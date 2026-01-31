/* ══════════════════════════════════════════════════
   DOC REVIEW PANEL — AI-Assisted Interactive Review
   ══════════════════════════════════════════════════ */

const CATEGORY_LABELS = {
  placeholder:   { label: 'Placeholder',   color: '#f59e0b' },
  incorrect_ref: { label: 'Wrong Ref',     color: '#ef4444' },
  missing_info:  { label: 'Missing Info',  color: '#3b82f6' },
  outdated:      { label: 'Outdated',      color: '#a855f7' },
  inaccurate:    { label: 'Inaccurate',    color: '#ef4444' },
};

const PRIORITY_COLORS = {
  high:   { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  medium: { bg: 'rgba(234,179,8,0.15)', color: '#eab308', border: 'rgba(234,179,8,0.3)' },
  low:    { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
};

let allReviews = [];

// ── Init & Load ──

function initDocReview() {
  loadReviews();
}

let _lastLoadError = null;

async function loadReviews() {
  _lastLoadError = null;
  console.log('[DocReview] loadReviews() called...');
  try {
    const result = await Promise.race([
      window.electronAPI.getDocReviews(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout (5s)')), 5000))
    ]);
    console.log('[DocReview] Received:', result.length, 'reviews');
    if (result.length > 0) {
      console.log('[DocReview] First review:', JSON.stringify({ id: result[0].id, status: result[0].status, docName: result[0].docName, qCount: (result[0].questions || []).length }));
    }
    allReviews = result;
  } catch (err) {
    console.error('[DocReview] Load failed:', err);
    _lastLoadError = err.message || String(err);
    allReviews = [];
  }
  renderReviewList();
}

// ── Render ──

function renderReviewList() {
  const container = document.getElementById('review-panel-container');
  const body = document.getElementById('reviews-body');
  if (!container || !body) return;

  const active = allReviews.filter(r => r.status === 'pending' || r.status === 'answered');
  const applied = allReviews.filter(r => r.status === 'applied');

  // Show/hide entire panel
  container.style.display = (active.length > 0 || applied.length > 0) ? 'block' : 'none';

  // Update count badge
  const countEl = document.getElementById('review-count');
  if (countEl) {
    const totalQs = active.reduce((s, r) => s + (r.questions || []).length, 0);
    countEl.textContent = active.length > 0
      ? `${active.length} doc(s), ${totalQs} question(s)`
      : `${applied.length} completed`;
  }

  if (active.length === 0 && applied.length === 0) {
    const debugInfo = _lastLoadError
      ? `<div style="font-size:9px;color:#ef4444;margin-top:6px;">Error: ${esc(_lastLoadError)}</div>`
      : `<div style="font-size:9px;color:var(--text-muted);opacity:0.4;margin-top:6px;">IPC returned ${allReviews.length} doc(s), 0 active</div>`;
    body.innerHTML = `
      <div class="panel-placeholder" style="padding: 30px 0; text-align: center;">
        <div style="font-size: 24px; opacity: 0.3;">&#x1F4DD;</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">No doc reviews pending</div>
        <div style="font-size: 10px; color: var(--text-muted); opacity: 0.5; margin-top: 4px;">Run documentalist in "review" mode to generate</div>
        ${debugInfo}
      </div>`;
    return;
  }

  let html = '<div class="review-list">';

  // Active reviews first
  for (const review of active) {
    html += renderReviewCard(review);
  }

  // Completed reviews (collapsed summary)
  if (applied.length > 0) {
    html += `<div class="review-applied-summary">
      <span style="color: var(--success); font-size: 10px;">&#x2713; ${applied.length} review(s) applied</span>
    </div>`;
  }

  html += '</div>';
  body.innerHTML = html;
  wireReviewEvents();
}

function renderReviewCard(review) {
  const p = PRIORITY_COLORS[review.priority] || PRIORITY_COLORS.medium;
  const questions = review.questions || [];
  const answeredCount = questions.filter(q => q.answer && q.answer.trim()).length;
  const totalCount = questions.length;

  return `
    <div class="review-card" data-review-id="${review.id}">
      <div class="review-card-header" data-toggle="${review.id}">
        <div class="review-card-left">
          <span class="review-doc-icon">&#x1F4C4;</span>
          <span class="review-doc-name">${esc(review.docName)}</span>
          <span class="badge" style="background:${p.bg};color:${p.color};border:1px solid ${p.border};font-size:9px;padding:1px 6px;">${review.priority}</span>
        </div>
        <div class="review-card-right">
          <span class="review-progress">${answeredCount}/${totalCount}</span>
          <span class="review-expand-icon" id="expand-${review.id}">&#x25B6;</span>
        </div>
      </div>
      <div class="review-card-body" id="review-body-${review.id}" style="display:none;">
        ${questions.map(q => renderQuestion(review.id, q)).join('')}
        <div class="review-card-actions">
          <button class="btn btn-sm review-btn-skip" data-skip="${review.id}">Skip Doc</button>
          <button class="btn btn-sm review-btn-accept" data-accept-all="${review.id}" title="Accept all AI suggestions">Accept Suggestions</button>
          <button class="btn btn-sm btn-primary review-btn-submit" data-submit="${review.id}" ${answeredCount === totalCount ? '' : 'disabled'}>Submit Answers</button>
        </div>
      </div>
    </div>`;
}

function renderQuestion(reviewId, q) {
  const cat = CATEGORY_LABELS[q.category] || { label: q.category, color: '#64748b' };
  const hasAnswer = q.answer && q.answer.trim();

  return `
    <div class="review-question ${hasAnswer ? 'review-q-answered' : ''}" data-question-id="${q.id}">
      <div class="review-q-header">
        <span class="review-q-badge" style="color:${cat.color};border-color:${cat.color}40;background:${cat.color}15;">${cat.label}</span>
        ${q.lineRef ? `<span class="review-q-line">Line ${esc(q.lineRef)}</span>` : ''}
      </div>
      <div class="review-q-text">${esc(q.question)}</div>
      ${q.currentValue ? `<div class="review-q-current">Current: <code>${esc(q.currentValue)}</code></div>` : ''}
      <input type="text"
        class="modal-input review-q-input"
        data-review="${reviewId}"
        data-qid="${q.id}"
        placeholder="${q.suggestion ? esc(q.suggestion) : 'Type your answer...'}"
        value="${hasAnswer ? esc(q.answer) : ''}"
      />
      ${q.suggestion ? `<div class="review-q-suggestion" data-fill="${reviewId}" data-fill-qid="${q.id}" data-fill-val="${esc(q.suggestion)}">&#x2728; Use suggestion</div>` : ''}
    </div>`;
}

// ── Events ──

function wireReviewEvents() {
  // Expand/collapse
  document.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.dataset.toggle;
      const body = document.getElementById(`review-body-${id}`);
      const icon = document.getElementById(`expand-${id}`);
      if (!body) return;
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? 'block' : 'none';
      if (icon) icon.innerHTML = isHidden ? '&#x25BC;' : '&#x25B6;';
    });
  });

  // Input change → update submit button state
  document.querySelectorAll('.review-q-input').forEach(input => {
    input.addEventListener('input', () => {
      updateSubmitState(input.dataset.review);
    });
  });

  // "Use suggestion" links
  document.querySelectorAll('[data-fill]').forEach(link => {
    link.addEventListener('click', () => {
      const reviewId = link.dataset.fill;
      const qid = link.dataset.fillQid;
      const val = link.dataset.fillVal;
      const input = document.querySelector(`.review-q-input[data-review="${reviewId}"][data-qid="${qid}"]`);
      if (input) {
        input.value = val;
        input.dispatchEvent(new Event('input'));
      }
    });
  });

  // Accept all suggestions
  document.querySelectorAll('[data-accept-all]').forEach(btn => {
    btn.addEventListener('click', () => {
      const reviewId = btn.dataset.acceptAll;
      const card = document.querySelector(`[data-review-id="${reviewId}"]`);
      if (!card) return;
      card.querySelectorAll('.review-q-input').forEach(input => {
        if (!input.value.trim() && input.placeholder && input.placeholder !== 'Type your answer...') {
          input.value = input.placeholder;
        }
      });
      updateSubmitState(reviewId);
    });
  });

  // Submit answers
  document.querySelectorAll('[data-submit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.dataset.submit;
      const card = document.querySelector(`[data-review-id="${reviewId}"]`);
      if (!card) return;

      const inputs = card.querySelectorAll('.review-q-input');
      const answers = [...inputs].map(inp => ({
        id: inp.dataset.qid,
        answer: inp.value.trim(),
      }));

      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        await window.electronAPI.submitReviewAnswers(reviewId, answers);
        await loadReviews();
      } catch (err) {
        console.error('[DocReview] Submit failed:', err);
        btn.textContent = 'Submit Answers';
        btn.disabled = false;
      }
    });
  });

  // Skip doc
  document.querySelectorAll('[data-skip]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reviewId = btn.dataset.skip;
      btn.textContent = 'Skipping...';
      btn.disabled = true;
      try {
        await window.electronAPI.skipDocReview(reviewId);
        await loadReviews();
      } catch (err) {
        console.error('[DocReview] Skip failed:', err);
        btn.textContent = 'Skip Doc';
        btn.disabled = false;
      }
    });
  });

  // Collapse button
  const collapseBtn = document.getElementById('btn-collapse-reviews');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const container = document.getElementById('review-panel-container');
      if (container) container.style.display = 'none';
    });
  }
}

function updateSubmitState(reviewId) {
  const card = document.querySelector(`[data-review-id="${reviewId}"]`);
  if (!card) return;
  const inputs = card.querySelectorAll('.review-q-input');
  const allFilled = [...inputs].every(inp => inp.value.trim());
  const submitBtn = card.querySelector(`[data-submit="${reviewId}"]`);
  if (submitBtn) submitBtn.disabled = !allFilled;
}

// ── Utils ──

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Export ──

/**
 * Set reviews from external data (skip IPC) and render.
 */
function setReviewsAndRender(data) {
  allReviews = data || [];
  console.log('[DocReview] setReviewsAndRender:', allReviews.length, 'reviews, statuses:', allReviews.map(r => r.status));
  renderReviewList();
}

window.DocReviewPanel = {
  init: initDocReview,
  load: loadReviews,
  setData: setReviewsAndRender,
  getActiveCount: () => allReviews.filter(r => r.status === 'pending' || r.status === 'answered').length,
};
