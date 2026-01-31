/* ═══════════════════════════════════════════════════════════
   HEALTH TRENDS PANEL - Chart.js line graphs over time
   ═══════════════════════════════════════════════════════════ */

let trendsChart = null;
let trendsData = { labels: [], tests: [], lint: [], vulns: [], bundle: [] };
let activeMetrics = { tests: true, lint: true, vulns: true, bundle: false };

const METRIC_CONFIG = {
  tests:  { label: 'Tests Passing', color: '#22c55e', key: 'tests' },
  lint:   { label: 'Lint Warnings', color: '#eab308', key: 'lint' },
  vulns:  { label: 'Vulnerabilities', color: '#ef4444', key: 'vulns' },
  bundle: { label: 'Bundle (KB)', color: '#a855f7', key: 'bundle' },
};

/**
 * Initialize the Health Trends panel
 */
function initHealthTrends() {
  const body = document.getElementById('trends-body');

  body.innerHTML = `
    <div class="trends-toggles" id="trends-toggles"></div>
    <div class="trends-chart-wrap">
      <canvas id="trends-canvas"></canvas>
    </div>
  `;

  renderToggles();
  loadTrendsData();
}

/**
 * Render metric toggle buttons
 */
function renderToggles() {
  const container = document.getElementById('trends-toggles');

  container.innerHTML = Object.entries(METRIC_CONFIG).map(([key, cfg]) => {
    const active = activeMetrics[key];
    return `
      <button class="trends-toggle ${active ? 'active' : ''}" data-metric="${key}" style="
        --toggle-color: ${cfg.color};
        ${active ? `border-color: ${cfg.color}; color: ${cfg.color}; background: ${cfg.color}15;` : ''}
      ">
        <span class="trends-toggle-dot" style="background: ${active ? cfg.color : '#64748b'};"></span>
        ${cfg.label}
      </button>
    `;
  }).join('');

  container.querySelectorAll('.trends-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const metric = btn.dataset.metric;
      activeMetrics[metric] = !activeMetrics[metric];
      renderToggles();
      updateChart();
    });
  });
}

/**
 * Load report data and extract time-series metrics
 */
async function loadTrendsData() {
  try {
    // Get all health-related reports (mainly daily-health and full-audit have metrics)
    const reports = await window.electronAPI.getReports({ limit: 100 });

    // Filter reports that have metrics with test data
    const withMetrics = reports
      .filter(r => r.metrics && (r.metrics.tests || r.metrics.lint || r.metrics.vulnerabilities))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // oldest first

    if (withMetrics.length === 0) {
      showNoData();
      return;
    }

    // Extract time series
    trendsData.labels = [];
    trendsData.tests = [];
    trendsData.lint = [];
    trendsData.vulns = [];
    trendsData.bundle = [];

    for (const report of withMetrics) {
      const date = new Date(report.timestamp);
      trendsData.labels.push(window.ChartUtils.formatDateLabel(report.timestamp));

      // Tests
      if (report.metrics.tests) {
        trendsData.tests.push(report.metrics.tests.passing || 0);
      } else {
        trendsData.tests.push(null);
      }

      // Lint
      if (report.metrics.lint) {
        trendsData.lint.push((report.metrics.lint.errors || 0) + (report.metrics.lint.warnings || 0));
      } else {
        trendsData.lint.push(null);
      }

      // Vulnerabilities
      if (report.metrics.vulnerabilities) {
        const v = report.metrics.vulnerabilities;
        trendsData.vulns.push((v.critical || 0) + (v.high || 0) + (v.moderate || 0));
      } else {
        trendsData.vulns.push(null);
      }

      // Bundle size (parse "2.4M" → 2400 KB)
      if (report.metrics.bundleSize) {
        trendsData.bundle.push(parseBundleSize(report.metrics.bundleSize));
      } else {
        trendsData.bundle.push(null);
      }
    }

    createChart();
  } catch (err) {
    console.error('[Trends] Load failed:', err);
    showNoData();
  }
}

/**
 * Create the Chart.js instance
 */
function createChart() {
  const canvas = document.getElementById('trends-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Destroy existing chart
  if (trendsChart) {
    trendsChart.destroy();
  }

  const datasets = [];

  if (activeMetrics.tests) {
    datasets.push(window.ChartUtils.createDataset(
      METRIC_CONFIG.tests.label, trendsData.tests, METRIC_CONFIG.tests.color
    ));
  }
  if (activeMetrics.lint) {
    datasets.push(window.ChartUtils.createDataset(
      METRIC_CONFIG.lint.label, trendsData.lint, METRIC_CONFIG.lint.color
    ));
  }
  if (activeMetrics.vulns) {
    datasets.push(window.ChartUtils.createDataset(
      METRIC_CONFIG.vulns.label, trendsData.vulns, METRIC_CONFIG.vulns.color
    ));
  }
  if (activeMetrics.bundle) {
    datasets.push(window.ChartUtils.createDataset(
      METRIC_CONFIG.bundle.label, trendsData.bundle, METRIC_CONFIG.bundle.color
    ));
  }

  const options = window.ChartUtils.getDefaultOptions();

  // Use multiple Y axes if tests (large numbers) and vulns (small numbers) are both visible
  if (activeMetrics.tests && (activeMetrics.lint || activeMetrics.vulns)) {
    options.scales.y.display = true;
    options.scales.y.position = 'left';
    options.scales.y.title = { display: true, text: 'Tests', color: '#22c55e', font: { size: 9, family: "'JetBrains Mono', monospace" } };

    options.scales.y2 = {
      ...options.scales.y,
      position: 'right',
      title: { display: true, text: 'Issues', color: '#eab308', font: { size: 9, family: "'JetBrains Mono', monospace" } },
      grid: { drawOnChartArea: false },
    };

    // Assign small-value metrics to y2
    datasets.forEach(ds => {
      if (ds.label !== METRIC_CONFIG.tests.label && ds.label !== METRIC_CONFIG.bundle.label) {
        ds.yAxisID = 'y2';
      } else {
        ds.yAxisID = 'y';
      }
    });
  }

  trendsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trendsData.labels,
      datasets,
    },
    options,
  });
}

/**
 * Update chart after toggling metrics
 */
function updateChart() {
  createChart();
}

/**
 * Show placeholder when no data
 */
function showNoData() {
  const body = document.getElementById('trends-body');
  body.innerHTML = `
    <div class="trends-toggles" id="trends-toggles"></div>
    <div class="panel-placeholder" style="flex:1;">
      <div style="font-size: 28px; opacity: 0.3;">\u{1F4C8}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Not enough data for trends</div>
      <div style="font-size: 10px; color: var(--text-muted); opacity: 0.5;">Charts appear after multiple agent runs</div>
    </div>
  `;
  renderToggles();
}

/**
 * Parse bundle size string to KB number
 */
function parseBundleSize(str) {
  if (!str) return null;
  const match = str.match(/([\d.]+)\s*(M|MB|K|KB|G|GB)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = (match[2] || 'K').toUpperCase();
  if (unit.startsWith('G')) return num * 1024 * 1024;
  if (unit.startsWith('M')) return num * 1024;
  return num;
}

// Expose globally
window.HealthTrendsPanel = { init: initHealthTrends, load: loadTrendsData };
