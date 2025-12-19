/**
 * Generate Self-Signed SSL Certificate for HTTPS
 *
 * This creates a local SSL certificate so microphone/camera can work on tablets
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

console.log('\n🔐 Generating SSL Certificate for HTTPS...\n');

// Create certs directory if it doesn't exist
if (!existsSync('./certs')) {
  mkdirSync('./certs');
  console.log('✅ Created certs directory');
}

// Check if OpenSSL is available
try {
  execSync('openssl version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Error: OpenSSL is not installed or not in PATH');
  console.error('   Please install OpenSSL or use Git Bash which includes it.');
  console.error('\n   Alternative: Use mkcert (simpler):');
  console.error('   1. Install: choco install mkcert (Windows)');
  console.error('   2. Run: mkcert -install');
  console.error('   3. Run: mkcert localhost 192.168.2.53');
  process.exit(1);
}

// Generate self-signed certificate
try {
  console.log('📝 Generating private key and certificate...');

  // Generate private key and certificate in one command
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
    -keyout certs/key.pem \
    -out certs/cert.pem \
    -subj "/C=CA/ST=Quebec/L=Montreal/O=SmartCookBook/CN=192.168.2.53" \
    -addext "subjectAltName=DNS:localhost,IP:192.168.2.53"`,
    { stdio: 'inherit' }
  );

  console.log('\n✅ SSL Certificate generated successfully!');
  console.log('   📄 Certificate: certs/cert.pem');
  console.log('   🔑 Private Key: certs/key.pem');
  console.log('\n⚠️  NOTE: You\'ll need to accept the security warning in your browser');
  console.log('   This is normal for self-signed certificates.\n');

} catch (error) {
  console.error('❌ Error generating certificate:', error.message);
  process.exit(1);
}
