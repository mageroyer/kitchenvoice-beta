/**
 * SmartCookBook Backend Server - Cloud Run Version
 * Google Cloud Speech-to-Text Proxy
 *
 * This version is optimized for Google Cloud Run:
 * - Uses PORT environment variable
 * - Uses HTTP (Cloud Run provides HTTPS)
 * - Credentials via GOOGLE_APPLICATION_CREDENTIALS env var
 */

const express = require('express');
const cors = require('cors');
const speech = require('@google-cloud/speech');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors()); // Allow requests from frontend
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies (large audio files)

// Initialize Google Cloud Speech client
// In Cloud Run, credentials are automatically provided via the service account
const speechClient = new speech.SpeechClient();

console.log('Google Cloud Speech-to-Text client initialized');

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'SmartCookBook Speech Server is running',
        timestamp: new Date().toISOString()
    });
});

/**
 * Speech recognition endpoint
 * POST /api/speech/recognize
 */
app.post('/api/speech/recognize', async (req, res) => {
    try {
        const { audio, sampleRate = 48000, languageCode = 'fr-CA' } = req.body;

        if (!audio) {
            return res.status(400).json({
                error: 'Missing audio data',
                message: 'Please provide base64-encoded audio in the request body'
            });
        }

        console.log(`Received audio for recognition (${audio.length} bytes, language: ${languageCode})`);

        // Configure recognition request
        const request = {
            audio: {
                content: audio
            },
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: sampleRate,
                languageCode: languageCode,
                enableAutomaticPunctuation: true,
                model: 'default',
                useEnhanced: true
            }
        };

        // Call Google Cloud Speech-to-Text API
        const startTime = Date.now();
        const [response] = await speechClient.recognize(request);
        const duration = Date.now() - startTime;

        // Extract transcription
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join(' ');

        const confidence = response.results.length > 0
            ? response.results[0].alternatives[0].confidence
            : 0;

        console.log(`Transcription complete (${duration}ms): "${transcription}"`);

        res.json({
            success: true,
            transcript: transcription,
            confidence: confidence,
            duration: duration,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Speech recognition error:', error);

        res.status(500).json({
            success: false,
            error: error.message,
            details: error.details || 'Unknown error occurred'
        });
    }
});

/**
 * Streaming recognition endpoint (placeholder)
 */
app.post('/api/speech/stream', async (req, res) => {
    res.status(501).json({
        message: 'Streaming endpoint not yet implemented',
        hint: 'Use /api/speech/recognize for now'
    });
});

// Start HTTP server (Cloud Run provides HTTPS)
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(50));
    console.log('SmartCookBook Speech Server Started (Cloud Run)');
    console.log('='.repeat(50));
    console.log(`Listening on port ${PORT}`);
    console.log('Ready to accept requests!');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    process.exit(0);
});
