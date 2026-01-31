/**
 * Premiere Pro Editor Operations
 * UXP API wrapper for editing operations (cuts, inserts, effects)
 *
 * Features:
 * - Action batching for single undo
 * - Sequence cloning
 * - Camera cut placement
 * - Silence removal with ripple delete
 * - Audio leveling
 */

// UXP Premiere Pro API
const { app, Constants } = require('premierepro');

// Ticks per second constant for Premiere Pro
const TICKS_PER_SECOND = 254016000000;

/**
 * Action batch for grouping multiple edits into single undo
 */
class ActionBatch {
  constructor(name = 'AutoPod Edit') {
    this.name = name;
    this.actions = [];
  }

  add(action) {
    if (action) {
      this.actions.push(action);
    }
    return this;
  }

  async execute() {
    if (this.actions.length === 0) return;

    // Execute all actions - Premiere groups sequential actions
    // into a single undo when done rapidly
    for (const action of this.actions) {
      await app.executeAction(action);
    }
  }

  get length() {
    return this.actions.length;
  }
}

export class PremiereEditor {
  constructor() {
    this.currentBatch = null;
  }

  /**
   * Convert seconds to TickTime object
   * @param {number} seconds - Time in seconds
   * @returns {Object} TickTime object
   */
  secondsToTicks(seconds) {
    return {
      ticks: Math.round(seconds * TICKS_PER_SECOND)
    };
  }

  /**
   * Convert TickTime to seconds
   * @param {Object} tickTime - TickTime object
   * @returns {number} Time in seconds
   */
  ticksToSeconds(tickTime) {
    return tickTime.ticks / TICKS_PER_SECOND;
  }

  /**
   * Start a new action batch for grouping edits
   * @param {string} name - Name for the undo group
   * @returns {ActionBatch} The new batch
   */
  startBatch(name = 'AutoPod Edit') {
    this.currentBatch = new ActionBatch(name);
    return this.currentBatch;
  }

  /**
   * Execute the current batch and clear it
   */
  async executeBatch() {
    if (this.currentBatch) {
      await this.currentBatch.execute();
      const count = this.currentBatch.length;
      this.currentBatch = null;
      return count;
    }
    return 0;
  }

  /**
   * Execute an action, adding to batch if one is active
   * @param {Object} action - Premiere action to execute
   */
  async executeAction(action) {
    if (this.currentBatch) {
      this.currentBatch.add(action);
    } else {
      await app.executeAction(action);
    }
  }

  /**
   * Get the active project
   * @returns {Promise<Object>} Project object
   */
  async getProject() {
    const project = await app.getProject();
    if (!project) {
      throw new Error('No project open');
    }
    return project;
  }

  /**
   * Get the active sequence
   * @returns {Promise<Object>} Sequence object
   */
  async getActiveSequence() {
    const project = await this.getProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) {
      throw new Error('No active sequence');
    }
    return sequence;
  }

  /**
   * Clone the active sequence with a new name
   * @param {string} newName - Name for the cloned sequence
   * @returns {Promise<Object>} New sequence info
   */
  async cloneSequence(newName) {
    const sequence = await this.getActiveSequence();

    // Create and execute clone action
    const cloneAction = sequence.createCloneAction();
    await app.executeAction(cloneAction);

    // Get the new sequence (should be the active one now)
    const project = await this.getProject();
    const newSequence = await project.getActiveSequence();

    // Rename it via the project item
    try {
      const projectItem = await newSequence.getProjectItem();
      if (projectItem) {
        const renameAction = projectItem.createSetNameAction(newName);
        await app.executeAction(renameAction);
      }
    } catch (err) {
      console.warn('Could not rename cloned sequence:', err);
    }

    return {
      id: newSequence.guid,
      name: newName,
      _sequence: newSequence
    };
  }

  /**
   * Create preview markers for speaker segments
   * Non-destructive - only adds markers for visualization
   * @param {Array} segments - Speaker segments with timing
   * @param {Array} mappings - Speaker to camera mappings
   * @returns {Promise<number>} Number of markers created
   */
  async createPreviewMarkers(segments, mappings) {
    const sequence = await this.getActiveSequence();
    const markers = sequence.markers;
    let count = 0;

    for (const segment of segments) {
      const mapping = mappings.find(m => m.speakerId === segment.speakerId);
      if (!mapping) continue;

      try {
        // Create marker at segment start
        const time = this.secondsToTicks(segment.start);
        const marker = markers.createMarker(time);

        if (marker) {
          // Determine camera name
          const cameraName = mapping.cameraIndex === 'wide'
            ? 'Wide Shot'
            : `Camera ${Number(mapping.cameraIndex) + 1}`;

          // Set marker properties
          const nameAction = marker.createSetNameAction(
            `${segment.speakerId} → ${cameraName}`
          );
          await app.executeAction(nameAction);

          const commentAction = marker.createSetCommentsAction(
            `Duration: ${(segment.end - segment.start).toFixed(2)}s\n` +
            `Confidence: ${(segment.confidence * 100).toFixed(0)}%`
          );
          await app.executeAction(commentAction);

          // Set color based on speaker index
          const speakerIndex = mappings.findIndex(m => m.speakerId === segment.speakerId);
          const colorAction = marker.createSetColorByIndexAction(speakerIndex % 8);
          await app.executeAction(colorAction);

          count++;
        }
      } catch (err) {
        console.warn(`Failed to create marker for segment at ${segment.start}:`, err);
      }
    }

    return count;
  }

  /**
   * Clear all markers from the active sequence
   */
  async clearMarkers() {
    const sequence = await this.getActiveSequence();
    const markers = sequence.markers;

    // Collect all markers
    const toDelete = [];
    let marker = markers.getFirstMarker();
    while (marker) {
      toDelete.push(marker);
      marker = markers.getNextMarker(marker);
    }

    // Delete each marker
    for (const m of toDelete) {
      try {
        markers.deleteMarker(m);
      } catch (err) {
        console.warn('Failed to delete marker:', err);
      }
    }

    return toDelete.length;
  }

  /**
   * Apply camera cuts based on cut decisions
   * @param {Array} cuts - Cut decisions from generateCutList
   * @param {Array} cameras - Available camera clips (with _projectItem)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Result with counts
   */
  async applyCameraCuts(cuts, cameras, options = {}) {
    const {
      videoTrackIndex = 0,
      audioTrackIndex = 0,
      useBatch = true
    } = options;

    if (!cuts || cuts.length === 0) {
      return { cutsApplied: 0 };
    }

    const sequence = await this.getActiveSequence();
    const sequenceEditor = await sequence.getSequenceEditor();

    if (useBatch) {
      this.startBatch('AutoPod Camera Cuts');
    }

    let cutsApplied = 0;
    let errors = [];

    for (const cut of cuts) {
      try {
        // Determine which camera to use
        let camera;
        if (cut.toCamera === 'wide' || cut.cameraIndex === 'wide') {
          // Use last camera as wide shot (configurable)
          camera = cameras[cameras.length - 1];
        } else {
          const camIndex = cut.toCamera !== undefined ? cut.toCamera : cut.cameraIndex;
          camera = cameras[camIndex];
        }

        if (!camera || !camera._projectItem) {
          errors.push(`Camera not found for cut at ${cut.time}s`);
          continue;
        }

        // Calculate the cut duration
        const cutTime = this.secondsToTicks(cut.time);
        const cutEnd = cut.segmentEnd || cut.end || (cut.time + (cut.duration || 5));

        // Create overwrite action to place clip
        const overwriteAction = sequenceEditor.createOverwriteItemAction(
          camera._projectItem,
          cutTime,
          videoTrackIndex,
          audioTrackIndex
        );

        await this.executeAction(overwriteAction);
        cutsApplied++;

      } catch (err) {
        errors.push(`Cut at ${cut.time}s failed: ${err.message}`);
      }
    }

    if (useBatch) {
      await this.executeBatch();
    }

    return {
      cutsApplied,
      totalCuts: cuts.length,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Remove silence regions from the sequence with ripple delete
   * @param {Array} silences - Silence regions to remove
   * @param {Object} settings - Settings with padding values
   * @returns {Promise<Object>} Result with counts
   */
  async removeSilences(silences, settings = {}) {
    const {
      silencePadding = 0.1,
      minSilenceDuration = 0.3,
      useBatch = true
    } = settings;

    if (!silences || silences.length === 0) {
      return { silencesRemoved: 0, timeRemoved: 0 };
    }

    const sequence = await this.getActiveSequence();
    const sequenceEditor = await sequence.getSequenceEditor();

    // Sort silences in reverse order (remove from end first to preserve timing)
    const sortedSilences = [...silences].sort((a, b) => b.start - a.start);

    if (useBatch) {
      this.startBatch('AutoPod Silence Removal');
    }

    let silencesRemoved = 0;
    let timeRemoved = 0;

    for (const silence of sortedSilences) {
      // Apply padding
      const start = silence.start + silencePadding;
      const end = silence.end - silencePadding;
      const duration = end - start;

      // Skip if padding eliminates the silence or it's too short
      if (duration < minSilenceDuration) continue;

      try {
        await this._rippleDeleteRegion(sequenceEditor, sequence, start, end);
        silencesRemoved++;
        timeRemoved += duration;
      } catch (err) {
        console.warn(`Failed to remove silence at ${silence.start}s:`, err);
      }
    }

    if (useBatch) {
      await this.executeBatch();
    }

    return {
      silencesRemoved,
      totalSilences: silences.length,
      timeRemoved: Math.round(timeRemoved * 100) / 100
    };
  }

  /**
   * Perform a ripple delete on a time region
   * @private
   */
  async _rippleDeleteRegion(sequenceEditor, sequence, startSeconds, endSeconds) {
    const videoTrackCount = await sequence.getVideoTrackCount();
    const audioTrackCount = await sequence.getAudioTrackCount();

    const videoItems = [];
    const audioItems = [];

    // Collect video items in the region
    for (let i = 0; i < videoTrackCount; i++) {
      const track = await sequence.getVideoTrack(i);
      const items = track.getTrackItems(1, false); // CLIP type

      for (const item of items) {
        const itemStart = this.ticksToSeconds(await item.getStartTime());
        const itemEnd = this.ticksToSeconds(await item.getEndTime());

        // Check if item is fully within the silence region
        if (itemStart >= startSeconds && itemEnd <= endSeconds) {
          videoItems.push(item);
        }
        // TODO: Handle partial overlaps by trimming
      }
    }

    // Collect audio items in the region
    for (let i = 0; i < audioTrackCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);

      for (const item of items) {
        const itemStart = this.ticksToSeconds(await item.getStartTime());
        const itemEnd = this.ticksToSeconds(await item.getEndTime());

        if (itemStart >= startSeconds && itemEnd <= endSeconds) {
          audioItems.push(item);
        }
      }
    }

    // Create selection and remove with ripple
    if (videoItems.length > 0 || audioItems.length > 0) {
      const selection = {
        videoClipTrackItems: videoItems,
        audioClipTrackItems: audioItems
      };

      const removeAction = sequenceEditor.createRemoveItemsAction(
        selection,
        true, // ripple
        Constants.MediaType.ALL,
        true  // shift overlapping
      );

      await this.executeAction(removeAction);
    }
  }

  /**
   * Apply audio leveling to all audio clips in the sequence
   * @param {Object} audioAnalysis - Audio analysis with LUFS measurement
   * @param {Object} settings - Target loudness settings
   * @returns {Promise<Object>} Result with adjustment info
   */
  async applyAudioLeveling(audioAnalysis, settings = {}) {
    const {
      targetLoudness = -16,
      applyLimiter = false,
      useBatch = true
    } = settings;

    const sequence = await this.getActiveSequence();

    // Calculate gain adjustment
    const currentLUFS = audioAnalysis.integratedLufs || audioAnalysis.integratedLUFS;
    const gainAdjustment = targetLoudness - currentLUFS;

    // Clamp to reasonable range
    const clampedGain = Math.max(-24, Math.min(24, gainAdjustment));

    if (useBatch) {
      this.startBatch('AutoPod Audio Leveling');
    }

    const audioTrackCount = await sequence.getAudioTrackCount();
    let clipsAdjusted = 0;

    for (let i = 0; i < audioTrackCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);

      for (const item of items) {
        try {
          const adjusted = await this._adjustClipVolume(item, clampedGain);
          if (adjusted) clipsAdjusted++;
        } catch (err) {
          console.warn(`Failed to adjust audio clip:`, err);
        }
      }
    }

    if (useBatch) {
      await this.executeBatch();
    }

    return {
      clipsAdjusted,
      gainApplied: clampedGain,
      originalLUFS: currentLUFS,
      targetLUFS: targetLoudness
    };
  }

  /**
   * Adjust volume of a single audio clip
   * @private
   */
  async _adjustClipVolume(audioClip, gainDb) {
    const componentChain = await audioClip.getComponentChain();
    const componentCount = componentChain.getComponentCount();

    // Look for existing Volume component
    for (let i = 0; i < componentCount; i++) {
      const component = componentChain.getComponentAtIndex(i);
      const name = await component.getDisplayName();

      if (name === 'Volume') {
        // Find the Level property
        const properties = await component.getProperties();
        for (const prop of properties) {
          const propName = await prop.getDisplayName();
          if (propName === 'Level') {
            const currentValue = await prop.getValue();
            const newValue = Math.max(-96, Math.min(12, currentValue + gainDb));

            const setAction = prop.createSetValueAction(newValue);
            await this.executeAction(setAction);
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get information about the current sequence
   * @returns {Promise<Object>} Sequence information
   */
  async getSequenceInfo() {
    const sequence = await this.getActiveSequence();

    const endTime = await sequence.getEndTime();
    const videoTrackCount = await sequence.getVideoTrackCount();
    const audioTrackCount = await sequence.getAudioTrackCount();
    const settings = await sequence.getSettings();

    return {
      name: sequence.name,
      guid: sequence.guid,
      duration: this.ticksToSeconds(endTime),
      videoTrackCount,
      audioTrackCount,
      settings
    };
  }

  /**
   * Complete editing workflow: clone, apply cuts, remove silence, level audio
   * @param {Object} analysisResult - Full analysis result from backend
   * @param {Array} speakerMappings - Speaker to camera mappings
   * @param {Array} cameras - Camera clips
   * @param {Object} settings - All edit settings
   * @returns {Promise<Object>} Complete result summary
   */
  async applyFullEdit(analysisResult, speakerMappings, cameras, settings = {}) {
    const results = {
      sequenceCloned: false,
      cutsApplied: 0,
      silencesRemoved: 0,
      timeRemoved: 0,
      audioAdjusted: false,
      errors: []
    };

    try {
      // Step 1: Clone the sequence
      const originalSequence = await this.getActiveSequence();
      const newName = `${originalSequence.name} - AutoPod Edit`;

      const cloneResult = await this.cloneSequence(newName);
      results.sequenceCloned = true;
      results.newSequenceName = cloneResult.name;

      // Step 2: Apply camera cuts
      if (analysisResult.segments && analysisResult.segments.length > 0) {
        // Generate cuts from segments using the same logic as backend
        const cuts = this._generateCutsFromSegments(
          analysisResult.segments,
          speakerMappings,
          settings
        );

        const cutResult = await this.applyCameraCuts(cuts, cameras, settings);
        results.cutsApplied = cutResult.cutsApplied;
        if (cutResult.errors) {
          results.errors.push(...cutResult.errors);
        }
      }

      // Step 3: Remove silences (if enabled)
      if (settings.enableSilenceRemoval && analysisResult.silences) {
        const silenceResult = await this.removeSilences(analysisResult.silences, settings);
        results.silencesRemoved = silenceResult.silencesRemoved;
        results.timeRemoved = silenceResult.timeRemoved;
      }

      // Step 4: Apply audio leveling (if enabled)
      if (settings.enableAudioLeveling && analysisResult.audioAnalysis) {
        const audioResult = await this.applyAudioLeveling(analysisResult.audioAnalysis, settings);
        results.audioAdjusted = audioResult.clipsAdjusted > 0;
        results.gainApplied = audioResult.gainApplied;
      }

    } catch (err) {
      results.errors.push(err.message);
    }

    return results;
  }

  /**
   * Generate cut decisions from speaker segments
   * Mirrors the backend cutLogic for consistency
   * @private
   */
  _generateCutsFromSegments(segments, mappings, settings) {
    const {
      minCutDuration = 2.0,
      cameraHoldTime = 1.5,
      speakerConfidenceThreshold = 0.7,
      useWideShotOnLowConfidence = true
    } = settings;

    const cuts = [];
    let lastCameraIndex = null;
    let lastCutTime = 0;

    // Sort segments by start time
    const sorted = [...segments].sort((a, b) => a.start - b.start);

    for (const segment of sorted) {
      const mapping = mappings.find(m => m.speakerId === segment.speakerId);
      if (!mapping) continue;

      const cameraIndex = mapping.cameraIndex;
      const timeSinceLastCut = segment.start - lastCutTime;

      // Check if we should cut
      if (cameraIndex !== lastCameraIndex) {
        if (timeSinceLastCut >= minCutDuration || lastCameraIndex === null) {
          // Apply camera hold time
          let cutTime = segment.start;
          if (lastCutTime > 0 && cutTime - lastCutTime < cameraHoldTime) {
            cutTime = lastCutTime + cameraHoldTime;
          }

          if (segment.confidence >= speakerConfidenceThreshold) {
            cuts.push({
              time: cutTime,
              toCamera: cameraIndex,
              speakerId: segment.speakerId,
              confidence: segment.confidence,
              segmentEnd: segment.end,
              reason: 'speaker_change'
            });
            lastCameraIndex = cameraIndex;
            lastCutTime = cutTime;
          } else if (useWideShotOnLowConfidence) {
            cuts.push({
              time: cutTime,
              toCamera: 'wide',
              speakerId: segment.speakerId,
              confidence: segment.confidence,
              segmentEnd: segment.end,
              reason: 'low_confidence'
            });
            lastCameraIndex = 'wide';
            lastCutTime = cutTime;
          }
        }
      }
    }

    return cuts;
  }
}
