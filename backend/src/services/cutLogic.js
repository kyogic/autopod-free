/**
 * Cut Decision Algorithm
 * Generates edit decisions from speaker diarization data
 */

/**
 * Generate cut list from speaker segments
 * @param {Array} segments - Speaker segments from diarization
 * @param {Array} speakerMappings - Speaker to camera mappings [{speakerId, cameraIndex}]
 * @param {Object} settings - Edit settings
 * @returns {Array} Cut decisions [{time, fromCamera, toCamera, reason, confidence}]
 */
export function generateCutList(segments, speakerMappings, settings = {}) {
  const {
    minCutDuration = 2.0,
    cameraHoldTime = 1.5,
    speakerConfidenceThreshold = 0.7,
    useWideShotOnLowConfidence = true,
    wideShotCameraIndex = 'wide',
    enableReactionShots = false,
    reactionShotFrequency = 30,
    reactionShotDuration = 2.0
  } = settings;

  if (!segments || segments.length === 0) {
    return [];
  }

  // Sort segments by start time
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

  const cuts = [];
  let lastCameraIndex = null;
  let lastCutTime = 0;
  let lastReactionShotTime = 0;

  // Map speaker IDs to camera indices
  const speakerToCamera = new Map();
  for (const mapping of speakerMappings) {
    speakerToCamera.set(mapping.speakerId, mapping.cameraIndex);
  }

  for (let i = 0; i < sortedSegments.length; i++) {
    const segment = sortedSegments[i];
    const cameraIndex = speakerToCamera.get(segment.speakerId);

    // Skip if no mapping for this speaker
    if (cameraIndex === undefined) {
      continue;
    }

    const timeSinceLastCut = segment.start - lastCutTime;
    const segmentDuration = segment.end - segment.start;

    // Determine if we should cut
    let shouldCut = false;
    let reason = '';
    let targetCamera = cameraIndex;

    // Check if speaker/camera changed
    if (cameraIndex !== lastCameraIndex) {
      // Check minimum cut duration
      if (timeSinceLastCut >= minCutDuration || lastCameraIndex === null) {
        // Check confidence threshold
        if (segment.confidence >= speakerConfidenceThreshold) {
          shouldCut = true;
          reason = 'speaker_change';
        } else if (useWideShotOnLowConfidence) {
          // Use wide shot for low confidence
          shouldCut = true;
          targetCamera = wideShotCameraIndex;
          reason = 'low_confidence_wide';
        }
      }
    }

    // Check for reaction shot opportunity
    if (enableReactionShots && !shouldCut && lastCameraIndex !== null) {
      const timeSinceReaction = segment.start - lastReactionShotTime;

      if (timeSinceReaction >= reactionShotFrequency && segmentDuration >= reactionShotDuration * 2) {
        // Get a different camera for reaction shot
        const otherCameras = [...new Set(speakerMappings.map(m => m.cameraIndex))]
          .filter(c => c !== lastCameraIndex && c !== 'wide');

        if (otherCameras.length > 0) {
          shouldCut = true;
          targetCamera = otherCameras[Math.floor(Math.random() * otherCameras.length)];
          reason = 'reaction_shot';
        }
      }
    }

    if (shouldCut) {
      // Apply camera hold time offset
      let cutTime = segment.start;
      if (lastCutTime > 0 && cutTime - lastCutTime < cameraHoldTime) {
        cutTime = lastCutTime + cameraHoldTime;
      }

      // Don't cut past the segment end
      if (cutTime < segment.end) {
        cuts.push({
          time: cutTime,
          fromCamera: lastCameraIndex,
          toCamera: targetCamera,
          speakerId: segment.speakerId,
          reason,
          confidence: segment.confidence,
          segmentStart: segment.start,
          segmentEnd: segment.end
        });

        lastCameraIndex = targetCamera;
        lastCutTime = cutTime;

        if (reason === 'reaction_shot') {
          lastReactionShotTime = cutTime;
        }
      }
    }
  }

  return cuts;
}

/**
 * Merge overlapping or adjacent segments from the same speaker
 * @param {Array} segments - Speaker segments
 * @param {number} maxGap - Maximum gap to merge (seconds)
 * @returns {Array} Merged segments
 */
export function mergeAdjacentSegments(segments, maxGap = 0.3) {
  if (!segments || segments.length === 0) {
    return [];
  }

  // Sort by start time
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const segment = sorted[i];

    // Check if same speaker and small gap
    if (segment.speakerId === current.speakerId &&
        segment.start - current.end <= maxGap) {
      // Merge: extend current segment
      current.end = Math.max(current.end, segment.end);
      // Average the confidence
      current.confidence = (current.confidence + segment.confidence) / 2;
    } else {
      // Different speaker or large gap: save current and start new
      merged.push(current);
      current = { ...segment };
    }
  }

  // Don't forget the last segment
  merged.push(current);

  return merged;
}

/**
 * Filter out short segments
 * @param {Array} segments - Speaker segments
 * @param {number} minDuration - Minimum segment duration
 * @returns {Array} Filtered segments
 */
export function filterShortSegments(segments, minDuration = 0.5) {
  return segments.filter(s => (s.end - s.start) >= minDuration);
}

/**
 * Handle overlapping speech (crosstalk)
 * Assigns overlapping regions to the dominant speaker or maintains current camera
 * @param {Array} segments - Speaker segments (may have overlaps)
 * @returns {Array} Non-overlapping segments
 */
export function handleCrosstalk(segments) {
  if (!segments || segments.length === 0) {
    return [];
  }

  // Sort by start time
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  const result = [];
  let i = 0;

  while (i < sorted.length) {
    const current = { ...sorted[i] };

    // Find all segments that overlap with current
    const overlapping = [current];
    let maxEnd = current.end;

    let j = i + 1;
    while (j < sorted.length && sorted[j].start < maxEnd) {
      overlapping.push({ ...sorted[j] });
      maxEnd = Math.max(maxEnd, sorted[j].end);
      j++;
    }

    if (overlapping.length === 1) {
      // No overlap
      result.push(current);
      i++;
    } else {
      // Handle overlap: split into non-overlapping regions
      const resolved = resolveOverlap(overlapping);
      result.push(...resolved);
      i = j;
    }
  }

  return result;
}

/**
 * Resolve overlapping segments by choosing the higher confidence speaker
 * @param {Array} segments - Overlapping segments
 * @returns {Array} Resolved non-overlapping segments
 */
function resolveOverlap(segments) {
  // Get all time points
  const timePoints = new Set();
  for (const seg of segments) {
    timePoints.add(seg.start);
    timePoints.add(seg.end);
  }

  const sortedTimes = [...timePoints].sort((a, b) => a - b);
  const result = [];

  for (let i = 0; i < sortedTimes.length - 1; i++) {
    const start = sortedTimes[i];
    const end = sortedTimes[i + 1];

    // Find all segments active during this interval
    const active = segments.filter(s => s.start <= start && s.end >= end);

    if (active.length === 0) continue;

    // Choose the one with highest confidence
    const best = active.reduce((a, b) => a.confidence > b.confidence ? a : b);

    // Check if we can merge with previous
    if (result.length > 0 && result[result.length - 1].speakerId === best.speakerId &&
        result[result.length - 1].end === start) {
      result[result.length - 1].end = end;
    } else {
      result.push({
        speakerId: best.speakerId,
        start,
        end,
        confidence: best.confidence
      });
    }
  }

  return result;
}

/**
 * Calculate edit statistics
 * @param {Array} cuts - Cut decisions
 * @param {number} totalDuration - Total sequence duration
 * @returns {Object} Statistics
 */
export function calculateEditStats(cuts, totalDuration) {
  if (!cuts || cuts.length === 0) {
    return {
      totalCuts: 0,
      cutsPerMinute: 0,
      averageShotDuration: totalDuration,
      shortestShot: totalDuration,
      longestShot: totalDuration,
      speakerChangeCuts: 0,
      reactionShotCuts: 0,
      lowConfidenceCuts: 0
    };
  }

  const shotDurations = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i].time;
    const end = i < cuts.length - 1 ? cuts[i + 1].time : totalDuration;
    shotDurations.push(end - start);
  }

  // Add first shot (before first cut)
  if (cuts.length > 0 && cuts[0].time > 0) {
    shotDurations.unshift(cuts[0].time);
  }

  return {
    totalCuts: cuts.length,
    cutsPerMinute: totalDuration > 0 ? (cuts.length / totalDuration) * 60 : 0,
    averageShotDuration: shotDurations.reduce((a, b) => a + b, 0) / shotDurations.length,
    shortestShot: Math.min(...shotDurations),
    longestShot: Math.max(...shotDurations),
    speakerChangeCuts: cuts.filter(c => c.reason === 'speaker_change').length,
    reactionShotCuts: cuts.filter(c => c.reason === 'reaction_shot').length,
    lowConfidenceCuts: cuts.filter(c => c.reason === 'low_confidence_wide').length
  };
}

/**
 * Validate speaker mappings
 * @param {Array} segments - Speaker segments
 * @param {Array} mappings - Speaker to camera mappings
 * @returns {Object} Validation result
 */
export function validateMappings(segments, mappings) {
  const speakersInSegments = new Set(segments.map(s => s.speakerId));
  const mappedSpeakers = new Set(mappings.map(m => m.speakerId));

  const unmappedSpeakers = [...speakersInSegments].filter(s => !mappedSpeakers.has(s));
  const unusedMappings = [...mappedSpeakers].filter(s => !speakersInSegments.has(s));

  return {
    valid: unmappedSpeakers.length === 0,
    unmappedSpeakers,
    unusedMappings,
    speakerCount: speakersInSegments.size,
    mappingCount: mappedSpeakers.size
  };
}
