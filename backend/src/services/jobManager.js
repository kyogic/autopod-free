/**
 * Job Manager - Handles analysis job lifecycle and Python subprocess management
 */

import { spawn, exec } from 'child_process';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_DIR = path.join(__dirname, '..', '..', 'python');

export class JobManager extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.pythonAvailable = false;
    this.ffmpegAvailable = false;
  }

  /**
   * Check if Python is available
   */
  async checkPython() {
    return new Promise((resolve) => {
      exec('python3 --version', (error) => {
        if (error) {
          exec('python --version', (error2) => {
            this.pythonAvailable = !error2;
            this.pythonCmd = error2 ? null : 'python';
            resolve(this.pythonAvailable);
          });
        } else {
          this.pythonAvailable = true;
          this.pythonCmd = 'python3';
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if ffmpeg is available
   */
  async checkFfmpeg() {
    return new Promise((resolve) => {
      exec('ffmpeg -version', (error) => {
        this.ffmpegAvailable = !error;
        resolve(this.ffmpegAvailable);
      });
    });
  }

  /**
   * Create a new analysis job
   */
  createJob(audioPath, options = {}) {
    const jobId = uuidv4();

    const job = {
      id: jobId,
      audioPath,
      options,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      process: null,
      createdAt: Date.now()
    };

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Start an analysis job
   */
  async startJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (!this.pythonAvailable) {
      throw new Error('Python is not available. Please install Python 3.8+');
    }

    job.status = 'running';
    this.emit('progress', jobId, { progress: 0, message: 'Starting analysis...' });

    try {
      // Run the diarization script
      const result = await this.runDiarization(job);
      job.result = result;
      job.status = 'complete';
      job.progress = 100;
      this.emit('complete', jobId, result);

    } catch (err) {
      job.error = err;
      job.status = 'error';
      this.emit('error', jobId, err);
      throw err;
    }

    return job;
  }

  /**
   * Run the Python diarization script
   */
  runDiarization(job) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(PYTHON_DIR, 'diarize.py');

      const args = [
        scriptPath,
        '--audio', job.audioPath,
        '--num-speakers', String(job.options.numSpeakers || 2),
        '--output-format', 'json'
      ];

      if (job.options.settings?.silenceThreshold) {
        args.push('--silence-threshold', String(job.options.settings.silenceThreshold));
      }

      if (job.options.settings?.minSilenceDuration) {
        args.push('--min-silence-duration', String(job.options.settings.minSilenceDuration));
      }

      console.log(`Running: ${this.pythonCmd} ${args.join(' ')}`);

      const proc = spawn(this.pythonCmd, args, {
        cwd: PYTHON_DIR,
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      job.process = proc;

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;

        // Parse progress updates
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('PROGRESS:')) {
            try {
              const progressData = JSON.parse(line.substring(9));
              job.progress = progressData.progress;
              this.emit('progress', job.id, progressData);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[diarize.py stderr]: ${data}`);
      });

      proc.on('close', (code) => {
        job.process = null;

        if (code === 0) {
          try {
            // Find the JSON result in stdout
            const jsonMatch = stdout.match(/RESULT:(.*?)$/m);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[1]);
              resolve(result);
            } else {
              // Try to parse entire stdout as JSON
              const result = JSON.parse(stdout.trim().split('\n').pop());
              resolve(result);
            }
          } catch (err) {
            reject(new Error(`Failed to parse diarization result: ${err.message}`));
          }
        } else {
          reject(new Error(`Diarization failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        job.process = null;
        reject(new Error(`Failed to start diarization: ${err.message}`));
      });
    });
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.process) {
      job.process.kill('SIGTERM');
      job.process = null;
    }

    job.status = 'cancelled';
    this.emit('error', jobId, { message: 'Job cancelled' });

    return true;
  }

  /**
   * Cancel all running jobs
   */
  cancelAll() {
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'running') {
        this.cancelJob(jobId);
      }
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error ? job.error.message : null
    };
  }

  /**
   * Get job result
   */
  getJobResult(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'complete') return null;
    return job.result;
  }

  /**
   * Clean up old jobs (older than 1 hour)
   */
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [jobId, job] of this.jobs) {
      if (job.createdAt < oneHourAgo && job.status !== 'running') {
        this.jobs.delete(jobId);
      }
    }
  }
}
