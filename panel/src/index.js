/**
 * AutoPod Free - Main Panel Entry Point
 * UXP Panel for Adobe Premiere Pro
 */

import { BackendAPI } from './api/backend.js';
import { PremiereSequence } from './premiere/sequence.js';
import { PremiereEditor } from './premiere/editor.js';
import { DEFAULT_SETTINGS, SPEAKER_COLORS } from './constants.js';

// State management
const state = {
  backendConnected: false,
  activeSequence: null,
  audioTracks: [],
  cameraClips: [],
  selectedAudioTrack: null,
  selectedCameras: [],
  analysisResult: null,
  speakerMappings: [],
  settings: { ...DEFAULT_SETTINGS },
  isAnalyzing: false,
  isApplying: false
};

// API instances
const backend = new BackendAPI();
const premiereSeq = new PremiereSequence();
const premiereEditor = new PremiereEditor();

// DOM Elements
const elements = {
  // Connection
  connectionStatus: document.getElementById('connectionStatus'),

  // Sequence section
  sequenceInfo: document.getElementById('sequenceInfo'),
  refreshSequenceBtn: document.getElementById('refreshSequenceBtn'),
  audioTrackSelect: document.getElementById('audioTrackSelect'),
  cameraClipList: document.getElementById('cameraClipList'),
  loadClipsBtn: document.getElementById('loadClipsBtn'),

  // Analysis section
  analyzeBtn: document.getElementById('analyzeBtn'),
  progressContainer: document.getElementById('progressContainer'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),

  // Mapping section
  mappingSection: document.getElementById('mappingSection'),
  speakerMapContainer: document.getElementById('speakerMapContainer'),
  timelineTrack: document.getElementById('timelineTrack'),
  timelineRuler: document.getElementById('timelineRuler'),

  // Settings
  minCutDuration: document.getElementById('minCutDuration'),
  cameraHoldTime: document.getElementById('cameraHoldTime'),
  speakerConfidence: document.getElementById('speakerConfidence'),
  speakerConfidenceValue: document.getElementById('speakerConfidenceValue'),
  enableSilenceRemoval: document.getElementById('enableSilenceRemoval'),
  silenceThreshold: document.getElementById('silenceThreshold'),
  minSilenceDuration: document.getElementById('minSilenceDuration'),
  silencePadding: document.getElementById('silencePadding'),
  enableAudioLeveling: document.getElementById('enableAudioLeveling'),
  targetLoudness: document.getElementById('targetLoudness'),
  applyLimiter: document.getElementById('applyLimiter'),
  enableReactionShots: document.getElementById('enableReactionShots'),
  useWideShot: document.getElementById('useWideShot'),

  // Apply section
  editSummary: document.getElementById('editSummary'),
  cutsCount: document.getElementById('cutsCount'),
  silencesCount: document.getElementById('silencesCount'),
  timeSaved: document.getElementById('timeSaved'),
  previewBtn: document.getElementById('previewBtn'),
  applyEditsBtn: document.getElementById('applyEditsBtn'),

  // Log
  logOutput: document.getElementById('logOutput')
};

/**
 * Initialize the panel
 */
async function init() {
  log('Initializing AutoPod Free...');

  // Set up event listeners
  setupEventListeners();

  // Connect to backend
  await connectToBackend();

  // Load active sequence
  await refreshSequence();

  log('Ready.');
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Sequence controls
  elements.refreshSequenceBtn.addEventListener('click', refreshSequence);
  elements.loadClipsBtn.addEventListener('click', loadProjectClips);
  elements.audioTrackSelect.addEventListener('change', onAudioTrackChange);

  // Analysis
  elements.analyzeBtn.addEventListener('click', startAnalysis);

  // Settings - range slider display
  elements.speakerConfidence.addEventListener('input', (e) => {
    elements.speakerConfidenceValue.textContent = e.target.value;
  });

  // Apply controls
  elements.previewBtn.addEventListener('click', previewEdits);
  elements.applyEditsBtn.addEventListener('click', applyEdits);

  // Backend events
  backend.on('progress', onAnalysisProgress);
  backend.on('complete', onAnalysisComplete);
  backend.on('error', onAnalysisError);
  backend.on('connected', onBackendConnected);
  backend.on('disconnected', onBackendDisconnected);
}

/**
 * Connect to the local backend service
 */
async function connectToBackend() {
  updateConnectionStatus('connecting');

  try {
    await backend.connect();
    // Connection status will be updated via event
  } catch (err) {
    log(`Backend connection failed: ${err.message}`, 'error');
    updateConnectionStatus('offline');
  }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status) {
  const dot = elements.connectionStatus.querySelector('.status-dot');
  const text = elements.connectionStatus.querySelector('.status-text');

  dot.className = 'status-dot ' + status;

  switch (status) {
    case 'online':
      text.textContent = 'Backend Connected';
      break;
    case 'connecting':
      text.textContent = 'Connecting...';
      break;
    default:
      text.textContent = 'Backend Offline';
  }
}

/**
 * Refresh active sequence info
 */
async function refreshSequence() {
  try {
    state.activeSequence = await premiereSeq.getActiveSequence();

    if (state.activeSequence) {
      elements.sequenceInfo.innerHTML = `
        <strong>${state.activeSequence.name}</strong><br>
        Duration: ${formatTime(state.activeSequence.duration)}<br>
        Video: ${state.activeSequence.videoTrackCount} tracks |
        Audio: ${state.activeSequence.audioTrackCount} tracks
      `;

      // Populate audio track dropdown
      await populateAudioTracks();

      elements.audioTrackSelect.disabled = false;
      updateAnalyzeButton();
    } else {
      elements.sequenceInfo.innerHTML = '<span class="placeholder">No active sequence</span>';
      elements.audioTrackSelect.disabled = true;
    }
  } catch (err) {
    log(`Error loading sequence: ${err.message}`, 'error');
  }
}

/**
 * Populate audio track dropdown
 */
async function populateAudioTracks() {
  const select = elements.audioTrackSelect;
  select.innerHTML = '<option value="">Select audio track...</option>';

  if (state.activeSequence) {
    state.audioTracks = await premiereSeq.getAudioTracks();

    state.audioTracks.forEach((track, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = `Audio ${index + 1}${track.name ? ` (${track.name})` : ''}`;
      select.appendChild(option);
    });
  }
}

/**
 * Handle audio track selection change
 */
function onAudioTrackChange(e) {
  state.selectedAudioTrack = e.target.value ? parseInt(e.target.value) : null;
  updateAnalyzeButton();
}

/**
 * Load camera clips from project
 */
async function loadProjectClips() {
  try {
    log('Loading clips from project...');
    state.cameraClips = await premiereSeq.getProjectClips();

    if (state.cameraClips.length === 0) {
      elements.cameraClipList.innerHTML = '<span class="placeholder">No video clips found in project</span>';
      return;
    }

    elements.cameraClipList.innerHTML = '';

    state.cameraClips.forEach((clip, index) => {
      const item = document.createElement('div');
      item.className = 'clip-item';
      item.innerHTML = `
        <input type="checkbox" id="clip_${index}" data-index="${index}" checked>
        <label for="clip_${index}" class="clip-name" title="${clip.name}">${clip.name}</label>
      `;

      item.querySelector('input').addEventListener('change', (e) => {
        updateSelectedCameras();
      });

      elements.cameraClipList.appendChild(item);
    });

    updateSelectedCameras();
    updateAnalyzeButton();

    log(`Loaded ${state.cameraClips.length} clips.`);
  } catch (err) {
    log(`Error loading clips: ${err.message}`, 'error');
  }
}

/**
 * Update selected cameras from checkboxes
 */
function updateSelectedCameras() {
  const checkboxes = elements.cameraClipList.querySelectorAll('input[type="checkbox"]:checked');
  state.selectedCameras = Array.from(checkboxes).map(cb => {
    const index = parseInt(cb.dataset.index);
    return state.cameraClips[index];
  });
  updateAnalyzeButton();
}

/**
 * Update analyze button state
 */
function updateAnalyzeButton() {
  const canAnalyze = state.backendConnected &&
                     state.activeSequence &&
                     state.selectedAudioTrack !== null &&
                     state.selectedCameras.length >= 2;

  elements.analyzeBtn.disabled = !canAnalyze;
}

/**
 * Start audio analysis
 */
async function startAnalysis() {
  if (state.isAnalyzing) return;

  state.isAnalyzing = true;
  elements.analyzeBtn.disabled = true;
  elements.progressContainer.classList.remove('hidden');
  elements.progressFill.style.width = '0%';
  elements.progressText.textContent = 'Preparing audio...';

  try {
    // Get audio file path from selected track
    const audioPath = await premiereSeq.getAudioSourcePath(state.selectedAudioTrack);

    if (!audioPath) {
      throw new Error('Could not determine audio source path');
    }

    log(`Analyzing: ${audioPath}`);

    // Start analysis job
    await backend.startAnalysis({
      audioPath,
      numSpeakers: state.selectedCameras.length,
      settings: gatherSettings()
    });

  } catch (err) {
    log(`Analysis failed: ${err.message}`, 'error');
    state.isAnalyzing = false;
    elements.progressContainer.classList.add('hidden');
    updateAnalyzeButton();
  }
}

/**
 * Handle analysis progress updates
 */
function onAnalysisProgress(data) {
  elements.progressFill.style.width = `${data.progress}%`;
  elements.progressText.textContent = data.message || `Processing... ${data.progress}%`;
}

/**
 * Handle analysis completion
 */
function onAnalysisComplete(result) {
  state.isAnalyzing = false;
  state.analysisResult = result;

  elements.progressContainer.classList.add('hidden');
  log('Analysis complete!', 'success');

  // Show mapping section
  displaySpeakerMapping(result.segments);
  displayTimelinePreview(result.segments, result.duration);
  updateEditSummary(result);

  elements.mappingSection.classList.remove('hidden');
  elements.editSummary.classList.remove('hidden');
  elements.previewBtn.disabled = false;
  elements.applyEditsBtn.disabled = false;

  updateAnalyzeButton();
}

/**
 * Handle analysis error
 */
function onAnalysisError(error) {
  state.isAnalyzing = false;
  elements.progressContainer.classList.add('hidden');
  log(`Analysis error: ${error.message}`, 'error');
  updateAnalyzeButton();
}

/**
 * Display speaker-to-camera mapping UI
 */
function displaySpeakerMapping(segments) {
  // Get unique speakers
  const speakers = [...new Set(segments.map(s => s.speakerId))];

  elements.speakerMapContainer.innerHTML = '';
  state.speakerMappings = [];

  speakers.forEach((speakerId, index) => {
    const color = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

    const row = document.createElement('div');
    row.className = 'speaker-row';
    row.innerHTML = `
      <div class="speaker-color" style="background-color: ${color}"></div>
      <span class="speaker-label">${speakerId}</span>
      <select data-speaker="${speakerId}">
        ${state.selectedCameras.map((cam, i) =>
          `<option value="${i}" ${i === index ? 'selected' : ''}>${cam.name}</option>`
        ).join('')}
        <option value="wide">Wide Shot</option>
      </select>
    `;

    row.querySelector('select').addEventListener('change', onMappingChange);
    elements.speakerMapContainer.appendChild(row);

    // Initial mapping
    state.speakerMappings.push({
      speakerId,
      cameraIndex: index < state.selectedCameras.length ? index : 0,
      color
    });
  });
}

/**
 * Handle speaker-camera mapping change
 */
function onMappingChange(e) {
  const speakerId = e.target.dataset.speaker;
  const value = e.target.value;

  const mapping = state.speakerMappings.find(m => m.speakerId === speakerId);
  if (mapping) {
    mapping.cameraIndex = value === 'wide' ? 'wide' : parseInt(value);
  }

  // Refresh timeline preview with new mapping
  if (state.analysisResult) {
    displayTimelinePreview(state.analysisResult.segments, state.analysisResult.duration);
  }
}

/**
 * Display timeline preview with speaker segments
 */
function displayTimelinePreview(segments, duration) {
  elements.timelineTrack.innerHTML = '';

  segments.forEach(segment => {
    const mapping = state.speakerMappings.find(m => m.speakerId === segment.speakerId);
    if (!mapping) return;

    const left = (segment.start / duration) * 100;
    const width = ((segment.end - segment.start) / duration) * 100;

    const el = document.createElement('div');
    el.className = 'timeline-segment';
    el.style.left = `${left}%`;
    el.style.width = `${width}%`;
    el.style.backgroundColor = mapping.color;
    el.title = `${segment.speakerId}: ${formatTime(segment.start)} - ${formatTime(segment.end)}`;

    elements.timelineTrack.appendChild(el);
  });

  // Update ruler
  elements.timelineRuler.innerHTML = `
    <span>0:00</span>
    <span>${formatTime(duration / 2)}</span>
    <span>${formatTime(duration)}</span>
  `;
}

/**
 * Update edit summary display
 */
function updateEditSummary(result) {
  const cuts = result.segments.length - 1;
  const silences = result.silences ? result.silences.length : 0;
  const timeSaved = result.silences
    ? result.silences.reduce((sum, s) => sum + s.duration, 0)
    : 0;

  elements.cutsCount.textContent = cuts;
  elements.silencesCount.textContent = silences;
  elements.timeSaved.textContent = formatTime(timeSaved);
}

/**
 * Gather current settings from UI
 */
function gatherSettings() {
  return {
    minCutDuration: parseFloat(elements.minCutDuration.value),
    cameraHoldTime: parseFloat(elements.cameraHoldTime.value),
    speakerConfidenceThreshold: parseFloat(elements.speakerConfidence.value),
    enableSilenceRemoval: elements.enableSilenceRemoval.checked,
    silenceThreshold: parseFloat(elements.silenceThreshold.value),
    minSilenceDuration: parseFloat(elements.minSilenceDuration.value),
    silencePadding: parseFloat(elements.silencePadding.value),
    enableAudioLeveling: elements.enableAudioLeveling.checked,
    targetLoudness: parseFloat(elements.targetLoudness.value),
    applyLimiter: elements.applyLimiter.checked,
    enableReactionShots: elements.enableReactionShots.checked,
    useWideShotOnLowConfidence: elements.useWideShot.checked
  };
}

/**
 * Preview edits (markers only, no actual edits)
 */
async function previewEdits() {
  try {
    log('Creating preview markers...');

    await premiereEditor.createPreviewMarkers(
      state.analysisResult.segments,
      state.speakerMappings
    );

    log('Preview markers created. Check sequence markers.', 'success');
  } catch (err) {
    log(`Preview failed: ${err.message}`, 'error');
  }
}

/**
 * Apply all edits to a new sequence
 */
async function applyEdits() {
  if (state.isApplying) return;

  const settings = gatherSettings();

  state.isApplying = true;
  elements.applyEditsBtn.disabled = true;
  log('Applying edits...');

  try {
    // Clone the sequence first
    const newSequence = await premiereEditor.cloneSequence(
      state.activeSequence.name + ' - AutoPod Edit'
    );

    log('Created new sequence: ' + newSequence.name);

    // Apply camera cuts
    await premiereEditor.applyCameraCuts(
      state.analysisResult.segments,
      state.speakerMappings,
      state.selectedCameras,
      settings
    );

    log('Applied camera cuts.');

    // Apply silence removal if enabled
    if (settings.enableSilenceRemoval && state.analysisResult.silences) {
      await premiereEditor.removeSilences(
        state.analysisResult.silences,
        settings
      );
      log('Removed silences.');
    }

    // Apply audio leveling if enabled
    if (settings.enableAudioLeveling && state.analysisResult.audioAnalysis) {
      await premiereEditor.applyAudioLeveling(
        state.analysisResult.audioAnalysis,
        settings
      );
      log('Applied audio leveling.');
    }

    log('All edits applied successfully!', 'success');

  } catch (err) {
    log(`Failed to apply edits: ${err.message}`, 'error');
  } finally {
    state.isApplying = false;
    elements.applyEditsBtn.disabled = false;
  }
}

/**
 * Backend connection handlers
 */
function onBackendConnected() {
  state.backendConnected = true;
  updateConnectionStatus('online');
  log('Connected to backend service.');
  updateAnalyzeButton();
}

function onBackendDisconnected() {
  state.backendConnected = false;
  updateConnectionStatus('offline');
  log('Disconnected from backend.', 'error');
  updateAnalyzeButton();
}

/**
 * Log message to panel footer
 */
function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type !== 'info' ? ` ${type}` : '');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

  elements.logOutput.appendChild(entry);
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;

  // Keep only last 50 entries
  while (elements.logOutput.children.length > 50) {
    elements.logOutput.removeChild(elements.logOutput.firstChild);
  }
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Initialize on load
init();
