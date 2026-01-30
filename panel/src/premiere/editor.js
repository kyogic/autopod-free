/**
 * Premiere Pro Editor Operations
 * UXP API wrapper for editing operations (cuts, inserts, effects)
 */

// UXP Premiere Pro API
const { app, Constants, TickTime } = require('premierepro');

// Ticks per second constant for Premiere Pro
const TICKS_PER_SECOND = 254016000000;

export class PremiereEditor {
  /**
   * Convert seconds to TickTime
   */
  secondsToTicks(seconds) {
    return {
      ticks: Math.round(seconds * TICKS_PER_SECOND)
    };
  }

  /**
   * Clone the active sequence with a new name
   * @param {string} newName - Name for the cloned sequence
   * @returns {Promise<Object>} New sequence info
   */
  async cloneSequence(newName) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new Error('No active sequence to clone');
    }

    // Create clone action
    const cloneAction = sequence.createCloneAction();

    // Execute the action
    await app.executeAction(cloneAction);

    // Get the new sequence (should be the active one now)
    const newSequence = await project.getActiveSequence();

    // Rename it
    // Note: Direct renaming may require accessing the project item
    const projectItem = await newSequence.getProjectItem();
    if (projectItem) {
      const renameAction = projectItem.createSetNameAction(newName);
      await app.executeAction(renameAction);
    }

    return {
      id: newSequence.guid,
      name: newName,
      _sequence: newSequence
    };
  }

  /**
   * Create preview markers for speaker segments
   * Does not modify the timeline, just adds markers for visualization
   * @param {Array} segments - Speaker segments
   * @param {Array} mappings - Speaker to camera mappings
   */
  async createPreviewMarkers(segments, mappings) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new Error('No active sequence');
    }

    const markers = sequence.markers;

    // Create a marker for each speaker change
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const mapping = mappings.find(m => m.speakerId === segment.speakerId);

      if (!mapping) continue;

      // Create marker at segment start
      const time = this.secondsToTicks(segment.start);
      const marker = markers.createMarker(time);

      if (marker) {
        // Set marker properties
        const cameraName = mapping.cameraIndex === 'wide'
          ? 'Wide Shot'
          : `Camera ${mapping.cameraIndex + 1}`;

        const nameAction = marker.createSetNameAction(`${segment.speakerId} -> ${cameraName}`);
        const commentAction = marker.createSetCommentsAction(
          `Duration: ${(segment.end - segment.start).toFixed(2)}s\nConfidence: ${(segment.confidence * 100).toFixed(0)}%`
        );

        await app.executeAction(nameAction);
        await app.executeAction(commentAction);

        // Set marker color based on speaker
        const colorIndex = mappings.indexOf(mapping) % 8;
        const colorAction = marker.createSetColorByIndexAction(colorIndex);
        await app.executeAction(colorAction);
      }
    }
  }

  /**
   * Apply camera cuts based on speaker segments
   * @param {Array} segments - Speaker segments with timing
   * @param {Array} mappings - Speaker to camera mappings
   * @param {Array} cameras - Available camera clips
   * @param {Object} settings - Edit settings
   */
  async applyCameraCuts(segments, mappings, cameras, settings) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    const sequenceEditor = await sequence.getSequenceEditor();

    if (!sequence) {
      throw new Error('No active sequence');
    }

    // Get the first video track (we'll place cuts here)
    const videoTrack = await sequence.getVideoTrack(0);

    // Process segments and create cut decisions
    const cuts = this._generateCutList(segments, mappings, cameras, settings);

    // Apply each cut
    for (const cut of cuts) {
      await this._applyCut(sequenceEditor, cut, cameras, settings);
    }
  }

  /**
   * Generate a list of cuts from speaker segments
   * @private
   */
  _generateCutList(segments, mappings, cameras, settings) {
    const cuts = [];
    let lastCameraIndex = null;
    let lastCutTime = 0;

    for (const segment of segments) {
      const mapping = mappings.find(m => m.speakerId === segment.speakerId);
      if (!mapping) continue;

      const cameraIndex = mapping.cameraIndex;

      // Check if we need to cut (different camera, enough time has passed)
      if (cameraIndex !== lastCameraIndex) {
        const timeSinceLastCut = segment.start - lastCutTime;

        // Only cut if minimum duration has passed
        if (timeSinceLastCut >= settings.minCutDuration || lastCameraIndex === null) {
          // Check confidence threshold
          if (segment.confidence >= settings.speakerConfidenceThreshold) {
            cuts.push({
              time: segment.start,
              cameraIndex: cameraIndex,
              speakerId: segment.speakerId,
              confidence: segment.confidence,
              duration: segment.end - segment.start
            });

            lastCameraIndex = cameraIndex;
            lastCutTime = segment.start;
          } else if (settings.useWideShotOnLowConfidence) {
            // Use wide shot for low confidence
            cuts.push({
              time: segment.start,
              cameraIndex: 'wide',
              speakerId: segment.speakerId,
              confidence: segment.confidence,
              duration: segment.end - segment.start
            });

            lastCameraIndex = 'wide';
            lastCutTime = segment.start;
          }
        }
      }
    }

    return cuts;
  }

  /**
   * Apply a single cut
   * @private
   */
  async _applyCut(sequenceEditor, cut, cameras, settings) {
    // Get the camera clip to insert
    let camera;
    if (cut.cameraIndex === 'wide') {
      // Use the last camera as wide shot (user should configure this)
      camera = cameras[cameras.length - 1];
    } else {
      camera = cameras[cut.cameraIndex];
    }

    if (!camera || !camera._projectItem) {
      console.warn('Camera not found for cut:', cut);
      return;
    }

    // Create insert action
    const time = this.secondsToTicks(cut.time);
    const insertAction = sequenceEditor.createOverwriteItemAction(
      camera._projectItem,
      time,
      0, // Video track index
      0  // Audio track index
    );

    await app.executeAction(insertAction);
  }

  /**
   * Remove silence regions from the sequence
   * @param {Array} silences - Silence regions to remove
   * @param {Object} settings - Edit settings with padding
   */
  async removeSilences(silences, settings) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    const sequenceEditor = await sequence.getSequenceEditor();

    if (!sequence) {
      throw new Error('No active sequence');
    }

    // Sort silences in reverse order (remove from end first to preserve timing)
    const sortedSilences = [...silences].sort((a, b) => b.start - a.start);

    for (const silence of sortedSilences) {
      // Apply padding
      const start = silence.start + settings.silencePadding;
      const end = silence.end - settings.silencePadding;

      // Skip if padding eliminates the silence
      if (end <= start) continue;

      // Skip if silence is too short after padding
      if ((end - start) < settings.minSilenceDuration) continue;

      await this._rippleDeleteRegion(sequenceEditor, sequence, start, end);
    }
  }

  /**
   * Perform a ripple delete on a time region
   * @private
   */
  async _rippleDeleteRegion(sequenceEditor, sequence, startSeconds, endSeconds) {
    // Get all track items that overlap with this region
    const videoTrackCount = await sequence.getVideoTrackCount();
    const audioTrackCount = await sequence.getAudioTrackCount();

    const itemsToRemove = [];

    // Collect video items
    for (let i = 0; i < videoTrackCount; i++) {
      const track = await sequence.getVideoTrack(i);
      const items = track.getTrackItems(1, false);

      for (const item of items) {
        const itemStart = (await item.getStartTime()).ticks / TICKS_PER_SECOND;
        const itemEnd = (await item.getEndTime()).ticks / TICKS_PER_SECOND;

        // Check if item overlaps with silence region
        if (itemStart < endSeconds && itemEnd > startSeconds) {
          // Need to handle partial overlaps by trimming
          // For now, we'll mark items that are fully within the silence
          if (itemStart >= startSeconds && itemEnd <= endSeconds) {
            itemsToRemove.push(item);
          }
        }
      }
    }

    // Collect audio items
    for (let i = 0; i < audioTrackCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);

      for (const item of items) {
        const itemStart = (await item.getStartTime()).ticks / TICKS_PER_SECOND;
        const itemEnd = (await item.getEndTime()).ticks / TICKS_PER_SECOND;

        if (itemStart >= startSeconds && itemEnd <= endSeconds) {
          itemsToRemove.push(item);
        }
      }
    }

    // Create selection and remove with ripple
    if (itemsToRemove.length > 0) {
      const selection = {
        videoClipTrackItems: itemsToRemove.filter(async i => {
          const type = await i.getMediaType();
          return type.toString().includes('video');
        }),
        audioClipTrackItems: itemsToRemove.filter(async i => {
          const type = await i.getMediaType();
          return type.toString().includes('audio');
        })
      };

      const removeAction = sequenceEditor.createRemoveItemsAction(
        selection,
        true, // ripple
        Constants.MediaType.ALL,
        true  // shift overlapping
      );

      await app.executeAction(removeAction);
    }
  }

  /**
   * Apply audio leveling to clips
   * @param {Object} audioAnalysis - Audio analysis results
   * @param {Object} settings - Audio settings
   */
  async applyAudioLeveling(audioAnalysis, settings) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new Error('No active sequence');
    }

    // Calculate the gain adjustment needed
    const currentLUFS = audioAnalysis.integratedLufs;
    const targetLUFS = settings.targetLoudness;
    const gainAdjustment = targetLUFS - currentLUFS;

    // Get all audio clips and apply volume effect
    const audioTrackCount = await sequence.getAudioTrackCount();

    for (let i = 0; i < audioTrackCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const items = track.getTrackItems(1, false);

      for (const item of items) {
        await this._applyVolumeEffect(item, gainAdjustment, settings);
      }
    }
  }

  /**
   * Apply volume effect to an audio clip
   * @private
   */
  async _applyVolumeEffect(audioClip, gainDb, settings) {
    try {
      const componentChain = await audioClip.getComponentChain();

      // Check if Volume effect already exists
      const componentCount = componentChain.getComponentCount();
      let volumeComponent = null;

      for (let i = 0; i < componentCount; i++) {
        const component = componentChain.getComponentAtIndex(i);
        const name = await component.getDisplayName();
        if (name === 'Volume') {
          volumeComponent = component;
          break;
        }
      }

      // If Volume effect exists, modify it; otherwise we'd need to add it
      // Note: Adding new effects requires AudioFilterFactory which may have limitations
      if (volumeComponent) {
        // Get the Level property and adjust it
        const properties = await volumeComponent.getProperties();
        for (const prop of properties) {
          const propName = await prop.getDisplayName();
          if (propName === 'Level') {
            // Set the new value
            const currentValue = await prop.getValue();
            const newValue = currentValue + gainDb;

            // Clamp to reasonable range
            const clampedValue = Math.max(-96, Math.min(12, newValue));

            const setAction = prop.createSetValueAction(clampedValue);
            await app.executeAction(setAction);
            break;
          }
        }
      }

      // Apply limiter if requested
      if (settings.applyLimiter) {
        // Note: Adding the Hard Limiter effect would require AudioFilterFactory
        // This is a placeholder for when that API is available/documented
        console.log('Limiter effect would be applied here');
      }

    } catch (err) {
      console.warn('Could not apply volume effect:', err);
    }
  }
}
