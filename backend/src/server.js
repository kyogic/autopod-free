/**
 * AutoPod Free - Backend Analysis Service
 * Handles audio analysis, diarization, and silence detection
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

import { analyzeRouter } from './routes/analyze.js';
import { silenceRouter } from './routes/silence.js';
import { audioRouter } from './routes/audio.js';
import { JobManager } from './services/jobManager.js';

const PORT = process.env.PORT || 3847;
const app = express();
const server = createServer(app);

// Initialize job manager
const jobManager = new JobManager();

// Middleware
app.use(cors());
app.use(express.json());

// Attach job manager to request
app.use((req, res, next) => {
  req.jobManager = jobManager;
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    pythonAvailable: jobManager.pythonAvailable,
    ffmpegAvailable: jobManager.ffmpegAvailable
  });
});

// API routes
app.use('/api/analyze', analyzeRouter);
app.use('/api/silence', silenceRouter);
app.use('/api/audio', audioRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server, path: '/' });

// Track client subscriptions
const clientSubscriptions = new Map();

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  clientSubscriptions.set(clientId, { ws, jobIds: new Set() });

  console.log(`Client connected: ${clientId}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'subscribe' && message.jobId) {
        const client = clientSubscriptions.get(clientId);
        if (client) {
          client.jobIds.add(message.jobId);
          console.log(`Client ${clientId} subscribed to job ${message.jobId}`);
        }
      }

      if (message.type === 'unsubscribe' && message.jobId) {
        const client = clientSubscriptions.get(clientId);
        if (client) {
          client.jobIds.delete(message.jobId);
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    clientSubscriptions.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for client ${clientId}:`, err);
    clientSubscriptions.delete(clientId);
  });
});

// Broadcast job updates to subscribed clients
jobManager.on('progress', (jobId, data) => {
  broadcastToSubscribers(jobId, {
    type: 'progress',
    jobId,
    data
  });
});

jobManager.on('complete', (jobId, data) => {
  broadcastToSubscribers(jobId, {
    type: 'complete',
    jobId,
    data
  });
});

jobManager.on('error', (jobId, error) => {
  broadcastToSubscribers(jobId, {
    type: 'error',
    jobId,
    data: { message: error.message }
  });
});

function broadcastToSubscribers(jobId, message) {
  const messageStr = JSON.stringify(message);

  for (const [clientId, client] of clientSubscriptions) {
    if (client.jobIds.has(jobId) && client.ws.readyState === 1) {
      try {
        client.ws.send(messageStr);
      } catch (err) {
        console.error(`Error sending to client ${clientId}:`, err);
      }
    }
  }
}

// Check dependencies on startup
async function checkDependencies() {
  console.log('Checking dependencies...');

  // Check Python
  const pythonAvailable = await jobManager.checkPython();
  console.log(`  Python: ${pythonAvailable ? 'OK' : 'NOT FOUND'}`);

  // Check ffmpeg
  const ffmpegAvailable = await jobManager.checkFfmpeg();
  console.log(`  ffmpeg: ${ffmpegAvailable ? 'OK' : 'NOT FOUND'}`);

  if (!pythonAvailable) {
    console.warn('\n  WARNING: Python not found. Speaker diarization will not work.');
    console.warn('  Install Python 3.8+ and run: pip install -r backend/python/requirements.txt\n');
  }

  if (!ffmpegAvailable) {
    console.warn('\n  WARNING: ffmpeg not found. Audio extraction will not work.');
    console.warn('  Install ffmpeg from https://ffmpeg.org/download.html\n');
  }
}

// Start server
server.listen(PORT, async () => {
  console.log(`\n========================================`);
  console.log(`  AutoPod Free Backend Service`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  WebSocket on ws://localhost:${PORT}`);
  console.log(`========================================\n`);

  await checkDependencies();

  console.log('\nReady for connections.\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');

  // Cancel all running jobs
  jobManager.cancelAll();

  // Close WebSocket connections
  wss.clients.forEach(client => {
    client.close();
  });

  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
