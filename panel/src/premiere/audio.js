/**
 * Premiere Pro Audio Operations
 * UXP API wrapper for audio effect operations
 */

// UXP Premiere Pro API
const { app, AudioFilterFactory } = require('premierepro');

const TICKS_PER_SECOND = 254016000000;

export class PremiereAudio {
  /**
   * Get list of available audio effects
   * @returns {Promise<Array<string>>} Effect display names
   */
  async getAvailableEffects() {
    try {
      const factory = await AudioFilterFactory.getInstance();
      const names = await factory.getDisplayNames();
      return names;
    } catch (err) {
      console.error('Error getting audio effects:', err);
      return [];
    }
  }

  /**
   * Apply an audio effect to a clip
   * @param {Object} audioClip - Audio clip track item
   * @param {string} effectName - Display name of effect
   * @returns {Promise<Object|null>} The applied component or null
   */
  async applyEffect(audioClip, effectName) {
    try {
      const factory = await AudioFilterFactory.getInstance();
      const component = await factory.createComponentByDisplayName(effectName);

      if (!component) {
        throw new Error(`Effect "${effectName}" not found`);
      }

      const chain = await audioClip.getComponentChain();
      const appendAction = chain.createAppendComponentAction(component);
      await app.executeAction(appendAction);

      return component;
    } catch (err) {
      console.error(`Error applying effect ${effectName}:`, err);
      return null;
    }
  }

  /**
   * Remove an audio effect from a clip
   * @param {Object} audioClip - Audio clip track item
   * @param {string} effectName - Display name of effect to remove
   */
  async removeEffect(audioClip, effectName) {
    try {
      const chain = await audioClip.getComponentChain();
      const count = chain.getComponentCount();

      for (let i = 0; i < count; i++) {
        const component = chain.getComponentAtIndex(i);
        const name = await component.getDisplayName();

        if (name === effectName) {
          const removeAction = chain.createRemoveComponentAction(component);
          await app.executeAction(removeAction);
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error(`Error removing effect ${effectName}:`, err);
      return false;
    }
  }

  /**
   * Get all effects on an audio clip
   * @param {Object} audioClip - Audio clip track item
   * @returns {Promise<Array>} Array of effect info
   */
  async getClipEffects(audioClip) {
    const effects = [];

    try {
      const chain = await audioClip.getComponentChain();
      const count = chain.getComponentCount();

      for (let i = 0; i < count; i++) {
        const component = chain.getComponentAtIndex(i);
        const name = await component.getDisplayName();

        effects.push({
          index: i,
          name,
          _component: component
        });
      }
    } catch (err) {
      console.error('Error getting clip effects:', err);
    }

    return effects;
  }

  /**
   * Set a property value on an effect
   * @param {Object} component - Effect component
   * @param {string} propertyName - Property display name
   * @param {*} value - New value
   */
  async setEffectProperty(component, propertyName, value) {
    try {
      const properties = await component.getProperties();

      for (const prop of properties) {
        const name = await prop.getDisplayName();

        if (name === propertyName) {
          const setAction = prop.createSetValueAction(value);
          await app.executeAction(setAction);
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error(`Error setting property ${propertyName}:`, err);
      return false;
    }
  }

  /**
   * Mute/unmute an audio track
   * @param {number} trackIndex - Track index
   * @param {boolean} muted - Mute state
   */
  async setTrackMute(trackIndex, muted) {
    const project = await app.getProject();
    const sequence = await project.getActiveSequence();

    if (!sequence) return;

    const track = await sequence.getAudioTrack(trackIndex);
    await track.setMute(muted);
  }

  /**
   * Check if common audio effects are available
   * @returns {Promise<Object>} Object with effect availability
   */
  async checkEffectAvailability() {
    const effects = await this.getAvailableEffects();
    const effectSet = new Set(effects.map(e => e.toLowerCase()));

    return {
      volume: effectSet.has('volume'),
      hardLimiter: effectSet.has('hard limiter') || effectSet.has('hardlimiter'),
      loudnessRadar: effectSet.has('loudness radar'),
      parametricEQ: effectSet.has('parametric eq') || effectSet.has('parametric equalizer'),
      multiband: effectSet.has('multiband compressor')
    };
  }
}
