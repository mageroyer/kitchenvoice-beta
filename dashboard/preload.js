const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Window controls ──
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // ── Tray ──
  updateTrayStatus: (color, tooltip) => ipcRenderer.send('update-tray-status', { color, tooltip }),

  // ── Notifications ──
  showNotification: ({ title, body, urgency }) => ipcRenderer.send('show-notification', { title, body, urgency }),

  // ── Service events ──
  onTriggerAgent: (callback) => {
    ipcRenderer.on('trigger-agent', (_event, agentName) => callback(agentName));
  },
  onServicesReady: (callback) => {
    ipcRenderer.on('services-ready', (_event, status) => callback(status));
  },
  onReportsUpdated: (callback) => {
    ipcRenderer.on('reports-updated', (_event, reports) => callback(reports));
  },
  startProgressListener: () => ipcRenderer.send('start-progress-listener'),
  onProgressUpdated: (callback) => {
    ipcRenderer.on('progress-updated', (_event, progress) => callback(progress));
  },

  // ── Connection status ──
  getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),

  // ── Reports ──
  getReports: (options) => ipcRenderer.invoke('get-reports', options),
  getLatestReport: (agentName) => ipcRenderer.invoke('get-latest-report', agentName),
  startReportsListener: () => ipcRenderer.send('start-reports-listener'),

  // ── Tasks ──
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  createTask: (taskData) => ipcRenderer.invoke('create-task', taskData),
  updateTask: (taskId, updates) => ipcRenderer.invoke('update-task', { taskId, updates }),
  deleteTask: (taskId) => ipcRenderer.invoke('delete-task', taskId),

  // ── Alerts ──
  getAlerts: (options) => ipcRenderer.invoke('get-alerts', options),
  updateAlert: (alertId, updates) => ipcRenderer.invoke('update-alert', { alertId, updates }),
  acknowledgeAlert: (alertId) => ipcRenderer.invoke('acknowledge-alert', alertId),
  getAlertCount: () => ipcRenderer.invoke('get-alert-count'),

  // ── Doc Queue ──
  getDocQueue: () => ipcRenderer.invoke('get-doc-queue'),
  submitSessionDigest: (text) => ipcRenderer.invoke('submit-session-digest', text),

  // ── GitHub Actions ──
  getWorkflowRuns: (options) => ipcRenderer.invoke('get-workflow-runs', options),
  triggerWorkflow: (agentName) => ipcRenderer.invoke('trigger-workflow', agentName),
  getRunStatus: (runId) => ipcRenderer.invoke('get-run-status', runId),

  // ── Pull Requests ──
  getAutopilotPRs: () => ipcRenderer.invoke('get-autopilot-prs'),
  mergePR: (pullNumber) => ipcRenderer.invoke('merge-pr', pullNumber),
  closePR: (pullNumber) => ipcRenderer.invoke('close-pr', pullNumber),
});
