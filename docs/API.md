# AutoPod Free - Backend API Documentation

The AutoPod Free backend provides REST and WebSocket APIs for audio analysis, speaker diarization, and edit generation.

## Base URL

```
http://localhost:3847
```

## Health Check

### GET /health

Check if the backend server is running.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

## Analysis Endpoints

### POST /api/analyze

Start a new speaker diarization analysis job.

**Request Body:**
```json
{
  "audioPath": "/path/to/audio.wav",
  "numSpeakers": 2,
  "settings": {
    "minSegmentDuration": 0.5,
    "confidenceThreshold": 0.7
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| audioPath | string | Yes | Absolute path to audio file |
| numSpeakers | number | No | Expected number of speakers (auto-detected if omitted) |
| settings | object | No | Analysis settings |

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

### GET /api/analyze/:jobId/status

Get the current status of an analysis job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "diarizing",
  "progress": 45,
  "message": "Analyzing speaker segments..."
}
```

**Status Values:**
- `pending` - Job created, waiting to start
- `extracting` - Extracting audio from video
- `diarizing` - Running speaker diarization
- `analyzing_silence` - Detecting silence regions
- `analyzing_audio` - Analyzing audio levels
- `complete` - Analysis finished
- `error` - Analysis failed
- `cancelled` - Job was cancelled

### GET /api/analyze/:jobId/results

Get the results of a completed analysis job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "complete",
  "results": {
    "segments": [
      {
        "speaker": "SPEAKER_00",
        "start": 0.0,
        "end": 5.2,
        "confidence": 0.92
      }
    ],
    "silences": [
      {
        "start": 5.2,
        "end": 6.8,
        "duration": 1.6
      }
    ],
    "audioAnalysis": {
      "integratedLufs": -18.5,
      "truePeak": -1.2,
      "loudnessRange": 8.3,
      "peakDb": -1.5,
      "rmsDb": -22.1
    },
    "duration": 120.5,
    "numSpeakers": 2
  }
}
```

### POST /api/analyze/:jobId/cancel

Cancel a running analysis job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled"
}
```

---

## Silence Detection

### POST /api/silence/detect

Detect silence regions in an audio file.

**Request Body:**
```json
{
  "audioPath": "/path/to/audio.wav",
  "threshold": -40,
  "minDuration": 0.4,
  "padding": 0.1
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| audioPath | string | - | Absolute path to audio file |
| threshold | number | -40 | Silence threshold in dB |
| minDuration | number | 0.4 | Minimum silence duration in seconds |
| padding | number | 0.1 | Padding to preserve at silence edges |

**Response:**
```json
{
  "silences": [
    {
      "start": 5.2,
      "end": 6.8,
      "duration": 1.6,
      "originalStart": 5.1,
      "originalEnd": 6.9,
      "originalDuration": 1.8
    }
  ],
  "count": 1,
  "totalSilenceDuration": 1.6
}
```

---

## Audio Analysis

### POST /api/audio/analyze

Analyze audio levels and loudness.

**Request Body:**
```json
{
  "audioPath": "/path/to/audio.wav"
}
```

**Response:**
```json
{
  "integratedLufs": -18.5,
  "truePeak": -1.2,
  "loudnessRange": 8.3,
  "peakDb": -1.5,
  "rmsDb": -22.1,
  "threshold": -28.5,
  "targetOffset": 2.5
}
```

| Field | Description |
|-------|-------------|
| integratedLufs | Integrated loudness in LUFS |
| truePeak | True peak level in dB |
| loudnessRange | Dynamic range (LRA) in LU |
| peakDb | Peak amplitude in dB |
| rmsDb | RMS level in dB |

### POST /api/audio/extract

Extract audio from a video file.

**Request Body:**
```json
{
  "videoPath": "/path/to/video.mp4",
  "outputPath": "/path/to/output.wav"
}
```

**Response:**
```json
{
  "outputPath": "/path/to/output.wav",
  "duration": 120.5
}
```

---

## EDL Generation

### POST /api/generate-edl

Generate an Edit Decision List from analysis results.

**Request Body:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "speakerMappings": {
    "SPEAKER_00": 0,
    "SPEAKER_01": 1
  },
  "settings": {
    "minCutDuration": 2.0,
    "cameraHoldTime": 1.5,
    "speakerConfidenceThreshold": 0.7,
    "useWideShotOnLowConfidence": true,
    "wideShotCameraIndex": 2,
    "enableReactionShots": false
  }
}
```

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| minCutDuration | number | 2.0 | Minimum cut duration in seconds |
| cameraHoldTime | number | 1.5 | Hold time before allowing camera change |
| speakerConfidenceThreshold | number | 0.7 | Minimum confidence for speaker detection |
| useWideShotOnLowConfidence | boolean | true | Use wide shot when confidence is low |
| wideShotCameraIndex | number | 2 | Camera index for wide shot |
| enableReactionShots | boolean | false | Enable reaction shot inserts |
| reactionShotFrequency | number | 30 | Seconds between reaction shots |
| reactionShotDuration | number | 2 | Duration of reaction shots |

**Response:**
```json
{
  "cuts": [
    {
      "startTime": 0.0,
      "endTime": 5.2,
      "cameraIndex": 0,
      "speaker": "SPEAKER_00",
      "confidence": 0.92
    }
  ],
  "statistics": {
    "totalCuts": 15,
    "cutsPerMinute": 7.5,
    "averageShotDuration": 8.0,
    "shortestShot": 2.1,
    "longestShot": 18.5
  },
  "silences": [...],
  "audioAnalysis": {...},
  "duration": 120.5
}
```

### POST /api/generate-edl/preview

Generate a preview EDL without a job (direct segments input).

**Request Body:**
```json
{
  "segments": [...],
  "speakerMappings": {...},
  "settings": {...}
}
```

### POST /api/generate-edl/export

Export EDL in CMX3600 format.

**Request Body:**
```json
{
  "cuts": [...],
  "title": "My Podcast Edit",
  "frameRate": 30
}
```

**Response:**
```
TITLE: My Podcast Edit
FCM: NON-DROP FRAME

001  CAM0     V     C        00:00:00:00 00:00:05:06 00:00:00:00 00:00:05:06
002  CAM1     V     C        00:00:05:06 00:00:12:15 00:00:05:06 00:00:12:15
...
```

---

## WebSocket API

Connect to `ws://localhost:3847` for real-time progress updates.

### Subscribe to Job Updates

```javascript
const ws = new WebSocket('ws://localhost:3847');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    jobId: '550e8400-e29b-41d4-a716-446655440000'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progress:', data.progress, '%');
  console.log('Status:', data.status);
};
```

### Message Types

**Progress Update:**
```json
{
  "type": "progress",
  "jobId": "...",
  "progress": 45,
  "status": "diarizing",
  "message": "Analyzing speaker segments..."
}
```

**Job Complete:**
```json
{
  "type": "complete",
  "jobId": "...",
  "results": {...}
}
```

**Error:**
```json
{
  "type": "error",
  "jobId": "...",
  "error": "Analysis failed: insufficient audio"
}
```

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `FILE_NOT_FOUND` | Audio/video file does not exist |
| `INVALID_FORMAT` | Unsupported audio/video format |
| `JOB_NOT_FOUND` | Analysis job ID not found |
| `FFMPEG_ERROR` | FFmpeg processing failed |
| `PYTHON_ERROR` | Python diarization failed |
| `TIMEOUT` | Operation timed out |

---

## Rate Limits

The local backend has no rate limits, but concurrent analysis jobs are limited to prevent system overload:

- Maximum concurrent jobs: 2
- Maximum job duration: 30 minutes
- Maximum file size: 2 GB
