/**
 * Silence Detection Routes
 */

import { Router } from 'express';
import { detectSilence } from '../services/silence.js';

export const silenceRouter = Router();

/**
 * POST /api/silence/detect
 * Detect silences in an audio file
 */
silenceRouter.post('/detect', async (req, res) => {
  try {
    const {
      audioPath,
      threshold = -40,
      minDuration = 0.4,
      padding = 0.1
    } = req.body;

    if (!audioPath) {
      return res.status(400).json({
        error: 'Missing required field: audioPath'
      });
    }

    const silences = await detectSilence(audioPath, {
      threshold,
      minDuration,
      padding
    });

    res.json({
      silences,
      count: silences.length,
      totalSilenceDuration: silences.reduce((sum, s) => sum + s.duration, 0)
    });

  } catch (err) {
    console.error('Error detecting silence:', err);
    res.status(500).json({
      error: 'Failed to detect silence',
      message: err.message
    });
  }
});
