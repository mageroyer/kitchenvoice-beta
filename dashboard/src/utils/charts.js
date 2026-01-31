/* ═══════════════════════════════════════════════════════════
   CHART UTILITIES - Dark purple themed Chart.js helpers
   ═══════════════════════════════════════════════════════════ */

/**
 * Default chart options matching the dark purple theme
 */
function getDefaultOptions(title = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: 'easeOutQuart',
    },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: false, // We use custom toggle buttons
      },
      title: {
        display: !!title,
        text: title,
        color: '#94a3b8',
        font: { family: "'JetBrains Mono', monospace", size: 10, weight: '600' },
        padding: { bottom: 10 },
      },
      tooltip: {
        backgroundColor: '#1a1530',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(124, 58, 237, 0.3)',
        borderWidth: 1,
        cornerRadius: 6,
        padding: 8,
        titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: '600' },
        bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
        displayColors: true,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(124, 58, 237, 0.08)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          font: { family: "'JetBrains Mono', monospace", size: 9 },
          maxRotation: 0,
          maxTicksLimit: 8,
        },
        border: {
          display: false,
        },
      },
      y: {
        grid: {
          color: 'rgba(124, 58, 237, 0.08)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          font: { family: "'JetBrains Mono', monospace", size: 9 },
          maxTicksLimit: 5,
        },
        border: {
          display: false,
        },
        beginAtZero: true,
      },
    },
  };
}

/**
 * Create a styled dataset for a line chart
 */
function createDataset(label, data, color, options = {}) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + '15', // 8% opacity fill
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointBorderColor: '#0d0b1a',
    pointBorderWidth: 2,
    pointHoverBackgroundColor: color,
    pointHoverBorderColor: '#fff',
    fill: true,
    tension: 0.3, // Smooth curves
    hidden: options.hidden || false,
  };
}

/**
 * Format date labels for x-axis (short format)
 */
function formatDateLabel(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Expose globally
window.ChartUtils = { getDefaultOptions, createDataset, formatDateLabel };
