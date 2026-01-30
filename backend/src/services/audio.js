/**
 * Audio Analysis Service
 * Uses ffmpeg for audio level analysis and extraction
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

/**
 * Analyze audio levels (peak, LUFS, loudness range)
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<Object>} Audio analysis results
 */
export async function analyzeAudioLevels(audioPath) {
  // Use ffmpeg loudnorm filter for detailed analysis
  const cmd = `ffmpeg -i "${audioPath}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const output = stdout + stderr;

    // Parse loudnorm JSON output
    const analysis = parseLoudnormOutput(output);

    // Also get peak levels
    const peakAnalysis = await analyzePeakLevels(audioPath);

    return {
      ...analysis,
      ...peakAnalysis
    };
  } catch (err) {
    // ffmpeg may still output data even with non-zero exit
    if (err.stdout || err.stderr) {
      const output = (err.stdout || '') + (err.stderr || '');
      const analysis = parseLoudnormOutput(output);
      const peakAnalysis = await analyzePeakLevels(audioPath).catch(() => ({}));
      return { ...analysis, ...peakAnalysis };
    }
    throw new Error(`Failed to analyze audio: ${err.message}`);
  }
}

/**
 * Parse ffmpeg loudnorm output
 * @param {string} output - ffmpeg output
 * @returns {Object} Parsed analysis
 */
function parseLoudnormOutput(output) {
  // Find JSON block in output
  const jsonMatch = output.match(/\{[^{}]*"input_i"[^{}]*\}/s);

  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      return {
        integratedLufs: parseFloat(data.input_i) || -24,
        truePeak: parseFloat(data.input_tp) || 0,
        loudnessRange: parseFloat(data.input_lra) || 0,
        threshold: parseFloat(data.input_thresh) || -34,
        targetOffset: parseFloat(data.target_offset) || 0
      };
    } catch (e) {
      console.warn('Failed to parse loudnorm JSON:', e);
    }
  }

  // Fallback: try to parse individual values
  const result = {
    integratedLufs: -24,
    truePeak: 0,
    loudnessRange: 0
  };

  const iMatch = output.match(/input_i\s*:\s*"?([-\d.]+)/);
  if (iMatch) result.integratedLufs = parseFloat(iMatch[1]);

  const tpMatch = output.match(/input_tp\s*:\s*"?([-\d.]+)/);
  if (tpMatch) result.truePeak = parseFloat(tpMatch[1]);

  const lraMatch = output.match(/input_lra\s*:\s*"?([-\d.]+)/);
  if (lraMatch) result.loudnessRange = parseFloat(lraMatch[1]);

  return result;
}

/**
 * Analyze peak levels using astats filter
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<Object>} Peak analysis
 */
async function analyzePeakLevels(audioPath) {
  const cmd = `ffmpeg -i "${audioPath}" -af astats=metadata=1:reset=1 -f null - 2>&1`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    const output = stdout + stderr;

    // Parse peak level
    const peakMatch = output.match(/Peak level dB:\s*([-\d.]+)/);
    const rmsMatch = output.match(/RMS level dB:\s*([-\d.]+)/);

    return {
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : 0,
      rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -24
    };
  } catch (err) {
    return { peakDb: 0, rmsDb: -24 };
  }
}

/**
 * Extract audio from a video file
 * @param {string} videoPath - Path to video file
 * @param {string} outputPath - Optional output path (defaults to temp file)
 * @returns {Promise<Object>} Extraction result
 */
export async function extractAudio(videoPath, outputPath = null) {
  // Generate output path if not provided
  if (!outputPath) {
    const tempDir = path.join(tmpdir(), 'autopod-free');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const baseName = path.basename(videoPath, path.extname(videoPath));
    outputPath = path.join(tempDir, `${baseName}_${Date.now()}.wav`);
  }

  // Extract audio as WAV (best for analysis)
  const cmd = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" -y`;

  try {
    await execAsync(cmd);

    // Get duration
    const duration = await getAudioDuration(outputPath);

    return {
      outputPath,
      duration
    };
  } catch (err) {
    throw new Error(`Failed to extract audio: ${err.message}`);
  }
}

/**
 * Get audio duration in seconds
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<number>} Duration in seconds
 */
export async function getAudioDuration(audioPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;

  try {
    const { stdout } = await execAsync(cmd);
    return parseFloat(stdout.trim()) || 0;
  } catch (err) {
    console.warn('Failed to get audio duration:', err);
    return 0;
  }
}

/**
 * Calculate the gain adjustment needed to reach target LUFS
 * @param {number} currentLufs - Current integrated LUFS
 * @param {number} targetLufs - Target LUFS (e.g., -16 for streaming)
 * @returns {number} Gain adjustment in dB
 */
export function calculateGainAdjustment(currentLufs, targetLufs) {
  return targetLufs - currentLufs;
}
