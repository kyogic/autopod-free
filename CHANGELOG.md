# Changelog

All notable changes to AutoPod Free will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-31

### Added

#### Core Features
- **Speaker Diarization**: Automatic speaker detection using pyannote.audio with SpeechBrain fallback
- **Camera Switching**: Automatic cut generation based on speaker changes
- **Silence Removal**: FFmpeg-based silence detection with configurable thresholds
- **Audio Leveling**: LUFS-based loudness normalization with peak limiting

#### Premiere Pro Integration
- UXP panel for Premiere Pro 2025+ (v25.0+)
- Non-destructive editing (creates new sequence)
- ActionBatch for single-undo support
- Real-time progress via WebSocket

#### Silence Removal Enhancements
- Partial clip trimming (handles clips overlapping silence regions)
- Four overlap cases: fully contained, trim start, trim end, split
- Preview mode with silence markers
- Configurable padding and minimum duration

#### Audio Leveling Features
- LUFS-based normalization (target: -16 LUFS default)
- Hard Limiter effect application for peak protection
- Per-track leveling options
- Gain clamping (-24 to +24 dB)

#### Cut Decision Logic
- Speaker confidence threshold filtering
- Minimum cut duration enforcement
- Camera hold time for stability
- Wide shot fallback on low confidence
- Crosstalk/overlap resolution
- Reaction shot support (configurable)

#### Backend Services
- Express.js server with WebSocket support
- Job management with progress tracking
- FFmpeg integration for audio analysis
- CMX3600 EDL export format

#### Documentation
- Comprehensive installation guide (macOS/Linux/Windows)
- Feature comparison with commercial AutoPod
- API documentation
- User guide

#### Testing
- 86 unit tests covering all core functionality
- Integration tests for EDL generation
- Panel logic validation tests

### Technical Details

- **Panel**: Adobe UXP (Manifest v6)
- **Backend**: Node.js 18+ with Express
- **Diarization**: Python 3.8+ with pyannote.audio/SpeechBrain
- **Audio**: FFmpeg for extraction and analysis
- **Communication**: HTTP REST + WebSocket

## [Unreleased]

### Planned
- Native multicam sequence support (pending Adobe API improvements)
- Batch processing for multiple sequences
- Custom keyboard shortcuts
- Adobe Exchange distribution
- Docker container for backend
