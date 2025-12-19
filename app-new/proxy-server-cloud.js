/**
 * Claude API Proxy - Cloud Run Version
 *
 * This version is optimized for Google Cloud Run:
 * - Uses PORT environment variable
 * - Uses HTTP (Cloud Run provides HTTPS)
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(express.json({ limit: '50mb' }));

// Proxy endpoint for Claude API
app.post('/api/claude', async (req, res) => {
  try {
    // Accept API key from body OR header (x-api-key)
    const apiKey = req.body.apiKey || req.headers['x-api-key'];

    // Remove apiKey from body if present, keep the rest
    const { apiKey: _, ...body } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required (send in body as apiKey or header as x-api-key)' });
    }

    console.log('Proxying request to Claude API...');
    console.log('  Model:', body.model);
    console.log('  Max tokens:', body.max_tokens);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API Error:', data);
      return res.status(response.status).json(data);
    }

    console.log('Claude API response received');
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claude API Proxy is running' });
});

// Start HTTP server (Cloud Run provides HTTPS)
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('Claude API Proxy Started (Cloud Run)');
  console.log('='.repeat(50));
  console.log(`Listening on port ${PORT}`);
  console.log('Ready to accept requests!');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  process.exit(0);
});
