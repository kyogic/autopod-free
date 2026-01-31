/**
 * Tests for panel edit logic
 * These test the cut generation logic that runs in the panel
 * (Cannot test actual UXP API without Premiere Pro)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock the cut generation logic from editor.js
// (Extracted here since we can't import UXP modules in Node)

function generateCutsFromSegments(segments, mappings, settings = {}) {
  const {
    minCutDuration = 2.0,
    cameraHoldTime = 1.5,
    speakerConfidenceThreshold = 0.7,
    useWideShotOnLowConfidence = true
  } = settings;

  const cuts = [];
  let lastCameraIndex = null;
  let lastCutTime = 0;

  const sorted = [...segments].sort((a, b) => a.start - b.start);

  for (const segment of sorted) {
    const mapping = mappings.find(m => m.speakerId === segment.speakerId);
    if (!mapping) continue;

    const cameraIndex = mapping.cameraIndex;
    const timeSinceLastCut = segment.start - lastCutTime;

    if (cameraIndex !== lastCameraIndex) {
      if (timeSinceLastCut >= minCutDuration || lastCameraIndex === null) {
        let cutTime = segment.start;
        if (lastCutTime > 0 && cutTime - lastCutTime < cameraHoldTime) {
          cutTime = lastCutTime + cameraHoldTime;
        }

        if (segment.confidence >= speakerConfidenceThreshold) {
          cuts.push({
            time: cutTime,
            toCamera: cameraIndex,
            speakerId: segment.speakerId,
            confidence: segment.confidence,
            segmentEnd: segment.end,
            reason: 'speaker_change'
          });
          lastCameraIndex = cameraIndex;
          lastCutTime = cutTime;
        } else if (useWideShotOnLowConfidence) {
          cuts.push({
            time: cutTime,
            toCamera: 'wide',
            speakerId: segment.speakerId,
            confidence: segment.confidence,
            segmentEnd: segment.end,
            reason: 'low_confidence'
          });
          lastCameraIndex = 'wide';
          lastCutTime = cutTime;
        }
      }
    }
  }

  return cuts;
}

// ActionBatch class for testing
class ActionBatch {
  constructor(name = 'Test Batch') {
    this.name = name;
    this.actions = [];
  }

  add(action) {
    if (action) {
      this.actions.push(action);
    }
    return this;
  }

  get length() {
    return this.actions.length;
  }
}

describe('Panel Cut Generation', () => {
  const sampleSegments = [
    { speakerId: 'SPEAKER_00', start: 0, end: 10, confidence: 0.9 },
    { speakerId: 'SPEAKER_01', start: 10.5, end: 25, confidence: 0.85 },
    { speakerId: 'SPEAKER_00', start: 25.3, end: 40, confidence: 0.92 },
    { speakerId: 'SPEAKER_01', start: 40.2, end: 55, confidence: 0.88 }
  ];

  const sampleMappings = [
    { speakerId: 'SPEAKER_00', cameraIndex: 0 },
    { speakerId: 'SPEAKER_01', cameraIndex: 1 }
  ];

  it('should generate cuts for speaker changes', () => {
    const cuts = generateCutsFromSegments(sampleSegments, sampleMappings, {
      minCutDuration: 2.0
    });

    assert.ok(cuts.length >= 3, 'Should have multiple cuts');
    assert.strictEqual(cuts[0].toCamera, 0, 'First cut should be to camera 0');
  });

  it('should respect minimum cut duration', () => {
    const rapidSegments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 1, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 1, end: 2, confidence: 0.85 },
      { speakerId: 'SPEAKER_00', start: 2, end: 3, confidence: 0.9 }
    ];

    const cuts = generateCutsFromSegments(rapidSegments, sampleMappings, {
      minCutDuration: 5.0  // Very high minimum
    });

    // With 5 second minimum, should only have initial cut
    assert.strictEqual(cuts.length, 1, 'Should limit cuts based on minCutDuration');
  });

  it('should use wide shot for low confidence', () => {
    const lowConfSegments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 10, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 10, end: 20, confidence: 0.3 } // Low confidence
    ];

    const cuts = generateCutsFromSegments(lowConfSegments, sampleMappings, {
      minCutDuration: 2.0,
      speakerConfidenceThreshold: 0.7,
      useWideShotOnLowConfidence: true
    });

    const lowConfCut = cuts.find(c => c.speakerId === 'SPEAKER_01');
    assert.ok(lowConfCut, 'Should have a cut for low confidence speaker');
    assert.strictEqual(lowConfCut.toCamera, 'wide', 'Should use wide shot for low confidence');
    assert.strictEqual(lowConfCut.reason, 'low_confidence');
  });

  it('should skip segments without mappings', () => {
    const segmentsWithUnmapped = [
      { speakerId: 'SPEAKER_00', start: 0, end: 10, confidence: 0.9 },
      { speakerId: 'UNKNOWN', start: 10, end: 20, confidence: 0.9 },
      { speakerId: 'SPEAKER_00', start: 20, end: 30, confidence: 0.9 }
    ];

    const cuts = generateCutsFromSegments(segmentsWithUnmapped, sampleMappings, {
      minCutDuration: 2.0
    });

    const unknownCuts = cuts.filter(c => c.speakerId === 'UNKNOWN');
    assert.strictEqual(unknownCuts.length, 0, 'Should skip unmapped speakers');
  });

  it('should apply camera hold time', () => {
    const quickChanges = [
      { speakerId: 'SPEAKER_00', start: 0, end: 3, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 3, end: 6, confidence: 0.9 }
    ];

    const cuts = generateCutsFromSegments(quickChanges, sampleMappings, {
      minCutDuration: 0.5,
      cameraHoldTime: 2.0
    });

    // With 2 second camera hold, second cut should be delayed
    if (cuts.length >= 2) {
      const gap = cuts[1].time - cuts[0].time;
      assert.ok(gap >= 2.0, 'Should respect camera hold time');
    }
  });

  it('should handle empty segments', () => {
    const cuts = generateCutsFromSegments([], sampleMappings, {});
    assert.deepStrictEqual(cuts, []);
  });

  it('should handle empty mappings', () => {
    const cuts = generateCutsFromSegments(sampleSegments, [], {});
    assert.deepStrictEqual(cuts, []);
  });

  it('should sort segments by start time', () => {
    const unsorted = [
      { speakerId: 'SPEAKER_01', start: 10, end: 20, confidence: 0.9 },
      { speakerId: 'SPEAKER_00', start: 0, end: 10, confidence: 0.9 }
    ];

    const cuts = generateCutsFromSegments(unsorted, sampleMappings, {
      minCutDuration: 2.0
    });

    // First cut should be at time 0, not 10
    assert.strictEqual(cuts[0].time, 0, 'Should process segments in time order');
    assert.strictEqual(cuts[0].toCamera, 0, 'First speaker should be SPEAKER_00');
  });
});

describe('ActionBatch', () => {
  it('should track added actions', () => {
    const batch = new ActionBatch('Test');
    batch.add({ type: 'action1' });
    batch.add({ type: 'action2' });

    assert.strictEqual(batch.length, 2);
  });

  it('should ignore null actions', () => {
    const batch = new ActionBatch('Test');
    batch.add(null);
    batch.add(undefined);
    batch.add({ type: 'valid' });

    assert.strictEqual(batch.length, 1);
  });

  it('should allow chaining', () => {
    const batch = new ActionBatch('Test');
    batch
      .add({ type: 'action1' })
      .add({ type: 'action2' })
      .add({ type: 'action3' });

    assert.strictEqual(batch.length, 3);
  });
});

describe('Time Conversion', () => {
  const TICKS_PER_SECOND = 254016000000;

  function secondsToTicks(seconds) {
    return { ticks: Math.round(seconds * TICKS_PER_SECOND) };
  }

  function ticksToSeconds(tickTime) {
    return tickTime.ticks / TICKS_PER_SECOND;
  }

  it('should convert seconds to ticks', () => {
    const result = secondsToTicks(1.0);
    assert.strictEqual(result.ticks, TICKS_PER_SECOND);
  });

  it('should convert ticks to seconds', () => {
    const result = ticksToSeconds({ ticks: TICKS_PER_SECOND });
    assert.strictEqual(result, 1.0);
  });

  it('should round-trip correctly', () => {
    const original = 123.456;
    const ticks = secondsToTicks(original);
    const roundTrip = ticksToSeconds(ticks);

    // Should be very close (within floating point precision)
    assert.ok(Math.abs(roundTrip - original) < 0.0001);
  });

  it('should handle zero', () => {
    assert.strictEqual(secondsToTicks(0).ticks, 0);
    assert.strictEqual(ticksToSeconds({ ticks: 0 }), 0);
  });

  it('should handle common timecode values', () => {
    // 1 minute
    const oneMinute = secondsToTicks(60);
    assert.strictEqual(ticksToSeconds(oneMinute), 60);

    // 1 hour
    const oneHour = secondsToTicks(3600);
    assert.strictEqual(ticksToSeconds(oneHour), 3600);
  });
});

describe('Silence Removal Logic', () => {
  function processSilences(silences, settings = {}) {
    const {
      silencePadding = 0.1,
      minSilenceDuration = 0.3
    } = settings;

    // Sort in reverse order
    const sorted = [...silences].sort((a, b) => b.start - a.start);
    const processed = [];

    for (const silence of sorted) {
      const start = silence.start + silencePadding;
      const end = silence.end - silencePadding;
      const duration = end - start;

      if (duration >= minSilenceDuration) {
        processed.push({
          start,
          end,
          duration,
          originalStart: silence.start,
          originalEnd: silence.end
        });
      }
    }

    return processed;
  }

  it('should apply padding to silences', () => {
    const silences = [
      { start: 10, end: 12, duration: 2 }
    ];

    const processed = processSilences(silences, { silencePadding: 0.1 });

    assert.strictEqual(processed[0].start, 10.1);
    assert.strictEqual(processed[0].end, 11.9);
  });

  it('should filter out silences that are too short after padding', () => {
    const silences = [
      { start: 10, end: 10.3, duration: 0.3 } // After padding: only 0.1s
    ];

    const processed = processSilences(silences, {
      silencePadding: 0.1,
      minSilenceDuration: 0.3
    });

    assert.strictEqual(processed.length, 0);
  });

  it('should sort silences in reverse order', () => {
    const silences = [
      { start: 10, end: 12, duration: 2 },
      { start: 20, end: 22, duration: 2 },
      { start: 5, end: 7, duration: 2 }
    ];

    const processed = processSilences(silences, { silencePadding: 0.1 });

    // Should be sorted from latest to earliest
    assert.ok(processed[0].start > processed[1].start);
    assert.ok(processed[1].start > processed[2].start);
  });
});

describe('Clip Overlap Detection', () => {
  // Simulate the overlap detection logic from editor.js
  function detectOverlaps(clips, regionStart, regionEnd) {
    const results = {
      fullyContained: [],
      trimStart: [],
      trimEnd: [],
      split: []
    };

    for (const clip of clips) {
      const { start: clipStart, end: clipEnd } = clip;

      // Case 1: Clip fully within region
      if (clipStart >= regionStart && clipEnd <= regionEnd) {
        results.fullyContained.push(clip);
      }
      // Case 2: Region fully within clip (needs split)
      else if (clipStart < regionStart && clipEnd > regionEnd) {
        results.split.push(clip);
      }
      // Case 3: Clip starts before and overlaps into region
      else if (clipStart < regionStart && clipEnd > regionStart && clipEnd <= regionEnd) {
        results.trimEnd.push(clip);
      }
      // Case 4: Clip starts in region and extends past
      else if (clipStart >= regionStart && clipStart < regionEnd && clipEnd > regionEnd) {
        results.trimStart.push(clip);
      }
    }

    return results;
  }

  it('should detect fully contained clips', () => {
    const clips = [
      { start: 12, end: 18, id: 'clip1' }  // Fully within 10-20
    ];

    const result = detectOverlaps(clips, 10, 20);

    assert.strictEqual(result.fullyContained.length, 1);
    assert.strictEqual(result.fullyContained[0].id, 'clip1');
  });

  it('should detect clips needing end trim', () => {
    const clips = [
      { start: 5, end: 15, id: 'clip1' }  // Starts before, ends within
    ];

    const result = detectOverlaps(clips, 10, 20);

    assert.strictEqual(result.trimEnd.length, 1);
    assert.strictEqual(result.trimEnd[0].id, 'clip1');
  });

  it('should detect clips needing start trim', () => {
    const clips = [
      { start: 15, end: 25, id: 'clip1' }  // Starts within, ends after
    ];

    const result = detectOverlaps(clips, 10, 20);

    assert.strictEqual(result.trimStart.length, 1);
    assert.strictEqual(result.trimStart[0].id, 'clip1');
  });

  it('should detect clips needing split', () => {
    const clips = [
      { start: 5, end: 25, id: 'clip1' }  // Spans entire region
    ];

    const result = detectOverlaps(clips, 10, 20);

    assert.strictEqual(result.split.length, 1);
    assert.strictEqual(result.split[0].id, 'clip1');
  });

  it('should handle multiple overlapping clips', () => {
    const clips = [
      { start: 12, end: 18, id: 'fully' },
      { start: 5, end: 15, id: 'trimEnd' },
      { start: 15, end: 25, id: 'trimStart' },
      { start: 5, end: 25, id: 'split' },
      { start: 0, end: 5, id: 'outside' }  // No overlap
    ];

    const result = detectOverlaps(clips, 10, 20);

    assert.strictEqual(result.fullyContained.length, 1);
    assert.strictEqual(result.trimEnd.length, 1);
    assert.strictEqual(result.trimStart.length, 1);
    assert.strictEqual(result.split.length, 1);
  });

  it('should handle empty clip list', () => {
    const result = detectOverlaps([], 10, 20);

    assert.deepStrictEqual(result.fullyContained, []);
    assert.deepStrictEqual(result.trimEnd, []);
    assert.deepStrictEqual(result.trimStart, []);
    assert.deepStrictEqual(result.split, []);
  });
});

describe('Audio Leveling Logic', () => {
  function calculateGainAdjustment(currentLufs, targetLufs) {
    const adjustment = targetLufs - currentLufs;
    return Math.max(-24, Math.min(24, adjustment));
  }

  it('should calculate positive gain for quiet audio', () => {
    const gain = calculateGainAdjustment(-24, -16);
    assert.strictEqual(gain, 8);  // Need +8 dB
  });

  it('should calculate negative gain for loud audio', () => {
    const gain = calculateGainAdjustment(-10, -16);
    assert.strictEqual(gain, -6);  // Need -6 dB
  });

  it('should clamp extreme positive gain', () => {
    const gain = calculateGainAdjustment(-50, -16);
    assert.strictEqual(gain, 24);  // Clamped to +24 dB
  });

  it('should clamp extreme negative gain', () => {
    const gain = calculateGainAdjustment(10, -16);
    assert.strictEqual(gain, -24);  // Clamped to -24 dB
  });

  it('should return zero for matched levels', () => {
    const gain = calculateGainAdjustment(-16, -16);
    assert.strictEqual(gain, 0);
  });
});

describe('Per-Track Leveling', () => {
  function applyTrackGains(tracks, globalGain, perTrackGains) {
    return tracks.map((track, index) => {
      const gain = perTrackGains && perTrackGains[index] !== undefined
        ? perTrackGains[index]
        : globalGain;
      return { ...track, appliedGain: gain };
    });
  }

  it('should apply global gain when no per-track gains specified', () => {
    const tracks = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const result = applyTrackGains(tracks, 6, null);

    assert.strictEqual(result[0].appliedGain, 6);
    assert.strictEqual(result[1].appliedGain, 6);
    assert.strictEqual(result[2].appliedGain, 6);
  });

  it('should apply per-track gains when specified', () => {
    const tracks = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const perTrackGains = { 0: 3, 1: 6, 2: 9 };
    const result = applyTrackGains(tracks, 0, perTrackGains);

    assert.strictEqual(result[0].appliedGain, 3);
    assert.strictEqual(result[1].appliedGain, 6);
    assert.strictEqual(result[2].appliedGain, 9);
  });

  it('should fall back to global gain for missing track gains', () => {
    const tracks = [{ id: 0 }, { id: 1 }, { id: 2 }];
    const perTrackGains = { 1: 10 };  // Only track 1 specified
    const result = applyTrackGains(tracks, 5, perTrackGains);

    assert.strictEqual(result[0].appliedGain, 5);  // Global
    assert.strictEqual(result[1].appliedGain, 10); // Per-track
    assert.strictEqual(result[2].appliedGain, 5);  // Global
  });
});

describe('Limiter Settings', () => {
  function validateLimiterSettings(ceiling) {
    // Ceiling should be 0 or negative (dB)
    if (ceiling > 0) {
      return { valid: false, error: 'Ceiling must be 0 dB or lower' };
    }
    // Ceiling shouldn't be too low
    if (ceiling < -20) {
      return { valid: false, error: 'Ceiling is too low, will severely limit output' };
    }
    return { valid: true };
  }

  it('should accept valid ceiling values', () => {
    assert.ok(validateLimiterSettings(-1).valid);
    assert.ok(validateLimiterSettings(-3).valid);
    assert.ok(validateLimiterSettings(0).valid);
    assert.ok(validateLimiterSettings(-10).valid);
  });

  it('should reject positive ceiling values', () => {
    assert.strictEqual(validateLimiterSettings(1).valid, false);
    assert.strictEqual(validateLimiterSettings(6).valid, false);
  });

  it('should warn about very low ceiling values', () => {
    assert.strictEqual(validateLimiterSettings(-25).valid, false);
    assert.strictEqual(validateLimiterSettings(-30).valid, false);
  });
});

describe('Silence Marker Generation', () => {
  function generateSilenceMarkerData(silences, settings = {}) {
    const {
      silencePadding = 0.1,
      minSilenceDuration = 0.3
    } = settings;

    const markers = [];

    for (const silence of silences) {
      const start = silence.start + silencePadding;
      const end = silence.end - silencePadding;
      const duration = end - start;

      if (duration >= minSilenceDuration) {
        markers.push({
          time: start,
          name: `Silence: ${duration.toFixed(2)}s`,
          duration,
          originalStart: silence.start,
          originalEnd: silence.end
        });
      }
    }

    return markers;
  }

  it('should generate marker data for valid silences', () => {
    const silences = [
      { start: 10, end: 15, duration: 5 }
    ];

    const markers = generateSilenceMarkerData(silences);

    assert.strictEqual(markers.length, 1);
    assert.strictEqual(markers[0].time, 10.1);
    assert.ok(markers[0].name.includes('4.80s'));
  });

  it('should skip silences too short after padding', () => {
    const silences = [
      { start: 10, end: 10.4, duration: 0.4 }  // After padding: 0.2s
    ];

    const markers = generateSilenceMarkerData(silences);

    assert.strictEqual(markers.length, 0);
  });

  it('should generate multiple markers', () => {
    const silences = [
      { start: 10, end: 15, duration: 5 },
      { start: 25, end: 30, duration: 5 },
      { start: 45, end: 50, duration: 5 }
    ];

    const markers = generateSilenceMarkerData(silences);

    assert.strictEqual(markers.length, 3);
  });
});

describe('Preview Edit Calculation', () => {
  function calculatePreviewStats(silences, settings = {}) {
    const {
      silencePadding = 0.1,
      minSilenceDuration = 0.3
    } = settings;

    let estimatedTimeRemoved = 0;
    let silenceCount = 0;

    for (const silence of silences) {
      const start = silence.start + silencePadding;
      const end = silence.end - silencePadding;
      const duration = end - start;

      if (duration >= minSilenceDuration) {
        estimatedTimeRemoved += duration;
        silenceCount++;
      }
    }

    return {
      silenceCount,
      estimatedTimeRemoved: Math.round(estimatedTimeRemoved * 100) / 100
    };
  }

  it('should calculate time removal estimate', () => {
    const silences = [
      { start: 10, end: 15, duration: 5 },  // 4.8s after padding
      { start: 25, end: 28, duration: 3 }   // 2.8s after padding
    ];

    const stats = calculatePreviewStats(silences);

    assert.strictEqual(stats.silenceCount, 2);
    assert.strictEqual(stats.estimatedTimeRemoved, 7.6);
  });

  it('should exclude short silences from estimate', () => {
    const silences = [
      { start: 10, end: 15, duration: 5 },  // Valid
      { start: 25, end: 25.4, duration: 0.4 }  // Too short
    ];

    const stats = calculatePreviewStats(silences);

    assert.strictEqual(stats.silenceCount, 1);
  });

  it('should handle empty silences array', () => {
    const stats = calculatePreviewStats([]);

    assert.strictEqual(stats.silenceCount, 0);
    assert.strictEqual(stats.estimatedTimeRemoved, 0);
  });
});
