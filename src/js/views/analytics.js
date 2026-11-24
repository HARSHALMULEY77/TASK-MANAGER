import { store } from '../store.js';
import { escapeHtml, formatDuration } from '../utils.js';
import {
  renderTrendChartSvg,
  renderPriorityChart,
  renderHorizontalBarBreakdown,
} from '../components/charts.js';

const analyticsState = {
  trendDays: 14, // 7 | 14 | 30
};

export function renderAnalyticsView(container) {
  const s = store.getState();
  const data = store.getAnalytics(analyticsState.trendDays);

  const categoryItems = Object.entries(data.categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label,
      value: count,
      displayValue: `${count} task${count === 1 ? '' : 's'}`,
    }));

  const studyItems = data.studyBySubject
    .filter((sub) => sub.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((sub) => ({
      label: sub.code ? `${sub.code} · ${sub.name}` : sub.name,
      value: sub.minutes,
      displayValue: formatDuration(sub.minutes),
      tone: 'success',
    }));

  const projectItems = s.projects.map((p) => {
    const st = store.getProjectStats(p.id);
    return {
      title: p.title,
      status: p.status,
      progress: st.progress,
      completedTasks: st.completedTasks,
      totalTasks: st.totalTasks,
      completedMilestones: st.completedMilestones,
      totalMilestones: st.totalMilestones,
    };
  });

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Productivity Analytics</h2>
        <div class="card-subtitle">All metrics computed live from your saved tasks, projects, and study sessions</div>
      </div>
      <div class="segmented" role="tablist">
        ${[7, 14, 30]
          .map(
            (d) =>
              `<button type="button" class="segmented-btn ${analyticsState.trendDays === d ? 'active' : ''}" data-an-days="${d}">${d} Days</button>`
          )
          .join('')}
      </div>
    </div>

    <section class="grid-kpis" style="margin-bottom:18px;">
      <div class="kpi-card">
        <span class="kpi-label">Daily Rate</span>
        <span class="kpi-value" style="color:var(--accent);">${data.dailyRate}%</span>
        <span class="kpi-meta">Today's completion rate</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Weekly Rate</span>
        <span class="kpi-value" style="color:var(--accent);">${data.weeklyRate}%</span>
        <span class="kpi-meta">Last 7 days</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Monthly Rate</span>
        <span class="kpi-value" style="color:var(--accent);">${data.monthlyRate}%</span>
        <span class="kpi-meta">Last 30 days</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Total Completed</span>
        <span class="kpi-value" style="color:var(--success);">${data.completedTasks}</span>
        <span class="kpi-meta">Completed tasks</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Pending Tasks</span>
        <span class="kpi-value">${data.pendingTasks}</span>
        <span class="kpi-meta">Remaining active</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Overdue Count</span>
        <span class="kpi-value" style="color:${data.overdueTasks > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${data.overdueTasks}</span>
        <span class="kpi-meta">Past deadline</span>
      </div>
    </section>

    <section class="grid-dashboard-main" style="margin-bottom:18px;">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">${analyticsState.trendDays}-Day Productivity Trend</h3>
            <div class="card-subtitle">Tasks created vs. tasks completed per day</div>
          </div>
        </div>
        ${renderTrendChartSvg(data.trend, { height: 230 })}
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Priority Breakdown</h3>
            <div class="card-subtitle">Task distribution by urgency level</div>
          </div>
        </div>
        ${renderPriorityChart(data.priorityCounts)}
      </div>
    </section>

    <section class="grid-2" style="margin-bottom:18px;">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Tasks by Category</h3>
            <div class="card-subtitle">Workload spread across life areas</div>
          </div>
        </div>
        ${renderHorizontalBarBreakdown(categoryItems, 'Create tasks to analyze category distribution.')}
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Study Time Statistics</h3>
            <div class="card-subtitle">Total logged: <strong class="mono">${formatDuration(data.totalStudyMinutes)}</strong> · This week: <strong class="mono">${formatDuration(data.weekStudyMinutes)}</strong></div>
          </div>
        </div>
        ${renderHorizontalBarBreakdown(studyItems, 'Log study sessions in Academic Manager to view subject hours.')}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Project Completion Statistics</h3>
          <div class="card-subtitle">${projectItems.length} project${projectItems.length === 1 ? '' : 's'} tracked</div>
        </div>
      </div>
      ${
        projectItems.length === 0
          ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-desc">No projects created yet.</div></div>`
          : `<div class="table-wrap">
              <table class="tf-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Status</th>
                    <th class="num">Tasks Completed</th>
                    <th class="num">Milestones</th>
                    <th class="num">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  ${projectItems
                    .map(
                      (p) => `
                    <tr>
                      <td style="font-weight:600;color:var(--text-primary);">${escapeHtml(p.title)}</td>
                      <td>${escapeHtml(p.status)}</td>
                      <td class="num">${p.completedTasks}/${p.totalTasks}</td>
                      <td class="num">${p.completedMilestones}/${p.totalMilestones}</td>
                      <td class="num" style="color:var(--accent);font-weight:600;">${p.progress}%</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
             </div>`
      }
    </section>
  `;

  container.querySelectorAll('[data-an-days]').forEach((btn) => {
    btn.addEventListener('click', () => {
      analyticsState.trendDays = Number(btn.getAttribute('data-an-days'));
      renderAnalyticsView(container);
    });
  });
}
