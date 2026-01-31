/* ═══════════════════════════════════════════════════════════
   SECURITY ALERTS PANEL - Vulnerability/secret/pattern feed
   ═══════════════════════════════════════════════════════════ */

const SEVERITY_STYLES = {
  critical: { bg: 'var(--error-dim)', color: 'var(--error)', border: 'rgba(239,68,68,0.4)', label: 'CRITICAL' },
  high:     { bg: 'rgba(249,115,22,0.12)', color: '#f97316', border: 'rgba(249,115,22,0.3)', label: 'HIGH' },
  medium:   { bg: 'var(--warning-dim)', color: 'var(--warning)', border: 'rgba(234,179,8,0.3)', label: 'MEDIUM' },
};

const TYPE_ICONS = {
  vulnerability: '\u{1F41B}',
  secret: '\u{1F511}',
  pattern: '\u{26A0}',
};

let allAlerts = [];

/**
 * Initialize the Security Alerts panel
 */
function initSecurityPanel() {
  const body = document.getElementById('security-body');
  body.innerHTML = `<div class="alerts-list" id="alerts-list"></div>`;
  loadAlerts();
}

/**
 * Load alerts from Firestore
 */
async function loadAlerts() {
  try {
    allAlerts = await window.electronAPI.getAlerts({ acknowledged: false, limit: 50 });
    renderAlertsList();
    updateAlertBadge();
  } catch (err) {
    console.error('[Security] Load failed:', err);
  }
}

/**
 * Render alerts feed
 */
function renderAlertsList() {
  const list = document.getElementById('alerts-list');

  if (allAlerts.length === 0) {
    list.innerHTML = `
      <div class="panel-placeholder" style="padding: 30px 0;">
        <div style="font-size: 28px; opacity: 0.3;">\u{1F6E1}</div>
        <div style="font-size: 11px; color: var(--success); margin-top: 8px;">All Clear</div>
        <div style="font-size: 10px; color: var(--text-muted); opacity: 0.5;">No unacknowledged alerts</div>
      </div>
    `;
    return;
  }

  list.innerHTML = allAlerts.map(alert => {
    const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium;
    const icon = TYPE_ICONS[alert.type] || '\u{26A0}';
    const time = alert.detectedAt ? formatAlertTime(alert.detectedAt) : '';
    const isFixing = alert.fixAttempted && !alert.fixResolved;

    return `
      <div class="alert-item ${isFixing ? 'alert-fixing' : ''}" data-alert-id="${alert.id}">
        <div class="alert-item-top">
          <span class="alert-icon">${icon}</span>
          <span class="alert-title">${escapeAlertHTML(alert.title)}</span>
          <span class="badge" style="background:${sev.bg};color:${sev.color};border:1px solid ${sev.border};font-size:9px;">${sev.label}</span>
        </div>
        ${alert.details ? `<div class="alert-details">${escapeAlertHTML(alert.details)}</div>` : ''}
        ${isFixing ? '<div class="alert-fix-status">Fix dispatched — awaiting next scan to verify resolution</div>' : ''}
        <div class="alert-item-bottom">
          <span class="alert-type">${alert.type}</span>
          ${alert.file ? `<span class="alert-file">${escapeAlertHTML(alert.file)}</span>` : ''}
          ${alert.fixAvailable ? '<span class="badge badge-success" style="font-size:8px;">Fix Available</span>' : ''}
          ${alert.fixAvailable && !isFixing ? `<button class="btn btn-sm alert-fix-btn" data-fix="${alert.id}" data-title="${escapeAlertHTML(alert.title)}" style="color:var(--success);border-color:rgba(34,197,94,0.3);">\u{1F527} Fix</button>` : ''}
          <span class="alert-time">${time}</span>
          <button class="btn btn-sm alert-ack-btn" data-ack="${alert.id}" title="Dismiss manually">\u{2713} Ack</button>
        </div>
      </div>
    `;
  }).join('');

  // Wire acknowledge buttons
  list.querySelectorAll('.alert-ack-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const alertId = btn.dataset.ack;
      await window.electronAPI.acknowledgeAlert(alertId);
      await loadAlerts();
    });
  });

  // Wire fix buttons → trigger deps-updater + create task
  list.querySelectorAll('.alert-fix-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const alertId = btn.dataset.fix;
      const alertTitle = btn.dataset.title;

      btn.textContent = 'Dispatching...';
      btn.disabled = true;

      try {
        // 1. Trigger deps-updater agent via GitHub Actions
        const result = await window.electronAPI.triggerWorkflow('deps-updater');

        if (result.success) {
          // 2. Create a task to track the fix
          await window.electronAPI.createTask({
            title: `Fix: ${alertTitle}`,
            description: `Auto-triggered deps-updater to resolve this security alert. Dispatched via Fix button. Alert stays active until next security scan confirms resolution.`,
            priority: 'high',
            assignedAgent: 'deps-updater',
            status: 'running',
          });

          // 3. Mark alert as fix attempted (NOT acknowledged — stays visible)
          await window.electronAPI.updateAlert(alertId, { fixAttempted: true, fixDispatchedAt: new Date().toISOString() });

          btn.textContent = 'Dispatched!';
          btn.style.borderColor = 'var(--success)';

          // Show toast if available
          if (typeof showToast === 'function') {
            showToast('deps-updater dispatched to fix vulnerability', 'success');
          }

          // Refresh panels
          setTimeout(async () => {
            await loadAlerts();
            if (window.TaskQueuePanel) await window.TaskQueuePanel.load();
          }, 1500);
        } else {
          btn.textContent = 'Error';
          btn.style.color = 'var(--error)';
          btn.style.borderColor = 'rgba(239,68,68,0.3)';
          console.error('[Security] Fix dispatch failed:', result.error);
          if (typeof showToast === 'function') {
            showToast('Failed to dispatch fix — check GitHub connection', 'error');
          }
        }
      } catch (err) {
        btn.textContent = 'Error';
        console.error('[Security] Fix error:', err);
      }

      setTimeout(() => {
        btn.textContent = '\u{1F527} Fix';
        btn.disabled = false;
        btn.style.color = 'var(--success)';
        btn.style.borderColor = 'rgba(34,197,94,0.3)';
      }, 4000);
    });
  });
}

/**
 * Update the alert count badge in the panel header
 */
function updateAlertBadge() {
  const badge = document.getElementById('security-badge');
  if (!badge) return;

  const count = allAlerts.length;
  if (count === 0) {
    badge.className = 'badge badge-success';
    badge.textContent = '0 alerts';
  } else {
    const hasCritical = allAlerts.some(a => a.severity === 'critical');
    badge.className = hasCritical ? 'badge badge-error' : 'badge badge-warning';
    badge.textContent = `${count} alert${count !== 1 ? 's' : ''}`;
  }
}

function formatAlertTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeAlertHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Expose globally
window.SecurityPanel = { init: initSecurityPanel, load: loadAlerts };
