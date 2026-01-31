/**
 * Unit tests for silence detection service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { mergeSilences, getTotalSilenceDuration } from '../src/services/silence.js';

describe('mergeSilences', () => {
  it('should merge adjacent silences within maxGap', () => {
    const silences = [
      { start: 0, end: 1, duration: 1 },
      { start: 1.1, end: 2, duration: 0.9 } // Gap of 0.1
    ];

    const merged = mergeSilences(silences, 0.2);

    assert.strictEqual(merged.length, 1, 'Should merge into one silence');
    assert.strictEqual(merged[0].start, 0);
    assert.strictEqual(merged[0].end, 2);
  });

  it('should not merge silences with large gap', () => {
    const silences = [
      { start: 0, end: 1, duration: 1 },
      { start: 2, end: 3, duration: 1 } // Gap of 1
    ];

    const merged = mergeSilences(silences, 0.2);

    assert.strictEqual(merged.length, 2, 'Should not merge with large gap');
  });

  it('should return empty array for empty input', () => {
    const merged = mergeSilences([]);
    assert.deepStrictEqual(merged, []);
  });

  it('should handle single silence', () => {
    const silences = [{ start: 5, end: 10, duration: 5 }];
    const merged = mergeSilences(silences, 0.2);
    assert.strictEqual(merged.length, 1);
  });

  it('should merge multiple consecutive silences', () => {
    const silences = [
      { start: 0, end: 1, duration: 1 },
      { start: 1.1, end: 2, duration: 0.9 },
      { start: 2.15, end: 3, duration: 0.85 }
    ];

    const merged = mergeSilences(silences, 0.2);

    assert.strictEqual(merged.length, 1, 'Should merge all consecutive silences');
    assert.strictEqual(merged[0].start, 0);
    assert.strictEqual(merged[0].end, 3);
  });
});

describe('getTotalSilenceDuration', () => {
  it('should calculate total duration', () => {
    const silences = [
      { start: 0, end: 1, duration: 1 },
      { start: 5, end: 7, duration: 2 },
      { start: 10, end: 11.5, duration: 1.5 }
    ];

    const total = getTotalSilenceDuration(silences);

    assert.strictEqual(total, 4.5);
  });

  it('should return 0 for empty array', () => {
    const total = getTotalSilenceDuration([]);
    assert.strictEqual(total, 0);
  });

  it('should handle single silence', () => {
    const silences = [{ start: 0, end: 5, duration: 5 }];
    const total = getTotalSilenceDuration(silences);
    assert.strictEqual(total, 5);
  });
});
