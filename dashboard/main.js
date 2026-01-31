const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ── Data services (loaded after app ready) ──
let firestoreService = null;
let githubService = null;

let mainWindow = null;
let tray = null;

function createTrayIcon(color = '#7c3aed') {
  // Create a 16x16 canvas-style icon using nativeImage
  // Purple circle for normal, yellow for warning, red for error
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  const colors = {
    '#7c3aed': [124, 58, 237],  // purple - all good
    '#eab308': [234, 179, 8],   // yellow - warnings
    '#ef4444': [239, 68, 68],   // red - failures
  };

  const [r, g, b] = colors[color] || colors['#7c3aed'];
  const cx = size / 2;
  const cy = size / 2;
  const radius = 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist <= radius) {
        const edge = Math.max(0, 1 - Math.max(0, dist - radius + 1));
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = Math.round(255 * edge);
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0b1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: createTrayIcon(),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Show when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Autopilot Command Center');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Run Health Check',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('trigger-agent', 'daily-health');
        }
      },
    },
    {
      label: 'Run Security Scan',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('trigger-agent', 'security-scanner');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// IPC handlers for frameless window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Update tray icon color + tooltip
ipcMain.on('update-tray-status', (event, { color, tooltip }) => {
  if (tray) {
    tray.setImage(createTrayIcon(color));
    if (tooltip) tray.setToolTip(tooltip);
  }
});

// Desktop notification from renderer
ipcMain.on('show-notification', (event, { title, body, urgency }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: urgency !== 'critical' });
    n.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    n.show();
  }
});

// ════════════════════════════════════════════
//  DATA SERVICE IPC HANDLERS
// ════════════════════════════════════════════

// ── Connection status ──
ipcMain.handle('get-connection-status', () => {
  return {
    firestore: firestoreService ? firestoreService.isConnected() : false,
    github: githubService ? githubService.isConnected() : false,
  };
});

// ── Reports ──
ipcMain.handle('get-reports', async (event, options) => {
  if (!firestoreService) return [];
  return firestoreService.getReports(options);
});

ipcMain.handle('get-latest-report', async (event, agentName) => {
  if (!firestoreService) return null;
  return firestoreService.getLatestReport(agentName);
});

// ── Tasks ──
ipcMain.handle('get-tasks', async () => {
  if (!firestoreService) return [];
  return firestoreService.getTasks();
});

ipcMain.handle('create-task', async (event, taskData) => {
  if (!firestoreService) return null;
  return firestoreService.createTask(taskData);
});

ipcMain.handle('update-task', async (event, { taskId, updates }) => {
  if (!firestoreService) return false;
  return firestoreService.updateTask(taskId, updates);
});

ipcMain.handle('delete-task', async (event, taskId) => {
  if (!firestoreService) return false;
  return firestoreService.deleteTask(taskId);
});

// ── Alerts ──
ipcMain.handle('get-alerts', async (event, options) => {
  if (!firestoreService) return [];
  return firestoreService.getAlerts(options);
});

ipcMain.handle('update-alert', async (event, { alertId, updates }) => {
  if (!firestoreService) return false;
  return firestoreService.updateAlert(alertId, updates);
});

ipcMain.handle('acknowledge-alert', async (event, alertId) => {
  if (!firestoreService) return false;
  return firestoreService.acknowledgeAlert(alertId);
});

ipcMain.handle('get-alert-count', async () => {
  if (!firestoreService) return 0;
  return firestoreService.getAlertCount();
});

// ── GitHub ──
ipcMain.handle('get-workflow-runs', async (event, options) => {
  if (!githubService) return [];
  return githubService.getWorkflowRuns(options);
});

ipcMain.handle('trigger-workflow', async (event, agentName, extraInputs) => {
  if (!githubService) return { success: false, error: 'GitHub not connected' };
  const result = await githubService.triggerWorkflow(agentName, extraInputs || {});

  // Send desktop notification
  if (result.success && Notification.isSupported()) {
    new Notification({
      title: 'Agent Triggered',
      body: `${agentName} workflow dispatched to GitHub Actions`,
    }).show();
  }

  return result;
});

ipcMain.handle('get-run-status', async (event, runId) => {
  if (!githubService) return null;
  return githubService.getRunStatus(runId);
});

ipcMain.handle('get-autopilot-prs', async () => {
  if (!githubService) return [];
  return githubService.getAutopilotPRs();
});

ipcMain.handle('merge-pr', async (event, pullNumber) => {
  if (!githubService) return { success: false, error: 'GitHub not connected' };
  return githubService.mergePR(pullNumber);
});

ipcMain.handle('close-pr', async (event, pullNumber) => {
  if (!githubService) return { success: false, error: 'GitHub not connected' };
  return githubService.closePR(pullNumber);
});

// ── Doc Queue ──
ipcMain.handle('get-doc-queue', async () => {
  if (!firestoreService) return [];
  return firestoreService.getDocQueue();
});

ipcMain.handle('submit-session-digest', async (event, summaryText) => {
  if (!firestoreService) return null;
  return firestoreService.submitSessionDigest(summaryText);
});

// ── Doc Reviews ──
ipcMain.handle('get-doc-reviews', async () => {
  if (!firestoreService) return [];
  return firestoreService.getDocReviews();
});

ipcMain.handle('submit-review-answers', async (event, { reviewId, answers }) => {
  if (!firestoreService) return false;
  return firestoreService.submitReviewAnswers(reviewId, answers);
});

ipcMain.handle('skip-doc-review', async (event, reviewId) => {
  if (!firestoreService) return false;
  return firestoreService.skipDocReview(reviewId);
});

// ── Realtime report listener ──
ipcMain.on('start-reports-listener', () => {
  if (!firestoreService) return;
  firestoreService.onReportsUpdate((reports) => {
    if (mainWindow) {
      mainWindow.webContents.send('reports-updated', reports);
    }
  });
});

// ── Realtime progress listener ──
ipcMain.on('start-progress-listener', () => {
  if (!firestoreService) return;
  firestoreService.onProgressUpdate((progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('progress-updated', progress);
    }
  });
});

// ════════════════════════════════════════════
//  INITIALIZE DATA SERVICES
// ════════════════════════════════════════════

async function initServices() {
  // ── Firestore ──
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountPath) {
    try {
      firestoreService = require('./src/services/firestore');
      const connected = firestoreService.init(serviceAccountPath);
      if (connected) {
        console.log('[Main] Firestore service initialized');
      }
    } catch (err) {
      console.error('[Main] Firestore init failed:', err.message);
    }
  } else {
    console.warn('[Main] No FIREBASE_SERVICE_ACCOUNT in .env - Firestore disabled');
  }

  // ── GitHub (async - Octokit is ESM) ──
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    try {
      githubService = require('./src/services/github');
      await githubService.init({
        token: githubToken,
        githubOwner: process.env.GITHUB_OWNER || 'mageroyer',
        githubRepo: process.env.GITHUB_REPO || 'kitchenvoice-beta',
      });
      console.log('[Main] GitHub service initialized');
    } catch (err) {
      console.error('[Main] GitHub init failed:', err.message);
    }
  } else {
    console.warn('[Main] No GITHUB_TOKEN in .env - GitHub API disabled');
  }

  // Send connection status to renderer once window is ready
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('services-ready', {
        firestore: firestoreService ? firestoreService.isConnected() : false,
        github: githubService ? githubService.isConnected() : false,
      });
    });
  }
}

// ── Single instance lock ──
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running — focus it and quit this one
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // App lifecycle
  app.whenReady().then(() => {
    createWindow();
    createTray();
    initServices();
  });
}

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    // Keep running in tray on Windows too
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
