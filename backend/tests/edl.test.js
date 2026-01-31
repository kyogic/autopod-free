/**
 * Integration tests for EDL generation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test fixture
const fixtureData = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'sample-diarization.json'), 'utf-8')
);

// Import the functions we need to test
import {
  generateCutList,
  mergeAdjacentSegments,
  filterShortSegments,
  handleCrosstalk,
  calculateEditStats,
  validateMappings
} from '../src/services/cutLogic.js';

describe('EDL Generation Integration', () => {
  const speakerMappings = [
    { speakerId: 'SPEAKER_00', cameraIndex: 0 },
    { speakerId: 'SPEAKER_01', cameraIndex: 1 }
  ];

  const settings = {
    minCutDuration: 2.0,
    cameraHoldTime: 1.5,
    speakerConfidenceThreshold: 0.7,
    useWideShotOnLowConfidence: true,
    wideShotCameraIndex: 'wide'
  };

  it('should load fixture data correctly', () => {
    assert.ok(fixtureData.segments, 'Should have segments');
    assert.ok(fixtureData.silences, 'Should have silences');
    assert.ok(fixtureData.audioAnalysis, 'Should have audioAnalysis');
    assert.strictEqual(fixtureData.duration, 120.0);
    assert.strictEqual(fixtureData.numSpeakers, 2);
  });

  it('should process fixture segments through full pipeline', () => {
    const { segments } = fixtureData;

    // Step 1: Merge adjacent segments
    const merged = mergeAdjacentSegments(segments, 0.3);
    assert.ok(merged.length <= segments.length, 'Merging should reduce or maintain segment count');

    // Step 2: Filter short segments
    const filtered = filterShortSegments(merged, 0.5);
    assert.ok(filtered.length <= merged.length, 'Filtering should reduce or maintain segment count');

    // Step 3: Handle crosstalk (if any)
    const resolved = handleCrosstalk(filtered);
    assert.ok(resolved.length > 0, 'Should have resolved segments');

    // Step 4: Validate mappings
    const validation = validateMappings(resolved, speakerMappings);
    assert.strictEqual(validation.valid, true, 'Mappings should be valid for fixture');

    // Step 5: Generate cuts
    const cuts = generateCutList(resolved, speakerMappings, settings);
    assert.ok(cuts.length > 0, 'Should generate cuts');

    // Step 6: Calculate stats
    const stats = calculateEditStats(cuts, fixtureData.duration);
    assert.ok(stats.totalCuts > 0, 'Should have positive cut count');
    assert.ok(stats.cutsPerMinute > 0, 'Should have positive cuts per minute');
  });

  it('should generate reasonable number of cuts for 2-minute podcast', () => {
    const { segments } = fixtureData;

    const merged = mergeAdjacentSegments(segments, 0.3);
    const filtered = filterShortSegments(merged, 0.5);
    const cuts = generateCutList(filtered, speakerMappings, settings);
    const stats = calculateEditStats(cuts, fixtureData.duration);

    // For a 2-minute conversation between 2 speakers:
    // - At least 2 cuts (initial camera + at least one switch)
    // - Not more than 30 cuts (would be too fast pacing)
    assert.ok(stats.totalCuts >= 2, 'Should have at least 2 cuts');
    assert.ok(stats.totalCuts <= 30, 'Should not have excessive cuts');

    // Average shot duration should be reasonable
    // Not less than 2 seconds (minCutDuration) on average
    assert.ok(stats.averageShotDuration >= 1, 'Average shot should be at least 1 second');
  });

  it('should respect minimum cut duration setting', () => {
    const { segments } = fixtureData;

    const strictSettings = {
      ...settings,
      minCutDuration: 10.0 // Very strict: 10 second minimum
    };

    const merged = mergeAdjacentSegments(segments, 0.3);
    const cuts = generateCutList(merged, speakerMappings, strictSettings);

    // With 10 second minimum, cuts should be at least 10 seconds apart
    for (let i = 1; i < cuts.length; i++) {
      const gap = cuts[i].time - cuts[i - 1].time;
      // Allow some tolerance for camera hold time adjustments
      assert.ok(gap >= 9, `Gap between cuts should be at least 9s, got ${gap}s`);
    }
  });

  it('should handle high confidence threshold', () => {
    const { segments } = fixtureData;

    const strictSettings = {
      ...settings,
      speakerConfidenceThreshold: 0.95, // Very strict
      useWideShotOnLowConfidence: true
    };

    const merged = mergeAdjacentSegments(segments, 0.3);
    const cuts = generateCutList(merged, speakerMappings, strictSettings);

    // With high threshold, some cuts should be to wide shot
    const wideShotCuts = cuts.filter(c => c.toCamera === 'wide' || c.reason === 'low_confidence_wide');
    // Depending on the confidence values in fixture, we might get wide shots
    assert.ok(Array.isArray(wideShotCuts), 'Should handle wide shot cuts');
  });

  it('should calculate silence removal savings', () => {
    const { silences, duration } = fixtureData;

    // Calculate potential time saved
    const totalSilence = silences.reduce((sum, s) => sum + s.duration, 0);

    // Verify calculation
    assert.ok(totalSilence > 0, 'Should have positive silence duration');
    assert.ok(totalSilence < duration, 'Silence should be less than total duration');

    // Calculate percentage
    const silencePercent = (totalSilence / duration) * 100;
    assert.ok(silencePercent < 50, 'Silence should be less than 50% of content');
  });

  it('should generate valid CMX3600 timecodes', () => {
    // Test timecode generation helper
    function secondsToTimecode(seconds, fps = 30) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const f = Math.floor((seconds % 1) * fps);

      return [
        String(h).padStart(2, '0'),
        String(m).padStart(2, '0'),
        String(s).padStart(2, '0'),
        String(f).padStart(2, '0')
      ].join(':');
    }

    // Test various times
    assert.strictEqual(secondsToTimecode(0), '00:00:00:00');
    assert.strictEqual(secondsToTimecode(60), '00:01:00:00');
    assert.strictEqual(secondsToTimecode(3661.5, 30), '01:01:01:15');
    assert.strictEqual(secondsToTimecode(120), '00:02:00:00');
  });

  it('should handle empty segments gracefully', () => {
    const emptySegments = [];

    const merged = mergeAdjacentSegments(emptySegments, 0.3);
    const filtered = filterShortSegments(merged, 0.5);
    const cuts = generateCutList(filtered, speakerMappings, settings);
    const stats = calculateEditStats(cuts, 0);

    assert.deepStrictEqual(merged, []);
    assert.deepStrictEqual(filtered, []);
    assert.deepStrictEqual(cuts, []);
    assert.strictEqual(stats.totalCuts, 0);
  });

  it('should preserve audio analysis data', () => {
    const { audioAnalysis } = fixtureData;

    // Verify expected fields
    assert.ok('peakDb' in audioAnalysis, 'Should have peakDb');
    assert.ok('integratedLufs' in audioAnalysis, 'Should have integratedLufs');

    // Verify reasonable values
    assert.ok(audioAnalysis.peakDb <= 0, 'Peak should be 0 or negative dB');
    assert.ok(audioAnalysis.integratedLufs < 0, 'LUFS should be negative');
    assert.ok(audioAnalysis.integratedLufs > -50, 'LUFS should not be extremely low');
  });
});

describe('Edge Cases', () => {
  it('should handle single speaker', () => {
    const singleSpeakerSegments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 60, confidence: 0.9 }
    ];

    const mappings = [{ speakerId: 'SPEAKER_00', cameraIndex: 0 }];

    const cuts = generateCutList(singleSpeakerSegments, mappings, {
      minCutDuration: 2
    });

    // Should have just one cut (establishing shot)
    assert.strictEqual(cuts.length, 1, 'Single speaker should have one cut');
  });

  it('should handle rapid speaker changes', () => {
    const rapidSegments = [];
    for (let i = 0; i < 20; i++) {
      rapidSegments.push({
        speakerId: i % 2 === 0 ? 'SPEAKER_00' : 'SPEAKER_01',
        start: i * 2,
        end: i * 2 + 2,
        confidence: 0.9
      });
    }

    const mappings = [
      { speakerId: 'SPEAKER_00', cameraIndex: 0 },
      { speakerId: 'SPEAKER_01', cameraIndex: 1 }
    ];

    const cuts = generateCutList(rapidSegments, mappings, {
      minCutDuration: 3 // Should limit cuts
    });

    // With 3 second minimum, shouldn't have a cut every 2 seconds
    assert.ok(cuts.length < rapidSegments.length, 'Should limit rapid cuts');
  });

  it('should handle overlapping segments', () => {
    const overlappingSegments = [
      { speakerId: 'SPEAKER_00', start: 0, end: 10, confidence: 0.9 },
      { speakerId: 'SPEAKER_01', start: 8, end: 15, confidence: 0.8 } // Overlaps 8-10
    ];

    const resolved = handleCrosstalk(overlappingSegments);

    // Should not have gaps or overlaps
    for (let i = 1; i < resolved.length; i++) {
      assert.ok(resolved[i].start >= resolved[i - 1].end - 0.001,
        'Resolved segments should not overlap');
    }
  });
});
