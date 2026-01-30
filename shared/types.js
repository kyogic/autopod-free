/**
 * @typedef {Object} SpeakerSegment
 * @property {string} speakerId - Unique speaker identifier (e.g., "SPEAKER_00")
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 * @property {number} confidence - Confidence score (0-1)
 */

/**
 * @typedef {Object} SilenceRegion
 * @property {number} start - Start time in seconds
 * @property {number} end - End time in seconds
 * @property {number} duration - Duration in seconds
 */

/**
 * @typedef {Object} AudioAnalysis
 * @property {number} peakDb - Peak level in dBFS
 * @property {number} integratedLufs - Integrated loudness in LUFS
 * @property {number} truePeak - True peak in dBTP
 * @property {number} loudnessRange - Loudness range in LU
 */

/**
 * @typedef {Object} CutDecision
 * @property {number} time - Cut time in seconds
 * @property {string} fromCamera - Camera/clip ID cutting from
 * @property {string} toCamera - Camera/clip ID cutting to
 * @property {string} reason - Reason for cut (speaker_change, reaction_shot, low_confidence)
 * @property {number} confidence - Confidence in this decision
 */

/**
 * @typedef {Object} SpeakerCameraMapping
 * @property {string} speakerId - Speaker identifier
 * @property {string} cameraId - Camera/clip identifier
 * @property {string} label - Display label for UI
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} jobId - Unique job identifier
 * @property {string} status - Job status
 * @property {SpeakerSegment[]} segments - Detected speaker segments
 * @property {SilenceRegion[]} silences - Detected silence regions
 * @property {AudioAnalysis} audioAnalysis - Audio level analysis
 * @property {number} duration - Total audio duration in seconds
 */

/**
 * @typedef {Object} EditSettings
 * @property {number} minCutDuration - Minimum seconds between cuts
 * @property {number} cameraHoldTime - Minimum time to hold on camera
 * @property {number} speakerConfidenceThreshold - Confidence threshold for speaker detection
 * @property {number} silenceThreshold - dB threshold for silence
 * @property {number} minSilenceDuration - Minimum silence duration to remove
 * @property {number} silencePadding - Padding around silences
 * @property {number} targetLoudness - Target LUFS
 * @property {number} targetPeak - Target peak dBFS
 * @property {boolean} applyLimiter - Whether to apply limiter
 * @property {boolean} enableReactionShots - Enable reaction shot cuts
 * @property {number} reactionShotFrequency - Seconds between reaction shots
 * @property {number} reactionShotDuration - Duration of reaction shots
 * @property {boolean} useWideShotOnLowConfidence - Use wide shot when confidence is low
 * @property {number} wideShotConfidenceThreshold - Threshold for wide shot fallback
 */

/**
 * @typedef {Object} ProjectClip
 * @property {string} id - Premiere ProjectItem node ID
 * @property {string} name - Clip name
 * @property {string} path - Media file path
 * @property {number} duration - Duration in seconds
 * @property {boolean} hasAudio - Whether clip has audio
 * @property {boolean} hasVideo - Whether clip has video
 */

/**
 * @typedef {Object} SequenceInfo
 * @property {string} id - Sequence ID
 * @property {string} name - Sequence name
 * @property {number} duration - Duration in seconds
 * @property {number} videoTrackCount - Number of video tracks
 * @property {number} audioTrackCount - Number of audio tracks
 */

export const Types = {};
