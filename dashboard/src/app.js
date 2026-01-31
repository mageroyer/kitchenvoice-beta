/* ═══════════════════════════════════════════════════════════
   APP.JS - Renderer entry point
   Wires up titlebar controls, clock, and panel placeholders
   ═══════════════════════════════════════════════════════════ */

// ── Track triggered runs (agent name → timestamp) ──
const triggeredRuns = {};

// ── Track overall system status for tray icon ──
let systemHealth = { failures: 0, warnings: 0, criticalAlerts: 0 };

// ── Agent definitions ──
const AGENTS = [
  { id: 'daily-health',      name: 'Health Check',    icon: '\u{1F3E5}', schedule: 'Daily 6 AM',      color: '#22c55e' },
  { id: 'test-fixer',        name: 'Test Fixer',      icon: '\u{1F527}', schedule: 'On CI failure',    color: '#3b82f6' },
  { id: 'deps-updater',      name: 'Deps Updater',    icon: '\u{1F4E6}', schedule: 'Sunday 3 AM',      color: '#a855f7' },
  { id: 'security-scanner',  name: 'Security Scan',   icon: '\u{1F6E1}', schedule: 'Monday 4 AM',      color: '#ef4444' },
  { id: 'codebase-mapper',   name: 'Codebase Mapper', icon: '\u{1F5FA}', schedule: 'Monthly 1st 1 AM', color: '#14b8a6' },
  { id: 'documentalist',     name: 'Documentalist',   icon: '\u{1F4DA}', schedule: 'Thursday 2 AM',    color: '#f59e0b' },
  { id: 'full-audit',        name: 'Full Audit',      icon: '\u{1F50D}', schedule: 'Monthly 1st',      color: '#06b6d4' },
];

// ── Titlebar window controls ──
function initTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimize();
  });

  document.getElementById('btn-maximize').addEventListener('click', async () => {
    window.electronAPI.maximize();
    // Update icon based on state
    const isMax = await window.electronAPI.isMaximized();
    const svg = document.querySelector('#btn-maximize svg');
    if (isMax) {
      svg.innerHTML = '<rect x="7" y="3" width="10" height="10" rx="1"/><rect x="3" y="7" width="10" height="10" rx="1"/>';
    } else {
      svg.innerHTML = '<rect x="5" y="5" width="14" height="14" rx="1"/>';
    }
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.close();
  });
}

// ── Live clock in titlebar ──
function initClock() {
  const el = document.getElementById('clockDisplay');
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  update();
  setInterval(update, 1000);
}

// ── Render agent status cards (placeholder data for Phase 1) ──
function renderAgentGrid() {
  const grid = document.getElementById('agent-grid');

  const html = AGENTS.map(agent => {
    const isMapper = agent.id === 'codebase-mapper';
    const isDocumentalist = agent.id === 'documentalist';
    return `
    <div class="agent-card ${isMapper ? 'agent-card-mapper' : ''} ${isDocumentalist ? 'agent-card-documentalist' : ''}" data-agent="${agent.id}">
      <div class="agent-card-header">
        <div class="agent-card-name">
          <span>${agent.icon}</span>
          <span>${agent.name}</span>
        </div>
        <span class="status-dot" style="background: ${agent.color}; box-shadow: 0 0 6px ${agent.color}40;"></span>
      </div>
      <div class="agent-card-metric">Awaiting data...</div>
      <div class="agent-card-footer">
        <span class="agent-card-time">${agent.schedule}</span>
        <span class="badge badge-purple">Idle</span>
      </div>
      ${isMapper ? `
      <div class="agent-card-actions">
        <button class="mapper-btn" data-mapper-action="full-scan" title="Run full codebase scan">Full Scan</button>
        <button class="mapper-btn" data-mapper-action="process-session" title="Scan recent changes (git-diff)">Process Session</button>
        <button class="mapper-btn" data-mapper-action="give-task" title="Targeted scan on specific files">Give Task</button>
      </div>` : ''}
      ${isDocumentalist ? `
      <div class="agent-card-actions">
        <button class="mapper-btn mapper-btn-review" data-doc-action="reviews" title="Pending doc reviews">
          Reviews <span class="mapper-review-count" id="mapper-review-count"></span>
        </button>
      </div>` : ''}
    </div>`;
  }).join('');

  grid.innerHTML = html;

  // Click agent card → open report in Reports panel
  grid.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
      const agentId = card.dataset.agent;
      if (window.ReportsPanel) {
        window.ReportsPanel.showAgent(agentId);
      }
    });
  });
}

// ── Wire up Codebase Mapper action buttons ──
function wireMapperActions() {
  // Full Scan — trigger codebase-mapper with no target (= full scan)
  document.querySelector('[data-mapper-action="full-scan"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.textContent = '...';
    btn.disabled = true;
    const result = await window.electronAPI.triggerWorkflow('codebase-mapper');
    btn.textContent = result.success ? 'Sent!' : 'Err';
    setTimeout(() => { btn.textContent = 'Full Scan'; btn.disabled = false; }, 3000);
  });

  // Process Session — trigger codebase-mapper with git-diff (auto-detect recent changes -> documentalist)
  document.querySelector('[data-mapper-action="process-session"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.textContent = '...';
    btn.disabled = true;
    const result = await window.electronAPI.triggerWorkflow('codebase-mapper', { scan_target: 'git-diff' });
    btn.textContent = result.success ? 'Sent!' : 'Err';
    if (result.success) showToast('Session scan dispatched (git-diff)');
    setTimeout(() => { btn.textContent = 'Process Session'; btn.disabled = false; }, 3000);
  });

  // Give Task — open target selection modal
  document.querySelector('[data-mapper-action="give-task"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showTargetModal();
  });
}

// ── Wire up Documentalist action buttons ──
function wireDocumentalistActions() {
  const btn = document.querySelector('[data-doc-action="reviews"]');
  if (!btn) {
    console.warn('[DocReview] Reviews button not found in DOM');
    return;
  }

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Show immediate loading feedback on the button
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Loading...';
    btn.disabled = true;

    let result = [];
    let error = null;
    try {
      // Race the IPC call against a 5-second timeout
      result = await Promise.race([
        window.electronAPI.getDocReviews(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout (5s)')), 5000))
      ]) || [];
    } catch (err) {
      error = err.message || String(err);
      console.error('[DocReview] Fetch failed:', error);
    }

    // Restore button
    btn.innerHTML = originalText;
    btn.disabled = false;

    const active = result.filter(r => r.status === 'pending' || r.status === 'answered');

    if (active.length > 0) {
      // Has reviews — pass data directly to panel (skip second IPC call)
      if (window.DocReviewPanel && window.DocReviewPanel.setData) {
        window.DocReviewPanel.setData(result);
      }
      const reviewPanel = document.getElementById('review-panel-container');
      if (reviewPanel) {
        reviewPanel.style.display = 'block';
        reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        reviewPanel.style.outline = '2px solid var(--purple-400)';
        reviewPanel.style.outlineOffset = '2px';
        setTimeout(() => { reviewPanel.style.outline = ''; reviewPanel.style.outlineOffset = ''; }, 2000);
      }
    } else {
      showReviewPromptModal(result, error);
    }
  });
}

// ── Review prompt modal — when no reviews exist ──
function showReviewPromptModal(directResult, directError) {
  document.querySelector('.modal-overlay')?.remove();

  // Build diagnostic line
  let debugLine;
  if (directResult === null && directError === null) {
    debugLine = '<span style="color:var(--purple-400);">Loading from Firestore...</span>';
  } else if (directError) {
    debugLine = `<span style="color:#ef4444;">Error: ${directError}</span>`;
  } else {
    debugLine = `IPC returned ${(directResult || []).length} doc(s)${(directResult || []).length > 0 ? ' [' + directResult.map(r => r.status).join(', ') + ']' : ''}`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">Doc Reviews</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div style="text-align: center; padding: 10px 0;">
          <div style="font-size: 28px; opacity: 0.4; margin-bottom: 8px;">&#x1F4DD;</div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">No pending reviews</div>
          <div style="font-size: 10px; color: var(--text-muted); line-height: 1.5;">
            Run the documentalist in <strong>review</strong> mode to analyze<br>
            your docs for gaps, placeholders, and inaccuracies.<br>
            It will generate targeted questions for you to answer.
          </div>
          <div style="font-size: 9px; color: var(--text-muted); opacity: 0.5; margin-top: 10px; font-family: monospace;">
            ${debugLine}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" id="review-modal-cancel">Close</button>
        <button class="btn btn-sm btn-primary" id="review-modal-generate">Generate Reviews</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Generate reviews — trigger documentalist in review mode
  document.getElementById('review-modal-generate').addEventListener('click', async () => {
    const btn = document.getElementById('review-modal-generate');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const result = await window.electronAPI.triggerWorkflow('documentalist', { mode: 'review' });
    if (result.success) {
      showToast('Documentalist review mode dispatched');
      overlay.remove();
    } else {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Generate Reviews'; btn.disabled = false; }, 3000);
    }
  });

  // Close handlers
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  document.getElementById('review-modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Target selection modal for codebase-mapper ──
function showTargetModal() {
  document.querySelector('.modal-overlay')?.remove();

  const profiles = [
    { id: 'git-diff', label: 'Git Diff', desc: 'Auto-detect from recent commits' },
    { id: 'autopilot-files', label: 'Autopilot Files', desc: 'scripts/autopilot/' },
    { id: 'cloud-functions', label: 'Cloud Functions', desc: 'functions/' },
    { id: 'dashboard-files', label: 'Dashboard', desc: 'dashboard/src/' },
    { id: 'all-external', label: 'All External', desc: 'All non-app areas' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">Targeted Scan</span>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label>Scan Profile</label>
          <div class="target-profile-list">
            ${profiles.map(p => `
              <div class="target-profile-option" data-profile="${p.id}">
                <div class="target-profile-name">${p.label}</div>
                <div class="target-profile-desc">${p.desc}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-field">
          <label>Or enter custom file list</label>
          <input class="modal-input" id="custom-files-input" placeholder="files:path/a.js,path/b.js" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" id="target-modal-cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" id="target-modal-send" disabled>Send Task</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let selectedProfile = null;

  // Profile selection
  overlay.querySelectorAll('.target-profile-option').forEach(opt => {
    opt.addEventListener('click', () => {
      overlay.querySelectorAll('.target-profile-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedProfile = opt.dataset.profile;
      document.getElementById('custom-files-input').value = '';
      document.getElementById('target-modal-send').disabled = false;
    });
  });

  // Custom input clears profile selection
  document.getElementById('custom-files-input').addEventListener('input', (e) => {
    if (e.target.value.trim()) {
      overlay.querySelectorAll('.target-profile-option').forEach(o => o.classList.remove('selected'));
      selectedProfile = null;
      document.getElementById('target-modal-send').disabled = false;
    } else if (!selectedProfile) {
      document.getElementById('target-modal-send').disabled = true;
    }
  });

  // Send
  document.getElementById('target-modal-send').addEventListener('click', async () => {
    const customFiles = document.getElementById('custom-files-input').value.trim();
    const target = customFiles || selectedProfile;
    if (!target) return;

    const btn = document.getElementById('target-modal-send');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    const result = await window.electronAPI.triggerWorkflow('codebase-mapper', { scan_target: target });
    if (result.success) {
      showToast('Targeted scan dispatched');
      overlay.remove();
    } else {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Send Task'; btn.disabled = false; }, 3000);
    }
  });

  // Close handlers
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  document.getElementById('target-modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── Update review count badge on mapper card ──
function updateMapperReviewBadge() {
  const countEl = document.getElementById('mapper-review-count');
  if (!countEl) return;
  const active = (window.DocReviewPanel && window.DocReviewPanel.getActiveCount)
    ? window.DocReviewPanel.getActiveCount()
    : 0;
  countEl.textContent = active > 0 ? active : '';
  countEl.style.display = active > 0 ? 'inline-flex' : 'none';
}

// ── Schedule countdown calculation ──
function getNextRunTime(agent) {
  const now = new Date();
  const utcNow = new Date(now.toISOString());

  if (agent.id === 'daily-health') {
    // Daily at 6 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(6, 0, 0, 0);
    if (next <= utcNow) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (agent.id === 'deps-updater') {
    // Sunday at 3 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(3, 0, 0, 0);
    const daysUntilSunday = (7 - next.getUTCDay()) % 7 || 7;
    if (next.getUTCDay() === 0 && next > utcNow) { /* already sunday and in future */ }
    else next.setUTCDate(next.getUTCDate() + ((7 - next.getUTCDay()) % 7 || 7));
    if (next.getUTCDay() === 0 && next <= utcNow) next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (agent.id === 'security-scanner') {
    // Monday at 4 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(4, 0, 0, 0);
    const daysUntilMonday = (1 - next.getUTCDay() + 7) % 7 || 7;
    if (next.getUTCDay() === 1 && next > utcNow) { /* already monday and in future */ }
    else next.setUTCDate(next.getUTCDate() + ((1 - next.getUTCDay() + 7) % 7 || 7));
    if (next.getUTCDay() === 1 && next <= utcNow) next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (agent.id === 'codebase-mapper') {
    // Monthly 1st at 1 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(1, 0, 0, 0);
    next.setUTCDate(1);
    if (next <= utcNow) next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  if (agent.id === 'documentalist') {
    // Thursday at 2 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(2, 0, 0, 0);
    if (next.getUTCDay() === 4 && next > utcNow) { /* already thursday and in future */ }
    else next.setUTCDate(next.getUTCDate() + ((4 - next.getUTCDay() + 7) % 7 || 7));
    if (next.getUTCDay() === 4 && next <= utcNow) next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (agent.id === 'full-audit') {
    // 1st of month at 2 AM UTC
    const next = new Date(utcNow);
    next.setUTCHours(2, 0, 0, 0);
    next.setUTCDate(1);
    if (next <= utcNow) next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function updateNextRunCountdown() {
  const el = document.getElementById('next-run-countdown');
  if (!el) return;

  const scheduledAgents = AGENTS.filter(a => a.id !== 'test-fixer');
  let soonest = Infinity;

  for (const agent of scheduledAgents) {
    const next = getNextRunTime(agent);
    if (next) {
      const diff = next.getTime() - Date.now();
      if (diff > 0 && diff < soonest) soonest = diff;
    }
  }

  if (soonest < Infinity) {
    el.textContent = `Next: ${formatCountdown(soonest)}`;
  } else {
    el.textContent = '--';
  }
}

// ── Render schedule placeholder ──
function renderSchedulePlaceholder() {
  const body = document.getElementById('schedule-body');

  // Build schedule entries from agent definitions
  const entries = AGENTS.filter(a => a.id !== 'test-fixer').map(agent => `
    <div class="schedule-entry" style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      margin-bottom: 4px;
      background: var(--bg-card);
      border-radius: var(--radius-sm);
      border-left: 3px solid ${agent.color};
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px;">${agent.icon}</span>
        <div>
          <div style="font-size: 11px; font-weight: 500; color: var(--text-primary);">${agent.name}</div>
          <div style="font-size: 9px; color: var(--text-muted);">${agent.schedule} UTC</div>
        </div>
      </div>
      <button class="btn btn-sm" data-run-agent="${agent.id}">Run</button>
    </div>
  `).join('');

  body.innerHTML = entries;

  // Update countdown immediately and every 30s
  updateNextRunCountdown();
  setInterval(updateNextRunCountdown, 30000);

  // Run buttons → trigger GitHub Actions workflow
  body.querySelectorAll('[data-run-agent]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const agentId = btn.dataset.runAgent;
      btn.textContent = '...';
      btn.disabled = true;

      const result = await window.electronAPI.triggerWorkflow(agentId);
      if (result.success) {
        // Remember which agent we triggered so we can label the run
        triggeredRuns[Date.now()] = agentId;
        btn.textContent = 'Sent!';
        btn.style.borderColor = 'var(--success)';
        btn.style.color = 'var(--success)';
      } else {
        btn.textContent = 'Err';
        btn.style.borderColor = 'var(--error)';
        btn.style.color = 'var(--error)';
        console.error(`[GitHub] Trigger failed for ${agentId}:`, result.error);
      }

      setTimeout(() => {
        btn.textContent = 'Run';
        btn.disabled = false;
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 4000);
    });
  });
}

// ── Initialize live panels ──
function initPanels() {
  // Reports panel (has its own init)
  if (window.ReportsPanel) {
    window.ReportsPanel.init();
  }

  // Task Queue panel
  if (window.TaskQueuePanel) {
    window.TaskQueuePanel.init();
  }

  // Security Alerts panel
  if (window.SecurityPanel) {
    window.SecurityPanel.init();
  }

  // Health Trends panel (Chart.js)
  if (window.HealthTrendsPanel) {
    window.HealthTrendsPanel.init();
  }

  // Doc Review panel (AI-assisted)
  if (window.DocReviewPanel) {
    window.DocReviewPanel.init();
  }
}

// ── Listen for tray-triggered agent runs ──
function initTrayListeners() {
  if (window.electronAPI && window.electronAPI.onTriggerAgent) {
    window.electronAPI.onTriggerAgent(async (agentName) => {
      console.log(`[Tray] Agent trigger received: ${agentName}`);
      const result = await window.electronAPI.triggerWorkflow(agentName);
      console.log(`[Tray] Trigger result:`, result);
    });
  }
}

// ── Connection status in titlebar ──
function updateConnectionStatus(status) {
  const dot = document.getElementById('systemStatusDot');
  const text = document.getElementById('systemStatusText');

  if (status.firestore && status.github) {
    dot.className = 'status-dot success';
    text.textContent = 'All Systems Connected';
  } else if (status.firestore || status.github) {
    dot.className = 'status-dot warning';
    const connected = [];
    if (status.firestore) connected.push('Firestore');
    if (status.github) connected.push('GitHub');
    text.textContent = `${connected.join(' + ')} Connected`;
  } else {
    dot.className = 'status-dot error';
    text.textContent = 'Offline Mode';
  }
}

// ── Load live data from services ──
async function loadLiveData() {
  const status = await window.electronAPI.getConnectionStatus();
  updateConnectionStatus(status);

  if (status.firestore) {
    // Load latest report for each agent → update agent cards
    await refreshAgentCards();

    // Start realtime listener for new reports
    window.electronAPI.startReportsListener();

    // Start realtime listener for agent progress
    window.electronAPI.startProgressListener();
    window.electronAPI.onProgressUpdated((progress) => {
      updateAgentCardsFromProgress(progress);
    });

    window.electronAPI.onReportsUpdated((reports) => {
      console.log(`[Realtime] ${reports.length} reports received`);
      updateAgentCardsFromReports(reports);

      // Notify on new failed reports (check last 5 min)
      const fiveMinAgo = Date.now() - 300000;
      for (const report of reports) {
        const ts = report.timestamp ? new Date(report.timestamp).getTime() : 0;
        if (ts > fiveMinAgo && report.status === 'failed') {
          notifyAgentComplete(report);
        }
      }

      // Re-evaluate system health after new reports
      evaluateSystemHealth();
    });
  }

  if (status.github) {
    // Load recent workflow runs
    await loadWorkflowRuns();
  }
}

// ── Refresh agent cards with latest Firestore data ──
async function refreshAgentCards() {
  for (const agent of AGENTS) {
    try {
      const report = await window.electronAPI.getLatestReport(agent.id);
      if (report) {
        updateAgentCard(agent.id, report);
      }
    } catch (err) {
      console.error(`[Data] Failed to load report for ${agent.id}:`, err);
    }
  }
}

// ── Update a single agent card with report data ──
function updateAgentCard(agentId, report) {
  const card = document.querySelector(`.agent-card[data-agent="${agentId}"]`);
  if (!card) return;

  const agent = AGENTS.find(a => a.id === agentId);

  // Status dot
  const dot = card.querySelector('.status-dot');
  if (report.status === 'success') {
    dot.style.background = '#22c55e';
    dot.style.boxShadow = '0 0 6px rgba(34,197,94,0.4)';
  } else if (report.status === 'failed') {
    dot.style.background = '#ef4444';
    dot.style.boxShadow = '0 0 6px rgba(239,68,68,0.4)';
  } else {
    dot.style.background = '#eab308';
    dot.style.boxShadow = '0 0 6px rgba(234,179,8,0.4)';
  }

  // Metric line
  const metricEl = card.querySelector('.agent-card-metric');
  if (report.metrics && report.metrics.tests) {
    metricEl.textContent = `${report.metrics.tests.passing || 0} tests passing`;
  } else if (report.metrics && report.metrics.filesScanned) {
    metricEl.textContent = `${report.metrics.filesScanned} files, ${report.metrics.jsdocCoverage || '?'} JSDoc`;
  } else if (report.metrics && report.metrics.overallHealth !== undefined) {
    metricEl.textContent = `${report.metrics.overallHealth}% health, ${report.metrics.docsUpdated || 0} updated`;
  } else if (report.changes && report.changes.length > 0) {
    metricEl.textContent = `${report.changes.length} changes made`;
  } else {
    metricEl.textContent = report.status === 'success' ? 'Clean run' : 'Issues found';
  }

  // Time + badge
  const timeEl = card.querySelector('.agent-card-time');
  if (report.timestamp) {
    timeEl.textContent = formatRelativeTime(report.timestamp);
  }

  const badge = card.querySelector('.badge');
  if (report.status === 'success') {
    badge.className = 'badge badge-success';
    badge.textContent = 'OK';
  } else if (report.status === 'failed') {
    badge.className = 'badge badge-error';
    badge.textContent = 'FAIL';
  } else {
    badge.className = 'badge badge-warning';
    badge.textContent = 'WARN';
  }
}

// ── Update agent cards from realtime report stream ──
function updateAgentCardsFromReports(reports) {
  // Group by agent, take latest for each
  const latest = {};
  for (const report of reports) {
    if (!latest[report.agentName]) {
      latest[report.agentName] = report;
    }
  }

  for (const [agentId, report] of Object.entries(latest)) {
    updateAgentCard(agentId, report);
  }
}

// ── Update agent cards with live progress from running agents ──
function updateAgentCardsFromProgress(progress) {
  for (const [agentId, data] of Object.entries(progress)) {
    const card = document.querySelector(`.agent-card[data-agent="${agentId}"]`);
    if (!card) continue;

    const metricEl = card.querySelector('.agent-card-metric');
    const badge = card.querySelector('.badge');
    const dot = card.querySelector('.status-dot');

    // Show running state with phase info
    if (metricEl) {
      metricEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>${data.message}</span>
          <span style="font-size: 9px; color: var(--text-muted);">${data.percent}%</span>
        </div>
        <div style="height: 3px; background: var(--bg-surface); border-radius: 2px; margin-top: 4px; overflow: hidden;">
          <div style="height: 100%; width: ${data.percent}%; background: var(--purple-400); border-radius: 2px; transition: width 0.3s ease;"></div>
        </div>
      `;
    }

    if (badge) {
      badge.className = 'badge badge-purple';
      badge.textContent = 'Running';
    }

    if (dot) {
      dot.style.background = '#a855f7';
      dot.style.boxShadow = '0 0 6px rgba(168,85,247,0.4)';
    }
  }
}

// ── Load GitHub workflow runs into schedule panel ──
async function loadWorkflowRuns() {
  try {
    const runs = await window.electronAPI.getWorkflowRuns({ limit: 10 });
    if (runs.length > 0) {
      updateScheduleWithRuns(runs);
    }
  } catch (err) {
    console.error('[GitHub] Failed to load workflow runs:', err);
  }
}

// ── Resolve agent name from schedule or triggered runs ──
const FRIENDLY_TO_ID = {
  'health check': 'daily-health',
  'daily health': 'daily-health',
  'test fixer': 'test-fixer',
  'deps updater': 'deps-updater',
  'security scan': 'security-scanner',
  'security scanner': 'security-scanner',
  'codebase mapper': 'codebase-mapper',
  'codebase map': 'codebase-mapper',
  'documentalist': 'documentalist',
  'doc maintenance': 'documentalist',
  'full audit': 'full-audit',
};

function resolveAgentName(run) {
  if (run.agentName && run.agentName !== 'unknown') return run.agentName;

  // Check if we triggered this run from the dashboard
  const runTime = new Date(run.createdAt).getTime();
  for (const [triggerTime, agentId] of Object.entries(triggeredRuns)) {
    // Match within 2-minute window
    if (Math.abs(runTime - Number(triggerTime)) < 120000) {
      return agentId;
    }
  }

  // Check displayTitle and name for friendly agent names
  const searchFields = [run.displayTitle, run.name].filter(Boolean);
  for (const field of searchFields) {
    const lower = field.toLowerCase();
    for (const [friendly, id] of Object.entries(FRIENDLY_TO_ID)) {
      if (lower.includes(friendly)) return id;
    }
  }

  // Infer from schedule: check what hour (UTC) the run started
  if (run.event === 'schedule') {
    const hour = new Date(run.createdAt).getUTCHours();
    const day = new Date(run.createdAt).getUTCDay();
    const date = new Date(run.createdAt).getUTCDate();

    if (hour === 6) return 'daily-health';
    if (hour === 1 && date === 1) return 'codebase-mapper';
    if (hour === 2 && day === 4) return 'documentalist';
    if (hour === 3 && day === 0) return 'deps-updater';
    if (hour === 4 && day === 1) return 'security-scanner';
    if (hour === 2 && date === 1) return 'full-audit';
  }

  // Last resort: check if workflow_dispatch event (manual trigger from GitHub UI)
  // These show the agent input in the display title like "agent: daily-health"
  if (run.event === 'workflow_dispatch') {
    return 'manual run';
  }

  return 'workflow';
}

// ── Get friendly name for agent ID ──
function getAgentDisplayName(agentId) {
  const agent = AGENTS.find(a => a.id === agentId);
  return agent ? agent.name : agentId;
}

// ── Show recent GitHub runs in schedule panel ──
function updateScheduleWithRuns(runs) {
  const body = document.getElementById('schedule-body');

  // Keep existing schedule entries, add a divider and recent runs
  const recentRunsHTML = runs.slice(0, 5).map(run => {
    run.agentName = resolveAgentName(run);
    const statusColor = run.conclusion === 'success' ? 'var(--success)'
      : run.conclusion === 'failure' ? 'var(--error)'
      : 'var(--warning)';
    const statusText = run.conclusion || run.status || 'unknown';
    const time = formatRelativeTime(run.createdAt);

    return `
      <div style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        margin-bottom: 3px;
        background: var(--bg-card);
        border-radius: var(--radius-sm);
        border-left: 3px solid ${statusColor};
        opacity: 0.7;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-dot" style="background: ${statusColor}; box-shadow: 0 0 4px ${statusColor};"></span>
          <div>
            <div style="font-size: 10px; color: var(--text-secondary);">${getAgentDisplayName(run.agentName)}</div>
            <div style="font-size: 9px; color: var(--text-muted);">${time}</div>
          </div>
        </div>
        <span class="badge" style="
          background: ${statusColor}20;
          color: ${statusColor};
          border: 1px solid ${statusColor}40;
        ">${statusText}</span>
      </div>
    `;
  }).join('');

  // Append recent runs section after the schedule
  const existingRuns = body.querySelector('.recent-runs');
  if (existingRuns) existingRuns.remove();

  const section = document.createElement('div');
  section.className = 'recent-runs';
  section.innerHTML = `
    <div style="
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      padding: 10px 4px 6px;
      border-top: 1px solid var(--purple-border);
      margin-top: 8px;
    ">Recent Runs</div>
    ${recentRunsHTML}
  `;
  body.appendChild(section);
}

// ── Utility: relative time formatting ──
function formatRelativeTime(timestamp) {
  if (!timestamp) return '--';

  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

// ══════════════════════════════════════════════════
//  SYSTEM TRAY STATUS SYNC
// ══════════════════════════════════════════════════

function syncTrayStatus() {
  let color = '#7c3aed';  // purple = all good
  let tooltip = 'Autopilot Command Center — All Systems Nominal';

  if (systemHealth.failures > 0 || systemHealth.criticalAlerts > 0) {
    color = '#ef4444';
    tooltip = `Autopilot — ${systemHealth.failures} failure(s), ${systemHealth.criticalAlerts} critical alert(s)`;
  } else if (systemHealth.warnings > 0) {
    color = '#eab308';
    tooltip = `Autopilot — ${systemHealth.warnings} warning(s)`;
  }

  window.electronAPI.updateTrayStatus(color, tooltip);
}

async function evaluateSystemHealth() {
  systemHealth = { failures: 0, warnings: 0, criticalAlerts: 0 };

  // Check latest agent reports for failures
  for (const agent of AGENTS) {
    try {
      const report = await window.electronAPI.getLatestReport(agent.id);
      if (report) {
        if (report.status === 'failed') systemHealth.failures++;
        else if (report.status === 'partial') systemHealth.warnings++;
      }
    } catch (e) { /* ignore */ }
  }

  // Check unacknowledged critical alerts
  try {
    const alerts = await window.electronAPI.getAlerts({ unacknowledgedOnly: true });
    for (const alert of alerts) {
      if (alert.severity === 'critical') systemHealth.criticalAlerts++;
      else if (alert.severity === 'high') systemHealth.warnings++;
    }
  } catch (e) { /* ignore */ }

  syncTrayStatus();
}

// ══════════════════════════════════════════════════
//  DESKTOP NOTIFICATIONS
// ══════════════════════════════════════════════════

function notifyAgentComplete(report) {
  if (!report || !report.agentName) return;
  const agent = AGENTS.find(a => a.id === report.agentName);
  const name = agent ? agent.name : report.agentName;
  const status = report.status === 'success' ? 'completed successfully' : 'finished with issues';

  window.electronAPI.showNotification({
    title: `${name} ${report.status === 'success' ? 'Complete' : 'Failed'}`,
    body: `${name} ${status}`,
    urgency: report.status === 'failed' ? 'critical' : 'normal',
  });
}

function notifyCriticalAlert(alert) {
  if (!alert) return;
  window.electronAPI.showNotification({
    title: `Security Alert: ${alert.severity.toUpperCase()}`,
    body: alert.title || 'New critical security finding detected',
    urgency: 'critical',
  });
}

// ══════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════

const PANEL_IDS = [
  'panel-agents',    // Ctrl+1
  'panel-schedule',  // Ctrl+2
  'panel-trends',    // Ctrl+3
  'panel-reports',   // Ctrl+4
  'panel-tasks',     // Ctrl+5
  'panel-security',  // Ctrl+6
];

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+R or F5 → Refresh all panels
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      refreshAllPanels();
      return;
    }

    // Escape → Close any open modal
    if (e.key === 'Escape') {
      const modal = document.querySelector('.modal-overlay');
      if (modal) modal.remove();
      // Also remove panel focus highlight
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-focused'));
      return;
    }

    // Ctrl+1 through Ctrl+6 → Focus panel
    if (e.ctrlKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      focusPanel(idx);
      return;
    }
  });
}

function focusPanel(index) {
  if (index < 0 || index >= PANEL_IDS.length) return;

  // Remove previous focus
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-focused'));

  // Add focus to target
  const panel = document.getElementById(PANEL_IDS[index]);
  if (panel) {
    panel.classList.add('panel-focused');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Auto-remove focus after 3 seconds
    setTimeout(() => panel.classList.remove('panel-focused'), 3000);
  }
}

async function refreshAllPanels() {
  // Flash titlebar to indicate refresh
  const statusText = document.getElementById('systemStatusText');
  const originalText = statusText.textContent;
  statusText.textContent = 'Refreshing...';
  statusText.style.color = 'var(--purple-400)';

  try {
    const status = await window.electronAPI.getConnectionStatus();
    updateConnectionStatus(status);

    const tasks = [];
    if (status.firestore) {
      tasks.push(refreshAgentCards());
      if (window.ReportsPanel) tasks.push(window.ReportsPanel.load());
      if (window.TaskQueuePanel) tasks.push(window.TaskQueuePanel.load());
      if (window.SecurityPanel) tasks.push(window.SecurityPanel.load());
      if (window.HealthTrendsPanel) tasks.push(window.HealthTrendsPanel.load());
      if (window.DocReviewPanel) tasks.push(window.DocReviewPanel.load());
    }
    if (status.github) {
      tasks.push(loadWorkflowRuns());
    }

    await Promise.allSettled(tasks);
    updateMapperReviewBadge();
    await evaluateSystemHealth();
  } catch (err) {
    console.error('[Refresh] Error:', err);
  }

  statusText.textContent = originalText;
  statusText.style.color = '';

  // Show brief toast
  showToast('All panels refreshed');
}

// ══════════════════════════════════════════════════
//  TOAST NOTIFICATIONS (in-app)
// ══════════════════════════════════════════════════

function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Auto-remove after 2.5s
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ══════════════════════════════════════════════════
//  STAGGERED PANEL ANIMATIONS
// ══════════════════════════════════════════════════

function animatePanelsIn() {
  const panels = document.querySelectorAll('.panel');
  panels.forEach((panel, i) => {
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(12px)';
    setTimeout(() => {
      panel.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    }, 80 * i);
  });
}

// ══════════════════════════════════════════════════
//  ERROR HANDLING / OFFLINE STATE
// ══════════════════════════════════════════════════

let retryCount = 0;
const MAX_RETRIES = 3;

async function checkAndReconnect() {
  const status = await window.electronAPI.getConnectionStatus();
  updateConnectionStatus(status);

  if (!status.firestore && !status.github) {
    retryCount++;
    const dot = document.getElementById('systemStatusDot');
    const text = document.getElementById('systemStatusText');
    dot.className = 'status-dot error';
    text.textContent = retryCount <= MAX_RETRIES
      ? `Reconnecting... (${retryCount}/${MAX_RETRIES})`
      : 'Offline — Check connections';
  } else {
    retryCount = 0;
  }

  return status;
}

// ── Auto-refresh data periodically ──
function startAutoRefresh() {
  // Refresh every 60 seconds
  setInterval(async () => {
    const status = await checkAndReconnect();
    if (status.firestore) {
      await refreshAgentCards();
    }
    if (status.github) {
      await loadWorkflowRuns();
    }
    await evaluateSystemHealth();
  }, 60000);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Boot] Autopilot Command Center starting...');

  initTitlebar();
  initClock();
  initKeyboardShortcuts();
  renderAgentGrid();
  wireMapperActions();
  wireDocumentalistActions();
  renderSchedulePlaceholder();
  initPanels();
  initTrayListeners();

  // Staggered panel entrance animation
  animatePanelsIn();

  // Listen for services ready event from main process
  window.electronAPI.onServicesReady((status) => {
    console.log('[Boot] Services ready:', status);
    updateConnectionStatus(status);
  });

  // Load live data (will gracefully handle disconnected services)
  await loadLiveData();

  // Update mapper review badge after panels load
  updateMapperReviewBadge();

  // Evaluate system health and sync tray icon
  await evaluateSystemHealth();

  // Start periodic refresh
  startAutoRefresh();

  console.log('[Boot] Dashboard ready.');
});
