/**
 * Firebase Cloud Functions
 *
 * - Claude API Proxy: Securely proxies requests to Claude API
 * - QuickBooks OAuth: Handles OAuth callback for QuickBooks integration
 *
 * Uses Firebase Secrets for secure credential storage
 * Updated: 2025-12-07 - Dual environment support (sandbox/production)
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

// ============================================================
// EMAIL WHITELIST - For admin-only functions (resetOwnerPrivilege)
// Regular API access is controlled by the credits system
// ============================================================
const API_WHITELIST = [
  'mageroyer@hotmail.com',  // Owner
  // Add more emails here as needed
];

/**
 * Check if email is whitelisted for API access
 * @param {string} email - User's email address
 * @returns {boolean} - True if whitelisted
 */
function isEmailWhitelisted(email) {
  if (!email) return false;
  return API_WHITELIST.includes(email.toLowerCase());
}

// ============================================================
// CORS Configuration - Restrict to allowed domains only
// ============================================================
const ALLOWED_ORIGINS = [
  'https://smartcookbook-2afe2.web.app',      // Production Firebase Hosting
  'https://smartcookbook-2afe2.firebaseapp.com', // Alternative Firebase domain
  'https://kitchencommand.io',                   // Custom domain
  'https://www.kitchencommand.io',               // Custom domain with www
  'http://localhost:5173',                      // Vite dev server
  'http://localhost:8080',                      // Alternative local dev
  'http://127.0.0.1:5173',                      // Localhost alternative
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    // In production, you may want to restrict this further
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
};

const cors = require('cors')(corsOptions);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2023-06-01';  // Note: This version supports Claude 3.5 models

// Google Cloud Speech client (uses automatic service account auth)
const speech = require('@google-cloud/speech');
const speechClient = new speech.SpeechClient();

// Define secrets - Production credentials
const claudeApiKey = defineSecret('CLAUDE_API_KEY');
const qbClientId = defineSecret('QUICKBOOKS_CLIENT_ID');
const qbClientSecret = defineSecret('QUICKBOOKS_CLIENT_SECRET');

// Define secrets - Sandbox credentials
const qbClientIdSandbox = defineSecret('QUICKBOOKS_CLIENT_ID_SANDBOX');
const qbClientSecretSandbox = defineSecret('QUICKBOOKS_CLIENT_SECRET_SANDBOX');

// QuickBooks OAuth URLs
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

/**
 * Get QuickBooks credentials based on environment
 * @param {string} environment - 'sandbox' or 'production'
 * @returns {object} - { clientId, clientSecret }
 */
function getQBCredentials(environment) {
  if (environment === 'production') {
    return {
      clientId: qbClientId.value(),
      clientSecret: qbClientSecret.value()
    };
  }
  return {
    clientId: qbClientIdSandbox.value(),
    clientSecret: qbClientSecretSandbox.value()
  };
}

// Frontend URL for redirects
const FRONTEND_URL = 'https://smartcookbook-2afe2.web.app';

/**
 * Claude API Proxy Function (v2)
 *
 * Receives requests from the frontend and forwards them to Claude API
 * with the server-side API key stored in Firebase Secrets
 *
 * SECURITY: Requires Firebase Authentication
 * - Validates Firebase ID token from Authorization header
 * - Logs user ID for audit trail
 * - Rate limiting enforced by Anthropic API
 */
exports.claudeProxy = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 300,  // 5 minutes for large multi-page PDFs
    memory: '1GiB',       // 1GB for large base64 image payloads
    secrets: [claudeApiKey]
  },
  (req, res) => {
    // Handle CORS
    cors(req, res, async () => {
      // Only allow POST requests
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        // ========================================
        // AUTHENTICATION CHECK
        // ========================================
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.warn('Claude proxy: Missing or invalid Authorization header');
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required. Please log in to use this feature.'
          });
        }

        const idToken = authHeader.split('Bearer ')[1];

        let decodedToken;
        try {
          decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (authError) {
          console.warn('Claude proxy: Invalid token:', authError.message);
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired session. Please log in again.'
          });
        }

        // Log authenticated request (for audit trail)
        const userId = decodedToken.uid;
        const userEmail = decodedToken.email || 'unknown';
        console.log(`Claude proxy: Authenticated request from user ${userId} (${userEmail})`);

        // Note: Whitelist removed - credits system now controls API usage

        // ========================================
        // API KEY & REQUEST PROCESSING
        // ========================================

        // Get API key from secret
        const apiKey = claudeApiKey.value();

        if (!apiKey) {
          console.error('Claude API key not configured');
          return res.status(500).json({
            error: 'Server configuration error - API key not set'
          });
        }

        // Get request body from client
        const { model, max_tokens, messages } = req.body;

        if (!model || !messages) {
          return res.status(400).json({
            error: 'Missing required fields: model and messages'
          });
        }

        console.log(`Proxying request to Claude API - Model: ${model}`);

        // Forward request to Claude API
        const response = await fetch(CLAUDE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': CLAUDE_API_VERSION
          },
          body: JSON.stringify({
            model,
            max_tokens: max_tokens || 4096,
            messages
          })
        });

        // Get response data
        const data = await response.json();

        // Forward rate limit headers to client (for monitoring)
        const rateLimitHeaders = {
          'x-ratelimit-requests-remaining': response.headers.get('anthropic-ratelimit-requests-remaining'),
          'x-ratelimit-tokens-remaining': response.headers.get('anthropic-ratelimit-tokens-remaining')
        };

        // Set rate limit headers on our response
        if (rateLimitHeaders['x-ratelimit-requests-remaining']) {
          res.set('x-ratelimit-requests-remaining', rateLimitHeaders['x-ratelimit-requests-remaining']);
        }
        if (rateLimitHeaders['x-ratelimit-tokens-remaining']) {
          res.set('x-ratelimit-tokens-remaining', rateLimitHeaders['x-ratelimit-tokens-remaining']);
        }

        // Log rate limit info
        console.log('Rate limits:', rateLimitHeaders);

        if (!response.ok) {
          console.error('Claude API error:', response.status, data);
          return res.status(response.status).json(data);
        }

        // Return Claude's response to client
        return res.status(200).json(data);

      } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({
          error: `Proxy error: ${error.message}`
        });
      }
    });
  }
);

// ============================================================
// Google Cloud Speech Proxy
// ============================================================

/**
 * Google Cloud Speech-to-Text Proxy Function
 *
 * Receives audio data from the frontend and forwards to Google Cloud Speech API.
 * Uses automatic service account authentication (same as Firebase Admin SDK).
 * NO API KEY NEEDED - authentication handled by Firebase service account.
 *
 * SECURITY: Requires Firebase Authentication
 * - Validates Firebase ID token from Authorization header
 * - Logs user ID for audit trail
 *
 * Request body:
 * - audio: base64-encoded audio data
 * - sampleRate: sample rate in Hz (default: 48000)
 * - languageCode: language code (default: 'fr-CA')
 *
 * Response:
 * - { success: true, transcript: string, confidence: number }
 * - { success: false, error: string }
 */
exports.speechProxy = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB'
    // No secrets needed - uses service account auth automatically
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
        // ========================================
        // AUTHENTICATION CHECK
        // ========================================
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.warn('Speech proxy: Missing or invalid Authorization header');
          return res.status(401).json({
            success: false,
            error: 'Authentication required. Please log in to use voice input.'
          });
        }

        const idToken = authHeader.split('Bearer ')[1];

        let decodedToken;
        try {
          decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (authError) {
          console.warn('Speech proxy: Invalid token:', authError.message);
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired session. Please log in again.'
          });
        }

        const userId = decodedToken.uid;
        const userEmail = decodedToken.email || 'unknown';
        console.log(`Speech proxy: Request from user ${userId} (${userEmail})`);

        // Note: Whitelist removed - credits system now controls API usage

        // ========================================
        // SPEECH RECOGNITION
        // ========================================

        const { audio, sampleRate = 48000, languageCode = 'fr-CA' } = req.body;

        if (!audio) {
          return res.status(400).json({
            success: false,
            error: 'Missing required field: audio'
          });
        }

        console.log(`Speech proxy: Processing ${(audio.length * 0.75 / 1024).toFixed(2)}KB audio, language: ${languageCode}`);

        // Build Google Cloud Speech API request
        const request = {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: sampleRate,
            languageCode: languageCode,
            enableAutomaticPunctuation: true,
            model: 'latest_short',
            useEnhanced: true
          },
          audio: {
            content: audio
          }
        };

        // Call Google Cloud Speech-to-Text API
        // Uses service account authentication automatically
        const [response] = await speechClient.recognize(request);

        // Extract transcript from response
        const results = response.results || [];
        if (results.length === 0 || !results[0].alternatives?.length) {
          console.log('Speech proxy: No speech detected');
          return res.json({
            success: true,
            transcript: '',
            confidence: 0,
            message: 'No speech detected'
          });
        }

        const bestResult = results[0].alternatives[0];
        const transcript = bestResult.transcript || '';
        const confidence = bestResult.confidence || 0.9;

        console.log(`Speech proxy: Transcribed "${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}" (confidence: ${(confidence * 100).toFixed(1)}%)`);

        return res.json({
          success: true,
          transcript: transcript,
          confidence: confidence
        });

      } catch (error) {
        console.error('Speech proxy error:', error);
        return res.status(500).json({
          success: false,
          error: `Speech processing failed: ${error.message}`
        });
      }
    });
  }
);

// ============================================================
// QuickBooks Online Integration Functions
// ============================================================

/**
 * QuickBooks OAuth Callback Handler
 *
 * Receives the authorization code from QuickBooks and exchanges it for tokens
 * Stores tokens in Firestore for the user
 */
exports.quickbooksCallback = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  async (req, res) => {
    try {
      const { code, state, realmId, error: qbError } = req.query;

      // Get environment from state parameter (format: "randomstring_environment")
      const environment = state?.includes('_production') ? 'production' : 'sandbox';
      console.log('QuickBooks environment:', environment);

      // Handle OAuth errors
      if (qbError) {
        console.error('QuickBooks OAuth error:', qbError);
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>QuickBooks Error</title>
          <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}.container{text-align:center;padding:40px;background:white;border-radius:12px;}.error{color:#f44336;font-size:48px;}h1{color:#333;}p{color:#666;}</style>
          </head>
          <body><div class="container"><div class="error">✗</div><h1>OAuth Error</h1><p>${qbError}</p></div>
          <script>if(window.opener){window.opener.postMessage({type:'QB_ERROR',error:'${qbError}'},'${FRONTEND_URL}');setTimeout(()=>window.close(),2500);}else{window.location.href='${FRONTEND_URL}/invoices?qb_error=${encodeURIComponent(qbError)}';}</script>
          </body></html>
        `);
      }

      // Validate required params
      if (!code || !realmId) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>QuickBooks Error</title>
          <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}.container{text-align:center;padding:40px;background:white;border-radius:12px;}.error{color:#f44336;font-size:48px;}h1{color:#333;}p{color:#666;}</style>
          </head>
          <body><div class="container"><div class="error">✗</div><h1>Missing Parameters</h1><p>Required OAuth parameters are missing.</p></div>
          <script>if(window.opener){window.opener.postMessage({type:'QB_ERROR',error:'missing_params'},'${FRONTEND_URL}');setTimeout(()=>window.close(),2500);}else{window.location.href='${FRONTEND_URL}/invoices?qb_error=missing_params';}</script>
          </body></html>
        `);
      }

      console.log('QuickBooks OAuth callback received');
      console.log('Realm ID:', realmId);

      // Get credentials based on environment
      const { clientId, clientSecret } = getQBCredentials(environment);

      if (!clientId || !clientSecret) {
        console.error('QuickBooks credentials not configured for environment:', environment);
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>QuickBooks Error</title>
          <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}.container{text-align:center;padding:40px;background:white;border-radius:12px;}.error{color:#f44336;font-size:48px;}h1{color:#333;}p{color:#666;}</style>
          </head>
          <body><div class="container"><div class="error">✗</div><h1>Server Configuration Error</h1><p>QuickBooks credentials not configured.</p></div>
          <script>if(window.opener){window.opener.postMessage({type:'QB_ERROR',error:'server_config_error'},'${FRONTEND_URL}');setTimeout(()=>window.close(),2500);}else{window.location.href='${FRONTEND_URL}/invoices?qb_error=server_config_error';}</script>
          </body></html>
        `);
      }

      // Log credential lengths for debugging (not the actual values)
      console.log('Client ID length:', clientId.length);
      console.log('Client Secret length:', clientSecret.length);

      // Build redirect URI (must match what's configured in QuickBooks)
      const redirectUri = `https://us-central1-smartcookbook-2afe2.cloudfunctions.net/quickbooksCallback`;

      // Log what we're sending
      console.log('Redirect URI:', redirectUri);
      console.log('Code length:', code.length);

      // Exchange authorization code for tokens
      const tokenResponse = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri
        })
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error('Token exchange failed:', tokens);
        console.error('Response status:', tokenResponse.status);
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><title>QuickBooks Error</title>
          <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}.container{text-align:center;padding:40px;background:white;border-radius:12px;}.error{color:#f44336;font-size:48px;}h1{color:#333;}p{color:#666;}</style>
          </head>
          <body><div class="container"><div class="error">✗</div><h1>Token Exchange Failed</h1><p>Could not exchange OAuth code for tokens.</p></div>
          <script>if(window.opener){window.opener.postMessage({type:'QB_ERROR',error:'token_exchange_failed'},'${FRONTEND_URL}');setTimeout(()=>window.close(),2500);}else{window.location.href='${FRONTEND_URL}/invoices?qb_error=token_exchange_failed';}</script>
          </body></html>
        `);
      }

      console.log('Token exchange successful');

      // Store tokens in Firestore (separate docs for sandbox vs production)
      const db = admin.firestore();
      const tokenDocId = environment === 'production' ? 'production' : 'sandbox';
      await db.collection('quickbooks_tokens').doc(tokenDocId).set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        realmId: realmId,
        environment: environment,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        refreshTokenExpiresAt: Date.now() + (tokens.x_refresh_token_expires_in * 1000),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('Tokens stored in Firestore');

      // Return HTML that notifies parent window and closes popup
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .success { color: #4CAF50; font-size: 48px; }
            h1 { color: #333; margin: 20px 0 10px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✓</div>
            <h1>Connected!</h1>
            <p>QuickBooks connected successfully. This window will close automatically.</p>
          </div>
          <script>
            // Notify parent window of success
            if (window.opener) {
              window.opener.postMessage({ type: 'QB_CONNECTED', environment: '${environment}' }, '${FRONTEND_URL}');
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect if no opener (direct navigation)
              window.location.href = '${FRONTEND_URL}/invoices?qb_connected=true&qb_env=${environment}';
            }
          </script>
        </body>
        </html>
      `);

    } catch (error) {
      console.error('QuickBooks callback error:', error);
      // Return HTML for error case too
      const errorMessage = encodeURIComponent(error.message);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks Error</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #f44336; font-size: 48px; }
            h1 { color: #333; margin: 20px 0 10px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">✗</div>
            <h1>Connection Failed</h1>
            <p>${error.message}</p>
            <p>This window will close automatically.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'QB_ERROR', error: '${error.message}' }, '${FRONTEND_URL}');
              setTimeout(() => window.close(), 2500);
            } else {
              window.location.href = '${FRONTEND_URL}/invoices?qb_error=${errorMessage}';
            }
          </script>
        </body>
        </html>
      `);
    }
  }
);

/**
 * Get QuickBooks Connection Status
 * Query param: ?environment=sandbox|production (defaults to sandbox)
 */
exports.quickbooksStatus = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      try {
        // Get environment from query param
        const environment = req.query.environment === 'production' ? 'production' : 'sandbox';
        const tokenDocId = environment === 'production' ? 'production' : 'sandbox';

        const db = admin.firestore();
        const doc = await db.collection('quickbooks_tokens').doc(tokenDocId).get();

        if (!doc.exists) {
          return res.json({ connected: false, environment, message: `Not connected to QuickBooks (${environment})` });
        }

        const data = doc.data();
        const { clientId, clientSecret } = getQBCredentials(environment);

        // Check if access token is expired
        if (Date.now() >= data.expiresAt) {
          // Try to refresh
          const refreshed = await refreshQuickBooksToken(data, clientId, clientSecret, environment);
          if (!refreshed) {
            return res.json({ connected: false, environment, message: 'Token expired and refresh failed' });
          }
        }

        // Get company info to verify connection
        try {
          const companyInfo = await quickBooksApiRequest(
            'GET',
            `/v3/company/${data.realmId}/companyinfo/${data.realmId}`,
            data.accessToken,
            data.realmId,
            null,
            environment
          );

          return res.json({
            connected: true,
            companyName: companyInfo.CompanyInfo?.CompanyName || 'Unknown',
            realmId: data.realmId,
            environment: environment
          });
        } catch (apiError) {
          console.error('Company info fetch failed:', apiError);
          return res.json({ connected: false, message: 'Connection verification failed' });
        }

      } catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Get QuickBooks Authorization URL
 * Query param: ?environment=sandbox|production (defaults to sandbox)
 */
exports.quickbooksAuthUrl = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 10,
    memory: '128MiB',
    secrets: [qbClientId, qbClientIdSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      try {
        // Get environment from query param
        const environment = req.query.environment === 'production' ? 'production' : 'sandbox';
        const { clientId } = getQBCredentials(environment);

        if (!clientId) {
          return res.status(500).json({
            error: 'QuickBooks not configured',
            message: `QUICKBOOKS_CLIENT_ID${environment === 'sandbox' ? '_SANDBOX' : ''} secret not set`
          });
        }

        // Include environment in state so callback knows which credentials to use
        const state = Math.random().toString(36).substring(7) + '_' + environment;
        const scope = 'com.intuit.quickbooks.accounting';
        const redirectUri = `https://us-central1-smartcookbook-2afe2.cloudfunctions.net/quickbooksCallback`;

        const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
          `client_id=${clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scope)}&` +
          `state=${state}`;

        return res.json({ authUrl, state, environment });

      } catch (error) {
        console.error('Auth URL error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Disconnect from QuickBooks
 * Body param: { environment: 'sandbox' | 'production' }
 */
exports.quickbooksDisconnect = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        // Get environment from body
        const environment = req.body?.environment === 'production' ? 'production' : 'sandbox';
        const tokenDocId = environment === 'production' ? 'production' : 'sandbox';
        const { clientId, clientSecret } = getQBCredentials(environment);

        const db = admin.firestore();
        const doc = await db.collection('quickbooks_tokens').doc(tokenDocId).get();

        if (doc.exists) {
          const data = doc.data();

          // Revoke token with QuickBooks
          try {
            await fetch(QB_REVOKE_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
              },
              body: JSON.stringify({ token: data.accessToken })
            });
          } catch (revokeError) {
            console.error('Token revoke failed (continuing):', revokeError);
          }

          // Delete from Firestore
          await db.collection('quickbooks_tokens').doc(tokenDocId).delete();
        }

        return res.json({ success: true, environment, message: `Disconnected from QuickBooks (${environment})` });

      } catch (error) {
        console.error('Disconnect error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Get or Create QuickBooks Vendors
 * GET: List all vendors - Query param: ?environment=sandbox|production
 * POST: Create a new vendor - Body param: { environment, name, email }
 */
exports.quickbooksVendors = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      try {
        // Get environment from query (GET) or body (POST)
        const environment = (req.query.environment || req.body?.environment) === 'production' ? 'production' : 'sandbox';
        const { clientId, clientSecret } = getQBCredentials(environment);
        const tokens = await getValidTokens(clientId, clientSecret, environment);

        // POST: Create a new vendor
        if (req.method === 'POST') {
          const { name, email } = req.body;

          if (!name) {
            return res.status(400).json({ error: 'Vendor name is required' });
          }

          // Build vendor object for QuickBooks
          const vendorData = {
            DisplayName: name
          };

          if (email) {
            vendorData.PrimaryEmailAddr = { Address: email };
          }

          const result = await quickBooksApiRequest(
            'POST',
            `/v3/company/${tokens.realmId}/vendor`,
            tokens.accessToken,
            tokens.realmId,
            vendorData,
            environment
          );

          console.log('Vendor created:', result.Vendor?.Id);

          return res.json({
            success: true,
            vendor: {
              id: result.Vendor?.Id,
              name: result.Vendor?.DisplayName,
              email: result.Vendor?.PrimaryEmailAddr?.Address,
              active: result.Vendor?.Active
            }
          });
        }

        // GET: List all vendors
        const result = await quickBooksApiRequest(
          'GET',
          `/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Vendor MAXRESULTS 1000')}`,
          tokens.accessToken,
          tokens.realmId,
          null,
          environment
        );

        const vendors = result.QueryResponse?.Vendor || [];
        return res.json({
          success: true,
          vendors: vendors.map(v => ({
            id: v.Id,
            name: v.DisplayName,
            email: v.PrimaryEmailAddr?.Address,
            active: v.Active
          }))
        });

      } catch (error) {
        console.error('Vendors error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Create Bill in QuickBooks
 * Body param: { environment, invoice, vendorId, accountId }
 *
 * If no accountId is provided, automatically queries QuickBooks for a valid
 * expense account, prioritizing "Cost of Goods Sold" accounts for food purchases.
 */
exports.quickbooksBills = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { invoice, vendorId, accountId: providedAccountId, environment: envParam } = req.body;
        const environment = envParam === 'production' ? 'production' : 'sandbox';

        if (!invoice || !vendorId) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'Please provide invoice and vendorId'
          });
        }

        // Validate invoice has items
        if (!invoice.items || invoice.items.length === 0) {
          return res.status(400).json({
            error: 'No line items',
            message: 'Invoice must have at least one line item to create a bill'
          });
        }

        const { clientId, clientSecret } = getQBCredentials(environment);
        const tokens = await getValidTokens(clientId, clientSecret, environment);

        // Get a valid expense account if none provided
        let accountId = providedAccountId;
        if (!accountId) {
          console.log('No accountId provided, querying for valid expense account...');

          // Query for expense accounts
          const query = `SELECT * FROM Account WHERE AccountType IN ('Expense', 'Cost of Goods Sold') AND Active = true MAXRESULTS 50`;
          const accountResult = await quickBooksApiRequest(
            'GET',
            `/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
            tokens.accessToken,
            tokens.realmId,
            null,
            environment
          );

          const accounts = accountResult.QueryResponse?.Account || [];

          if (accounts.length === 0) {
            return res.status(400).json({
              error: 'No expense account found',
              message: 'No active expense accounts found in QuickBooks. Please create an expense account (e.g., "Cost of Goods Sold" or "Food Purchases") in QuickBooks first.'
            });
          }

          // Prioritize Cost of Goods Sold accounts for food/inventory purchases
          const cogsAccount = accounts.find(a => a.AccountType === 'Cost of Goods Sold');
          const expenseAccount = accounts.find(a => a.AccountType === 'Expense');

          // Use COGS if available, otherwise first expense account
          const selectedAccount = cogsAccount || expenseAccount || accounts[0];
          accountId = selectedAccount.Id;

          console.log(`Auto-selected expense account: ${selectedAccount.Name} (ID: ${accountId}, Type: ${selectedAccount.AccountType})`);
        }

        // Build QuickBooks Bill object
        // Note: Don't include 'Id' on line items for new bills (only for updates)
        // Note: Don't include 'DueDate' if null (causes validation error)
        const bill = {
          VendorRef: { value: vendorId },
          TxnDate: invoice.date || new Date().toISOString().split('T')[0],
          DocNumber: invoice.invoiceNumber || `SCB-${Date.now()}`,
          PrivateNote: `Imported from SmartCookBook - ${invoice.supplierName || 'Unknown Vendor'}`,
          Line: invoice.items.map((item) => ({
            Amount: Math.round((item.totalPrice || (item.quantity * item.unitPrice) || 0) * 100) / 100,
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: accountId }
            },
            Description: `${item.name || item.description || 'Item'}${item.quantity ? ` (${item.quantity} x $${item.unitPrice || 0})` : ''}`
          }))
        };

        // Only add DueDate if provided
        if (invoice.dueDate) {
          bill.DueDate = invoice.dueDate;
        }

        console.log('Bill payload:', JSON.stringify(bill, null, 2));

        // Create bill in QuickBooks
        const result = await quickBooksApiRequest(
          'POST',
          `/v3/company/${tokens.realmId}/bill`,
          tokens.accessToken,
          tokens.realmId,
          bill,
          environment
        );

        console.log('Bill created:', result.Bill?.Id);

        return res.json({
          success: true,
          billId: result.Bill?.Id,
          docNumber: result.Bill?.DocNumber,
          total: result.Bill?.TotalAmt,
          accountId: accountId
        });

      } catch (error) {
        console.error('Create bill error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Get QuickBooks Token Health & Expiration Info
 * Returns token expiration status and warnings
 * Query param: ?environment=sandbox|production
 */
exports.quickbooksTokenHealth = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 10,
    memory: '128MiB'
  },
  (req, res) => {
    cors(req, res, async () => {
      try {
        const environment = req.query.environment === 'production' ? 'production' : 'sandbox';
        const tokenDocId = environment === 'production' ? 'production' : 'sandbox';

        const db = admin.firestore();
        const doc = await db.collection('quickbooks_tokens').doc(tokenDocId).get();

        if (!doc.exists) {
          return res.json({
            connected: false,
            environment,
            message: `No QuickBooks connection for ${environment}`
          });
        }

        const data = doc.data();
        const now = Date.now();

        // Calculate time remaining
        const accessTokenExpiresIn = data.expiresAt - now;
        const refreshTokenExpiresIn = data.refreshTokenExpiresAt - now;

        // Convert to human-readable
        const formatDuration = (ms) => {
          if (ms <= 0) return 'Expired';
          const days = Math.floor(ms / (1000 * 60 * 60 * 24));
          const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
          if (days > 0) return `${days}d ${hours}h`;
          if (hours > 0) return `${hours}h ${minutes}m`;
          return `${minutes}m`;
        };

        // Determine warning levels
        const REFRESH_TOKEN_WARNING_DAYS = 14;
        const REFRESH_TOKEN_CRITICAL_DAYS = 7;

        let refreshTokenStatus = 'healthy';
        let refreshTokenMessage = null;

        if (refreshTokenExpiresIn <= 0) {
          refreshTokenStatus = 'expired';
          refreshTokenMessage = 'Refresh token has expired. Please re-authorize QuickBooks.';
        } else if (refreshTokenExpiresIn <= REFRESH_TOKEN_CRITICAL_DAYS * 24 * 60 * 60 * 1000) {
          refreshTokenStatus = 'critical';
          refreshTokenMessage = `Refresh token expires in ${formatDuration(refreshTokenExpiresIn)}. Re-authorize soon!`;
        } else if (refreshTokenExpiresIn <= REFRESH_TOKEN_WARNING_DAYS * 24 * 60 * 60 * 1000) {
          refreshTokenStatus = 'warning';
          refreshTokenMessage = `Refresh token expires in ${formatDuration(refreshTokenExpiresIn)}. Consider re-authorizing.`;
        }

        return res.json({
          connected: true,
          environment,
          accessToken: {
            expiresAt: data.expiresAt,
            expiresIn: formatDuration(accessTokenExpiresIn),
            expired: accessTokenExpiresIn <= 0,
            status: accessTokenExpiresIn <= 0 ? 'expired' : 'active'
          },
          refreshToken: {
            expiresAt: data.refreshTokenExpiresAt,
            expiresIn: formatDuration(refreshTokenExpiresIn),
            expired: refreshTokenExpiresIn <= 0,
            status: refreshTokenStatus,
            message: refreshTokenMessage,
            daysRemaining: Math.floor(refreshTokenExpiresIn / (1000 * 60 * 60 * 24))
          },
          lastUpdated: data.updatedAt?.toDate?.() || null,
          realmId: data.realmId
        });

      } catch (error) {
        console.error('Token health check error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

/**
 * Get QuickBooks Accounts (for COGS mapping)
 * Returns expense accounts for category mapping
 * Query param: ?environment=sandbox|production
 */
exports.quickbooksAccounts = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [qbClientId, qbClientSecret, qbClientIdSandbox, qbClientSecretSandbox]
  },
  (req, res) => {
    cors(req, res, async () => {
      try {
        const environment = req.query.environment === 'production' ? 'production' : 'sandbox';
        const { clientId, clientSecret } = getQBCredentials(environment);
        const tokens = await getValidTokens(clientId, clientSecret, environment);

        // Query for expense accounts (Account.AccountType = 'Expense' or 'Cost of Goods Sold')
        const query = `SELECT * FROM Account WHERE AccountType IN ('Expense', 'Cost of Goods Sold') MAXRESULTS 200`;

        const result = await quickBooksApiRequest(
          'GET',
          `/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(query)}`,
          tokens.accessToken,
          tokens.realmId,
          null,
          environment
        );

        const accounts = result.QueryResponse?.Account || [];

        return res.json({
          success: true,
          accounts: accounts.map(a => ({
            id: a.Id,
            name: a.Name,
            fullName: a.FullyQualifiedName,
            type: a.AccountType,
            subType: a.AccountSubType,
            active: a.Active,
            currentBalance: a.CurrentBalance
          }))
        });

      } catch (error) {
        console.error('Accounts error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

// ============================================================
// TEMPORARY: Owner Privilege Reset Function
// ============================================================

/**
 * Reset/Create Owner Privilege
 *
 * TEMPORARY FUNCTION - Delete after use
 * Only works for whitelisted emails
 *
 * POST body: { pin: "1234" }
 */
exports.resetOwnerPrivilege = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        // Authenticate user
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
          decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (authError) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        const userId = decodedToken.uid;
        const userEmail = decodedToken.email || '';

        // Only allow whitelisted users
        if (!isEmailWhitelisted(userEmail)) {
          console.warn(`resetOwnerPrivilege: Denied for ${userEmail}`);
          return res.status(403).json({ error: 'Access denied' });
        }

        // Get PIN from request
        const { pin } = req.body;
        if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
          return res.status(400).json({ error: 'PIN must be 4-6 digits' });
        }

        const db = admin.firestore();

        // Check if privilege already exists
        const privilegesRef = db.collection('users').doc(userId).collection('privileges');
        const existingSnap = await privilegesRef.where('accessLevel', '==', 'owner').get();

        if (!existingSnap.empty) {
          // Update existing owner privilege
          const docId = existingSnap.docs[0].id;
          await privilegesRef.doc(docId).update({
            pin: pin,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`Updated owner PIN for user ${userId}`);
          return res.json({ success: true, message: 'Owner PIN updated', docId });
        }

        // Create new owner privilege
        const newDoc = await privilegesRef.add({
          name: decodedToken.name || userEmail.split('@')[0],
          pin: pin,
          accessLevel: 'owner',
          departments: [],
          position: 'Owner',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Created owner privilege for user ${userId}: ${newDoc.id}`);
        return res.json({ success: true, message: 'Owner privilege created', docId: newDoc.id });

      } catch (error) {
        console.error('resetOwnerPrivilege error:', error);
        return res.status(500).json({ error: error.message });
      }
    });
  }
);

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get valid tokens, refreshing if needed
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} environment - 'sandbox' or 'production'
 */
async function getValidTokens(clientId, clientSecret, environment = 'sandbox') {
  const db = admin.firestore();
  const tokenDocId = environment === 'production' ? 'production' : 'sandbox';
  const doc = await db.collection('quickbooks_tokens').doc(tokenDocId).get();

  if (!doc.exists) {
    throw new Error(`Not connected to QuickBooks (${environment})`);
  }

  let data = doc.data();

  // Refresh if expired or expiring soon
  if (Date.now() >= data.expiresAt - 60000) {
    const refreshed = await refreshQuickBooksToken(data, clientId, clientSecret, environment);
    if (!refreshed) {
      throw new Error('Token expired and refresh failed');
    }
    // Re-read updated data
    const updatedDoc = await db.collection('quickbooks_tokens').doc(tokenDocId).get();
    data = updatedDoc.data();
  }

  return data;
}

/**
 * Refresh QuickBooks access token
 * @param {object} tokenData
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} environment - 'sandbox' or 'production'
 */
async function refreshQuickBooksToken(tokenData, clientId, clientSecret, environment = 'sandbox') {
  try {
    const response = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken
      })
    });

    const tokens = await response.json();

    if (!response.ok) {
      console.error('Token refresh failed:', tokens);
      return false;
    }

    // Update Firestore (use environment-specific doc)
    const db = admin.firestore();
    const tokenDocId = environment === 'production' ? 'production' : 'sandbox';
    await db.collection('quickbooks_tokens').doc(tokenDocId).update({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`QuickBooks token refreshed (${environment})`);
    return true;

  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

/**
 * Make QuickBooks API request
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {string} accessToken
 * @param {string} realmId
 * @param {object|null} body - Request body
 * @param {string} environment - 'sandbox' or 'production'
 */
async function quickBooksApiRequest(method, endpoint, accessToken, realmId, body = null, environment = 'sandbox') {
  // Use sandbox or production API based on environment
  const baseUrl = environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  const url = `${baseUrl}${endpoint}`;

  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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
    console.error('QuickBooks API error:', response.status, JSON.stringify(data, null, 2));
    // Extract detailed error info from QuickBooks response
    const qbError = data.Fault?.Error?.[0];
    const errorMessage = qbError?.Message || 'QuickBooks API error';
    const errorDetail = qbError?.Detail || '';
    const errorCode = qbError?.code || '';
    console.error(`QB Error Details - Code: ${errorCode}, Message: ${errorMessage}, Detail: ${errorDetail}`);
    throw new Error(`${errorMessage}${errorDetail ? ': ' + errorDetail : ''}`);
  }

  return data;
}

// ============================================================
// PUBLIC WEBSITE API
// Public endpoints for the auto-generated store websites
// ============================================================

/**
 * CORS options for public API (more permissive)
 * Allow any origin since these are public website endpoints
 */
const publicCorsOptions = {
  origin: true, // Allow any origin
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 300 // Cache preflight for 5 minutes
};

const publicCors = require('cors')(publicCorsOptions);

/**
 * Get Public Store Data by Slug
 *
 * Returns store profile and all public recipes grouped by category.
 * Used by the Next.js public website to render store pages.
 *
 * Query: ?slug=store-slug
 * Cache: 5 minutes
 */
exports.publicStore = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  (req, res) => {
    publicCors(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { slug } = req.query;

        if (!slug) {
          return res.status(400).json({ error: 'Missing slug parameter' });
        }

        const db = admin.firestore();

        // Look up the store ID from the slug
        const slugDoc = await db.collection('slugs').doc(slug).get();

        if (!slugDoc.exists) {
          return res.status(404).json({ error: 'Store not found' });
        }

        const { storeId } = slugDoc.data();

        // Get store document
        const storeDoc = await db.collection('stores').doc(storeId).get();

        if (!storeDoc.exists) {
          return res.status(404).json({ error: 'Store not found' });
        }

        const storeData = storeDoc.data();
        const settings = storeData.websiteSettings || {};

        // Check if website is enabled
        if (!settings.enabled) {
          return res.status(403).json({ error: 'Website is disabled' });
        }

        // Get public recipes
        const recipesSnap = await db
          .collection('stores')
          .doc(storeId)
          .collection('publicRecipes')
          .where('isVisible', '==', true)
          .get();

        // Group recipes by display category
        const grouped = {};
        const items = [];

        recipesSnap.forEach(doc => {
          const recipe = doc.data();
          items.push(recipe);

          const category = recipe.displayCategory || 'Other';
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(recipe);
        });

        // Sort each category by sortOrder
        Object.keys(grouped).forEach(cat => {
          grouped[cat].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        });

        // Get ordered category list
        const categoryOrder = settings.displayCategories || Object.keys(grouped);

        // Build response
        const response = {
          store: {
            name: settings.branding?.tagline ? settings.branding.tagline.split(' - ')[0] : slug,
            tagline: settings.branding?.tagline || '',
            logo: settings.branding?.logo || null,
            coverPhoto: settings.branding?.coverPhoto || null,
            phone: settings.contact?.phone || '',
            address: settings.contact?.address || '',
            hours: settings.contact?.hours || '',
            social: settings.contact?.social || {}
          },
          menu: {
            lastUpdated: new Date().toISOString(),
            categories: categoryOrder.filter(cat => grouped[cat]?.length > 0),
            items: grouped
          },
          settings: {
            showPrices: settings.displayOptions?.showPrices ?? true,
            showPhotos: settings.displayOptions?.showPhotos ?? true,
            primaryColor: settings.colors?.primary || '#2C5530',
            accentColor: settings.colors?.accent || '#D4AF37',
            template: settings.template || 'marche'
          },
          seo: {
            title: settings.seo?.title || '',
            description: settings.seo?.description || ''
          }
        };

        // Set cache headers (5 minutes)
        res.set('Cache-Control', 'public, max-age=300, s-maxage=300');

        return res.json(response);

      } catch (error) {
        console.error('publicStore error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Get Today's Menu Only
 *
 * Returns only items marked as "available today".
 * Lighter payload for daily menu displays.
 *
 * Query: ?slug=store-slug
 * Cache: 1 minute
 */
exports.publicStoreToday = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 15,
    memory: '128MiB'
  },
  (req, res) => {
    publicCors(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { slug } = req.query;

        if (!slug) {
          return res.status(400).json({ error: 'Missing slug parameter' });
        }

        const db = admin.firestore();

        // Look up the store ID from the slug
        const slugDoc = await db.collection('slugs').doc(slug).get();

        if (!slugDoc.exists) {
          return res.status(404).json({ error: 'Store not found' });
        }

        const { storeId } = slugDoc.data();

        // Get store settings
        const storeDoc = await db.collection('stores').doc(storeId).get();
        const storeData = storeDoc.data();
        const settings = storeData?.websiteSettings || {};

        if (!settings.enabled) {
          return res.status(403).json({ error: 'Website is disabled' });
        }

        // Get today's items only
        const recipesSnap = await db
          .collection('stores')
          .doc(storeId)
          .collection('publicRecipes')
          .where('isVisible', '==', true)
          .where('isAvailableToday', '==', true)
          .get();

        const items = [];
        recipesSnap.forEach(doc => {
          items.push(doc.data());
        });

        // Sort by sortOrder
        items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        // Build lightweight response
        const response = {
          storeName: settings.branding?.tagline?.split(' - ')[0] || slug,
          lastUpdated: new Date().toISOString(),
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: settings.displayOptions?.showPrices ? item.sellingPrice : null,
            photo: settings.displayOptions?.showPhotos ? item.photo : null,
            category: item.displayCategory,
            tags: item.tags || []
          })),
          settings: {
            showPrices: settings.displayOptions?.showPrices ?? true,
            showPhotos: settings.displayOptions?.showPhotos ?? true,
            primaryColor: settings.colors?.primary || '#2C5530'
          }
        };

        // Set cache headers (1 minute)
        res.set('Cache-Control', 'public, max-age=60, s-maxage=60');

        return res.json(response);

      } catch (error) {
        console.error('publicStoreToday error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Check Slug Availability
 *
 * Query: ?slug=desired-slug
 * Returns: { available: boolean }
 */
exports.checkSlug = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 10,
    memory: '128MiB'
  },
  (req, res) => {
    publicCors(req, res, async () => {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
        const { slug } = req.query;

        if (!slug) {
          return res.status(400).json({ error: 'Missing slug parameter' });
        }

        // Validate slug format
        const slugRegex = /^[a-z0-9-]+$/;
        if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 50) {
          return res.json({ available: false, reason: 'Invalid format' });
        }

        // Reserved slugs
        const reserved = ['admin', 'api', 'www', 'app', 'help', 'support', 'about', 'contact', 'login', 'register'];
        if (reserved.includes(slug)) {
          return res.json({ available: false, reason: 'Reserved' });
        }

        const db = admin.firestore();

        // Check if slug exists
        const slugDoc = await db.collection('slugs').doc(slug).get();

        return res.json({ available: !slugDoc.exists });

      } catch (error) {
        console.error('checkSlug error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);
