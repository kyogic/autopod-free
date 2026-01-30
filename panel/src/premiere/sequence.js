/**
 * Premiere Pro Sequence Operations
 * UXP API wrapper for sequence-related operations
 */

// UXP Premiere Pro API
const { app } = require('premierepro');

export class PremiereSequence {
  /**
   * Get the active sequence
   * @returns {Promise<Object|null>} Sequence info or null
   */
  async getActiveSequence() {
    try {
      const project = await app.getProject();
      if (!project) return null;

      const sequence = await project.getActiveSequence();
      if (!sequence) return null;

      const settings = await sequence.getSettings();
      const endTime = await sequence.getEndTime();
      const videoTrackCount = await sequence.getVideoTrackCount();
      const audioTrackCount = await sequence.getAudioTrackCount();

      // Convert ticks to seconds
      const ticksPerSecond = 254016000000; // Premiere Pro standard
      const duration = endTime.ticks / ticksPerSecond;

      return {
        id: sequence.guid,
        name: sequence.name,
        duration,
        videoTrackCount,
        audioTrackCount,
        settings,
        _sequence: sequence // Keep reference for later use
      };
    } catch (err) {
      console.error('Error getting active sequence:', err);
      throw err;
    }
  }

  /**
   * Get audio tracks from active sequence
   * @returns {Promise<Array>} Array of audio track info
   */
  async getAudioTracks() {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) return [];

    const trackCount = await sequence.getAudioTrackCount();
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const track = await sequence.getAudioTrack(i);
      const isMuted = await track.isMuted();

      tracks.push({
        index: i,
        name: `Audio ${i + 1}`,
        isMuted,
        _track: track
      });
    }

    return tracks;
  }

  /**
   * Get video tracks from active sequence
   * @returns {Promise<Array>} Array of video track info
   */
  async getVideoTracks() {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) return [];

    const trackCount = await sequence.getVideoTrackCount();
    const tracks = [];

    for (let i = 0; i < trackCount; i++) {
      const track = await sequence.getVideoTrack(i);
      const isMuted = await track.isMuted();

      tracks.push({
        index: i,
        name: `Video ${i + 1}`,
        isMuted,
        _track: track
      });
    }

    return tracks;
  }

  /**
   * Get audio source path from a track
   * This gets the file path of the first clip on the specified audio track
   * @param {number} trackIndex - Audio track index
   * @returns {Promise<string|null>} File path or null
   */
  async getAudioSourcePath(trackIndex) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) return null;

    const track = await sequence.getAudioTrack(trackIndex);
    const items = track.getTrackItems(1, false); // TrackItemType.CLIP = 1

    if (items.length === 0) return null;

    // Get the project item for the first clip
    const projectItem = await items[0].getProjectItem();
    if (!projectItem) return null;

    // Get the media path
    const path = await projectItem.getMediaPath();
    return path;
  }

  /**
   * Get all video clips from the project bin
   * @returns {Promise<Array>} Array of clip info
   */
  async getProjectClips() {
    const project = await app.getProject();
    if (!project) return [];

    const rootItem = await project.getRootItem();
    const clips = [];

    await this._collectVideoClips(rootItem, clips);

    return clips;
  }

  /**
   * Recursively collect video clips from a bin
   * @private
   */
  async _collectVideoClips(item, clips) {
    const children = await item.getItems();

    for (const child of children) {
      const type = await child.getType();

      // Type 1 = Bin, Type 2 = Clip
      if (type === 1) {
        // Recurse into bin
        await this._collectVideoClips(child, clips);
      } else if (type === 2) {
        // Check if it's a video clip
        const hasVideo = await child.hasVideo();
        if (hasVideo) {
          const name = await child.getName();
          const path = await child.getMediaPath();
          const duration = await this._getClipDuration(child);

          clips.push({
            id: child.guid,
            name,
            path,
            duration,
            hasVideo: true,
            hasAudio: await child.hasAudio(),
            _projectItem: child
          });
        }
      }
    }
  }

  /**
   * Get clip duration in seconds
   * @private
   */
  async _getClipDuration(projectItem) {
    try {
      const outPoint = await projectItem.getOutPoint();
      const inPoint = await projectItem.getInPoint();
      const ticksPerSecond = 254016000000;
      return (outPoint.ticks - inPoint.ticks) / ticksPerSecond;
    } catch {
      return 0;
    }
  }

  /**
   * Get track items from a specific track
   * @param {number} trackIndex - Track index
   * @param {string} trackType - 'video' or 'audio'
   * @returns {Promise<Array>} Array of track items
   */
  async getTrackItems(trackIndex, trackType = 'video') {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();
    if (!sequence) return [];

    const track = trackType === 'video'
      ? await sequence.getVideoTrack(trackIndex)
      : await sequence.getAudioTrack(trackIndex);

    const items = track.getTrackItems(1, false); // TrackItemType.CLIP = 1
    const ticksPerSecond = 254016000000;

    const result = [];
    for (const item of items) {
      const startTime = await item.getStartTime();
      const endTime = await item.getEndTime();
      const name = await item.getName();

      result.push({
        name,
        start: startTime.ticks / ticksPerSecond,
        end: endTime.ticks / ticksPerSecond,
        duration: (endTime.ticks - startTime.ticks) / ticksPerSecond,
        _item: item
      });
    }

    return result;
  }
}
