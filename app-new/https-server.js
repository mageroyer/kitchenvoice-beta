/**
 * HTTPS Server for Tablet Testing
 *
 * Serves the built app over HTTPS so microphone/camera work on tablets
 */

import express from 'express';
import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 5000;

// Serve static files from dist directory
app.use(express.static(join(__dirname, 'dist')));

// Handle client-side routing - return index.html for all routes
app.use((req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Load SSL certificates
let server;
try {
  const httpsOptions = {
    key: readFileSync(join(__dirname, 'certs', 'key.pem')),
    cert: readFileSync(join(__dirname, 'certs', 'cert.pem'))
  };

  server = https.createServer(httpsOptions, app);
} catch (error) {
  console.error('❌ Error loading SSL certificates:', error.message);
  console.error('\n   Run: npm run generate:cert\n');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n🔐 HTTPS Server running on:');
  console.log(`   ➜ Local:   https://localhost:${PORT}/`);
  console.log(`   ➜ Network: https://192.168.2.53:${PORT}/`);
  console.log(`\n   📱 Tablet Access: https://192.168.2.53:${PORT}/`);
  console.log('\n⚠️  You will need to accept the security warning (self-signed cert)\n');
});
