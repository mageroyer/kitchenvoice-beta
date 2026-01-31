/* ═══════════════════════════════════════════════════════════
   FIRESTORE SERVICE - Main process (Node.js)
   Firebase Admin SDK for reading/writing autopilot data
   ═══════════════════════════════════════════════════════════ */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');

let db = null;
let reportsListener = null;
let progressListener = null;

/**
 * Initialize Firebase Admin SDK with service account key
 */
function init(serviceAccountPath) {
  if (getApps().length > 0) {
    db = getFirestore();
    return true;
  }

  try {
    const resolvedPath = path.resolve(serviceAccountPath);
    const serviceAccount = require(resolvedPath);

    initializeApp({
      credential: cert(serviceAccount),
    });

    db = getFirestore();
    console.log('[Firestore] Connected to project:', serviceAccount.project_id);
    return true;
  } catch (err) {
    console.error('[Firestore] Init failed:', err.message);
    return false;
  }
}

/**
 * Check if Firestore is connected
 */
function isConnected() {
  return db !== null;
}

/**
 * Serialize a Firestore document for IPC transfer.
 * Converts Timestamp fields to ISO strings.
 */
function serializeDoc(doc) {
  const data = doc.data();
  const result = { id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && value.toDate) {
      // Firestore Timestamp → ISO string
      result[key] = value.toDate().toISOString();
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ════════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════════

/**
 * Get recent reports, optionally filtered by agent
 */
async function getReports({ agentName = null, limit = 50 } = {}) {
  if (!db) return [];

  try {
    let query = db.collection('autopilot_reports')
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (agentName) {
      query = query.where('agentName', '==', agentName);
    }

    const snap = await query.get();
    return snap.docs.map(doc => serializeDoc(doc));
  } catch (err) {
    console.error('[Firestore] getReports error:', err.message);
    return [];
  }
}

/**
 * Get the latest report for a specific agent
 */
async function getLatestReport(agentName) {
  if (!db) return null;

  try {
    const snap = await db.collection('autopilot_reports')
      .where('agentName', '==', agentName)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snap.empty) return null;
    return serializeDoc(snap.docs[0]);
  } catch (err) {
    console.error('[Firestore] getLatestReport error:', err.message);
    return null;
  }
}

/**
 * Listen for realtime report updates (returns unsubscribe function)
 */
function onReportsUpdate(callback) {
  if (!db) return () => {};

  if (reportsListener) {
    reportsListener();
  }

  reportsListener = db.collection('autopilot_reports')
    .orderBy('timestamp', 'desc')
    .limit(20)
    .onSnapshot(
      (snap) => {
        const reports = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Convert Firestore Timestamp to ISO string for renderer
          timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || null,
        }));
        callback(reports);
      },
      (err) => {
        console.error('[Firestore] Reports listener error:', err.message);
      }
    );

  return reportsListener;
}

// ════════════════════════════════════════════
//  PROGRESS (live agent progress)
// ════════════════════════════════════════════

/**
 * Listen for realtime progress updates from running agents.
 * Returns unsubscribe function.
 */
function onProgressUpdate(callback) {
  if (!db) return () => {};

  if (progressListener) {
    progressListener();
  }

  progressListener = db.collection('autopilot_progress')
    .onSnapshot(
      (snap) => {
        const progress = {};
        snap.docs.forEach(doc => {
          const data = doc.data();
          progress[doc.id] = {
            agentName: doc.id,
            phase: data.phase || '',
            message: data.message || '',
            percent: data.percent || 0,
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
          };
        });
        callback(progress);
      },
      (err) => {
        console.error('[Firestore] Progress listener error:', err.message);
      }
    );

  return progressListener;
}

// ════════════════════════════════════════════
//  TASKS
// ════════════════════════════════════════════

/**
 * Get all tasks, ordered by priority then creation date
 */
async function getTasks() {
  if (!db) return [];

  try {
    const snap = await db.collection('autopilot_tasks')
      .orderBy('createdAt', 'desc')
      .get();

    return snap.docs.map(doc => serializeDoc(doc));
  } catch (err) {
    console.error('[Firestore] getTasks error:', err.message);
    return [];
  }
}

/**
 * Create a new task
 */
async function createTask({ title, description, priority = 'medium', assignedAgent = null }) {
  if (!db) return null;

  try {
    const ref = await db.collection('autopilot_tasks').add({
      title,
      description,
      priority,
      assignedAgent,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      completedAt: null,
      result: null,
    });

    console.log('[Firestore] Task created:', ref.id);
    return ref.id;
  } catch (err) {
    console.error('[Firestore] createTask error:', err.message);
    return null;
  }
}

/**
 * Update a task (status, assignedAgent, result)
 */
async function updateTask(taskId, updates) {
  if (!db) return false;

  try {
    const data = { ...updates };

    // Auto-set completedAt when marking as completed
    if (updates.status === 'completed' || updates.status === 'failed') {
      data.completedAt = FieldValue.serverTimestamp();
    }

    await db.collection('autopilot_tasks').doc(taskId).update(data);
    console.log('[Firestore] Task updated:', taskId);
    return true;
  } catch (err) {
    console.error('[Firestore] updateTask error:', err.message);
    return false;
  }
}

/**
 * Delete a task
 */
async function deleteTask(taskId) {
  if (!db) return false;

  try {
    await db.collection('autopilot_tasks').doc(taskId).delete();
    console.log('[Firestore] Task deleted:', taskId);
    return true;
  } catch (err) {
    console.error('[Firestore] deleteTask error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════
//  SECURITY ALERTS
// ════════════════════════════════════════════

/**
 * Get security alerts, newest first
 */
async function getAlerts({ acknowledged = false, limit = 50 } = {}) {
  if (!db) return [];

  try {
    let query = db.collection('autopilot_alerts')
      .orderBy('detectedAt', 'desc')
      .limit(limit);

    if (!acknowledged) {
      query = query.where('acknowledged', '==', false);
    }

    const snap = await query.get();
    return snap.docs.map(doc => serializeDoc(doc));
  } catch (err) {
    console.error('[Firestore] getAlerts error:', err.message);
    return [];
  }
}

/**
 * Acknowledge a security alert
 */
async function acknowledgeAlert(alertId) {
  if (!db) return false;

  try {
    await db.collection('autopilot_alerts').doc(alertId).update({
      acknowledged: true,
      acknowledgedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[Firestore] acknowledgeAlert error:', err.message);
    return false;
  }
}

/**
 * Update a security alert (e.g., mark fixAttempted)
 */
async function updateAlert(alertId, updates) {
  if (!db) return false;

  try {
    await db.collection('autopilot_alerts').doc(alertId).update(updates);
    return true;
  } catch (err) {
    console.error('[Firestore] updateAlert error:', err.message);
    return false;
  }
}

/**
 * Get unacknowledged alert count
 */
async function getAlertCount() {
  if (!db) return 0;

  try {
    const snap = await db.collection('autopilot_alerts')
      .where('acknowledged', '==', false)
      .count()
      .get();
    return snap.data().count;
  } catch (err) {
    console.error('[Firestore] getAlertCount error:', err.message);
    return 0;
  }
}

// ════════════════════════════════════════════
//  DOC UPDATE QUEUE
// ════════════════════════════════════════════

/**
 * Get pending doc update queue items
 */
async function getDocQueue() {
  if (!db) return [];

  try {
    const snap = await db.collection('doc_update_queue')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();

    return snap.docs.map(doc => serializeDoc(doc));
  } catch (err) {
    console.error('[Firestore] getDocQueue error:', err.message);
    return [];
  }
}

/**
 * Submit a session digest to the doc update queue.
 * Called from the dashboard when a user pastes a Claude Code session summary.
 */
async function submitSessionDigest(summaryText) {
  if (!db) return null;

  try {
    const ref = await db.collection('doc_update_queue').add({
      sourceAgent: 'manual',
      type: 'session-digest',
      status: 'pending',
      priority: 'normal',
      createdAt: FieldValue.serverTimestamp(),
      processedAt: null,
      sessionData: {
        summary: summaryText,
        submittedAt: new Date().toISOString(),
      },
    });

    console.log('[Firestore] Session digest submitted:', ref.id);
    return ref.id;
  } catch (err) {
    console.error('[Firestore] submitSessionDigest error:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════
//  DOC REVIEWS (AI-Assisted Interactive Review)
// ════════════════════════════════════════════

async function getDocReviews() {
  if (!db) return [];
  try {
    const snap = await db.collection('doc_reviews')
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(doc => serializeDoc(doc));
  } catch (err) {
    console.error('[Firestore] getDocReviews error:', err.message);
    return [];
  }
}

async function submitReviewAnswers(reviewId, answers) {
  if (!db) return false;
  try {
    const docRef = db.collection('doc_reviews').doc(reviewId);
    const doc = await docRef.get();
    if (!doc.exists) return false;

    const data = doc.data();
    const updatedQuestions = data.questions.map(q => {
      const match = answers.find(a => a.id === q.id);
      return match ? { ...q, answer: match.answer } : q;
    });

    const allAnswered = updatedQuestions.every(q => q.answer && q.answer.trim());

    await docRef.update({
      questions: updatedQuestions,
      status: allAnswered ? 'answered' : 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[Firestore] submitReviewAnswers error:', err.message);
    return false;
  }
}

async function skipDocReview(reviewId) {
  if (!db) return false;
  try {
    await db.collection('doc_reviews').doc(reviewId).update({
      status: 'skipped',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[Firestore] skipDocReview error:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════
//  DASHBOARD CONFIG
// ════════════════════════════════════════════

/**
 * Get or create dashboard config document
 */
async function getConfig() {
  if (!db) return null;

  try {
    const doc = await db.collection('autopilot_config').doc('dashboard').get();
    if (doc.exists) return doc.data();

    // Create default config
    const defaults = {
      githubRepo: process.env.GITHUB_REPO || 'kitchenvoice-beta',
      githubOwner: process.env.GITHUB_OWNER || 'mageroyer',
      refreshInterval: 60000,
      createdAt: FieldValue.serverTimestamp(),
    };
    await db.collection('autopilot_config').doc('dashboard').set(defaults);
    return defaults;
  } catch (err) {
    console.error('[Firestore] getConfig error:', err.message);
    return null;
  }
}

module.exports = {
  init,
  isConnected,
  // Reports
  getReports,
  getLatestReport,
  onReportsUpdate,
  // Progress
  onProgressUpdate,
  // Tasks
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  // Alerts
  getAlerts,
  updateAlert,
  acknowledgeAlert,
  getAlertCount,
  // Doc Queue
  getDocQueue,
  submitSessionDigest,
  // Doc Reviews
  getDocReviews,
  submitReviewAnswers,
  skipDocReview,
  // Config
  getConfig,
};
