/**
 * Audio Analysis Routes
 */

import { Router } from 'express';
import { analyzeAudioLevels, extractAudio } from '../services/audio.js';

export const audioRouter = Router();

/**
 * POST /api/audio/analyze
 * Analyze audio levels (peak, LUFS)
 */
audioRouter.post('/analyze', async (req, res) => {
  try {
    const { audioPath } = req.body;

    if (!audioPath) {
      return res.status(400).json({
        error: 'Missing required field: audioPath'
      });
    }

    const analysis = await analyzeAudioLevels(audioPath);

    res.json(analysis);

  } catch (err) {
    console.error('Error analyzing audio:', err);
    res.status(500).json({
      error: 'Failed to analyze audio',
      message: err.message
    });
  }
});

/**
 * POST /api/audio/extract
 * Extract audio from a video file
 */
audioRouter.post('/extract', async (req, res) => {
  try {
    const { videoPath, outputPath } = req.body;

    if (!videoPath) {
      return res.status(400).json({
        error: 'Missing required field: videoPath'
      });
    }

    const result = await extractAudio(videoPath, outputPath);

    res.json({
      success: true,
      outputPath: result.outputPath,
      duration: result.duration
    });

  } catch (err) {
    console.error('Error extracting audio:', err);
    res.status(500).json({
      error: 'Failed to extract audio',
      message: err.message
    });
  }
});
