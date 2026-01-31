/**
 * EDL Generation Routes
 * Generate Edit Decision Lists from analysis results
 */

import { Router } from 'express';
import {
  generateCutList,
  mergeAdjacentSegments,
  filterShortSegments,
  calculateEditStats,
  validateMappings
} from '../services/cutLogic.js';

export const edlRouter = Router();

/**
 * POST /api/generate-edl
 * Generate cut list from analysis results
 */
edlRouter.post('/', async (req, res) => {
  try {
    const { jobId, speakerMappings, settings } = req.body;

    if (!jobId) {
      return res.status(400).json({
        error: 'Missing required field: jobId'
      });
    }

    if (!speakerMappings || !Array.isArray(speakerMappings)) {
      return res.status(400).json({
        error: 'Missing or invalid speakerMappings array'
      });
    }

    // Get the job result
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

    const { segments, silences, audioAnalysis, duration } = job.result;

    // Validate mappings
    const mappingValidation = validateMappings(segments, speakerMappings);
    if (!mappingValidation.valid) {
      return res.status(400).json({
        error: 'Invalid speaker mappings',
        unmappedSpeakers: mappingValidation.unmappedSpeakers
      });
    }

    // Process segments
    const mergedSegments = mergeAdjacentSegments(segments, settings?.mergeGap || 0.3);
    const filteredSegments = filterShortSegments(mergedSegments, settings?.minSegmentDuration || 0.5);

    // Generate cut list
    const cuts = generateCutList(filteredSegments, speakerMappings, settings || {});

    // Calculate statistics
    const stats = calculateEditStats(cuts, duration);

    res.json({
      cuts,
      statistics: stats,
      silences: silences || [],
      audioAnalysis: audioAnalysis || {},
      duration,
      processedSegments: filteredSegments.length,
      originalSegments: segments.length
    });

  } catch (err) {
    console.error('Error generating EDL:', err);
    res.status(500).json({
      error: 'Failed to generate EDL',
      message: err.message
    });
  }
});

/**
 * POST /api/generate-edl/preview
 * Generate a preview without requiring a job (direct segments input)
 */
edlRouter.post('/preview', async (req, res) => {
  try {
    const { segments, speakerMappings, settings, duration } = req.body;

    if (!segments || !Array.isArray(segments)) {
      return res.status(400).json({
        error: 'Missing or invalid segments array'
      });
    }

    if (!speakerMappings || !Array.isArray(speakerMappings)) {
      return res.status(400).json({
        error: 'Missing or invalid speakerMappings array'
      });
    }

    // Validate mappings
    const mappingValidation = validateMappings(segments, speakerMappings);

    // Process segments
    const mergedSegments = mergeAdjacentSegments(segments, settings?.mergeGap || 0.3);
    const filteredSegments = filterShortSegments(mergedSegments, settings?.minSegmentDuration || 0.5);

    // Generate cut list
    const cuts = generateCutList(filteredSegments, speakerMappings, settings || {});

    // Calculate statistics
    const totalDuration = duration || (segments.length > 0 ? Math.max(...segments.map(s => s.end)) : 0);
    const stats = calculateEditStats(cuts, totalDuration);

    res.json({
      cuts,
      statistics: stats,
      mappingValidation,
      processedSegments: filteredSegments.length
    });

  } catch (err) {
    console.error('Error generating preview:', err);
    res.status(500).json({
      error: 'Failed to generate preview',
      message: err.message
    });
  }
});

/**
 * POST /api/generate-edl/export
 * Export cuts as CMX3600 EDL format
 */
edlRouter.post('/export', async (req, res) => {
  try {
    const { cuts, title, frameRate } = req.body;

    if (!cuts || !Array.isArray(cuts)) {
      return res.status(400).json({
        error: 'Missing or invalid cuts array'
      });
    }

    const fps = frameRate || 30;
    const edlTitle = title || 'AutoPod Free Export';

    // Generate CMX3600 EDL
    let edl = `TITLE: ${edlTitle}\nFCM: NON-DROP FRAME\n\n`;

    cuts.forEach((cut, index) => {
      const editNum = String(index + 1).padStart(3, '0');
      const srcIn = secondsToTimecode(cut.time, fps);
      const srcOut = secondsToTimecode(cut.segmentEnd || cut.time + 5, fps);
      const recIn = secondsToTimecode(cut.time, fps);
      const recOut = secondsToTimecode(cut.segmentEnd || cut.time + 5, fps);

      // V = video, C = cut
      edl += `${editNum}  CAM${cut.toCamera || 1}    V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
      edl += `* FROM CLIP NAME: Camera ${cut.toCamera || 1}\n`;
      edl += `* COMMENT: ${cut.reason || 'speaker_change'} - ${cut.speakerId || 'unknown'}\n\n`;
    });

    res.json({
      edl,
      format: 'CMX3600',
      cutCount: cuts.length
    });

  } catch (err) {
    console.error('Error exporting EDL:', err);
    res.status(500).json({
      error: 'Failed to export EDL',
      message: err.message
    });
  }
});

/**
 * Convert seconds to SMPTE timecode
 */
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
