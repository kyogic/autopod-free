/**
 * Premiere Pro Marker Operations
 * UXP API wrapper for marker operations
 */

// UXP Premiere Pro API
const { app } = require('premierepro');

const TICKS_PER_SECOND = 254016000000;

export class PremiereMarkers {
  /**
   * Convert seconds to TickTime
   */
  secondsToTicks(seconds) {
    return {
      ticks: Math.round(seconds * TICKS_PER_SECOND)
    };
  }

  /**
   * Convert TickTime to seconds
   */
  ticksToSeconds(tickTime) {
    return tickTime.ticks / TICKS_PER_SECOND;
  }

  /**
   * Get all markers from the active sequence
   * @returns {Promise<Array>} Array of marker info
   */
  async getSequenceMarkers() {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) return [];

    const markers = sequence.markers;
    const result = [];

    // Iterate through markers
    let marker = markers.getFirstMarker();
    while (marker) {
      const start = marker.getStart();
      const duration = marker.getDuration();

      result.push({
        name: marker.getName(),
        comments: marker.getComments(),
        type: marker.getType(),
        color: marker.getColor(),
        colorIndex: marker.getColorIndex(),
        start: this.ticksToSeconds(start),
        duration: this.ticksToSeconds(duration),
        url: marker.getUrl(),
        target: marker.getTarget(),
        _marker: marker
      });

      marker = markers.getNextMarker(marker);
    }

    return result;
  }

  /**
   * Create a new marker at the specified time
   * @param {number} timeSeconds - Time in seconds
   * @param {Object} options - Marker options
   * @returns {Promise<Object>} Created marker
   */
  async createMarker(timeSeconds, options = {}) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) {
      throw new Error('No active sequence');
    }

    const markers = sequence.markers;
    const time = this.secondsToTicks(timeSeconds);
    const marker = markers.createMarker(time);

    if (!marker) {
      throw new Error('Failed to create marker');
    }

    // Apply options
    if (options.name) {
      const action = marker.createSetNameAction(options.name);
      await app.executeAction(action);
    }

    if (options.comments) {
      const action = marker.createSetCommentsAction(options.comments);
      await app.executeAction(action);
    }

    if (options.duration) {
      const action = marker.createSetDurationAction(this.secondsToTicks(options.duration));
      await app.executeAction(action);
    }

    if (options.colorIndex !== undefined) {
      const action = marker.createSetColorByIndexAction(options.colorIndex);
      await app.executeAction(action);
    }

    if (options.type) {
      const action = marker.createSetTypeAction(options.type);
      await app.executeAction(action);
    }

    return {
      name: options.name || '',
      start: timeSeconds,
      _marker: marker
    };
  }

  /**
   * Create multiple markers at once
   * @param {Array} markerDefs - Array of marker definitions
   * @returns {Promise<Array>} Created markers
   */
  async createMarkers(markerDefs) {
    const results = [];

    for (const def of markerDefs) {
      try {
        const marker = await this.createMarker(def.time, def);
        results.push(marker);
      } catch (err) {
        console.warn('Failed to create marker:', err);
      }
    }

    return results;
  }

  /**
   * Clear all markers from the sequence
   */
  async clearAllMarkers() {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) return;

    const markers = sequence.markers;

    // Collect all markers first
    const toRemove = [];
    let marker = markers.getFirstMarker();
    while (marker) {
      toRemove.push(marker);
      marker = markers.getNextMarker(marker);
    }

    // Remove each marker
    for (const m of toRemove) {
      markers.deleteMarker(m);
    }
  }

  /**
   * Clear markers within a time range
   * @param {number} startSeconds - Range start
   * @param {number} endSeconds - Range end
   */
  async clearMarkersInRange(startSeconds, endSeconds) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) return;

    const markers = sequence.markers;
    const toRemove = [];

    let marker = markers.getFirstMarker();
    while (marker) {
      const time = this.ticksToSeconds(marker.getStart());
      if (time >= startSeconds && time <= endSeconds) {
        toRemove.push(marker);
      }
      marker = markers.getNextMarker(marker);
    }

    for (const m of toRemove) {
      markers.deleteMarker(m);
    }
  }

  /**
   * Create markers for speaker segments (preview mode)
   * @param {Array} segments - Speaker segments
   * @param {Array} speakerMappings - Speaker to camera mappings
   */
  async createSpeakerPreviewMarkers(segments, speakerMappings) {
    const markerDefs = segments.map((segment, index) => {
      const mapping = speakerMappings.find(m => m.speakerId === segment.speakerId);
      const colorIndex = mapping ? speakerMappings.indexOf(mapping) : 0;

      return {
        time: segment.start,
        name: `${segment.speakerId}`,
        comments: `Camera: ${mapping ? mapping.cameraIndex : 'N/A'}\nConfidence: ${(segment.confidence * 100).toFixed(0)}%\nDuration: ${(segment.end - segment.start).toFixed(2)}s`,
        colorIndex: colorIndex % 8,
        duration: segment.end - segment.start
      };
    });

    return await this.createMarkers(markerDefs);
  }

  /**
   * Create markers for silence regions (preview mode)
   * @param {Array} silences - Silence regions
   */
  async createSilencePreviewMarkers(silences) {
    const markerDefs = silences.map(silence => ({
      time: silence.start,
      name: 'SILENCE',
      comments: `Duration: ${silence.duration.toFixed(2)}s`,
      colorIndex: 7, // Gray color
      duration: silence.duration
    }));

    return await this.createMarkers(markerDefs);
  }
}
