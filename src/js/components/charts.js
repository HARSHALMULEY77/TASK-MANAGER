import { escapeHtml, formatShortDate } from '../utils.js';

export function renderTrendChartSvg(trend, { height = 210 } = {}) {
  if (!trend || trend.length === 0) {
    return '<div class="empty-state"><div class="empty-state-desc">No trend data available yet.</div></div>';
  }

  const width = 620;
  const padL = 36;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    4,
    ...trend.map((d) => Math.max(d.completed, d.created))
  );
  const yMax = Math.ceil(maxVal / 2) * 2;
  const barGroupW = plotW / trend.length;
  const barW = Math.min(18, Math.max(6, barGroupW * 0.34));

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padT + plotH * (1 - ratio);
      const val = Math.round(yMax * ratio);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="rgba(148,163,184,0.14)" stroke-width="1" />
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="11" font-family="JetBrains Mono, monospace">${val}</text>
      `;
    })
    .join('');

  const bars = trend
    .map((d, idx) => {
      const cx = padL + idx * barGroupW + barGroupW / 2;
      const hCreated = (d.created / yMax) * plotH;
      const hDone = (d.completed / yMax) * plotH;
      const yCreated = padT + plotH - hCreated;
      const yDone = padT + plotH - hDone;

      const showLabel =
        trend.length <= 10 || idx === 0 || idx === trend.length - 1 || idx % Math.ceil(trend.length / 7) === 0;
      const label = showLabel ? formatShortDate(d.dateStr) : '';

      return `
        <g>
          <title>${escapeHtml(formatShortDate(d.dateStr))}: ${d.completed} completed, ${d.created} created</title>
          <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${yCreated.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hCreated).toFixed(1)}" rx="3" fill="rgba(148,163,184,0.35)" />
          <rect x="${(cx + 1.5).toFixed(1)}" y="${yDone.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, hDone).toFixed(1)}" rx="3" fill="var(--accent)" />
          ${
            label
              ? `<text x="${cx.toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="var(--text-muted)" font-size="10.5" font-family="DM Sans, sans-serif">${escapeHtml(label)}</text>`
              : ''
          }
        </g>
      `;
    })
    .join('');

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Task creation and completion trend chart">
        ${gridLines}
        ${bars}
      </svg>
      <div class="chart-legend">
        <span><span class="legend-swatch" style="background: var(--accent)"></span>Completed Tasks</span>
        <span><span class="legend-swatch" style="background: rgba(148,163,184,0.45)"></span>Created Tasks</span>
      </div>
    </div>
  `;
}

export function renderPriorityChart(priorityCounts) {
  const entries = [
    { key: 'Critical', count: priorityCounts.Critical || 0, color: 'var(--danger)' },
    { key: 'High', count: priorityCounts.High || 0, color: 'var(--warning)' },
    { key: 'Medium', count: priorityCounts.Medium || 0, color: 'var(--info)' },
    { key: 'Low', count: priorityCounts.Low || 0, color: 'var(--text-muted)' },
  ];
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  if (total === 0) {
    return `
      <div class="empty-state" style="padding: 24px 12px;">
        <div class="empty-state-desc">Add tasks to see priority distribution.</div>
      </div>
    `;
  }

  // Build SVG donut
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = entries
    .filter((e) => e.count > 0)
    .map((e) => {
      const pct = e.count / total;
      const dash = pct * c;
      const seg = `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${e.color}" stroke-width="14" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 64 64)" />`;
      offset += dash;
      return seg;
    })
    .join('');

  const rows = entries
    .map((e) => {
      const pct = Math.round((e.count / total) * 100);
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border-hairline);">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <span style="width:9px;height:9px;border-radius:2px;background:${e.color};display:inline-block;"></span>
            <span>${e.key}</span>
          </div>
          <div class="mono" style="font-size:12.5px;color:var(--text-secondary);">${e.count} <span style="color:var(--text-muted)">(${pct}%)</span></div>
        </div>
      `;
    })
    .join('');

  return `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
      <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="Priority distribution donut chart">
        <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--bg-input)" stroke-width="14" />
        ${segments}
        <text x="64" y="61" text-anchor="middle" fill="var(--text-primary)" font-size="20" font-weight="700" font-family="JetBrains Mono, monospace">${total}</text>
        <text x="64" y="77" text-anchor="middle" fill="var(--text-muted)" font-size="11" font-family="DM Sans, sans-serif">tasks</text>
      </svg>
      <div style="flex:1;min-width:170px;">
        ${rows}
      </div>
    </div>
  `;
}

export function renderHorizontalBarBreakdown(items, emptyMessage = 'No data available yet.') {
  if (!items || items.length === 0) {
    return `<div class="empty-state" style="padding:24px 12px;"><div class="empty-state-desc">${escapeHtml(emptyMessage)}</div></div>`;
  }
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  return items
    .map((item) => {
      const pct = Math.round((item.value / maxVal) * 100);
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:5px;">
            <span style="color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.label)}</span>
            <span class="mono" style="color:var(--text-secondary);font-size:12.5px;flex-shrink:0;">${escapeHtml(item.displayValue)}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${item.tone || ''}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}
