/**
 * Simple CORS Proxy for Claude API (HTTPS)
 *
 * This proxy forwards requests to the Claude API and handles CORS headers
 * Run with: node proxy-server.js
 */

import express from 'express';
import cors from 'cors';
import https from 'https';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

// SSL Certificate paths
const SSL_CERT_PATH = join(__dirname, 'certs', 'cert.pem');
const SSL_KEY_PATH = join(__dirname, 'certs', 'key.pem');

// Enable CORS for all origins (development only)
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

    console.log('🔄 Proxying request to Claude API...');
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
      console.error('❌ Claude API Error:', data);
      return res.status(response.status).json(data);
    }

    console.log('✅ Claude API response received');
    res.json(data);

  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Claude API Proxy is running (HTTPS)' });
});

// Check if SSL certificates exist
if (!existsSync(SSL_CERT_PATH) || !existsSync(SSL_KEY_PATH)) {
  console.error('❌ SSL certificates not found!');
  console.error('   Run: npm run generate:cert');
  process.exit(1);
}

const httpsOptions = {
  key: readFileSync(SSL_KEY_PATH),
  cert: readFileSync(SSL_CERT_PATH)
};

https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔐 Claude API Proxy Server running on https://0.0.0.0:${PORT}`);
  console.log(`   Health check: https://localhost:${PORT}/health`);
  console.log(`   Proxy endpoint: https://localhost:${PORT}/api/claude`);
  console.log(`\n   📱 Access from tablet: https://192.168.2.53:${PORT}/api/claude`);
  console.log(`\n   ⚠️  Accept the self-signed certificate warning on first access\n`);
});
