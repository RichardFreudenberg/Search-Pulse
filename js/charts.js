/* ============================================
   Nexus CRM — Chart Utilities (Chart.js)
   ============================================ */

// Chart instances registry — track so we can destroy before re-render
const _chartInstances = {};

function destroyChart(id) {
  if (_chartInstances[id]) {
    _chartInstances[id].destroy();
    delete _chartInstances[id];
  }
}

function createBarChart(canvasId, labels, data, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  const colors = options.colors || [
    '#5c7cfa','#339af0','#22b8cf','#20c997','#51cf66','#94d82d',
    '#fcc419','#ff922b','#f03e3e','#cc5de8','#da77f2','#748ffc',
    '#74c0fc','#63e6be'
  ];

  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: options.singleColor
          ? data.map(() => options.singleColor)
          : colors.slice(0, data.length),
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => options.tooltipFormat ? options.tooltipFormat(ctx.raw) : ctx.raw
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, maxRotation: 45 }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: v => options.yFormat ? options.yFormat(v) : v
          },
          beginAtZero: true
        }
      }
    }
  });
}

function createDoughnutChart(canvasId, labels, data, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  const defaultColors = options.colors || [
    '#5c7cfa','#20c997','#fcc419','#f03e3e','#cc5de8','#ff922b','#339af0','#51cf66'
  ];

  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: defaultColors.slice(0, data.length),
        borderWidth: 2,
        borderColor: isDark ? '#212529' : '#ffffff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round(ctx.raw / total * 100) : 0;
              return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function createLineChart(canvasId, labels, datasets, options = {}) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#9ca3af' : '#6b7280';

  const palette = ['#5c7cfa','#20c997','#fcc419','#f03e3e'];

  _chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '20',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { color: textColor, font: { size: 11 } }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 } }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: v => options.yFormat ? options.yFormat(v) : v
          },
          beginAtZero: true
        }
      }
    }
  });
}

// Generate last N months labels (e.g. ["Nov", "Dec", "Jan"])
function getLastNMonthLabels(n) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const result = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2));
  }
  return result;
}

// Count items by month (items must have a dateField in ISO format)
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
