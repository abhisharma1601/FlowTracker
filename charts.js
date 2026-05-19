/**
 * charts.js — All chart rendering: heatmap, weekly chart, progress arcs
 * Uses Chart.js via CDN for bar/line charts, and custom canvas for heatmap.
 */

const Charts = (() => {

  let weeklyChartInstance = null;
  let activityChartInstance = null;

  // --- Weekly Productivity Bar Chart ---

  function renderWeeklyChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const sessions = Storage.getFocusSessions();
    const tickets = Storage.getTickets();

    // Build last 7 days labels and data
    const days = [];
    const focusData = [];
    const ticketData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateStr = d.toDateString();
      days.push(label);

      const dayFocus = sessions
        .filter(s => new Date(s.createdAt).toDateString() === dateStr && s.completed)
        .reduce((acc, s) => acc + (s.duration || 0), 0);
      focusData.push(+(dayFocus / 60).toFixed(1));

      const dayTickets = tickets.filter(t =>
        t.status === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === dateStr
      ).length;
      ticketData.push(dayTickets);
    }

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';

    if (weeklyChartInstance) weeklyChartInstance.destroy();

    weeklyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Focus Hours',
            data: focusData,
            backgroundColor: accent + 'cc',
            borderColor: accent,
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y',
          },
          {
            label: 'Tickets Done',
            data: ticketData,
            type: 'line',
            borderColor: '#10b981',
            backgroundColor: '#10b98133',
            pointBackgroundColor: '#10b981',
            fill: true,
            tension: 0.4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: '#334155',
            borderWidth: 1,
          },
        },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b22' }, title: { display: true, text: 'Hours', color: '#64748b' } },
          y1: { position: 'right', ticks: { color: '#64748b' }, grid: { display: false }, title: { display: true, text: 'Tickets', color: '#64748b' } },
        },
      },
    });
  }

  // --- Activity Heatmap (GitHub style) ---

  function renderHeatmap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const activity = Storage.getActivity();
    const tickets = Storage.getTickets();

    // Build a map of date -> count
    const countMap = {};

    activity.forEach(a => {
      const d = new Date(a.timestamp).toDateString();
      countMap[d] = (countMap[d] || 0) + 1;
    });

    tickets.filter(t => t.status === 'done' && t.completedAt).forEach(t => {
      const d = new Date(t.completedAt).toDateString();
      countMap[d] = (countMap[d] || 0) + 2;
    });

    // Generate last 52 weeks (364 days)
    const today = new Date();
    const cells = [];
    for (let i = 363; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      cells.push({ date: d, count: countMap[d.toDateString()] || 0 });
    }

    const levels = (count) => {
      if (count === 0) return 0;
      if (count <= 2) return 1;
      if (count <= 5) return 2;
      if (count <= 10) return 3;
      return 4;
    };

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';

    // Pad to start on Sunday
    const startDay = cells[0].date.getDay();
    const padded = Array(startDay).fill(null).concat(cells);

    // Group into weeks
    const weeks = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    // Month labels
    const monthLabels = {};
    cells.forEach((c, i) => {
      if (c.date.getDate() === 1) {
        const weekIdx = Math.floor((i + startDay) / 7);
        monthLabels[weekIdx] = c.date.toLocaleDateString('en-US', { month: 'short' });
      }
    });

    const colors = [
      'var(--surface-2)',
      accent + '44',
      accent + '88',
      accent + 'bb',
      accent,
    ];

    let html = '<div class="heatmap-wrapper"><div class="heatmap-months">';
    weeks.forEach((_, wi) => {
      html += `<span class="heatmap-month-label">${monthLabels[wi] || ''}</span>`;
    });
    html += '</div><div class="heatmap-grid">';

    weeks.forEach(week => {
      html += '<div class="heatmap-col">';
      week.forEach(cell => {
        if (!cell) {
          html += '<div class="heatmap-cell heatmap-empty"></div>';
        } else {
          const level = levels(cell.count);
          const dateStr = cell.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          html += `<div class="heatmap-cell" style="background:${colors[level]}" title="${dateStr}: ${cell.count} actions" data-count="${cell.count}" data-date="${dateStr}"></div>`;
        }
      });
      html += '</div>';
    });

    html += '</div></div>';
    html += `
      <div class="heatmap-legend">
        <span style="color:var(--text-muted)">Less</span>
        ${colors.map(c => `<div class="heatmap-cell" style="background:${c}"></div>`).join('')}
        <span style="color:var(--text-muted)">More</span>
      </div>
    `;

    container.innerHTML = html;
  }

  // --- Donut / Arc for project progress ---

  function renderDonut(canvasId, percent, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2;
    const r = size / 2 - 6;
    const start = -Math.PI / 2;
    const end = start + (2 * Math.PI * percent / 100);

    ctx.clearRect(0, 0, size, size);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Fill
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = color || '#6366f1';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `bold ${size / 5}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(percent)}%`, cx, cy);
  }

  // --- Stats Sparkline (mini line chart) ---

  function renderSparkline(canvasId, data, color = '#6366f1') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const max = Math.max(...data, 1);

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (v / max) * h * 0.9 - h * 0.05;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function destroyAll() {
    if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; }
    if (activityChartInstance) { activityChartInstance.destroy(); activityChartInstance = null; }
  }

  return { renderWeeklyChart, renderHeatmap, renderDonut, renderSparkline, destroyAll };
})();
