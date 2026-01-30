/**
 * Panel-side constants
 * Duplicated from shared for UXP compatibility (no node_modules resolution)
 */

// Backend server configuration
export const BACKEND_PORT = 3847;
export const BACKEND_HOST = 'localhost';
export const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
export const BACKEND_WS_URL = `ws://${BACKEND_HOST}:${BACKEND_PORT}`;

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
  minCutDuration: 2.0,
  cameraHoldTime: 1.5,
  speakerConfidenceThreshold: 0.7,

  // Silence removal
  silenceThreshold: -40,
  minSilenceDuration: 0.4,
  silencePadding: 0.1,

  // Audio leveling
  targetLoudness: -16,
  targetPeak: -3,
  applyLimiter: true,

  // Reaction shots
  enableReactionShots: false,
  reactionShotFrequency: 30,
  reactionShotDuration: 2.0,

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
