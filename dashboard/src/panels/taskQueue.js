/* ═══════════════════════════════════════════════════════════
   TASK QUEUE PANEL - Create, assign, and manage tasks
   ═══════════════════════════════════════════════════════════ */

const PRIORITY_COLORS = {
  critical: { bg: 'var(--error-dim)', color: 'var(--error)', border: 'rgba(239,68,68,0.3)' },
  high:     { bg: 'rgba(249,115,22,0.15)', color: '#f97316', border: 'rgba(249,115,22,0.3)' },
  medium:   { bg: 'var(--warning-dim)', color: 'var(--warning)', border: 'rgba(234,179,8,0.3)' },
  low:      { bg: 'var(--info-dim)', color: 'var(--info)', border: 'rgba(59,130,246,0.3)' },
};

const STATUS_ICONS = {
  pending: '\u{23F3}',
  running: '\u{26A1}',
  completed: '\u{2705}',
  failed: '\u{274C}',
};

let allTasks = [];

/**
 * Initialize the Task Queue panel
 */
function initTaskQueue() {
  const body = document.getElementById('tasks-body');
  body.innerHTML = `<div class="task-list" id="task-list"></div>`;

  // Wire up create task button
  document.getElementById('btn-create-task').addEventListener('click', showCreateTaskModal);

  loadTasks();
}

/**
 * Load tasks from Firestore
 */
async function loadTasks() {
  try {
    allTasks = await window.electronAPI.getTasks();
    renderTaskList();
  } catch (err) {
    console.error('[Tasks] Load failed:', err);
  }
}

/**
 * Render the task list
 */
function renderTaskList() {
  const list = document.getElementById('task-list');

  if (allTasks.length === 0) {
    list.innerHTML = `
      <div class="panel-placeholder" style="padding: 30px 0;">
        <div style="font-size: 24px; opacity: 0.3;">\u{1F4CB}</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">No tasks in queue</div>
        <div style="font-size: 10px; color: var(--text-muted); opacity: 0.5;">Click "+ Task" to create one</div>
      </div>
    `;
    return;
  }

  // Sort: pending first, then running, then completed
  const order = { running: 0, pending: 1, completed: 2, failed: 3 };
  const sorted = [...allTasks].sort((a, b) => (order[a.status] || 9) - (order[b.status] || 9));

  list.innerHTML = sorted.map(task => {
    const p = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
    const icon = STATUS_ICONS[task.status] || '\u{2022}';
    const isActive = task.status === 'pending' || task.status === 'running';
    const time = task.createdAt ? formatTaskTime(task.createdAt) : '';
    const agentLabel = task.assignedAgent || 'unassigned';

    return `
      <div class="task-item ${isActive ? '' : 'task-done'}" data-task-id="${task.id}">
        <div class="task-item-top">
          <span class="task-status-icon">${icon}</span>
          <span class="task-title">${escapeTaskHTML(task.title)}</span>
          <span class="badge" style="background:${p.bg};color:${p.color};border:1px solid ${p.border};font-size:9px;">${task.priority}</span>
        </div>
        ${task.description ? `<div class="task-desc">${escapeTaskHTML(task.description)}</div>` : ''}
        <div class="task-item-bottom">
          <span class="task-agent">${agentLabel}</span>
          <span class="task-time">${time}</span>
          ${isActive ? `<button class="btn btn-sm task-complete-btn" data-complete="${task.id}">\u{2713} Done</button>` : ''}
          <button class="btn btn-sm btn-danger task-delete-btn" data-delete="${task.id}" style="padding:2px 6px;">\u{2715}</button>
        </div>
      </div>
    `;
  }).join('');

  // Wire complete buttons
  list.querySelectorAll('.task-complete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.complete;
      await window.electronAPI.updateTask(taskId, { status: 'completed' });
      await loadTasks();
    });
  });

  // Wire delete buttons
  list.querySelectorAll('.task-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.delete;
      await window.electronAPI.deleteTask(taskId);
      await loadTasks();
    });
  });
}

/**
 * Show create task modal
 */
function showCreateTaskModal() {
  // Remove existing modal if any
  const existing = document.getElementById('task-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'task-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">Create Task</span>
        <button class="modal-close" id="modal-close">\u{2715}</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label>Title</label>
          <input type="text" id="task-input-title" placeholder="What needs to be done?" class="modal-input" />
        </div>
        <div class="modal-field">
          <label>Description</label>
          <textarea id="task-input-desc" placeholder="Details (optional)" class="modal-textarea" rows="3"></textarea>
        </div>
        <div class="modal-row">
          <div class="modal-field">
            <label>Priority</label>
            <select id="task-input-priority" class="modal-select">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="modal-field">
            <label>Assign Agent</label>
            <select id="task-input-agent" class="modal-select">
              <option value="">None</option>
              <option value="daily-health">Health Check</option>
              <option value="test-fixer">Test Fixer</option>
              <option value="deps-updater">Deps Updater</option>
              <option value="security-scanner">Security Scan</option>
              <option value="codebase-mapper">Codebase Mapper</option>
              <option value="full-audit">Full Audit</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-create">Create Task</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus title input
  setTimeout(() => document.getElementById('task-input-title').focus(), 100);

  // Close handlers
  document.getElementById('modal-close').addEventListener('click', () => overlay.remove());
  document.getElementById('modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Create handler
  document.getElementById('modal-create').addEventListener('click', async () => {
    const title = document.getElementById('task-input-title').value.trim();
    if (!title) return;

    const taskData = {
      title,
      description: document.getElementById('task-input-desc').value.trim(),
      priority: document.getElementById('task-input-priority').value,
      assignedAgent: document.getElementById('task-input-agent').value || null,
    };

    await window.electronAPI.createTask(taskData);
    overlay.remove();
    await loadTasks();
  });
}

function formatTaskTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeTaskHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Expose globally
window.TaskQueuePanel = { init: initTaskQueue, load: loadTasks };
