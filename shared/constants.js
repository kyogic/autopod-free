/**
 * Shared constants between panel and backend
 */

// Backend server configuration
export const BACKEND_PORT = 3847;
export const BACKEND_HOST = 'localhost';
export const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

// WebSocket events
export const WS_EVENTS = {
  PROGRESS: 'progress',
  COMPLETE: 'complete',
  ERROR: 'error',
  CANCEL: 'cancel'
};

// Analysis job statuses
export const JOB_STATUS = {
  PENDING: 'pending',
  EXTRACTING: 'extracting',
  DIARIZING: 'diarizing',
  ANALYZING_SILENCE: 'analyzing_silence',
  ANALYZING_AUDIO: 'analyzing_audio',
  COMPLETE: 'complete',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

// Default settings
export const DEFAULT_SETTINGS = {
  // Cut behavior
  minCutDuration: 2.0,        // Minimum seconds before allowing a cut
  cameraHoldTime: 1.5,        // Minimum time to hold on a camera after cutting
  speakerConfidenceThreshold: 0.7, // Minimum confidence to trust speaker detection

  // Silence removal
  silenceThreshold: -40,      // dB threshold for silence
  minSilenceDuration: 0.4,    // Minimum silence duration to remove (seconds)
  silencePadding: 0.1,        // Padding to keep before/after silence (seconds)

  // Audio leveling
  targetLoudness: -16,        // Target LUFS for loudness normalization
  targetPeak: -3,             // Target peak dBFS
  applyLimiter: true,         // Whether to apply limiter effect

  // Reaction shots
  enableReactionShots: false, // Cut to listener occasionally
  reactionShotFrequency: 30,  // Minimum seconds between reaction shots
  reactionShotDuration: 2.0,  // Duration of reaction shots

  // Wide shot safety
  useWideShotOnLowConfidence: true,
  wideShotConfidenceThreshold: 0.5
};

// Speaker colors for UI
export const SPEAKER_COLORS = [
  '#4A90D9', // Blue
  '#D94A4A', // Red
  '#4AD94A', // Green
  '#D9D94A', // Yellow
  '#D94AD9', // Magenta
  '#4AD9D9'  // Cyan
];

// Media types
export const MEDIA_TYPE = {
  VIDEO: 'video',
  AUDIO: 'audio',
  ALL: 'all'
};
