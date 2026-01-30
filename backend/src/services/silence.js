/**
 * Silence Detection Service
 * Uses ffmpeg to detect silent regions in audio
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Detect silent regions in an audio file using ffmpeg silencedetect filter
 * @param {string} audioPath - Path to audio file
 * @param {Object} options - Detection options
 * @returns {Promise<Array>} Array of silence regions
 */
export async function detectSilence(audioPath, options = {}) {
  const {
    threshold = -40, // dB
    minDuration = 0.4, // seconds
    padding = 0.1 // seconds to keep before/after
  } = options;

  // Use ffmpeg silencedetect filter
  const cmd = `ffmpeg -i "${audioPath}" -af silencedetect=noise=${threshold}dB:d=${minDuration} -f null - 2>&1`;

  try {
    const { stdout, stderr } = await execAsync(cmd);
    const output = stdout + stderr;

    // Parse silencedetect output
    const silences = parseSilenceOutput(output, padding);

    return silences;
  } catch (err) {
    // ffmpeg returns non-zero exit code but still outputs the data
    if (err.stdout || err.stderr) {
      const output = (err.stdout || '') + (err.stderr || '');
      return parseSilenceOutput(output, padding);
    }
    throw new Error(`Failed to detect silence: ${err.message}`);
  }
}

/**
 * Parse ffmpeg silencedetect output
 * @param {string} output - ffmpeg output
 * @param {number} padding - Padding in seconds
 * @returns {Array} Silence regions
 */
function parseSilenceOutput(output, padding) {
  const silences = [];
  const lines = output.split('\n');

  let currentStart = null;

  for (const line of lines) {
    // Match silence_start
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }

    // Match silence_end with duration
    const endMatch = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      const duration = parseFloat(endMatch[2]);

      // Apply padding
      const paddedStart = currentStart + padding;
      const paddedEnd = end - padding;
      const paddedDuration = paddedEnd - paddedStart;

      // Only include if there's still silence after padding
      if (paddedDuration > 0) {
        silences.push({
          start: paddedStart,
          end: paddedEnd,
          duration: paddedDuration,
          originalStart: currentStart,
          originalEnd: end,
          originalDuration: duration
        });
      }

      currentStart = null;
    }
  }

  return silences;
}

/**
 * Merge nearby silences
 * @param {Array} silences - Silence regions
 * @param {number} maxGap - Maximum gap between silences to merge
 * @returns {Array} Merged silence regions
 */
export function mergeSilences(silences, maxGap = 0.2) {
  if (silences.length === 0) return [];

  const merged = [{ ...silences[0] }];

  for (let i = 1; i < silences.length; i++) {
    const current = silences[i];
    const last = merged[merged.length - 1];

    // Check if gap is small enough to merge
    if (current.start - last.end <= maxGap) {
      last.end = current.end;
      last.duration = last.end - last.start;
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Calculate total silence duration
 * @param {Array} silences - Silence regions
 * @returns {number} Total duration in seconds
 */
export function getTotalSilenceDuration(silences) {
  return silences.reduce((sum, s) => sum + s.duration, 0);
}
