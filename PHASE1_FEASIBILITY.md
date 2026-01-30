# Phase 1: Feasibility Analysis & Architecture Decision

## Executive Summary

This document analyzes the feasibility of building a production-ready Adobe Premiere Pro plugin that replicates AutoPod's core functionality: automatic multi-cam switching based on speaker detection, silence removal, and audio leveling.

**Verdict: FEASIBLE** with the UXP + Node.js backend architecture.

---

## 1. Technology Stack Recommendation

### CEP vs UXP Decision: **UXP (Recommended)**

| Factor | CEP (ExtendScript) | UXP |
|--------|-------------------|-----|
| **Status** | Deprecated, support ends Sept 2026 | Current platform, actively developed |
| **UI Framework** | HTML/CSS/JS with Chromium | HTML/CSS/JS with modern engine |
| **API Style** | Synchronous (blocks UI) | Asynchronous (non-blocking) |
| **Sequence Editing** | Full support via QE DOM | Full support via SequenceEditor |
| **Effect Application** | QE DOM (undocumented) | AudioComponentChain (documented) |
| **Ripple Delete** | `clip.remove(true, true)` | `createRemoveItemsAction(sel, true, ...)` |
| **Future-proof** | No | Yes |

**Decision: UXP** for new development. The API is mature enough for our needs and is the only forward-compatible option.

### Full Stack Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Premiere Pro Application                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   UXP Panel (UI Layer)                     │  │
│  │  - React/Spectrum Web Components                          │  │
│  │  - Settings forms, timeline preview, progress indicators  │  │
│  │  - Communicates with Premiere via ppro API                │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Premiere Pro API (ppro module)                │  │
│  │  - Sequence, SequenceEditor, Track, TrackItem             │  │
│  │  - Marker, AudioComponentChain, ProjectItem               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                    HTTP/WebSocket (localhost)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Local Backend Service (Node.js)                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Express.js API Server                    │  │
│  │  - POST /analyze - Start diarization                      │  │
│  │  - GET /status - Check progress                           │  │
│  │  - GET /results - Retrieve speaker segments               │  │
│  │  - POST /generate-edl - Create edit decision list         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Python Subprocess (Diarization)               │  │
│  │  - pyannote.audio / speechbrain / resemblyzer             │  │
│  │  - Audio extraction via ffmpeg                            │  │
│  │  - Speaker embedding + clustering                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Premiere Pro API Capabilities Analysis

### What We CAN Do (Confirmed)

| Capability | API | Method |
|------------|-----|--------|
| **Clone sequence** | Sequence | `createCloneAction()` |
| **Insert clips** | SequenceEditor | `createInsertProjectItemAction(projectItem, time, vTrack, aTrack, limitShift)` |
| **Overwrite clips** | SequenceEditor | `createOverwriteItemAction(projectItem, time, vTrack, aTrack)` |
| **Remove clips (ripple)** | SequenceEditor | `createRemoveItemsAction(selection, ripple=true, mediaType, shiftOverlapping)` |
| **Move clips** | TrackItem | `createMoveAction(tickTime)` |
| **Set clip in/out points** | TrackItem | `createSetInPointAction()`, `createSetOutPointAction()` |
| **Add audio effects** | AudioComponentChain | `createInsertComponentAction(component, index)` |
| **Create markers** | Sequence.markers | Create and modify markers for preview |
| **Access track items** | Track | `getTrackItems(type, includeEmpty)` |
| **Disable clips** | TrackItem | `createSetDisabledAction(disabled)` |
| **Get clip timing** | TrackItem | `getStartTime()`, `getEndTime()`, `getDuration()` |

### What We CANNOT Do Directly

| Limitation | Workaround |
|------------|------------|
| **Create multicam source sequence** | Import as nested sequence; use existing multicam if user provides |
| **Switch multicam angles programmatically** | Use individual camera clips on tracks + razor cuts |
| **Set clip gain (dB value)** | Apply Volume effect via AudioComponentChain, modify parameters |
| **Batch export audio for analysis** | Use ffmpeg externally on source media paths |
| **True loudness normalization** | Apply Loudness Radar/Limiter effect; user may need manual adjustment |

### Multicam Strategy

Since the API cannot directly manipulate multicam angle switching, we use a **flattened approach**:

1. User provides individual camera clips (or a multicam source sequence)
2. Plugin places camera clips on video tracks as standard cuts
3. Result is a standard edited sequence (fully editable)
4. Optionally: User can "Create Multi-Camera Source Sequence" manually afterward

This is actually **better for most use cases** because:
- Editors can see and adjust individual cuts
- No complex multicam source dependencies
- Works with any clip organization

---

## 3. Speaker Diarization Approach

### Recommended: pyannote.audio (MIT-licensed community model)

| Option | License | Accuracy (DER) | Speed | Notes |
|--------|---------|----------------|-------|-------|
| **pyannote 3.1** | MIT (community model) | 11-19% | GPU: fast, CPU: moderate | Best balance, most tested |
| **speechbrain ECAPA-TDNN** | Apache 2.0 | 15-22% | CPU: very fast | Fallback option |
| **NeMo Sortformer** | Apache 2.0 | 10-15% | GPU required | Enterprise-grade |
| **WhisperX** | BSD | 12-18% | GPU recommended | Includes transcription |
| **Resemblyzer** | Apache 2.0 | 20-30% | Fast | Lightweight, older |

**Primary choice: pyannote/speaker-diarization-3.1** with the community model (CC-BY-4.0 for model weights, MIT for code).

**Fallback: speechbrain + MeanShift clustering** for CPU-only fast processing.

### Diarization Pipeline

```
Input Audio (WAV/extracted)
         │
         ▼
┌─────────────────────────┐
│   Voice Activity        │
│   Detection (VAD)       │  ← pyannote/segmentation
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Speaker Embedding     │
│   Extraction            │  ← pyannote/embedding or ECAPA-TDNN
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Clustering            │
│   (Agglomerative/       │  ← Assigns segments to speakers
│    Spectral)            │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   Output: RTTM format   │
│   SPEAKER file 1 0.5    │  ← start, duration, speaker_id
│   2.3 SPEAKER_00        │
└─────────────────────────┘
```

### Handling Crosstalk

When speakers overlap:
1. Calculate energy (RMS) for each detected speaker in overlap window
2. Assign to dominant energy speaker
3. If energies are within 3dB, maintain current camera (no cut)
4. Mark overlaps in UI for user review

---

## 4. Silence Detection Approach

### Algorithm: RMS-based with LUFS option

```python
def detect_silences(audio, threshold_db=-40, min_duration=0.4, padding=0.1):
    """
    Detect silent regions in audio.

    Args:
        audio: Audio samples (numpy array)
        threshold_db: Silence threshold in dBFS (default -40)
        min_duration: Minimum silence duration in seconds
        padding: Keep this much audio before/after silence

    Returns:
        List of (start, end) tuples for silent regions
    """
    # Convert to RMS in windows
    window_size = int(sample_rate * 0.05)  # 50ms windows
    rms = calculate_rms_windows(audio, window_size)
    rms_db = 20 * np.log10(rms + 1e-10)

    # Find regions below threshold
    silent_mask = rms_db < threshold_db

    # Group consecutive silent windows
    silent_regions = find_consecutive_regions(silent_mask)

    # Filter by minimum duration and apply padding
    return filter_and_pad(silent_regions, min_duration, padding)
```

### Integration with Premiere

Silences are removed via `createRemoveItemsAction` with `ripple=true`:
1. Select all track items that span the silence region
2. Create a TrackItemSelection
3. Execute ripple delete
4. All tracks stay in sync

---

## 5. Audio Leveling Approach

### Capabilities

| Feature | Implementation | API Used |
|---------|---------------|----------|
| **Clip gain adjustment** | Apply Volume effect, set gain parameter | AudioComponentChain |
| **Peak normalization** | Analyze peaks externally, calculate gain | ffmpeg + Volume effect |
| **Loudness targeting** | Measure LUFS externally, calculate gain | ffmpeg loudnorm + Volume effect |
| **Limiter** | Apply Hard Limiter effect | AudioComponentChain |

### Implementation Strategy

```javascript
// 1. Analyze audio externally
const analysis = await analyzeAudio(clipPath);  // Returns peak, LUFS

// 2. Calculate required gain
const targetLUFS = -16;  // Podcast standard
const gainNeeded = targetLUFS - analysis.integratedLUFS;

// 3. Apply via UXP
const componentChain = await audioClip.getComponentChain();
const volumeEffect = AudioFilterFactory.createComponentByDisplayName("Volume");
// Set gain parameter
await executeAction(componentChain.createAppendComponentAction(volumeEffect));
```

### Limitations & Honest Assessment

- **No direct clip gain property**: Must use Volume effect
- **No true integrated loudness normalization**: We measure externally and apply static gain
- **Limiter effect parameters**: May vary by Premiere version
- **User verification recommended**: Always suggest user review audio levels

---

## 6. Dependency List & Licensing

### Node.js Backend

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| express | ^4.18 | MIT | HTTP server |
| ws | ^8.14 | MIT | WebSocket for progress |
| fluent-ffmpeg | ^2.1 | MIT | Audio extraction |
| uuid | ^9.0 | MIT | Job IDs |

### Python Analysis

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| pyannote.audio | ^3.1 | MIT | Diarization pipeline |
| torch | ^2.0 | BSD | Deep learning runtime |
| torchaudio | ^2.0 | BSD | Audio processing |
| numpy | ^1.24 | BSD | Array operations |
| scipy | ^1.11 | BSD | Signal processing |
| speechbrain | ^0.5 | Apache 2.0 | Fallback embeddings |

### Model Weights

| Model | License | Notes |
|-------|---------|-------|
| pyannote/segmentation-3.0 | MIT | VAD + segmentation |
| pyannote/speaker-diarization-3.1 | CC-BY-4.0 | Full pipeline |
| speechbrain/spkrec-ecapa-voxceleb | Apache 2.0 | Speaker embeddings |

### External Tools

| Tool | License | Purpose |
|------|---------|---------|
| ffmpeg | LGPL/GPL | Audio extraction, analysis |

**All dependencies are permissively licensed for commercial use.**

---

## 7. Project File Structure

```
autopod-free/
├── README.md                     # Quick start guide
├── CAPABILITIES.md               # Honest capabilities doc
├── package.json                  # Root workspace config
│
├── panel/                        # UXP Panel Extension
│   ├── manifest.json             # UXP manifest
│   ├── package.json
│   ├── src/
│   │   ├── index.html            # Panel entry
│   │   ├── index.js              # Main panel logic
│   │   ├── styles.css
│   │   ├── components/
│   │   │   ├── SequenceSelector.js
│   │   │   ├── SpeakerMapper.js
│   │   │   ├── TimelinePreview.js
│   │   │   ├── SettingsForm.js
│   │   │   └── ProgressBar.js
│   │   ├── premiere/
│   │   │   ├── sequence.js       # Sequence operations
│   │   │   ├── editor.js         # Edit operations
│   │   │   ├── audio.js          # Audio effect operations
│   │   │   └── markers.js        # Marker operations
│   │   └── api/
│   │       └── backend.js        # Backend communication
│   └── dist/                     # Built panel
│
├── backend/                      # Node.js Analysis Service
│   ├── package.json
│   ├── src/
│   │   ├── server.js             # Express server
│   │   ├── routes/
│   │   │   ├── analyze.js        # Diarization endpoint
│   │   │   ├── silence.js        # Silence detection
│   │   │   └── audio.js          # Audio analysis
│   │   ├── services/
│   │   │   ├── diarization.js    # Python subprocess mgmt
│   │   │   ├── silence.js        # Silence detection logic
│   │   │   └── audio.js          # Audio leveling calc
│   │   └── utils/
│   │       ├── ffmpeg.js         # ffmpeg wrapper
│   │       └── edl.js            # EDL/XML generation
│   └── python/
│       ├── requirements.txt
│       ├── diarize.py            # Main diarization script
│       ├── embeddings.py         # Speaker embedding
│       └── vad.py                # Voice activity detection
│
├── shared/                       # Shared types/utilities
│   ├── types.ts                  # TypeScript interfaces
│   └── constants.js              # Shared constants
│
├── tests/
│   ├── unit/
│   │   ├── cutLogic.test.js      # Cut decision tests
│   │   ├── silenceDetection.test.js
│   │   └── speakerMapping.test.js
│   └── integration/
│       ├── edlGeneration.test.js
│       └── fixtures/
│           └── sample-diarization.json
│
├── docs/
│   ├── INSTALL.md                # Installation guide
│   ├── USER_GUIDE.md             # User documentation
│   └── API.md                    # Backend API docs
│
└── scripts/
    ├── install.sh                # One-click install (Mac/Linux)
    ├── install.ps1               # One-click install (Windows)
    └── package-extension.js      # Build ZXP for distribution
```

---

## 8. Development Milestones

### Phase 1: Feasibility ✓ (Current)
- [x] API capability research
- [x] Architecture decision
- [x] Dependency analysis
- [x] File structure design

### Phase 2: Scaffolding & Communication
- [ ] UXP panel skeleton with manifest
- [ ] Node.js backend server setup
- [ ] Panel ↔ Backend communication
- [ ] Basic Premiere API integration tests
- [ ] Development environment setup scripts

### Phase 3: Diarization & Cut Logic
- [ ] Python diarization pipeline
- [ ] Speaker segment extraction
- [ ] Cut decision algorithm
- [ ] Speaker-to-camera mapping UI
- [ ] Timeline preview component

### Phase 4: Premiere Editing
- [ ] Sequence cloning
- [ ] Clip insertion/placement
- [ ] Cut execution
- [ ] Marker placement for preview
- [ ] Undo support (action batching)

### Phase 5: Silence & Audio
- [ ] Silence detection algorithm
- [ ] Ripple delete implementation
- [ ] Audio analysis (peak/LUFS)
- [ ] Volume effect application
- [ ] Limiter effect (optional)

### Phase 6: Polish & Packaging
- [ ] Error handling & logging
- [ ] Progress indicators
- [ ] User documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] ZXP packaging
- [ ] Install scripts

---

## 9. Risk Assessment & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| UXP API changes | Low | High | Pin Premiere version requirements, test against multiple versions |
| Diarization accuracy issues | Medium | Medium | Provide confidence threshold, preview before apply, easy undo |
| Performance on long sequences | Medium | Medium | Batch operations, progress feedback, chunked processing |
| Python environment issues (Windows) | Medium | High | Bundle Python, provide clear install docs, fallback to CPU-only |
| Audio gain precision | Low | Low | External measurement, user verification step |

---

## 10. Conclusion & Next Steps

### Feasibility: CONFIRMED

The project is technically feasible with the following approach:

1. **UXP Panel** for modern, supported Premiere integration
2. **Node.js + Python backend** for heavy audio analysis
3. **Flattened multicam** approach using standard clips and cuts
4. **pyannote.audio** with community model for speaker diarization
5. **RMS-based silence detection** with user-configurable thresholds
6. **Volume effect** for audio leveling with external LUFS measurement

### Awaiting Approval

Please review this Phase 1 document and confirm:

1. Architecture approach (UXP + Node.js + Python)
2. Multicam strategy (flattened clips vs. true multicam)
3. Diarization choice (pyannote primary, speechbrain fallback)
4. Audio leveling approach (external measurement + Volume effect)

Once approved, I will proceed to **Phase 2: Repo scaffolding, panel UI skeleton, and backend communication**.

---

## Sources

- [Adobe UXP for Premiere Pro](https://developer.adobe.com/premiere-pro/uxp/)
- [Premiere Pro UXP API Reference](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/)
- [UXP Premiere Pro Types (GitHub)](https://github.com/AdobeDocs/uxp-premiere-pro/blob/main/src/pages/ppro_reference/types.d.ts)
- [Adobe CEP Samples - PProPanel](https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/jsx/PPRO/Premiere.jsx)
- [pyannote Speaker Diarization 3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
- [Top Speaker Diarization Libraries (AssemblyAI)](https://www.assemblyai.com/blog/top-speaker-diarization-libraries-and-apis)
- [CPU-Only Diarization Alternative](https://towardsai.net/p/machine-learning/towards-approximate-fast-diarization-a-cpu-only-alternative-to-pyannote-3-1)
- [Premiere Pro ExtendScript Audio Levels Discussion](https://community.adobe.com/t5/premiere-pro/adjust-audio-levels-of-a-clip-with-extendscript/td-p/10072237)
