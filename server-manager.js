/**
 * SmartCookBook Server Manager
 *
 * Manages all servers from a single process with:
 * - Port conflict detection and cleanup
 * - Unified logging
 * - Graceful shutdown
 * - Health checks
 *
 * Usage: node server-manager.js [--dev | --tablet]
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');

// Configuration
const SERVERS = [
  {
    name: 'Speech API',
    port: 3000,
    cwd: path.join(__dirname, 'backend'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['start'],
    healthCheck: '/health',
    https: true
  },
  {
    name: 'Claude Proxy',
    port: 3001,
    cwd: path.join(__dirname, 'app-new'),
    cmd: process.platform === 'win32' ? 'node.exe' : 'node',
    args: ['proxy-server.js'],
    healthCheck: '/health',
    https: true
  },
  {
    name: 'Frontend',
    port: 5173,
    cwd: path.join(__dirname, 'app-new'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    healthCheck: null,
    https: false
  }
];

const processes = [];
let shuttingDown = false;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const serverColors = [colors.cyan, colors.magenta, colors.yellow];

function log(message, color = colors.reset) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.bright}[${timestamp}]${colors.reset} ${color}${message}${colors.reset}`);
}

function logServer(serverIndex, name, message) {
  const color = serverColors[serverIndex % serverColors.length];
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.bright}[${timestamp}]${colors.reset} ${color}[${name}]${colors.reset} ${message}`);
}

/**
 * Get local IP address for tablet access
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

/**
 * Kill process using a specific port (Windows)
 */
function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const lines = result.trim().split('\n');
      const pids = new Set();

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            pids.add(pid);
          }
        }
      });

      pids.forEach(pid => {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          log(`Killed process ${pid} on port ${port}`, colors.yellow);
        } catch (e) {
          // Process may have already exited
        }
      });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch (e) {
    // No process found on port
  }
}

/**
 * Wait for a server to be ready
 */
function waitForServer(port, isHttps, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const protocol = isHttps ? https : http;

    const check = () => {
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`));
        return;
      }

      const options = {
        hostname: 'localhost',
        port: port,
        path: '/health',
        method: 'GET',
        rejectUnauthorized: false,
        timeout: 2000
      };

      const req = protocol.request(options, (res) => {
        resolve(true);
      });

      req.on('error', () => {
        setTimeout(check, 500);
      });

      req.on('timeout', () => {
        req.destroy();
        setTimeout(check, 500);
      });

      req.end();
    };

    setTimeout(check, 1000);
  });
}

/**
 * Start a server
 */
function startServer(serverConfig, index) {
  return new Promise(async (resolve, reject) => {
    const { name, port, cwd, cmd, args, https: isHttps } = serverConfig;

    // Check and kill any existing process on the port
    const inUse = await isPortInUse(port);
    if (inUse) {
      log(`Port ${port} is in use, killing existing process...`, colors.yellow);
      killPort(port);
      await new Promise(r => setTimeout(r, 1000));
    }

    logServer(index, name, `Starting on port ${port}...`);

    const child = spawn(cmd, args, {
      cwd: cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    processes.push({ name, child, port });

    child.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          logServer(index, name, line);
        }
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      lines.forEach(line => {
        if (line.trim() && !line.includes('ExperimentalWarning')) {
          logServer(index, name, `${colors.red}${line}${colors.reset}`);
        }
      });
    });

    child.on('error', (error) => {
      logServer(index, name, `${colors.red}Error: ${error.message}${colors.reset}`);
      reject(error);
    });

    child.on('exit', (code) => {
      if (!shuttingDown) {
        logServer(index, name, `${colors.red}Exited with code ${code}${colors.reset}`);
      }
    });

    // Wait a bit for server to start
    setTimeout(() => resolve(child), 2000);
  });
}

/**
 * Graceful shutdown
 */
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  log('\nShutting down all servers...', colors.yellow);

  processes.forEach(({ name, child, port }) => {
    log(`Stopping ${name}...`, colors.yellow);

    // Kill the process
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
      } catch (e) {
        // Already exited
      }
    } else {
      child.kill('SIGTERM');
    }

    // Also kill anything on the port to be sure
    killPort(port);
  });

  log('All servers stopped.', colors.green);
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  const localIP = getLocalIP();

  console.log('');
  log('╔════════════════════════════════════════════════════════════╗', colors.bright);
  log('║          SmartCookBook Server Manager                      ║', colors.bright);
  log('╚════════════════════════════════════════════════════════════╝', colors.bright);
  console.log('');

  // Register shutdown handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`, colors.red);
    shutdown();
  });

  // Start all servers
  for (let i = 0; i < SERVERS.length; i++) {
    try {
      await startServer(SERVERS[i], i);
    } catch (error) {
      log(`Failed to start ${SERVERS[i].name}: ${error.message}`, colors.red);
    }
  }

  // Wait a moment for servers to initialize
  await new Promise(r => setTimeout(r, 3000));

  // Print access information
  console.log('');
  log('╔════════════════════════════════════════════════════════════╗', colors.green);
  log('║                    All Servers Running                     ║', colors.green);
  log('╚════════════════════════════════════════════════════════════╝', colors.green);
  console.log('');
  log(`Speech API:     https://localhost:3000`, colors.cyan);
  log(`Claude Proxy:   https://localhost:3001`, colors.magenta);
  log(`Frontend:       http://localhost:5173`, colors.yellow);
  console.log('');
  log(`📱 Tablet Access:`, colors.bright);
  log(`   Frontend:    http://${localIP}:5173`, colors.yellow);
  log(`   Speech API:  https://${localIP}:3000`, colors.cyan);
  log(`   Claude API:  https://${localIP}:3001`, colors.magenta);
  console.log('');
  log(`⚠️  Accept SSL certificate warnings on first access`, colors.yellow);
  log(`Press Ctrl+C to stop all servers`, colors.bright);
  console.log('');
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});
