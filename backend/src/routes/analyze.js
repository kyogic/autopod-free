/**
 * Analysis Routes - Handle speaker diarization requests
 */

import { Router } from 'express';
import { existsSync } from 'fs';

export const analyzeRouter = Router();

/**
 * POST /api/analyze
 * Start a new analysis job
 */
analyzeRouter.post('/', async (req, res) => {
  try {
    const { audioPath, numSpeakers, settings } = req.body;

    // Validate input
    if (!audioPath) {
      return res.status(400).json({
        error: 'Missing required field: audioPath'
      });
    }

    // Check if file exists
    if (!existsSync(audioPath)) {
      return res.status(400).json({
        error: 'Audio file not found',
        path: audioPath
      });
    }

    // Create and start job
    const job = req.jobManager.createJob(audioPath, {
      numSpeakers: numSpeakers || 2,
      settings: settings || {}
    });

    // Start job asynchronously
    req.jobManager.startJob(job.id).catch(err => {
      console.error(`Job ${job.id} failed:`, err);
    });

    res.json({
      jobId: job.id,
      status: 'started',
      message: 'Analysis job started. Subscribe via WebSocket for updates.'
    });

  } catch (err) {
    console.error('Error starting analysis:', err);
    res.status(500).json({
      error: 'Failed to start analysis',
      message: err.message
    });
  }
});

/**
 * GET /api/analyze/:jobId/status
 * Get job status
 */
analyzeRouter.get('/:jobId/status', (req, res) => {
  const { jobId } = req.params;
  const status = req.jobManager.getJobStatus(jobId);

  if (!status) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  res.json(status);
});

/**
 * GET /api/analyze/:jobId/results
 * Get job results
 */
analyzeRouter.get('/:jobId/results', (req, res) => {
  const { jobId } = req.params;
  const job = req.jobManager.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found'
    });
  }

  if (job.status !== 'complete') {
    return res.status(400).json({
      error: 'Job not complete',
      status: job.status
    });
  }

  res.json(job.result);
});

/**
 * POST /api/analyze/:jobId/cancel
 * Cancel a running job
 */
analyzeRouter.post('/:jobId/cancel', (req, res) => {
  const { jobId } = req.params;
  const success = req.jobManager.cancelJob(jobId);

  if (!success) {
    return res.status(404).json({
      error: 'Job not found or already completed'
    });
  }

  res.json({
    status: 'cancelled',
    message: 'Job cancelled successfully'
  });
});
