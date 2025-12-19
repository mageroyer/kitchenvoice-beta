/**
 * SmartCookBook Backend Server
 * Google Cloud Speech-to-Text V2 API Proxy
 *
 * This server receives audio from the frontend and sends it to Google Cloud
 * for speech recognition using the V2 API with chirp_2 model.
 *
 * V2 API with chirp_2 provides:
 * - Automatic punctuation for French (fr-CA)
 * - Better multilingual accuracy
 * - Improved recognition of domain-specific vocabulary
 *
 * Model Selection (as of December 2025):
 * - chirp_2: Current production model (GA in us-central1)
 *   - Best accuracy for French-Canadian (fr-CA)
 *   - Automatic punctuation enabled by default
 *   - Stable and reliable for production use
 *
 * - chirp_3: Next-generation model (Preview)
 *   - Available in: us (multi-region), eu, asia-northeast1, asia-southeast1
 *   - NOT yet available in us-central1 (our current region)
 *   - Features: speaker diarization, auto language detection
 *   - Consider migration when available in us-central1 and GA
 *
 * @see https://cloud.google.com/speech-to-text/v2/docs/chirp_2-model
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const { SpeechClient } = require('@google-cloud/speech').v2;
const path = require('path');

// Initialize Express app
const app = express();
const PORT = 3000;

// ============================================
// SERVER HEALTH & METRICS
// ============================================

const serverStartTime = Date.now();
const requestMetrics = {
  total: 0,
  success: 0,
  errors: 0,
  byEndpoint: {},
  avgResponseTime: 0,
  totalResponseTime: 0,
};

// ============================================
// API USAGE MONITORING
// ============================================

/**
 * API Usage Tracking for cost monitoring and alerts
 * Tracks usage by day/month for Google Cloud Speech and Claude API
 */
const apiUsageMetrics = {
  // Google Cloud Speech usage
  speech: {
    // Current session
    sessionRequests: 0,
    sessionAudioSeconds: 0,
    sessionErrors: 0,
    // Daily tracking (resets at midnight)
    dailyRequests: 0,
    dailyAudioSeconds: 0,
    dailyDate: new Date().toISOString().split('T')[0],
    // Monthly tracking
    monthlyRequests: 0,
    monthlyAudioSeconds: 0,
    monthlyMonth: new Date().toISOString().slice(0, 7), // YYYY-MM
    // Cost estimation (Google Cloud Speech pricing)
    pricing: {
      freeMinutesPerMonth: 60,
      costPer15Seconds: 0.006, // After free tier
    },
  },
  // Claude API usage
  claude: {
    // Current session
    sessionRequests: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionErrors: 0,
    // Daily tracking
    dailyRequests: 0,
    dailyInputTokens: 0,
    dailyOutputTokens: 0,
    dailyDate: new Date().toISOString().split('T')[0],
    // Monthly tracking
    monthlyRequests: 0,
    monthlyInputTokens: 0,
    monthlyOutputTokens: 0,
    monthlyMonth: new Date().toISOString().slice(0, 7),
    // Model-specific tracking
    byModel: {},
    // Cost estimation (Claude pricing - approximate)
    pricing: {
      // Prices per 1M tokens (varies by model)
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      default: { input: 3.00, output: 15.00 },
    },
  },
  // Usage alerts configuration
  alerts: {
    speechMonthlyMinutesWarning: 50, // Warn at 50 minutes (83% of free tier)
    speechMonthlyMinutesCritical: 55, // Critical at 55 minutes
    claudeDailyRequestsWarning: 100,
    claudeDailyRequestsCritical: 200,
    claudeMonthlyTokensWarning: 1000000, // 1M tokens
    claudeMonthlyTokensCritical: 5000000, // 5M tokens
  },
  // Alert history (last 10 alerts)
  alertHistory: [],
};

/**
 * Reset daily metrics if date changed
 */
function checkDailyReset() {
  const today = new Date().toISOString().split('T')[0];

  if (apiUsageMetrics.speech.dailyDate !== today) {
    console.log(`📊 Resetting daily speech metrics (was ${apiUsageMetrics.speech.dailyDate})`);
    apiUsageMetrics.speech.dailyDate = today;
    apiUsageMetrics.speech.dailyRequests = 0;
    apiUsageMetrics.speech.dailyAudioSeconds = 0;
  }

  if (apiUsageMetrics.claude.dailyDate !== today) {
    console.log(`📊 Resetting daily Claude metrics (was ${apiUsageMetrics.claude.dailyDate})`);
    apiUsageMetrics.claude.dailyDate = today;
    apiUsageMetrics.claude.dailyRequests = 0;
    apiUsageMetrics.claude.dailyInputTokens = 0;
    apiUsageMetrics.claude.dailyOutputTokens = 0;
  }
}

/**
 * Reset monthly metrics if month changed
 */
function checkMonthlyReset() {
  const thisMonth = new Date().toISOString().slice(0, 7);

  if (apiUsageMetrics.speech.monthlyMonth !== thisMonth) {
    console.log(`📊 Resetting monthly speech metrics (was ${apiUsageMetrics.speech.monthlyMonth})`);
    apiUsageMetrics.speech.monthlyMonth = thisMonth;
    apiUsageMetrics.speech.monthlyRequests = 0;
    apiUsageMetrics.speech.monthlyAudioSeconds = 0;
  }

  if (apiUsageMetrics.claude.monthlyMonth !== thisMonth) {
    console.log(`📊 Resetting monthly Claude metrics (was ${apiUsageMetrics.claude.monthlyMonth})`);
    apiUsageMetrics.claude.monthlyMonth = thisMonth;
    apiUsageMetrics.claude.monthlyRequests = 0;
    apiUsageMetrics.claude.monthlyInputTokens = 0;
    apiUsageMetrics.claude.monthlyOutputTokens = 0;
    apiUsageMetrics.claude.byModel = {};
  }
}

/**
 * Track Speech API usage
 */
function trackSpeechUsage(audioSeconds, success = true) {
  checkDailyReset();
  checkMonthlyReset();

  apiUsageMetrics.speech.sessionRequests++;
  apiUsageMetrics.speech.dailyRequests++;
  apiUsageMetrics.speech.monthlyRequests++;

  if (success) {
    apiUsageMetrics.speech.sessionAudioSeconds += audioSeconds;
    apiUsageMetrics.speech.dailyAudioSeconds += audioSeconds;
    apiUsageMetrics.speech.monthlyAudioSeconds += audioSeconds;
  } else {
    apiUsageMetrics.speech.sessionErrors++;
  }

  // Check alerts
  checkSpeechAlerts();
}

/**
 * Track Claude API usage
 */
function trackClaudeUsage(model, inputTokens, outputTokens, success = true) {
  checkDailyReset();
  checkMonthlyReset();

  apiUsageMetrics.claude.sessionRequests++;
  apiUsageMetrics.claude.dailyRequests++;
  apiUsageMetrics.claude.monthlyRequests++;

  if (success) {
    apiUsageMetrics.claude.sessionInputTokens += inputTokens;
    apiUsageMetrics.claude.sessionOutputTokens += outputTokens;
    apiUsageMetrics.claude.dailyInputTokens += inputTokens;
    apiUsageMetrics.claude.dailyOutputTokens += outputTokens;
    apiUsageMetrics.claude.monthlyInputTokens += inputTokens;
    apiUsageMetrics.claude.monthlyOutputTokens += outputTokens;

    // Track by model
    if (!apiUsageMetrics.claude.byModel[model]) {
      apiUsageMetrics.claude.byModel[model] = { requests: 0, inputTokens: 0, outputTokens: 0 };
    }
    apiUsageMetrics.claude.byModel[model].requests++;
    apiUsageMetrics.claude.byModel[model].inputTokens += inputTokens;
    apiUsageMetrics.claude.byModel[model].outputTokens += outputTokens;
  } else {
    apiUsageMetrics.claude.sessionErrors++;
  }

  // Check alerts
  checkClaudeAlerts();
}

/**
 * Check Speech API usage alerts
 */
function checkSpeechAlerts() {
  const monthlyMinutes = apiUsageMetrics.speech.monthlyAudioSeconds / 60;
  const alerts = apiUsageMetrics.alerts;

  if (monthlyMinutes >= alerts.speechMonthlyMinutesCritical) {
    addAlert('speech', 'critical', `Speech API: ${monthlyMinutes.toFixed(1)} minutes used this month (approaching free tier limit of 60 min)`);
  } else if (monthlyMinutes >= alerts.speechMonthlyMinutesWarning) {
    addAlert('speech', 'warning', `Speech API: ${monthlyMinutes.toFixed(1)} minutes used this month (${((monthlyMinutes / 60) * 100).toFixed(0)}% of free tier)`);
  }
}

/**
 * Check Claude API usage alerts
 */
function checkClaudeAlerts() {
  const alerts = apiUsageMetrics.alerts;
  const dailyRequests = apiUsageMetrics.claude.dailyRequests;
  const monthlyTokens = apiUsageMetrics.claude.monthlyInputTokens + apiUsageMetrics.claude.monthlyOutputTokens;

  if (dailyRequests >= alerts.claudeDailyRequestsCritical) {
    addAlert('claude', 'critical', `Claude API: ${dailyRequests} requests today (high usage)`);
  } else if (dailyRequests >= alerts.claudeDailyRequestsWarning) {
    addAlert('claude', 'warning', `Claude API: ${dailyRequests} requests today`);
  }

  if (monthlyTokens >= alerts.claudeMonthlyTokensCritical) {
    addAlert('claude', 'critical', `Claude API: ${(monthlyTokens / 1000000).toFixed(2)}M tokens this month`);
  } else if (monthlyTokens >= alerts.claudeMonthlyTokensWarning) {
    addAlert('claude', 'warning', `Claude API: ${(monthlyTokens / 1000000).toFixed(2)}M tokens this month`);
  }
}

/**
 * Add alert to history (deduplicated by message within 1 hour)
 */
function addAlert(service, level, message) {
  const now = Date.now();
  const hourAgo = now - 3600000;

  // Check if same alert was raised in last hour
  const recentSame = apiUsageMetrics.alertHistory.find(
    a => a.message === message && a.timestamp > hourAgo
  );

  if (recentSame) return; // Don't duplicate

  const alert = {
    service,
    level,
    message,
    timestamp: now,
    date: new Date().toISOString(),
  };

  apiUsageMetrics.alertHistory.unshift(alert);

  // Keep only last 10 alerts
  if (apiUsageMetrics.alertHistory.length > 10) {
    apiUsageMetrics.alertHistory = apiUsageMetrics.alertHistory.slice(0, 10);
  }

  // Log alert
  const emoji = level === 'critical' ? '🚨' : '⚠️';
  console.log(`${emoji} USAGE ALERT [${service}/${level}]: ${message}`);
}

/**
 * Calculate estimated costs
 */
function calculateCosts() {
  const speech = apiUsageMetrics.speech;
  const claude = apiUsageMetrics.claude;

  // Speech cost calculation
  const speechMinutes = speech.monthlyAudioSeconds / 60;
  const billableMinutes = Math.max(0, speechMinutes - speech.pricing.freeMinutesPerMonth);
  const speechCost = billableMinutes * 4 * speech.pricing.costPer15Seconds; // 4 x 15-sec chunks per minute

  // Claude cost calculation
  let claudeCost = 0;
  for (const [model, usage] of Object.entries(claude.byModel)) {
    const pricing = claude.pricing[model] || claude.pricing.default;
    claudeCost += (usage.inputTokens / 1000000) * pricing.input;
    claudeCost += (usage.outputTokens / 1000000) * pricing.output;
  }

  return {
    speech: {
      monthlyMinutes: speechMinutes.toFixed(2),
      freeMinutesUsed: Math.min(speechMinutes, speech.pricing.freeMinutesPerMonth).toFixed(2),
      billableMinutes: billableMinutes.toFixed(2),
      estimatedCost: `$${speechCost.toFixed(2)}`,
    },
    claude: {
      monthlyInputTokens: claude.monthlyInputTokens,
      monthlyOutputTokens: claude.monthlyOutputTokens,
      totalTokens: claude.monthlyInputTokens + claude.monthlyOutputTokens,
      estimatedCost: `$${claudeCost.toFixed(2)}`,
    },
    total: `$${(speechCost + claudeCost).toFixed(2)}`,
  };
}

// Track active requests for timeout handling
const activeRequests = new Map();

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Format duration for logging
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get memory usage in MB
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024),
  };
}

// SSL Certificate paths (shared with app-new)
const SSL_CERT_PATH = path.join(__dirname, '../app-new/certs/cert.pem');
const SSL_KEY_PATH = path.join(__dirname, '../app-new/certs/key.pem');

// Google Cloud project configuration
const CREDENTIALS_PATH = path.join(__dirname, '../google-cloud-credentials.json');
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
const PROJECT_ID = credentials.project_id;

// Speech-to-Text configuration
// chirp_2 is the current production model with best French-Canadian support
// chirp_3 can be enabled when it becomes GA in us-central1
const SPEECH_MODEL = process.env.SPEECH_MODEL || 'chirp_2';
const LOCATION = process.env.SPEECH_LOCATION || 'us-central1';

// Supported models and their features
const MODEL_INFO = {
  'chirp_2': {
    description: 'Production model with excellent French-Canadian support',
    features: ['automatic_punctuation', 'word_timestamps'],
    ga_regions: ['us-central1', 'asia-southeast1', 'europe-west4'],
  },
  'chirp_3': {
    description: 'Next-gen model with speaker diarization (Preview)',
    features: ['automatic_punctuation', 'speaker_diarization', 'auto_language_detection'],
    ga_regions: ['us', 'eu', 'asia-northeast1', 'asia-southeast1'],
    preview_regions: ['asia-south1', 'europe-west2', 'europe-west3', 'northamerica-northeast1'],
  },
};

console.log(`📢 Speech Model: ${SPEECH_MODEL} (${MODEL_INFO[SPEECH_MODEL]?.description || 'Unknown model'})`);
console.log(`📍 Region: ${LOCATION}`);

// CORS configuration - whitelist allowed origins
const allowedOrigins = [
    // Development - HTTP and HTTPS on various ports
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5000',
    'https://localhost:5173',
    'https://localhost:5174',
    'https://localhost:5175',
    'https://localhost:5176',
    'https://localhost:5000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'https://127.0.0.1:5173',
    'https://127.0.0.1:5175',
    // Network access (tablet)
    'http://192.168.2.53:5173',
    'http://192.168.2.53:5174',
    'http://192.168.2.53:5175',
    'https://192.168.2.53:5173',
    'https://192.168.2.53:5174',
    'https://192.168.2.53:5175',
    'https://192.168.2.53:5000',
    // Production
    'https://smartcookbook-2afe2.web.app',
    'https://smartcookbook-2afe2.firebaseapp.com'
];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.log('⚠️ CORS blocked origin:', origin);
        return callback(new Error('CORS not allowed'), false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
}));

// Parse JSON bodies - limit to 5MB for audio
app.use(express.json({ limit: '5mb' }));

// ============================================
// REQUEST LOGGING MIDDLEWARE
// ============================================

// Request timeout configuration (ms)
const REQUEST_TIMEOUTS = {
  default: 30000,           // 30 seconds for most requests
  '/api/speech/recognize': 120000,  // 2 minutes for speech recognition
  '/api/claude': 180000,    // 3 minutes for Claude API (large documents)
  '/api/quickbooks/bills': 60000,   // 1 minute for QuickBooks
};

/**
 * Get timeout for a specific endpoint
 */
function getTimeoutForEndpoint(path) {
  for (const [endpoint, timeout] of Object.entries(REQUEST_TIMEOUTS)) {
    if (path.startsWith(endpoint)) {
      return timeout;
    }
  }
  return REQUEST_TIMEOUTS.default;
}

/**
 * Request logging and metrics middleware
 */
app.use((req, res, next) => {
  // Skip logging for health checks to reduce noise
  if (req.path === '/health') {
    return next();
  }

  const requestId = generateRequestId();
  const startTime = Date.now();
  const timeout = getTimeoutForEndpoint(req.path);

  // Attach request ID to request object
  req.requestId = requestId;
  req.startTime = startTime;

  // Track active request
  activeRequests.set(requestId, {
    path: req.path,
    method: req.method,
    startTime,
    timeout,
  });

  // Set up request timeout
  const timeoutId = setTimeout(() => {
    if (activeRequests.has(requestId)) {
      console.error(`⏱️ [${requestId}] REQUEST TIMEOUT after ${formatDuration(timeout)}: ${req.method} ${req.path}`);
      activeRequests.delete(requestId);

      // Only send response if not already sent
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Request timeout',
          message: `Request took longer than ${formatDuration(timeout)}. Please try again.`,
          requestId,
        });
      }
    }
  }, timeout);

  // Log incoming request
  const bodySize = req.body ? JSON.stringify(req.body).length : 0;
  console.log(`📥 [${requestId}] ${req.method} ${req.path} (body: ${formatBytes(bodySize)}, timeout: ${formatDuration(timeout)})`);

  // Capture response
  const originalSend = res.send;
  res.send = function(body) {
    clearTimeout(timeoutId);
    activeRequests.delete(requestId);

    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Update metrics
    requestMetrics.total++;
    requestMetrics.totalResponseTime += duration;
    requestMetrics.avgResponseTime = Math.round(requestMetrics.totalResponseTime / requestMetrics.total);

    if (statusCode >= 200 && statusCode < 400) {
      requestMetrics.success++;
    } else {
      requestMetrics.errors++;
    }

    // Track by endpoint
    const endpoint = req.path;
    if (!requestMetrics.byEndpoint[endpoint]) {
      requestMetrics.byEndpoint[endpoint] = { count: 0, errors: 0, avgTime: 0, totalTime: 0 };
    }
    requestMetrics.byEndpoint[endpoint].count++;
    requestMetrics.byEndpoint[endpoint].totalTime += duration;
    requestMetrics.byEndpoint[endpoint].avgTime = Math.round(
      requestMetrics.byEndpoint[endpoint].totalTime / requestMetrics.byEndpoint[endpoint].count
    );
    if (statusCode >= 400) {
      requestMetrics.byEndpoint[endpoint].errors++;
    }

    // Log response
    const statusEmoji = statusCode >= 500 ? '❌' : statusCode >= 400 ? '⚠️' : '✅';
    const responseSize = body ? Buffer.byteLength(body) : 0;
    console.log(`📤 [${requestId}] ${statusEmoji} ${statusCode} (${formatDuration(duration)}, response: ${formatBytes(responseSize)})`);

    return originalSend.call(this, body);
  };

  next();
});

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

// Initialize Google Cloud Speech V2 client
const speechClient = new SpeechClient({
    keyFilename: CREDENTIALS_PATH,
    apiEndpoint: `${LOCATION}-speech.googleapis.com`
});

console.log('✅ Google Cloud Speech-to-Text V2 client initialized');

/**
 * Health check endpoint - basic status
 * GET /health
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Detailed health check endpoint - full server status
 * GET /health/detailed
 */
app.get('/health/detailed', (req, res) => {
    const uptime = Date.now() - serverStartTime;
    const memory = getMemoryUsage();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: {
            ms: uptime,
            formatted: formatUptime(uptime),
        },
        memory: {
            heapUsed: `${memory.heapUsed}MB`,
            heapTotal: `${memory.heapTotal}MB`,
            rss: `${memory.rss}MB`,
        },
        requests: {
            total: requestMetrics.total,
            success: requestMetrics.success,
            errors: requestMetrics.errors,
            successRate: requestMetrics.total > 0
                ? `${((requestMetrics.success / requestMetrics.total) * 100).toFixed(1)}%`
                : 'N/A',
            avgResponseTime: `${requestMetrics.avgResponseTime}ms`,
        },
        activeRequests: activeRequests.size,
        config: {
            speechModel: SPEECH_MODEL,
            region: LOCATION,
            environment: QB_CONFIG?.environment || 'N/A',
        },
        version: '1.1.0',
    });
});

/**
 * Metrics endpoint - detailed request statistics
 * GET /health/metrics
 */
app.get('/health/metrics', (req, res) => {
    const uptime = Date.now() - serverStartTime;

    // Calculate requests per minute
    const uptimeMinutes = uptime / 60000;
    const requestsPerMinute = uptimeMinutes > 0
        ? (requestMetrics.total / uptimeMinutes).toFixed(2)
        : 0;

    res.json({
        timestamp: new Date().toISOString(),
        uptime: formatUptime(uptime),
        summary: {
            totalRequests: requestMetrics.total,
            successfulRequests: requestMetrics.success,
            failedRequests: requestMetrics.errors,
            successRate: requestMetrics.total > 0
                ? ((requestMetrics.success / requestMetrics.total) * 100).toFixed(1)
                : 0,
            avgResponseTime: requestMetrics.avgResponseTime,
            requestsPerMinute: parseFloat(requestsPerMinute),
        },
        endpoints: Object.entries(requestMetrics.byEndpoint).map(([path, stats]) => ({
            path,
            requests: stats.count,
            errors: stats.errors,
            avgResponseTime: `${stats.avgTime}ms`,
            errorRate: stats.count > 0
                ? `${((stats.errors / stats.count) * 100).toFixed(1)}%`
                : '0%',
        })).sort((a, b) => b.requests - a.requests),
        activeRequests: Array.from(activeRequests.entries()).map(([id, req]) => ({
            id,
            path: req.path,
            method: req.method,
            elapsed: `${Date.now() - req.startTime}ms`,
            timeout: `${req.timeout}ms`,
        })),
        memory: getMemoryUsage(),
    });
});

/**
 * Liveness probe - for container orchestration
 * GET /health/live
 */
app.get('/health/live', (req, res) => {
    res.status(200).send('OK');
});

/**
 * Readiness probe - check if service is ready to accept requests
 * GET /health/ready
 */
app.get('/health/ready', async (req, res) => {
    const checks = {
        server: true,
        speechClient: false,
        quickbooks: qbTokens?.accessToken ? true : 'not_configured',
    };

    // Check if Speech client is initialized
    try {
        checks.speechClient = speechClient ? true : false;
    } catch (e) {
        checks.speechClient = false;
    }

    const allReady = checks.server && checks.speechClient;

    res.status(allReady ? 200 : 503).json({
        ready: allReady,
        checks,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Format uptime to human readable
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * API Usage monitoring endpoint
 * GET /api/usage
 *
 * Returns current API usage statistics, costs, and alerts
 */
app.get('/api/usage', (req, res) => {
    checkDailyReset();
    checkMonthlyReset();

    const costs = calculateCosts();

    res.json({
        timestamp: new Date().toISOString(),
        period: {
            daily: apiUsageMetrics.speech.dailyDate,
            monthly: apiUsageMetrics.speech.monthlyMonth,
        },
        speech: {
            session: {
                requests: apiUsageMetrics.speech.sessionRequests,
                audioSeconds: apiUsageMetrics.speech.sessionAudioSeconds,
                audioMinutes: (apiUsageMetrics.speech.sessionAudioSeconds / 60).toFixed(2),
                errors: apiUsageMetrics.speech.sessionErrors,
            },
            daily: {
                requests: apiUsageMetrics.speech.dailyRequests,
                audioSeconds: apiUsageMetrics.speech.dailyAudioSeconds,
                audioMinutes: (apiUsageMetrics.speech.dailyAudioSeconds / 60).toFixed(2),
            },
            monthly: {
                requests: apiUsageMetrics.speech.monthlyRequests,
                audioSeconds: apiUsageMetrics.speech.monthlyAudioSeconds,
                audioMinutes: (apiUsageMetrics.speech.monthlyAudioSeconds / 60).toFixed(2),
                freeMinutesRemaining: Math.max(0, 60 - apiUsageMetrics.speech.monthlyAudioSeconds / 60).toFixed(2),
                freeTierPercentUsed: Math.min(100, (apiUsageMetrics.speech.monthlyAudioSeconds / 60 / 60 * 100)).toFixed(1),
            },
            costs: costs.speech,
        },
        claude: {
            session: {
                requests: apiUsageMetrics.claude.sessionRequests,
                inputTokens: apiUsageMetrics.claude.sessionInputTokens,
                outputTokens: apiUsageMetrics.claude.sessionOutputTokens,
                totalTokens: apiUsageMetrics.claude.sessionInputTokens + apiUsageMetrics.claude.sessionOutputTokens,
                errors: apiUsageMetrics.claude.sessionErrors,
            },
            daily: {
                requests: apiUsageMetrics.claude.dailyRequests,
                inputTokens: apiUsageMetrics.claude.dailyInputTokens,
                outputTokens: apiUsageMetrics.claude.dailyOutputTokens,
                totalTokens: apiUsageMetrics.claude.dailyInputTokens + apiUsageMetrics.claude.dailyOutputTokens,
            },
            monthly: {
                requests: apiUsageMetrics.claude.monthlyRequests,
                inputTokens: apiUsageMetrics.claude.monthlyInputTokens,
                outputTokens: apiUsageMetrics.claude.monthlyOutputTokens,
                totalTokens: apiUsageMetrics.claude.monthlyInputTokens + apiUsageMetrics.claude.monthlyOutputTokens,
            },
            byModel: apiUsageMetrics.claude.byModel,
            costs: costs.claude,
        },
        costs: {
            speech: costs.speech.estimatedCost,
            claude: costs.claude.estimatedCost,
            total: costs.total,
        },
        alerts: {
            active: apiUsageMetrics.alertHistory.filter(a => Date.now() - a.timestamp < 3600000),
            history: apiUsageMetrics.alertHistory,
        },
        limits: apiUsageMetrics.alerts,
    });
});

/**
 * API Usage alerts endpoint
 * GET /api/usage/alerts
 *
 * Returns only alerts that need attention
 */
app.get('/api/usage/alerts', (req, res) => {
    checkDailyReset();
    checkMonthlyReset();

    const activeAlerts = apiUsageMetrics.alertHistory.filter(
        a => Date.now() - a.timestamp < 3600000 // Last hour
    );

    const hasWarnings = activeAlerts.some(a => a.level === 'warning');
    const hasCritical = activeAlerts.some(a => a.level === 'critical');

    res.json({
        timestamp: new Date().toISOString(),
        status: hasCritical ? 'critical' : hasWarnings ? 'warning' : 'ok',
        alertCount: activeAlerts.length,
        alerts: activeAlerts,
    });
});

/**
 * Update usage alert thresholds
 * POST /api/usage/limits
 */
app.post('/api/usage/limits', (req, res) => {
    const { speechMonthlyMinutesWarning, speechMonthlyMinutesCritical,
            claudeDailyRequestsWarning, claudeDailyRequestsCritical,
            claudeMonthlyTokensWarning, claudeMonthlyTokensCritical } = req.body;

    // Update thresholds if provided
    if (speechMonthlyMinutesWarning !== undefined) {
        apiUsageMetrics.alerts.speechMonthlyMinutesWarning = speechMonthlyMinutesWarning;
    }
    if (speechMonthlyMinutesCritical !== undefined) {
        apiUsageMetrics.alerts.speechMonthlyMinutesCritical = speechMonthlyMinutesCritical;
    }
    if (claudeDailyRequestsWarning !== undefined) {
        apiUsageMetrics.alerts.claudeDailyRequestsWarning = claudeDailyRequestsWarning;
    }
    if (claudeDailyRequestsCritical !== undefined) {
        apiUsageMetrics.alerts.claudeDailyRequestsCritical = claudeDailyRequestsCritical;
    }
    if (claudeMonthlyTokensWarning !== undefined) {
        apiUsageMetrics.alerts.claudeMonthlyTokensWarning = claudeMonthlyTokensWarning;
    }
    if (claudeMonthlyTokensCritical !== undefined) {
        apiUsageMetrics.alerts.claudeMonthlyTokensCritical = claudeMonthlyTokensCritical;
    }

    console.log('📊 Usage alert thresholds updated:', apiUsageMetrics.alerts);

    res.json({
        success: true,
        limits: apiUsageMetrics.alerts,
    });
});

/**
 * Model info endpoint - returns current speech model configuration
 * GET /api/speech/model-info
 */
app.get('/api/speech/model-info', (req, res) => {
    res.json({
        model: SPEECH_MODEL,
        region: LOCATION,
        info: MODEL_INFO[SPEECH_MODEL] || { description: 'Unknown model' },
        supportedLanguages: [
            { code: 'fr-CA', name: 'French (Canada)', default: true },
            { code: 'fr-FR', name: 'French (France)' },
            { code: 'en-CA', name: 'English (Canada)' },
            { code: 'en-US', name: 'English (United States)' },
        ],
        recommendation: SPEECH_MODEL === 'chirp_2'
            ? 'chirp_2 is the recommended model for French-Canadian speech recognition with automatic punctuation.'
            : 'chirp_3 provides enhanced accuracy and speaker diarization features.',
    });
});

/**
 * Speech recognition endpoint
 * POST /api/speech/recognize
 *
 * Expects JSON body:
 * {
 *   "audio": "base64-encoded audio data",
 *   "sampleRate": 16000,
 *   "languageCode": "fr-CA"
 * }
 */
app.post('/api/speech/recognize', async (req, res) => {
    try {
        const { audio, sampleRate = 48000, languageCode = 'fr-CA' } = req.body; // French (Canada) by default

        if (!audio) {
            return res.status(400).json({
                error: 'Missing audio data',
                message: 'Please provide base64-encoded audio in the request body'
            });
        }

        console.log(`🎤 Received audio for recognition (${audio.length} bytes, language: ${languageCode}, sampleRate: ${sampleRate})`);

        // Calculate audio duration estimate (rough)
        const audioDurationSec = (audio.length * 0.75) / (sampleRate * 2); // rough estimate
        console.log(`🎤 Estimated audio duration: ${audioDurationSec.toFixed(1)} seconds`);

        // V2 API request format with configurable model
        // chirp_2/chirp_3 have automatic punctuation ENABLED BY DEFAULT for French
        const recognizer = `projects/${PROJECT_ID}/locations/${LOCATION}/recognizers/_`;

        const request = {
            recognizer: recognizer,
            content: Buffer.from(audio, 'base64'),
            config: {
                // Auto-detect audio encoding (works with WEBM_OPUS)
                autoDecodingConfig: {},
                // Language configuration
                languageCodes: [languageCode],
                // Use configured model (chirp_2 default, chirp_3 when available)
                model: SPEECH_MODEL,
                // Features - punctuation is automatic with chirp models
                features: {
                    enableAutomaticPunctuation: true,
                    enableWordTimeOffsets: false
                }
            }
        };

        console.log(`🎯 Using model: ${SPEECH_MODEL} in ${LOCATION}`);

        // Call Google Cloud Speech-to-Text V2 API
        const startTime = Date.now();
        const [response] = await speechClient.recognize(request);
        const duration = Date.now() - startTime;

        // Log full response for debugging
        const results = response.results || [];
        console.log(`🔍 Google V2 response - ${results.length} result(s)`);
        results.forEach((result, i) => {
            if (result.alternatives && result.alternatives[0]) {
                console.log(`   Result ${i}: "${result.alternatives[0].transcript}" (confidence: ${((result.alternatives[0].confidence || 0) * 100).toFixed(1)}%)`);
            }
        });

        // Extract transcription
        const transcription = results
            .filter(result => result.alternatives && result.alternatives[0])
            .map(result => result.alternatives[0].transcript)
            .join(' ');

        const confidence = results.length > 0 && results[0].alternatives && results[0].alternatives[0]
            ? results[0].alternatives[0].confidence || 0
            : 0;

        console.log(`✅ Transcription complete (${duration}ms): "${transcription}" (confidence: ${(confidence * 100).toFixed(1)}%)`);

        // Track usage (estimate audio duration from base64 size)
        // Rough estimate: base64 is ~1.37x the binary size, and audio is ~16kbps for speech
        const estimatedAudioSeconds = Math.max(1, audioDurationSec);
        trackSpeechUsage(estimatedAudioSeconds, true);

        // Return result
        res.json({
            success: true,
            transcript: transcription,
            confidence: confidence,
            duration: duration,
            audioDuration: estimatedAudioSeconds,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Speech recognition error:', error.message);

        // Track failed request
        trackSpeechUsage(0, false);

        // Return generic error to client (don't expose internals)
        res.status(500).json({
            success: false,
            error: 'Speech recognition failed. Please try again.'
        });
    }
});

/**
 * Streaming recognition endpoint (for future use)
 * This allows continuous recognition without timeout
 */
app.post('/api/speech/stream', async (req, res) => {
    // TODO: Implement streaming recognition for continuous audio
    res.status(501).json({
        message: 'Streaming endpoint not yet implemented',
        hint: 'Use /api/speech/recognize for now'
    });
});

// Start HTTPS server - listen on all network interfaces for tablet access
// Check if SSL certificates exist
if (!fs.existsSync(SSL_CERT_PATH) || !fs.existsSync(SSL_KEY_PATH)) {
    console.error('❌ SSL certificates not found!');
    console.error('   Run: cd ../app-new && npm run generate:cert');
    process.exit(1);
}

const httpsOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH)
};

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
    const requestId = req.requestId || 'unknown';
    console.error(`❌ [${requestId}] Unhandled error:`, err.message);
    console.error(err.stack);

    // Clear from active requests
    if (requestId !== 'unknown') {
        activeRequests.delete(requestId);
    }

    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
        requestId,
    });
});

/**
 * 404 handler for unknown routes
 */
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: `Endpoint ${req.method} ${req.path} does not exist`,
        availableEndpoints: [
            'GET /health',
            'GET /health/detailed',
            'GET /health/metrics',
            'GET /health/live',
            'GET /health/ready',
            'GET /api/usage',
            'GET /api/usage/alerts',
            'POST /api/usage/limits',
            'GET /api/speech/model-info',
            'POST /api/speech/recognize',
            'POST /api/claude',
            'GET /api/quickbooks/status',
        ],
    });
});

https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('🔐 SmartCookBook Backend Server v1.2.0 (HTTPS)');
    console.log('='.repeat(60));
    console.log('');
    console.log('📍 Server URLs:');
    console.log(`   Local:   https://localhost:${PORT}`);
    console.log(`   Network: https://192.168.2.53:${PORT}`);
    console.log('');
    console.log('🏥 Health Endpoints:');
    console.log(`   Basic:    /health`);
    console.log(`   Detailed: /health/detailed`);
    console.log(`   Metrics:  /health/metrics`);
    console.log(`   Live:     /health/live`);
    console.log(`   Ready:    /health/ready`);
    console.log('');
    console.log('📊 API Usage Monitoring:');
    console.log(`   Usage:     GET  /api/usage`);
    console.log(`   Alerts:    GET  /api/usage/alerts`);
    console.log(`   Limits:    POST /api/usage/limits`);
    console.log('');
    console.log('🎤 Speech API:');
    console.log(`   Model Info: GET  /api/speech/model-info`);
    console.log(`   Recognize:  POST /api/speech/recognize`);
    console.log('');
    console.log('🤖 Claude API:');
    console.log(`   Proxy:      POST /api/claude`);
    console.log('');
    console.log('📊 QuickBooks:');
    console.log(`   Status:     GET  /api/quickbooks/status`);
    console.log('');
    console.log('='.repeat(60));
    console.log('📱 Ready to accept requests from desktop and tablet!');
    console.log('⚠️  Accept the self-signed certificate warning on first access');
    console.log('='.repeat(60));
    console.log('');
});

// Claude API Key - server-managed, persistent across all users
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';

/**
 * Claude API Proxy endpoint
 * POST /api/claude
 *
 * Forwards requests to Claude API to avoid CORS issues
 * Uses server-side API key (from environment variable)
 */
app.post('/api/claude', async (req, res) => {
    try {
        // Use server-side API key, fall back to client-provided key for backwards compatibility
        const apiKey = CLAUDE_API_KEY || req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                error: 'Missing API key',
                message: 'Claude API key not configured on server. Set CLAUDE_API_KEY environment variable.'
            });
        }

        console.log('🤖 Claude API proxy request received');
        console.log(`   Model: ${req.body.model}`);
        console.log(`   Max tokens: ${req.body.max_tokens}`);
        console.log(`   Using: ${CLAUDE_API_KEY ? 'server API key' : 'client API key'}`);

        // Forward to Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(req.body)
        });

        // Get response data
        const data = await response.json();

        // Forward rate limit headers if present
        const rateLimitHeaders = [
            'x-ratelimit-limit-requests',
            'x-ratelimit-limit-tokens',
            'x-ratelimit-remaining-requests',
            'x-ratelimit-remaining-tokens'
        ];

        rateLimitHeaders.forEach(header => {
            const value = response.headers.get(header);
            if (value) res.setHeader(header, value);
        });

        if (!response.ok) {
            console.error('❌ Claude API error:', response.status, data);
            // Track failed request
            trackClaudeUsage(req.body.model || 'unknown', 0, 0, false);
            return res.status(response.status).json(data);
        }

        // Extract token usage from response
        const inputTokens = data.usage?.input_tokens || 0;
        const outputTokens = data.usage?.output_tokens || 0;
        const model = req.body.model || 'unknown';

        // Track successful request
        trackClaudeUsage(model, inputTokens, outputTokens, true);

        console.log(`✅ Claude API response received (${inputTokens} in / ${outputTokens} out tokens)`);
        res.json(data);

    } catch (error) {
        console.error('❌ Claude proxy error:', error.message);
        // Track failed request
        trackClaudeUsage(req.body?.model || 'unknown', 0, 0, false);
        res.status(500).json({
            error: 'Proxy error',
            message: error.message
        });
    }
});

// ============================================================
// QuickBooks Online Integration
// ============================================================

// QuickBooks OAuth Configuration (from environment or config)
const QB_CONFIG = {
    clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
    clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
    redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'https://localhost:3000/api/quickbooks/callback',
    environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox', // 'sandbox' or 'production'
    // OAuth URLs
    authUrl: 'https://appcenter.intuit.com/connect/oauth2',
    tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
    revokeUrl: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
    // API URLs
    get apiBaseUrl() {
        return this.environment === 'production'
            ? 'https://quickbooks.api.intuit.com'
            : 'https://sandbox-quickbooks.api.intuit.com';
    }
};

// In-memory token storage (in production, use database/secure storage)
let qbTokens = {
    accessToken: null,
    refreshToken: null,
    realmId: null,
    expiresAt: null
};

/**
 * QuickBooks OAuth - Get Authorization URL
 * GET /api/quickbooks/auth-url
 */
app.get('/api/quickbooks/auth-url', (req, res) => {
    if (!QB_CONFIG.clientId) {
        return res.status(500).json({
            error: 'QuickBooks not configured',
            message: 'Please set QUICKBOOKS_CLIENT_ID in environment variables'
        });
    }

    const state = Math.random().toString(36).substring(7); // CSRF protection
    const scope = 'com.intuit.quickbooks.accounting';

    const authUrl = `${QB_CONFIG.authUrl}?` +
        `client_id=${QB_CONFIG.clientId}&` +
        `redirect_uri=${encodeURIComponent(QB_CONFIG.redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

    console.log('🔐 QuickBooks auth URL generated');
    res.json({ authUrl, state });
});

/**
 * QuickBooks OAuth - Callback Handler
 * GET /api/quickbooks/callback
 */
app.get('/api/quickbooks/callback', async (req, res) => {
    const { code, state, realmId, error } = req.query;

    if (error) {
        console.error('❌ QuickBooks OAuth error:', error);
        return res.redirect('/settings?qb_error=' + encodeURIComponent(error));
    }

    if (!code || !realmId) {
        return res.redirect('/settings?qb_error=missing_params');
    }

    try {
        // Exchange authorization code for tokens
        const tokenResponse = await fetch(QB_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: QB_CONFIG.redirectUri
            })
        });

        const tokens = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error('❌ Token exchange failed:', tokens);
            return res.redirect('/settings?qb_error=token_exchange_failed');
        }

        // Store tokens
        qbTokens = {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            realmId: realmId,
            expiresAt: Date.now() + (tokens.expires_in * 1000)
        };

        console.log('✅ QuickBooks connected successfully');
        console.log(`   Realm ID: ${realmId}`);
        console.log(`   Token expires in: ${tokens.expires_in} seconds`);

        // Redirect to settings page with success
        res.redirect('/settings?qb_connected=true');

    } catch (error) {
        console.error('❌ QuickBooks callback error:', error);
        res.redirect('/settings?qb_error=' + encodeURIComponent(error.message));
    }
});

/**
 * QuickBooks - Check Connection Status
 * GET /api/quickbooks/status
 */
app.get('/api/quickbooks/status', async (req, res) => {
    if (!qbTokens.accessToken) {
        return res.json({
            connected: false,
            message: 'Not connected to QuickBooks'
        });
    }

    // Check if token is expired
    if (Date.now() >= qbTokens.expiresAt) {
        // Try to refresh
        const refreshed = await refreshQuickBooksToken();
        if (!refreshed) {
            return res.json({
                connected: false,
                message: 'Token expired and refresh failed'
            });
        }
    }

    try {
        // Get company info to verify connection
        const companyInfo = await quickBooksRequest('GET', `/v3/company/${qbTokens.realmId}/companyinfo/${qbTokens.realmId}`);

        res.json({
            connected: true,
            companyName: companyInfo.CompanyInfo?.CompanyName || 'Unknown',
            realmId: qbTokens.realmId,
            environment: QB_CONFIG.environment
        });
    } catch (error) {
        res.json({
            connected: false,
            message: 'Connection verification failed'
        });
    }
});

/**
 * QuickBooks - Disconnect
 * POST /api/quickbooks/disconnect
 */
app.post('/api/quickbooks/disconnect', async (req, res) => {
    if (qbTokens.accessToken) {
        try {
            // Revoke token
            await fetch(QB_CONFIG.revokeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Basic ' + Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64')
                },
                body: JSON.stringify({
                    token: qbTokens.accessToken
                })
            });
        } catch (error) {
            console.error('⚠️ Token revoke failed (continuing disconnect):', error.message);
        }
    }

    // Clear tokens
    qbTokens = {
        accessToken: null,
        refreshToken: null,
        realmId: null,
        expiresAt: null
    };

    console.log('✅ QuickBooks disconnected');
    res.json({ success: true, message: 'Disconnected from QuickBooks' });
});

/**
 * QuickBooks - Get Vendors List
 * GET /api/quickbooks/vendors
 */
app.get('/api/quickbooks/vendors', async (req, res) => {
    try {
        await ensureValidToken();

        const result = await quickBooksRequest('GET',
            `/v3/company/${qbTokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Vendor MAXRESULTS 1000')}`
        );

        const vendors = result.QueryResponse?.Vendor || [];
        res.json({
            success: true,
            vendors: vendors.map(v => ({
                id: v.Id,
                name: v.DisplayName,
                email: v.PrimaryEmailAddr?.Address,
                active: v.Active
            }))
        });
    } catch (error) {
        console.error('❌ Get vendors error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * QuickBooks - Create Bill from Invoice
 * POST /api/quickbooks/bills
 */
app.post('/api/quickbooks/bills', async (req, res) => {
    try {
        await ensureValidToken();

        const { invoice, vendorId, accountId } = req.body;

        if (!invoice || !vendorId) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide invoice and vendorId'
            });
        }

        // Build QuickBooks Bill object
        const bill = {
            VendorRef: {
                value: vendorId
            },
            TxnDate: invoice.date || new Date().toISOString().split('T')[0],
            DueDate: invoice.dueDate || null,
            DocNumber: invoice.invoiceNumber,
            PrivateNote: `Imported from SmartCookBook - ${invoice.supplierName}`,
            Line: invoice.items.map((item, index) => ({
                Id: String(index + 1),
                Amount: item.totalPrice || (item.quantity * item.unitPrice),
                DetailType: 'AccountBasedExpenseLineDetail',
                AccountBasedExpenseLineDetail: {
                    AccountRef: {
                        value: accountId || '1' // Default expense account
                    },
                    BillableStatus: 'NotBillable'
                },
                Description: `${item.name}${item.description ? ' - ' + item.description : ''} (${item.quantity} x ${item.unitPrice})`
            }))
        };

        // Create bill in QuickBooks
        const result = await quickBooksRequest('POST',
            `/v3/company/${qbTokens.realmId}/bill`,
            bill
        );

        console.log('✅ Bill created in QuickBooks:', result.Bill?.Id);

        res.json({
            success: true,
            billId: result.Bill?.Id,
            docNumber: result.Bill?.DocNumber,
            total: result.Bill?.TotalAmt
        });

    } catch (error) {
        console.error('❌ Create bill error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * QuickBooks - Get Chart of Accounts (Expense accounts)
 * GET /api/quickbooks/accounts
 */
app.get('/api/quickbooks/accounts', async (req, res) => {
    try {
        await ensureValidToken();

        const result = await quickBooksRequest('GET',
            `/v3/company/${qbTokens.realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 200")}`
        );

        const accounts = result.QueryResponse?.Account || [];
        res.json({
            success: true,
            accounts: accounts.map(a => ({
                id: a.Id,
                name: a.Name,
                fullyQualifiedName: a.FullyQualifiedName,
                accountType: a.AccountType,
                active: a.Active
            }))
        });
    } catch (error) {
        console.error('❌ Get accounts error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * QuickBooks - Create Vendor
 * POST /api/quickbooks/vendors
 */
app.post('/api/quickbooks/vendors', async (req, res) => {
    try {
        await ensureValidToken();

        const { name, email } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Vendor name is required' });
        }

        const vendor = {
            DisplayName: name,
            PrimaryEmailAddr: email ? { Address: email } : undefined
        };

        const result = await quickBooksRequest('POST',
            `/v3/company/${qbTokens.realmId}/vendor`,
            vendor
        );

        console.log('✅ Vendor created in QuickBooks:', result.Vendor?.Id);

        res.json({
            success: true,
            vendor: {
                id: result.Vendor?.Id,
                name: result.Vendor?.DisplayName
            }
        });

    } catch (error) {
        console.error('❌ Create vendor error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper: Refresh QuickBooks token
 */
async function refreshQuickBooksToken() {
    if (!qbTokens.refreshToken) return false;

    try {
        const response = await fetch(QB_CONFIG.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${QB_CONFIG.clientId}:${QB_CONFIG.clientSecret}`).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: qbTokens.refreshToken
            })
        });

        const tokens = await response.json();

        if (!response.ok) {
            console.error('❌ Token refresh failed:', tokens);
            return false;
        }

        qbTokens.accessToken = tokens.access_token;
        qbTokens.refreshToken = tokens.refresh_token;
        qbTokens.expiresAt = Date.now() + (tokens.expires_in * 1000);

        console.log('🔄 QuickBooks token refreshed');
        return true;

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        return false;
    }
}

/**
 * Helper: Ensure valid token before API calls
 */
async function ensureValidToken() {
    if (!qbTokens.accessToken) {
        throw new Error('Not connected to QuickBooks');
    }

    if (Date.now() >= qbTokens.expiresAt - 60000) { // Refresh 1 min before expiry
        const refreshed = await refreshQuickBooksToken();
        if (!refreshed) {
            throw new Error('Token expired and refresh failed');
        }
    }
}

/**
 * Helper: Make QuickBooks API request
 */
async function quickBooksRequest(method, endpoint, body = null) {
    const url = `${QB_CONFIG.apiBaseUrl}${endpoint}`;

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${qbTokens.accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        console.error('❌ QuickBooks API error:', response.status, data);
        throw new Error(data.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
    }

    return data;
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('');
    console.log('='.repeat(60));
    console.log(`👋 Received ${signal}. Starting graceful shutdown...`);
    console.log('='.repeat(60));

    // Log final metrics
    const uptime = Date.now() - serverStartTime;
    console.log('');
    console.log('📊 Final Server Metrics:');
    console.log(`   Uptime: ${formatUptime(uptime)}`);
    console.log(`   Total Requests: ${requestMetrics.total}`);
    console.log(`   Success Rate: ${requestMetrics.total > 0 ? ((requestMetrics.success / requestMetrics.total) * 100).toFixed(1) : 0}%`);
    console.log(`   Avg Response Time: ${requestMetrics.avgResponseTime}ms`);
    console.log(`   Active Requests: ${activeRequests.size}`);

    // Wait for active requests to complete (max 10 seconds)
    if (activeRequests.size > 0) {
        console.log('');
        console.log(`⏳ Waiting for ${activeRequests.size} active request(s) to complete...`);

        const maxWait = 10000;
        const startWait = Date.now();

        while (activeRequests.size > 0 && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (activeRequests.size > 0) {
            console.log(`⚠️ Force closing ${activeRequests.size} remaining request(s)`);
        }
    }

    console.log('');
    console.log('✅ Server shutdown complete');
    console.log('='.repeat(60));
    process.exit(0);
}

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('');
    console.error('💥 Uncaught Exception:', err.message);
    console.error(err.stack);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('');
    console.error('💥 Unhandled Promise Rejection:', reason);
    // Don't shutdown for unhandled rejections, just log
});
