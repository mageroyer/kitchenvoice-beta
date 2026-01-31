/* ═══════════════════════════════════════════════════════════
   REPORTS PANEL - Report list + detail viewer
   ═══════════════════════════════════════════════════════════ */

const AGENT_META = {
  'daily-health':     { name: 'Health Check',   icon: '\u{1F3E5}', color: '#22c55e' },
  'test-fixer':       { name: 'Test Fixer',     icon: '\u{1F527}', color: '#3b82f6' },
  'deps-updater':     { name: 'Deps Updater',   icon: '\u{1F4E6}', color: '#a855f7' },
  'security-scanner': { name: 'Security Scan',  icon: '\u{1F6E1}', color: '#ef4444' },
  'codebase-mapper':  { name: 'Codebase Mapper', icon: '\u{1F5FA}', color: '#14b8a6' },
  'documentalist':    { name: 'Documentalist',  icon: '\u{1F4DA}', color: '#f59e0b' },
  'full-audit':       { name: 'Full Audit',     icon: '\u{1F50D}', color: '#06b6d4' },
};

let allReports = [];
let selectedReportId = null;

/**
 * Initialize the Reports panel
 */
function initReportsPanel() {
  const body = document.getElementById('reports-body');
  body.innerHTML = `
    <div class="reports-layout">
      <div class="reports-sidebar" id="reports-sidebar">
        <div class="reports-filter">
          <select id="reports-agent-filter" class="reports-select">
            <option value="">All Agents</option>
            <option value="daily-health">Health Check</option>
            <option value="test-fixer">Test Fixer</option>
            <option value="deps-updater">Deps Updater</option>
            <option value="security-scanner">Security Scan</option>
            <option value="codebase-mapper">Codebase Mapper</option>
            <option value="documentalist">Documentalist</option>
            <option value="full-audit">Full Audit</option>
          </select>
        </div>
        <div class="reports-list" id="reports-list">
          <div class="reports-empty">No reports yet</div>
        </div>
      </div>
      <div class="reports-detail" id="reports-detail">
        <div class="reports-detail-empty">
          <div style="font-size: 28px; opacity: 0.3;">\u{1F4CB}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Select a report to view details</div>
        </div>
      </div>
    </div>
  `;

  // Filter handler
  document.getElementById('reports-agent-filter').addEventListener('change', (e) => {
    renderReportsList(e.target.value);
  });

  // Load reports
  loadReports();
}

/**
 * Load reports from Firestore
 */
async function loadReports() {
  try {
    allReports = await window.electronAPI.getReports({ limit: 50 });
    renderReportsList();
    updateReportCount();
  } catch (err) {
    console.error('[Reports] Load failed:', err);
  }
}

/**
 * Render the report list sidebar
 */
function renderReportsList(filterAgent = '') {
  const list = document.getElementById('reports-list');
  let reports = allReports;

  if (filterAgent) {
    reports = reports.filter(r => r.agentName === filterAgent);
  }

  if (reports.length === 0) {
    list.innerHTML = '<div class="reports-empty">No reports found</div>';
    return;
  }

  list.innerHTML = reports.map(report => {
    const meta = AGENT_META[report.agentName] || { name: report.agentName, icon: '\u{2699}', color: '#7c3aed' };
    const time = formatTime(report.timestamp);
    const isSelected = report.id === selectedReportId;
    const statusClass = report.status === 'success' ? 'success' : report.status === 'failed' ? 'error' : 'warning';

    return `
      <div class="report-item ${isSelected ? 'selected' : ''}" data-report-id="${report.id}">
        <div class="report-item-header">
          <span class="report-item-icon" style="color: ${meta.color};">${meta.icon}</span>
          <span class="report-item-name">${meta.name}</span>
          <span class="status-dot ${statusClass}"></span>
        </div>
        <div class="report-item-time">${time}</div>
      </div>
    `;
  }).join('');

  // Click handlers
  list.querySelectorAll('.report-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.reportId;
      selectedReportId = id;
      renderReportsList(filterAgent);
      renderReportDetail(id);
    });
  });
}

/**
 * Render report detail view
 */
function renderReportDetail(reportId) {
  const detail = document.getElementById('reports-detail');
  const report = allReports.find(r => r.id === reportId);

  if (!report) {
    detail.innerHTML = '<div class="reports-detail-empty">Report not found</div>';
    return;
  }

  const meta = AGENT_META[report.agentName] || { name: report.agentName, icon: '\u{2699}', color: '#7c3aed' };
  const statusClass = report.status === 'success' ? 'success' : report.status === 'failed' ? 'error' : 'warning';
  const statusLabel = report.status === 'success' ? 'SUCCESS' : report.status === 'failed' ? 'FAILED' : 'WARNING';
  const duration = report.duration ? `${(report.duration / 1000).toFixed(1)}s` : '--';
  const time = formatTime(report.timestamp);

  // Build metrics cards
  let metricsHTML = '';
  if (report.metrics) {
    const m = report.metrics;
    if (m.tests) {
      metricsHTML += metricCard('Tests', `${m.tests.passing || 0} passing`, m.tests.failing > 0 ? 'error' : 'success');
      if (m.tests.failing > 0) {
        metricsHTML += metricCard('Failing', `${m.tests.failing}`, 'error');
      }
    }
    if (m.build) {
      metricsHTML += metricCard('Build', m.build.success ? 'OK' : 'FAIL', m.build.success ? 'success' : 'error');
    }
    if (m.lint) {
      metricsHTML += metricCard('Lint', `${m.lint.errors || 0} err / ${m.lint.warnings || 0} warn`, m.lint.errors > 0 ? 'warning' : 'success');
    }
    if (m.vulnerabilities) {
      const total = (m.vulnerabilities.critical || 0) + (m.vulnerabilities.high || 0);
      metricsHTML += metricCard('Vulns', `${total} critical/high`, total > 0 ? 'error' : 'success');
    }
    if (m.bundleSize) {
      metricsHTML += metricCard('Bundle', m.bundleSize, 'info');
    }
  }

  // Build changes list
  let changesHTML = '';
  if (report.changes && report.changes.length > 0) {
    changesHTML = `
      <div class="report-section">
        <div class="report-section-title">Changes (${report.changes.length})</div>
        <ul class="report-changes-list">
          ${report.changes.map(c => `<li>${escapeHTML(c)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // Build issues list
  let issuesHTML = '';
  if (report.issues && report.issues.length > 0) {
    issuesHTML = `
      <div class="report-section report-section-error">
        <div class="report-section-title" style="color: var(--error);">Issues (${report.issues.length})</div>
        <ul class="report-changes-list">
          ${report.issues.map(i => `<li style="color: var(--error);">${escapeHTML(i)}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // PR link
  let prHTML = '';
  if (report.prUrl) {
    prHTML = `
      <div class="report-section">
        <div class="report-section-title">Pull Request</div>
        <div class="report-pr-link">${escapeHTML(report.prUrl)}</div>
      </div>
    `;
  }

  // Doc changes (diff viewer)
  let docChangesHTML = '';
  if (report.docChanges && report.docChanges.length > 0) {
    const items = report.docChanges.map((dc, idx) => {
      const icon = dc.changeType === 'created' ? '\u{2795}' : '\u{270F}\u{FE0F}';
      const badge = dc.changeType === 'created' ? 'new' : 'modified';
      return `
        <div class="doc-change-item" data-diff-idx="${idx}">
          <span class="doc-change-icon">${icon}</span>
          <div class="doc-change-info">
            <span class="doc-change-name">${escapeHTML(dc.docName)}</span>
            <span class="doc-change-path">${escapeHTML(dc.docPath)}</span>
          </div>
          <div class="doc-change-stats">
            <span class="added">+${dc.linesAdded || 0}</span>
            <span class="removed">-${dc.linesRemoved || 0}</span>
          </div>
          <span class="doc-change-badge ${badge}">${badge}</span>
        </div>
      `;
    }).join('');

    docChangesHTML = `
      <div class="report-section">
        <div class="report-section-title">Documents Modified (${report.docChanges.length})</div>
        <div class="doc-changes-list">${items}</div>
      </div>
    `;
  }

  detail.innerHTML = `
    <div class="report-detail-scroll">
      <!-- Header -->
      <div class="report-detail-header">
        <div class="report-detail-title">
          <span style="font-size: 18px;">${meta.icon}</span>
          <span>${meta.name}</span>
          <span class="badge badge-${statusClass}">${statusLabel}</span>
        </div>
        <div class="report-detail-meta">
          <span>${time}</span>
          <span>\u{2022}</span>
          <span>Duration: ${duration}</span>
          ${report.testsPassing ? `<span>\u{2022}</span><span>${report.testsPassing} tests passing</span>` : ''}
        </div>
      </div>

      <!-- Metrics -->
      ${metricsHTML ? `<div class="report-metrics-grid">${metricsHTML}</div>` : ''}

      <!-- Changes -->
      ${changesHTML}

      <!-- Issues -->
      ${issuesHTML}

      <!-- Documents Modified -->
      ${docChangesHTML}

      <!-- PR -->
      ${prHTML}

      <!-- Full Log (collapsible) -->
      ${report.fullResult ? `
        <div class="report-section">
          <div class="report-section-title report-log-toggle" id="log-toggle">
            Full Log <span style="font-size: 9px; color: var(--text-muted);">[click to expand]</span>
          </div>
          <pre class="report-log-content" id="log-content" style="display: none;">${escapeHTML(report.fullResult)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Log toggle
  const toggle = document.getElementById('log-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const content = document.getElementById('log-content');
      const isHidden = content.style.display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      toggle.querySelector('span').textContent = isHidden ? '[click to collapse]' : '[click to expand]';
    });
  }

  // Doc change click handlers → open diff modal
  if (report.docChanges && report.docChanges.length > 0) {
    detail.querySelectorAll('.doc-change-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.diffIdx);
        const docChange = report.docChanges[idx];
        if (docChange) showDiffModal(docChange);
      });
    });
  }
}

/**
 * Show a diff modal for a doc change
 */
function showDiffModal(docChange) {
  // Remove any existing modal
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const badge = docChange.changeType === 'created' ? 'new' : 'modified';

  // Parse diff lines into classified HTML
  const diffLines = (docChange.diff || '').split('\n');
  const linesHTML = diffLines.map(line => {
    let cls = 'diff-context';
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-added';
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-removed';
    else if (line.startsWith('@@')) cls = 'diff-hunk';
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('new file')) cls = 'diff-meta';
    return `<div class="diff-line ${cls}">${escapeHTML(line)}</div>`;
  }).join('');

  const truncatedHTML = docChange.truncated
    ? '<div class="diff-truncated-notice">\u{26A0} Diff was truncated (file too large)</div>'
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="diff-modal-content">
      <div class="modal-header">
        <div class="modal-title" style="display: flex; align-items: center; gap: 8px;">
          ${escapeHTML(docChange.docName)}
          <span class="doc-change-badge ${badge}">${badge}</span>
        </div>
        <button class="modal-close">\u{2715}</button>
      </div>
      <div class="diff-modal-meta">
        <span class="diff-meta-path">${escapeHTML(docChange.docPath)}</span>
        <div class="diff-meta-stats">
          <span class="added">+${docChange.linesAdded || 0}</span>
          <span class="removed">-${docChange.linesRemoved || 0}</span>
        </div>
      </div>
      <div class="diff-modal-body">
        <div class="diff-content">${linesHTML}</div>
        ${truncatedHTML}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Show a specific agent's report (called from agent card click)
 */
async function showAgentReport(agentId) {
  // Switch filter to this agent
  const filter = document.getElementById('reports-agent-filter');
  if (filter) filter.value = agentId;

  // Load latest report for this agent
  const report = await window.electronAPI.getLatestReport(agentId);
  if (report) {
    // Make sure it's in our list
    if (!allReports.find(r => r.id === report.id)) {
      allReports.unshift(report);
    }
    selectedReportId = report.id;
    renderReportsList(agentId);
    renderReportDetail(report.id);
  } else {
    renderReportsList(agentId);
    document.getElementById('reports-detail').innerHTML = `
      <div class="reports-detail-empty">
        <div style="font-size: 28px; opacity: 0.3;">${AGENT_META[agentId]?.icon || '\u{2699}'}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">No reports yet for ${AGENT_META[agentId]?.name || agentId}</div>
      </div>
    `;
  }
}

// ── Helpers ──

function metricCard(label, value, type) {
  return `
    <div class="report-metric-card report-metric-${type}">
      <div class="report-metric-value">${value}</div>
      <div class="report-metric-label">${label}</div>
    </div>
  `;
}

function formatTime(timestamp) {
  if (!timestamp) return '--';

  let date;
  if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp._seconds) {
    // Firestore Admin SDK Timestamp object
    date = new Date(timestamp._seconds * 1000);
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

  if (isNaN(date.getTime())) return '--';

  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  let relative;
  if (mins < 1) relative = 'just now';
  else if (mins < 60) relative = `${mins}m ago`;
  else if (hrs < 24) relative = `${hrs}h ago`;
  else relative = `${days}d ago`;

  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return `${dateStr} ${timeStr} (${relative})`;
}

function escapeHTML(str) {
  if (!str) return '';
  const s = typeof str === 'string' ? str : JSON.stringify(str, null, 2);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateReportCount() {
  const el = document.getElementById('report-count');
  if (el) el.textContent = `${allReports.length} reports`;
}

// Expose globally for app.js
window.ReportsPanel = { init: initReportsPanel, load: loadReports, showAgent: showAgentReport };
