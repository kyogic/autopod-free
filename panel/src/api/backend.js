/**
 * Backend API Communication Module
 * Handles HTTP and WebSocket communication with the local analysis service
 */

import { BACKEND_URL, BACKEND_WS_URL, WS_EVENTS } from '../constants.js';

export class BackendAPI {
  constructor() {
    this.ws = null;
    this.eventHandlers = {};
    this.currentJobId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  /**
   * Register an event handler
   */
  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  /**
   * Remove an event handler
   */
  off(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
  }

  /**
   * Emit an event to all handlers
   */
  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  /**
   * Connect to the backend service
   */
  async connect() {
    // First check if backend is reachable via HTTP
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (!response.ok) {
        throw new Error('Backend health check failed');
      }
    } catch (err) {
      throw new Error(`Cannot reach backend at ${BACKEND_URL}: ${err.message}`);
    }

    // Establish WebSocket connection for real-time updates
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(BACKEND_WS_URL);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        this.ws.onclose = () => {
          this.emit('disconnected');
          this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Attempt to reconnect after disconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnect attempt ${this.reconnectAttempts}...`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Will retry via onclose handler
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case WS_EVENTS.PROGRESS:
          this.emit('progress', message.data);
          break;

        case WS_EVENTS.COMPLETE:
          this.emit('complete', message.data);
          this.currentJobId = null;
          break;

        case WS_EVENTS.ERROR:
          this.emit('error', message.data);
          this.currentJobId = null;
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }

  /**
   * Start an analysis job
   */
  async startAnalysis({ audioPath, numSpeakers, settings }) {
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioPath,
        numSpeakers,
        settings
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Analysis request failed');
    }

    const result = await response.json();
    this.currentJobId = result.jobId;

    // Subscribe to job updates via WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        jobId: this.currentJobId
      }));
    }

    return result;
  }

  /**
   * Cancel the current analysis job
   */
  async cancelAnalysis() {
    if (!this.currentJobId) return;

    const response = await fetch(`${BACKEND_URL}/api/analyze/${this.currentJobId}/cancel`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to cancel analysis');
    }

    this.currentJobId = null;
  }

  /**
   * Get the status of a job
   */
  async getJobStatus(jobId) {
    const response = await fetch(`${BACKEND_URL}/api/analyze/${jobId}/status`);

    if (!response.ok) {
      throw new Error('Failed to get job status');
    }

    return await response.json();
  }

  /**
   * Get analysis results
   */
  async getResults(jobId) {
    const response = await fetch(`${BACKEND_URL}/api/analyze/${jobId}/results`);

    if (!response.ok) {
      throw new Error('Failed to get results');
    }

    return await response.json();
  }

  /**
   * Generate EDL from analysis results
   */
  async generateEDL(jobId, mappings, settings) {
    const response = await fetch(`${BACKEND_URL}/api/generate-edl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobId,
        speakerMappings: mappings,
        settings
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate EDL');
    }

    return await response.json();
  }

  /**
   * Disconnect from backend
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
