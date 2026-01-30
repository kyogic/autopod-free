# AutoPod Free

An open-source alternative to AutoPod for Adobe Premiere Pro. Automatically edit multi-camera podcasts and interviews based on speaker detection.

## Features

- **Automatic Camera Switching**: Detects who is speaking and cuts to their camera
- **Silence Removal**: Finds and removes dead air with configurable thresholds
- **Audio Leveling**: Normalize loudness to broadcast standards (-16 LUFS)
- **Non-Destructive Editing**: Creates a new sequence, never modifies the original
- **Preview Mode**: Review cuts as markers before applying
- **Fully Local**: No cloud services, all processing on your machine

## Requirements

- Adobe Premiere Pro 2025 (v25.0+) with UXP support
- Node.js 18+
- Python 3.8+ (for speaker diarization)
- ffmpeg (for audio processing)

## Quick Start

### 1. Install Dependencies

**macOS/Linux:**
```bash
./scripts/install.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

### 2. Start the Backend Server

```bash
npm run backend
```

Keep this running while using the extension.

### 3. Load the UXP Panel

1. Install [Adobe UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/devtool/)
2. Open UXP Developer Tool
3. Click "Add Plugin"
4. Select the `panel` folder from this project
5. Click "Load"

### 4. Use in Premiere Pro

1. Open your project with multi-cam footage
2. Go to **Window > Extensions > AutoPod Free**
3. Select your sequence and audio source track
4. Load your camera clips from the project
5. Click **Analyze Speakers**
6. Map speakers to cameras
7. Adjust settings as needed
8. Click **Apply Edits**

## Project Structure

```
autopod-free/
├── panel/           # UXP Panel Extension (UI)
├── backend/         # Node.js analysis service
│   ├── src/         # Server code
│   └── python/      # Speaker diarization scripts
├── shared/          # Shared types and constants
├── tests/           # Unit and integration tests
├── docs/            # Documentation
└── scripts/         # Installation scripts
```

## How It Works

1. **Audio Extraction**: ffmpeg extracts audio from your sequence
2. **Speaker Diarization**: pyannote.audio detects who speaks when
3. **Cut Decision**: Algorithm determines optimal cut points
4. **Silence Detection**: Identifies gaps in speech
5. **Apply Edits**: UXP API creates cuts in a new sequence

## Configuration

### Edit Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Min Cut Duration | 2.0s | Minimum time between cuts |
| Camera Hold Time | 1.5s | Minimum time to stay on a camera |
| Speaker Confidence | 0.7 | Threshold for trusting speaker detection |

### Silence Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Threshold | -40 dB | Audio level below this is silence |
| Min Duration | 0.4s | Minimum silence length to remove |
| Padding | 0.1s | Audio to keep before/after silence |

### Audio Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Target Loudness | -16 LUFS | Standard for streaming platforms |
| Apply Limiter | Yes | Prevent clipping |

## Limitations

See [CAPABILITIES.md](./CAPABILITIES.md) for a detailed list of what this extension can and cannot do compared to the commercial AutoPod.

Key limitations:
- Cannot directly switch multicam angles (uses flattened clips instead)
- Audio leveling is applied via Volume effect, not true loudness normalization
- Speaker detection requires good audio quality

## Development

### Running in Development

```bash
# Terminal 1: Start backend with auto-reload
npm run backend:dev

# Load panel in UXP Developer Tool for hot reload
```

### Running Tests

```bash
npm test
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Credits

- [pyannote.audio](https://github.com/pyannote/pyannote-audio) - Speaker diarization
- [speechbrain](https://github.com/speechbrain/speechbrain) - Fallback speaker embeddings
- [ffmpeg](https://ffmpeg.org/) - Audio processing
