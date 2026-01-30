# Voice Recognition System Guide

## Overview

SmartCookBook uses **Google Cloud Speech-to-Text V2 API** with the **chirp_2 model** for all voice recognition features. This provides:

- **96%+ accuracy** for French-Canadian speech
- **Automatic punctuation** (commas, periods) for proper parsing
- **No timeout limitations** on mobile devices
- **Consistent behavior** across all platforms

**All voice features now use Google Cloud Speech V2:**
- Recipe search (voice search bar)
- Bulk ingredient dictation with AI parsing
- Bulk method steps dictation
- Bulk notes dictation
- Bulk plating instructions dictation
- Bulk task dictation with pause detection
- Individual field voice input

---

## The Problem (Solved)

**Browser Web Speech API Limitations:**
- ❌ **2-second timeout on mobile** (imposed by Google Chrome on mobile devices)
- ❌ Limited control over recording duration
- ❌ Inconsistent behavior across devices
- ❌ No support for continuous recognition on mobile

This made it impossible to dictate longer recipe names, ingredients, or instructions on tablets and phones.

---

## The Solution

**Google Cloud Speech-to-Text V2 API with chirp_2 model:**
- ✅ **No timeout limitations** - record as long as needed
- ✅ **96%+ accuracy** for French-Canadian (fr-CA)
- ✅ **Automatic punctuation** - commas and periods added automatically
- ✅ **Consistent behavior** across all devices (desktop, tablet, phone)
- ✅ **Multiple language support** (English, French, etc.)
- ✅ **Continuous recognition** for long-form dictation

**Why V2 API with chirp_2?**
- V1 API had no punctuation support for French
- chirp_2 model provides best multilingual accuracy
- Automatic punctuation enables proper ingredient parsing

---

## Model Comparison (December 2025)

| Feature | chirp_2 (Current) | chirp_3 (Future) |
|---------|-------------------|------------------|
| **Status** | GA (Production) | Preview |
| **Region** | us-central1 | us, eu (multi-region) |
| **French-Canadian (fr-CA)** | Excellent | Excellent |
| **Automatic Punctuation** | Yes | Yes |
| **Speaker Diarization** | No | Yes |
| **Auto Language Detection** | No | Yes |
| **Word Timestamps** | Yes | Yes |

### Recommendation

**Keep chirp_2 for now.** It provides:
- Best accuracy for French-Canadian speech
- Stable GA status in us-central1
- Automatic punctuation (critical for ingredient parsing)

**Consider chirp_3 when:**
- It becomes GA in us-central1 (not yet available)
- You need speaker diarization (multi-speaker recipes)
- Auto language detection is required

### Configuration

The model is configurable via environment variables:
```bash
# In backend/.env
SPEECH_MODEL=chirp_2      # or chirp_3 when available
SPEECH_LOCATION=us-central1
```

---

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (React App)    │
│                 │
│  • User clicks  │
│    microphone   │
│  • Records audio│
│  • Sends to     │
│    backend      │
└────────┬────────┘
         │
         │ HTTP POST (base64 audio)
         ▼
┌─────────────────┐
│  Backend Server │
│  (Node.js)      │
│                 │
│  • Receives     │
│    audio        │
│  • Forwards to  │
│    Google Cloud │
└────────┬────────┘
         │
         │ Google Cloud API
         ▼
┌─────────────────┐
│  Google Cloud   │
│  Speech-to-Text │
│                 │
│  • Transcribes  │
│    audio        │
│  • Returns text │
└────────┬────────┘
         │
         │ JSON response
         ▼
┌─────────────────┐
│   Frontend      │
│                 │
│  • Receives     │
│    transcript   │
│  • Updates UI   │
└─────────────────┘
```

---

## Components

### 1. Backend Server (`backend/server.js`)

**Purpose:** Proxy server that handles Google Cloud V2 API calls with configurable Chirp model

**Endpoints:**

Health & Monitoring:
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed status with metrics
- `GET /health/metrics` - Full request statistics
- `GET /health/live` - Liveness probe (for containers)
- `GET /health/ready` - Readiness probe

Speech API:
- `GET /api/speech/model-info` - Current speech model configuration
- `POST /api/speech/recognize` - Speech-to-text recognition (V2 API)

**How to run:**
```bash
cd backend
npm start
```

**Configuration:**
- Port: `3000`
- API Version: **V2** with **chirp_2** model (configurable)
- Region: `us-central1` (configurable via `SPEECH_LOCATION`)
- Model: `chirp_2` (configurable via `SPEECH_MODEL`)
- Credentials: `../google-cloud-credentials.json`
- Language: Configurable per request (default: `fr-CA`)
- Features: Automatic punctuation enabled

**Environment Variables:**
```bash
SPEECH_MODEL=chirp_2        # Speech model: chirp_2 or chirp_3
SPEECH_LOCATION=us-central1 # Google Cloud region
```

**IAM Requirements:**
- Service account needs **Cloud Speech Client** role

---

### 2. Frontend Services

**Multiple voice services are available for different use cases:**

#### a) `googleCloudSpeech.js` - Simple single-field input
**Location:** `app-new/src/services/speech/googleCloudSpeech.js`
**Used by:** Recipe search bar

```javascript
import GoogleCloudSpeechService from '../services/speech/googleCloudSpeech';

const speech = new GoogleCloudSpeechService();
speech.start({
  onTranscript: (text) => setSearchQuery(text),
  languageCode: 'en-US'
});
speech.stop();
```

#### b) `googleCloudVoice.js` - Unified voice service for all features
**Location:** `app-new/src/services/speech/googleCloudVoice.js`
**Used by:** All bulk dictation and field voice input

```javascript
import GoogleCloudVoiceService from '../services/speech/googleCloudVoice';

const voiceService = new GoogleCloudVoiceService();

// Start recording
await voiceService.start({
  onResult: (text) => console.log('Transcribed:', text),
  onError: (error) => console.error('Error:', error),
  onEnd: () => console.log('Recording ended'),
  languageCode: 'en-US'
});

// Stop and get transcript
voiceService.stop();

// Cancel without processing
voiceService.cancel();
```

#### c) `bulkIngredientVoice.js` - Continuous recording with pause detection
**Location:** `app-new/src/services/voice/bulkIngredientVoice.js`
**Used by:** Bulk ingredient dictation

```javascript
import { BulkIngredientVoice, PAUSE_PRESETS } from '../services/voice/bulkIngredientVoice';

const voiceService = new BulkIngredientVoice({
  pausePreset: 'NORMAL', // 'FAST', 'NORMAL', 'SLOW'
  language: 'fr-CA',
  onTranscriptUpdate: (data) => {
    console.log('Lines:', data.lines);
    console.log('Current:', data.currentLine);
  },
  onComplete: (transcript) => console.log('Done:', transcript),
  onError: (error) => console.error('Error:', error)
});

voiceService.start();
voiceService.stop();
```

**Pause Detection Presets:**
- **FAST:** 1 second pause (for fast speakers)
- **NORMAL:** 1.5 second pause (balanced, default)
- **SLOW:** 2.5 second pause (for slow/thoughtful speakers)

#### d) `bulkTaskVoice.js` - Task-specific continuous recording
**Location:** `app-new/src/services/voice/bulkTaskVoice.js`
**Used by:** Bulk task dictation with intelligent task separation

```javascript
import { BulkTaskVoice, PAUSE_PRESETS } from '../services/voice/bulkTaskVoice';

const voiceService = new BulkTaskVoice({
  pausePreset: 'NORMAL',
  language: 'fr-CA',
  onTranscriptUpdate: (data) => {
    console.log('Task lines:', data.lines);
  }
});

voiceService.start();
voiceService.stop();
```

**Task Separation Features:**
- Automatically splits on punctuation (. ! ? ;)
- Recognizes French cooking patterns ("pour" separator)
- Filters out very short segments (< 2 characters)
- Removes duplicate lines

---

### 3. Component Integration (Completed)

**All components now use appropriate voice services:**

| Component | Voice Service | Feature | Status |
|-----------|--------------|---------|--------|
| `RecipeListPage.jsx` | GoogleCloudSpeechService | Voice search | ✅ Complete |
| `IngredientList.jsx` | BulkIngredientVoice | Bulk dictation + field voice | ✅ Complete |
| `MethodSteps.jsx` | GoogleCloudVoiceService | Bulk dictation + field voice | ✅ Complete |
| `Notes.jsx` | GoogleCloudVoiceService | Bulk dictation + field voice | ✅ Complete |
| `PlatingInstructions.jsx` | GoogleCloudVoiceService | Bulk dictation + field voice | ✅ Complete |
| `Tasks.jsx` | BulkTaskVoice | Bulk task dictation | ✅ Complete |

**Bulk Dictation Flow:**
1. User clicks "Dictate" button
2. Button turns red, text shows "Stop"
3. User speaks (no timeout - as long as needed)
4. Pause detection automatically separates lines/tasks
5. User clicks "Stop" when done
6. Audio sent to Google Cloud Speech (when using cloud services)
7. Transcript sent to Claude API for parsing (when applicable)
8. Parsed items added to the list

**Continuous Recognition Features:**
- **Pause Detection:** Automatically detects when user pauses between items
- **Real-time Updates:** Shows current line and completed lines as user speaks
- **Configurable Timing:** Fast, Normal, or Slow pause presets
- **Auto-restart:** Continuous recording until user stops manually

---

## Cost Analysis

**Google Cloud Speech-to-Text Pricing:**
- **First 60 minutes/month:** FREE ✅
- **After 60 minutes:** $0.006 per 15 seconds

**Estimated Usage:**
- Average voice input: 5 seconds per action
- Daily usage: 50 voice inputs
- Monthly usage: 1,500 voice inputs = **125 minutes**

**Monthly Cost:**
- First 60 minutes: **$0** (free tier)
- Next 65 minutes: 65 × 4 × $0.006 = **$1.56**
- **Total: ~$1.56/month**

**Very affordable for unlimited, timeout-free voice recognition!**

---

## Setup Instructions

### Quick Start

```bash
# From project root, run:
start.bat

# Choose mode:
# 1 = Development (PC only, HTTP frontend)
# 2 = Tablet Mode (HTTPS everywhere)
```

### Manual Start (Development)

```bash
# Terminal 1: Speech API (port 3000)
cd backend
npm start

# Terminal 2: Claude Proxy (port 3001)
cd app-new
node proxy-server.js

# Terminal 3: Frontend (port 5173)
cd app-new
npm run dev
```

### Test Health Endpoints

```
Speech API:  https://localhost:3000/health
Claude Proxy: https://localhost:3001/health
```

### HTTPS Requirement for Tablet

Mobile browsers require HTTPS for microphone access. Use Tablet Mode (option 2 in start.bat) which:
1. Builds the frontend for production
2. Serves frontend over HTTPS on port 5000
3. Uses self-signed certificates

**First-time tablet setup:**
1. Visit each URL and accept the SSL warning:
   - `https://192.168.2.53:3000/health`
   - `https://192.168.2.53:3001/health`
   - `https://192.168.2.53:5000`
2. Open the app: `https://192.168.2.53:5000`

---

## Language Support

**Supported Languages:**
- `en-US` - English (United States)
- `en-CA` - English (Canada)
- `fr-FR` - French (France)
- `fr-CA` - French (Canada)
- [Full list of supported languages](https://cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages)

**How to Change Language:**
```javascript
// Google Cloud services
speech.start({
  languageCode: 'fr-CA', // Change to desired language
  onTranscript: (text) => console.log(text)
});

// Bulk voice services
const voiceService = new BulkIngredientVoice({
  language: 'fr-CA', // Change to desired language
  pausePreset: 'NORMAL'
});
```

---

## Advantages Over Web Speech API

| Feature | Web Speech API | Google Cloud Speech | Bulk Voice Services |
|---------|---------------|-------------------|-------------------|
| **Mobile Timeout** | ❌ 2 seconds | ✅ No limit | ✅ No limit |
| **Continuous Recognition** | ❌ Limited | ✅ Full support | ✅ With pause detection |
| **Accuracy** | 🟡 Good | ✅ Excellent | 🟡 Good (browser-based) |
| **Language Support** | 🟡 Limited | ✅ 125+ languages | 🟡 Browser-dependent |
| **Cost** | ✅ Free | 🟡 $1-2/month | ✅ Free |
| **Reliability** | 🟡 Varies by browser | ✅ Consistent | 🟡 Browser-dependent |
| **Pause Detection** | ❌ No | ❌ No | ✅ Built-in |
| **Real-time Updates** | 🟡 Limited | 🟡 Limited | ✅ Live transcript |

---

## Troubleshooting

### "Voice recording not supported"

**On Tablet:**
- Must use HTTPS (Tablet Mode, option 2 in start.bat)
- HTTP does not support MediaRecorder on mobile browsers

**On PC:**
- Accept SSL certificates for localhost:3000 and localhost:3001
- Visit health endpoints and click "Proceed to localhost (unsafe)"

**For Bulk Voice Services:**
- Check browser compatibility: Chrome, Edge, Safari support
- Firefox has limited Web Speech API support

### ERR_SSL_PROTOCOL_ERROR

```bash
# Stop all servers
stop.bat

# Restart
start.bat
```

### ERR_CERT_AUTHORITY_INVALID

- Visit the URL and accept the self-signed certificate warning
- Click "Advanced" > "Proceed to localhost (unsafe)"

### Backend Server Won't Start

**Error:** `Cannot find module '@google-cloud/speech'`
```bash
cd backend
npm install
```

**Error:** `Credentials file not found`
- Check that `google-cloud-credentials.json` exists in project root
- Verify path in `server.js` is correct

### Port Already In Use

```bash
# Kill all SmartCookBook processes
stop.bat

# Or manually kill specific ports
netstat -ano | findstr :3000
taskkill /F /PID <pid>
```

### Tablet Can't Connect

1. Check firewall allows ports 3000, 3001, 5000
2. Verify PC IP address: `ipconfig`
3. Update `.env.local` with correct IP
4. Ensure tablet is on same network as PC

### Audio Not Recording

**Error:** `NotAllowedError: Permission denied`
- Browser blocked microphone access
- Click the lock icon in address bar
- Allow microphone permissions

### Low Transcription Accuracy

**Solutions:**
- Speak clearly and at normal pace
- Reduce background noise
- Check microphone quality
- Try different language code (en-US vs en-CA)
- For bulk services: adjust pause preset (FAST/NORMAL/SLOW)

### Pause Detection Issues

**Pauses too short (cutting off mid-sentence):**
- Change pause preset to 'SLOW' (2.5 seconds)
- Or set custom pauseDuration: `pauseDuration: 3000`

**Pauses too long (not detecting item boundaries):**
- Change pause preset to 'FAST' (1 second)
- Or set custom pauseDuration: `pauseDuration: 800`

### Continuous Recognition Stops

**Web Speech API limitations:**
- Browser may limit continuous recognition time
- Service automatically restarts recognition
- If it stops permanently, try refreshing the page

---

## Future Enhancements

### 1. Streaming Recognition
- Real-time transcription as you speak
- No need to wait for recording to finish
- Better user experience

### 2. Voice Commands
- "Create new recipe"
- "Add ingredient"
- "Save recipe"
- Hands-free navigation

### 3. Multi-Language Auto-Detection
- Automatically detect language being spoken
- Switch between English and French seamlessly

### 4. Enhanced Pause Detection
- Smart punctuation-based splitting
- Context-aware ingredient parsing
- Custom pause patterns per user

---

## Summary

The voice recognition system provides multiple options for different use cases:

**Google Cloud Speech-to-Text V2:**
- **No timeout limitations** - Perfect for mobile devices
- **96%+ accuracy** - chirp_2 model for French-Canadian
- **Automatic punctuation** - Commas and periods for proper parsing
- **Affordable** - ~$1.56/month for typical usage
- **Reliable** - Consistent across all devices

**Bulk Voice Services (Browser-based):**
- **Continuous recognition** with pause detection
- **Real-time transcript updates** showing current and completed lines
- **Configurable pause timing** for different speaking patterns
- **Free** - No API costs, browser-based
- **Intelligent separation** for ingredients and tasks

**Current Implementation:**
- Recipe search voice input (Google Cloud)
- Bulk ingredient dictation with pause detection (BulkIngredientVoice)
- Bulk method steps dictation with Claude parsing (GoogleCloudVoice)
- Bulk notes dictation (GoogleCloudVoice)
- Bulk plating instructions dictation (GoogleCloudVoice)
- Bulk task dictation with intelligent separation (BulkTaskVoice)
- Individual field voice input (GoogleCloudVoice)

**Ingredient Parsing Features:**
- French abbreviations: c.s. (cuillère à soupe), c.t. (cuillère à thé)
- Preserved units: gousse, botte (not abbreviated)
- Smart splitting: "sel et poivre" → 2 ingredients
- Metric preservation: 500g, 750ml stay intact
- toolQty/toolUnit fields for portion scaling

**Task Parsing Features:**
- Automatic task separation on punctuation
- Recognition of French cooking patterns
- Duplicate removal and length filtering
- Real-time line processing

---

**Date Created:** November 29, 2025
**Version:** 3.3
**Status:** Complete - V2 API with chirp_2 (configurable) + Bulk Voice Services
**Last Updated:** January 7, 2026
**Backend Version:** 1.1.0 (with health monitoring & request logging)

---

## References

- [Chirp 2 Documentation](https://cloud.google.com/speech-to-text/v2/docs/chirp_2-model)
- [Chirp 3 Documentation](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
- [Speech-to-Text Release Notes](https://docs.cloud.google.com/speech-to-text/docs/release-notes)
- [Supported Languages](https://cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages)
- [Web Speech API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
