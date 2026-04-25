/* ============================================
   SearchPulse CRM — Chart Utilities (Chart.js)
   All charts use the royal-blue design system,
   DM Sans font, and robust canvas sizing.
   ============================================ */

// Chart instances registry — destroy before re-render to prevent leaks
const _chartInstances = {};

function destroyChart(id) {
  if (_chartInstances[id]) {
    try { _chartInstances[id].destroy(); } catch (_) {}
    delete _chartInstances[id];
  }
}

// ── Shared theme helpers ───────────────────────────────────────────────────
function _chartTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    isDark,
    gridColor:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    textColor:   isDark ? '#71717a' : '#71717a',
    bgCard:      isDark ? '#0d0d10' : '#ffffff',
    font: { family: "'DM Sans', 'Inter', system-ui, sans-serif", size: 11.5 },
  };
}

// Brand-aligned blue palette — first slot is always the accent blue
const CHART_PALETTE = [
  '#2563eb', // brand blue
  '#0ea5e9', // sky
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
  '#84cc16', // lime
];

// Shorten long labels to fit axis ticks — truncate at N chars
function _truncLabel(label, maxLen = 14) {
  if (!label) return '';
  return label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
}

// Shared tooltip style
function _tooltipPlugin(theme) {
  return {
    backgroundColor: theme.isDark ? '#18181b' : '#ffffff',
    titleColor:      theme.isDark ? '#fafafa' : '#18181b',
    bodyColor:       theme.isDark ? '#a1a1aa' : '#52525b',
    borderColor:     theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    padding: { x: 12, y: 8 },
    cornerRadius: 8,
    titleFont: { family: theme.font.family, size: 12, weight: '600' },
    bodyFont:  { family: theme.font.family, size: 11.5 },
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
  };
}

// ── Bar Chart ──────────────────────────────────────────────────────────────
function createBarChart(canvasId, labels, data, options = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Ensure parent has position:relative (Chart.js requirement)
  const parent = canvas.parentElement;
  if (parent) parent.style.position = 'relative';

  const theme = _chartTheme();
  const displayLabels = labels.map(l => _truncLabel(l, options.maxLabelLen || 13));

  // Colors: singleColor fills all bars one hue, otherwise rotate palette
  const bgColors = options.singleColor
    ? data.map(() => options.singleColor)
    : CHART_PALETTE.slice(0, data.length);

  const hoverColors = bgColors.map(c => c + 'cc');

  _chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        hoverBackgroundColor: hoverColors,
        borderRadius: { topLeft: 5, topRight: 5 },
        borderSkipped: 'bottom',
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: 'easeOutQuart' },
      onClick: options.onClickLabel ? (e, elements, chart) => {
        if (elements.length) {
          // pass original (non-truncated) label
          options.onClickLabel(labels[elements[0].index]);
        }
      } : undefined,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...(_tooltipPlugin(theme)),
          callbacks: {
            title: (items) => labels[items[0].dataIndex] || items[0].label,
            label: (ctx) => {
              const raw = ctx.raw;
              if (options.tooltipFormat) return ' ' + options.tooltipFormat(raw);
              return ' ' + (Number.isInteger(raw) ? raw.toLocaleString() : raw);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            maxRotation: 35,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: { color: theme.gridColor, lineWidth: 1 },
          border: { display: false, dash: [3, 3] },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            padding: 6,
            callback: (v) => options.yFormat ? options.yFormat(v) : (Number.isInteger(v) ? v : null),
            maxTicksLimit: 6,
          },
          beginAtZero: true,
        },
      },
    },
  });

  if (options.onClickLabel) canvas.style.cursor = 'pointer';
}

// ── Doughnut / Pie Chart ───────────────────────────────────────────────────
function createDoughnutChart(canvasId, labels, data, options = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (parent) parent.style.position = 'relative';

  const theme = _chartTheme();
  const colors = options.colors || CHART_PALETTE.slice(0, data.length);

  _chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        hoverBackgroundColor: colors.map(c => c + 'dd'),
        borderWidth: 3,
        borderColor: theme.bgCard,
        hoverBorderColor: theme.bgCard,
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: { animateRotate: true, duration: 500, easing: 'easeOutQuart' },
      onClick: options.onClickLabel ? (e, elements, chart) => {
        if (elements.length) options.onClickLabel(chart.data.labels[elements[0].index]);
      } : undefined,
      plugins: {
        legend: {
          display: options.showLegend !== false,
          position: options.legendPosition || 'bottom',
          labels: {
            color: theme.textColor,
            font: theme.font,
            padding: 14,
            usePointStyle: true,
            pointStyle: 'circle',
            pointStyleWidth: 7,
            boxHeight: 7,
            generateLabels: (chart) => {
              const ds = chart.data.datasets[0];
              const total = ds.data.reduce((a, b) => a + b, 0);
              return chart.data.labels.map((label, i) => ({
                text: `${_truncLabel(label, 16)}  ${total ? Math.round(ds.data[i] / total * 100) : 0}%`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: 'transparent',
                index: i,
                hidden: false,
              }));
            },
          },
        },
        tooltip: {
          ...(_tooltipPlugin(theme)),
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round(ctx.raw / total * 100) : 0;
              if (options.tooltipFormat) return ` ${ctx.label}: ${options.tooltipFormat(ctx.raw)} (${pct}%)`;
              return ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  if (options.onClickLabel) canvas.style.cursor = 'pointer';
}

// ── Line Chart ─────────────────────────────────────────────────────────────
function createLineChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (parent) parent.style.position = 'relative';

  const theme = _chartTheme();
  const palette = options.colors || CHART_PALETTE;

  _chartInstances[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => {
        const color = palette[i % palette.length];
        return {
          label: ds.label,
          data: ds.data,
          borderColor: color,
          // Subtle area fill — only first dataset, very transparent
          backgroundColor: i === 0
            ? color + '14'
            : 'transparent',
          fill: i === 0,
          tension: 0.42,
          borderWidth: 2,
          pointRadius: (ctx) => {
            // Only show points at non-zero values, hide zero clutter
            return ds.data[ctx.dataIndex] > 0 ? 3.5 : 0;
          },
          pointHoverRadius: 5.5,
          pointBackgroundColor: color,
          pointBorderColor: theme.bgCard,
          pointBorderWidth: 2,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: 'top',
          align: 'end',
          labels: {
            color: theme.textColor,
            font: theme.font,
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle',
            boxHeight: 6,
            pointStyleWidth: 6,
          },
        },
        tooltip: {
          ...(_tooltipPlugin(theme)),
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw;
              if (options.tooltipFormat) return ` ${ctx.dataset.label}: ${options.tooltipFormat(raw)}`;
              return ` ${ctx.dataset.label}: ${Number.isInteger(raw) ? raw.toLocaleString() : raw}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          grid: { color: theme.gridColor, lineWidth: 1 },
          border: { display: false, dash: [3, 3] },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            padding: 6,
            callback: (v) => options.yFormat ? options.yFormat(v) : (Number.isInteger(v) ? v : null),
            maxTicksLimit: 5,
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Horizontal Bar Chart ───────────────────────────────────────────────────
// Better for long category names (stages, sources, etc.)
function createHorizontalBarChart(canvasId, labels, data, options = {}) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (parent) parent.style.position = 'relative';

  const theme = _chartTheme();
  const bgColors = options.singleColor
    ? data.map(() => options.singleColor)
    : CHART_PALETTE.slice(0, data.length);

  _chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        hoverBackgroundColor: bgColors.map(c => c + 'cc'),
        borderRadius: { topRight: 5, bottomRight: 5 },
        borderSkipped: 'left',
        borderWidth: 0,
        barThickness: options.barThickness || 'flex',
        maxBarThickness: options.maxBarThickness || 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: 'easeOutQuart' },
      onClick: options.onClickLabel ? (e, elements, chart) => {
        if (elements.length) options.onClickLabel(chart.data.labels[elements[0].index]);
      } : undefined,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...(_tooltipPlugin(theme)),
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw;
              if (options.tooltipFormat) return ' ' + options.tooltipFormat(raw);
              return ' ' + (Number.isInteger(raw) ? raw.toLocaleString() : raw);
            },
          },
        },
      },
      scales: {
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            padding: 4,
          },
        },
        x: {
          grid: { color: theme.gridColor, lineWidth: 1 },
          border: { display: false },
          ticks: {
            color: theme.textColor,
            font: theme.font,
            padding: 4,
            callback: (v) => options.xFormat ? options.xFormat(v) : (Number.isInteger(v) ? v : null),
            maxTicksLimit: 6,
          },
          beginAtZero: true,
        },
      },
    },
  });

  if (options.onClickLabel) canvas.style.cursor = 'pointer';
}

// ── Utility: last N month labels ──────────────────────────────────────────
function getLastNMonthLabels(n) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const result = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(months[d.getMonth()] + ' \'' + d.getFullYear().toString().slice(2));
  }
  return result;
}

// ── Utility: count items by month ─────────────────────────────────────────
function countByMonth(items, dateField, n) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return items.filter(item => {
      if (!item[dateField]) return false;
      const itemDate = new Date(item[dateField]);
      return itemDate.getFullYear() === d.getFullYear() && itemDate.getMonth() === d.getMonth();
    }).length;
  });
}

// ── Safe chart init: wait for canvas to be in a painted layout ────────────
function initChart(fn) {
  // requestAnimationFrame fires after paint; double-RAF ensures layout is complete
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
