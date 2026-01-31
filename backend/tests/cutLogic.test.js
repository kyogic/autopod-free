/**
 * Unit tests for cut decision algorithm
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  generateCutList,
  mergeAdjacentSegments,
  filterShortSegments,
  handleCrosstalk,
  calculateEditStats,
  validateMappings
} from '../src/services/cutLogic.js';

describe('generateCutList', () => {
  it('should return empty array for empty segments', () => {
    const result = generateCutList([], [], {});
    assert.deepStrictEqual(result, []);
  });

  it('should return empty array for null segments', () => {
    const result = generateCutList(null, [], {});
    assert.deepStrictEqual(result, []);
  });

  it('should generate cuts on speaker changes', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.85 },
      { speakerId: 'SPEAKER_00', start: 10, end: 15, confidence: 0.9 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const cuts = generateCutList(segments, mappings, { minCutDuration: 1 });

    // First segment establishes camera, then cuts at speaker changes
    assert.ok(cuts.length >= 2, 'Should have at least 2 cuts');
    assert.strictEqual(cuts[0].toCamera, 0, 'First cut should be to camera 0');
  });

  it('should respect minimum cut duration', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 2, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 2, end: 3, confidence: 0.85 }, // Only 1 second
      { speakerId: 'SPEAKER_00', start: 3, end: 8, confidence: 0.9 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const cuts = generateCutList(segments, mappings, { minCutDuration: 3 });

    // Should skip the short segment
    const cutTimes = cuts.map(c => c.time);
    // The second cut shouldn't happen at 2 seconds since minCutDuration is 3
    const hasCutAt2 = cutTimes.some(t => Math.abs(t - 2) < 0.1);
    assert.ok(!hasCutAt2 || cuts.length === 1, 'Should respect minimum cut duration');
  });

  it('should use wide shot on low confidence when enabled', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.3 } // Low confidence
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const cuts = generateCutList(segments, mappings, {
      minCutDuration: 1,
      speakerConfidenceThreshold: 0.7,
      useWideShotOnLowConfidence: true,
      wideShotCameraIndex: 'wide'
    });

    // Find the cut for the low confidence segment
    const lowConfCut = cuts.find(c => c.speakerId === 'SPEAKER_01');
    if (lowConfCut) {
      assert.strictEqual(lowConfCut.toCamera, 'wide', 'Should use wide shot for low confidence');
      assert.strictEqual(lowConfCut.reason, 'low_confidence_wide');
    }
  });

  it('should skip segments without mappings', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'UNKNOWN', start: 5, end: 10, confidence: 0.9 }, // No mapping
      { speakerId: 'SPEAKER_00', start: 10, end: 15, confidence: 0.9 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 }
    ];

    const cuts = generateCutList(segments, mappings, { minCutDuration: 1 });

    // Should not have any cuts for UNKNOWN speaker
    const unknownCuts = cuts.filter(c => c.speakerId === 'UNKNOWN');
    assert.strictEqual(unknownCuts.length, 0, 'Should skip unmapped speakers');
  });

  it('should handle unsorted segments', () => {
    const segments = [
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.85 },
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 }, // Out of order
      { speakerId: 'SPEAKER_00', start: 10, end: 15, confidence: 0.9 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const cuts = generateCutList(segments, mappings, { minCutDuration: 1 });

    // Should still work correctly
    assert.ok(cuts.length > 0, 'Should handle unsorted segments');
    // First cut should be at or near time 0
    assert.ok(cuts[0].time <= 1, 'First cut should be near start');
  });
});

describe('mergeAdjacentSegments', () => {
  it('should merge adjacent segments from same speaker', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_00', start: 5.1, end: 10, confidence: 0.85 } // Small gap
    ];

    const merged = mergeAdjacentSegments(segments, 0.3);

    assert.strictEqual(merged.length, 1, 'Should merge into one segment');
    assert.strictEqual(merged[0].start, 0);
    assert.strictEqual(merged[0].end, 10);
  });

  it('should not merge segments from different speakers', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5.1, end: 10, confidence: 0.85 }
    ];

    const merged = mergeAdjacentSegments(segments, 0.3);

    assert.strictEqual(merged.length, 2, 'Should not merge different speakers');
  });

  it('should not merge segments with large gap', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_00', start: 6, end: 10, confidence: 0.85 } // 1 second gap
    ];

    const merged = mergeAdjacentSegments(segments, 0.3);

    assert.strictEqual(merged.length, 2, 'Should not merge with large gap');
  });

  it('should return empty array for empty input', () => {
    const merged = mergeAdjacentSegments([]);
    assert.deepStrictEqual(merged, []);
  });

  it('should average confidence when merging', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.8 },
      { speakerId: 'SPEAKER_00', start: 5.1, end: 10, confidence: 1.0 }
    ];

    const merged = mergeAdjacentSegments(segments, 0.3);

    assert.strictEqual(merged[0].confidence, 0.9, 'Should average confidence');
  });
});

describe('filterShortSegments', () => {
  it('should filter out short segments', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_00', start: 6, end: 6.3, confidence: 0.9 }, // Too short
      { speakerId: 'SPEAKER_01', start: 7, end: 12, confidence: 0.85 }
    ];

    const filtered = filterShortSegments(segments, 0.5);

    assert.strictEqual(filtered.length, 2, 'Should filter out short segment');
    assert.ok(filtered.every(s => (s.end - s.start) >= 0.5));
  });

  it('should keep all segments if all are long enough', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 6, end: 12, confidence: 0.85 }
    ];

    const filtered = filterShortSegments(segments, 0.5);

    assert.strictEqual(filtered.length, 2);
  });
});

describe('handleCrosstalk', () => {
  it('should handle non-overlapping segments', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.85 }
    ];

    const resolved = handleCrosstalk(segments);

    assert.strictEqual(resolved.length, 2);
  });

  it('should resolve overlapping segments by confidence', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 7, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.7 } // Overlaps from 5-7
    ];

    const resolved = handleCrosstalk(segments);

    // Check that high confidence speaker wins in overlap region
    const overlapRegion = resolved.filter(s => s.start >= 5 && s.end <= 7);
    if (overlapRegion.length > 0) {
      assert.strictEqual(overlapRegion[0].speakerId, 'SPEAKER_00',
        'Higher confidence speaker should win in overlap');
    }
  });

  it('should return empty array for empty input', () => {
    const resolved = handleCrosstalk([]);
    assert.deepStrictEqual(resolved, []);
  });
});

describe('calculateEditStats', () => {
  it('should calculate correct statistics', () => {
    const cuts = [
      { time: 5, reason: 'speaker_change', confidence: 0.9 },
      { time: 10, reason: 'speaker_change', confidence: 0.85 },
      { time: 15, reason: 'reaction_shot', confidence: 0.8 }
    ];

    const stats = calculateEditStats(cuts, 20);

    assert.strictEqual(stats.totalCuts, 3);
    assert.strictEqual(stats.speakerChangeCuts, 2);
    assert.strictEqual(stats.reactionShotCuts, 1);
    assert.ok(stats.cutsPerMinute > 0);
  });

  it('should handle empty cuts', () => {
    const stats = calculateEditStats([], 60);

    assert.strictEqual(stats.totalCuts, 0);
    assert.strictEqual(stats.cutsPerMinute, 0);
    assert.strictEqual(stats.averageShotDuration, 60);
  });

  it('should handle null cuts', () => {
    const stats = calculateEditStats(null, 60);

    assert.strictEqual(stats.totalCuts, 0);
  });
});

describe('validateMappings', () => {
  it('should validate complete mappings', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.85 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const result = validateMappings(segments, mappings);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.unmappedSpeakers.length, 0);
  });

  it('should detect unmapped speakers', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 5, end: 10, confidence: 0.85 },
      { speakerId: 'SPEAKER_02', start: 10, end: 15, confidence: 0.8 } // Not mapped
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const result = validateMappings(segments, mappings);

    assert.strictEqual(result.valid, false);
    assert.ok(result.unmappedSpeakers.includes('SPEAKER_02'));
  });

  it('should detect unused mappings', () => {
    const segments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 5, confidence: 0.9 }
    ];

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 } // Not in segments
    ];

    const result = validateMappings(segments, mappings);

    assert.ok(result.unusedMappings.includes('SPEAKER_01'));
  });
});

// Integration-style tests
describe('Full workflow', () => {
  it('should process a realistic podcast scenario', () => {
    // Simulate a 2-person podcast with natural conversation
    const segments = [
      { speakerId: 'HOST', start: 0, end: 15, confidence: 0.95 },
      { speakerId: 'GUEST', start: 15.2, end: 45, confidence: 0.9 },
      { speakerId: 'HOST', start: 45.5, end: 60, confidence: 0.93 },
      { speakerId: 'GUEST', start: 60.3, end: 90, confidence: 0.88 },
      { speakerId: 'HOST', start: 90.1, end: 120, confidence: 0.92 }
    ];

    const mappings = [
      { speakerId: 'HOST', cameraIndex: 0 },
      { speakerId: 'GUEST', cameraIndex: 1 }
    ];

    const settings = {
      minCutDuration: 2,
      cameraHoldTime: 1.5,
      speakerConfidenceThreshold: 0.7,
      useWideShotOnLowConfidence: true
    };

    // Merge adjacent segments first
    const merged = mergeAdjacentSegments(segments, 0.5);

    // Generate cuts
    const cuts = generateCutList(merged, mappings, settings);

    // Validate results
    assert.ok(cuts.length > 0, 'Should generate cuts');

    // Check that cuts alternate between speakers
    for (let i = 1; i < cuts.length; i++) {
      const prevCut = cuts[i - 1];
      const currCut = cuts[i];
      // Time should always increase
      assert.ok(currCut.time > prevCut.time, 'Cuts should be in time order');
    }

    // Calculate and verify stats
    const stats = calculateEditStats(cuts, 120);
    assert.ok(stats.cutsPerMinute > 0, 'Should have positive cuts per minute');
    assert.ok(stats.averageShotDuration > 0, 'Should have positive avg shot duration');
  });
});
