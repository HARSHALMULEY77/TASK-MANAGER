import { store } from '../store.js';
import {
  escapeHtml,
  getGreeting,
  formatFullDisplayDate,
  formatLiveClock,
  formatDate,
  formatTime,
  formatRelativeTimestamp,
  getDeadlineMeta,
  todayStr,
  getDaysDiff,
} from '../utils.js';
import { icon } from '../icons.js';
import { renderTrendChartSvg, renderPriorityChart } from '../components/charts.js';
import { openTaskModal, confirmAction, showToast } from '../components/modals.js';

export function renderDashboard(container, { navigate }) {
  const s = store.getState();
  const analytics = store.getAnalytics(7);
  const now = new Date();
  const t0 = todayStr();
  const greeting = getGreeting(now);
  const userName = s.profile.name ? `, ${s.profile.name}` : '';

  // Upcoming Deadlines across Tasks, Assignments, Exams, Projects
  const upcomingDeadlines = [];
  s.tasks.forEach((t) => {
    if (t.status !== 'Completed' && t.dueDate) {
      upcomingDeadlines.push({
        type: 'Task',
        id: t.id,
        title: t.title,
        date: t.dueDate,
        time: t.deadlineTime,
        priority: t.priority,
        meta: getDeadlineMeta(t),
        route: 'tasks',
      });
    }
  });
  s.assignments.forEach((a) => {
    if (a.status !== 'Submitted' && a.status !== 'Graded' && a.dueDate) {
      const diff = getDaysDiff(a.dueDate, t0);
      upcomingDeadlines.push({
        type: 'Assignment',
        id: a.id,
        title: a.title,
        date: a.dueDate,
        time: '',
        priority: a.priority,
        meta: {
          label: diff < 0 ? `Overdue ${Math.abs(diff)}d` : diff === 0 ? 'Due today' : `Due in ${diff}d`,
          tone: diff < 0 ? 'danger' : diff <= 1 ? 'warning' : 'accent',
        },
        route: 'academic',
      });
    }
  });
  s.exams.forEach((ex) => {
    if (ex.examDate && getDaysDiff(ex.examDate, t0) >= -1) {
      const diff = getDaysDiff(ex.examDate, t0);
      upcomingDeadlines.push({
        type: 'Exam',
        id: ex.id,
        title: ex.name,
        date: ex.examDate,
        time: ex.examTime,
        priority: 'Critical',
        meta: {
          label: diff === 0 ? 'Exam today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`,
          tone: diff <= 2 ? 'warning' : 'accent',
        },
        route: 'academic',
      });
    }
  });
  s.projects.forEach((p) => {
    if (p.status !== 'Completed' && p.expectedEndDate) {
      const diff = getDaysDiff(p.expectedEndDate, t0);
      upcomingDeadlines.push({
        type: 'Project',
        id: p.id,
        title: p.title,
        date: p.expectedEndDate,
        time: '',
        priority: p.priority,
        meta: {
          label: diff < 0 ? `Past target (${Math.abs(diff)}d)` : diff === 0 ? 'Due today' : `In ${diff}d`,
          tone: diff < 0 ? 'danger' : diff <= 3 ? 'warning' : 'neutral',
        },
        route: 'projects',
      });
    }
  });
  upcomingDeadlines.sort((a, b) => a.date.localeCompare(b.date));

  // Today's Schedule (Routine blocks matching today + tasks/events due today)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDayName = dayNames[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const completedRoutineIds = s.routineCompletions[t0] || [];

  const todayRoutine = s.routineSlots.filter((slot) => {
    if (slot.dayScope === 'Everyday') return true;
    if (slot.dayScope === 'Weekdays') return !isWeekend;
    if (slot.dayScope === 'Weekends') return isWeekend;
    return slot.dayScope === todayDayName;
  });

  const todayEvents = s.calendarEvents.filter((ev) => ev.date === t0);
  const todayTasks = s.tasks.filter((t) => t.dueDate === t0 && t.status !== 'Completed');

  const sampleBanner = store.hasSampleData()
    ? `
      <div class="notice-banner">
        <div>
          <strong>Example workspace items are currently loaded.</strong>
          <span style="color:var(--text-muted);margin-left:6px;">Explore them freely or remove them whenever you are ready for a clean workspace.</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="dash-remove-sample">Remove Example Items</button>
      </div>
    `
    : '';

  container.innerHTML = `
    ${sampleBanner}

    <section class="hero-banner">
      <div>
        <h2 class="hero-greeting">${escapeHtml(greeting)}${escapeHtml(userName)}</h2>
        <div class="hero-date-row">
          <span>${escapeHtml(formatFullDisplayDate(now))}</span>
          <span class="meta-sep" aria-hidden="true">·</span>
          <span id="dash-live-clock" class="hero-clock">${escapeHtml(formatLiveClock(now, s.settings.timeFormat))}</span>
          ${
            s.profile.mainGoal
              ? `<span class="meta-sep" aria-hidden="true">·</span><span style="color:var(--text-muted);">Goal: ${escapeHtml(s.profile.mainGoal)}</span>`
              : ''
          }
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" id="dash-focus-btn">
          ${icon('focus', 15)} Focus Today
        </button>
        <button type="button" class="btn btn-primary" id="dash-quick-add">
          ${icon('plus', 15)} Quick Add Task
        </button>
      </div>
    </section>

    <section class="grid-kpis" aria-label="Task metrics">
      <div class="kpi-card">
        <span class="kpi-label">Total Tasks</span>
        <span class="kpi-value">${analytics.totalTasks}</span>
        <span class="kpi-meta">All tracked items</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Completed</span>
        <span class="kpi-value" style="color:var(--success);">${analytics.completedTasks}</span>
        <span class="kpi-meta">${analytics.totalTasks > 0 ? Math.round((analytics.completedTasks / analytics.totalTasks) * 100) : 0}% overall</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Pending</span>
        <span class="kpi-value">${analytics.pendingTasks}</span>
        <span class="kpi-meta">Active workload</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Overdue</span>
        <span class="kpi-value" style="color:${analytics.overdueTasks > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${analytics.overdueTasks}</span>
        <span class="kpi-meta">${analytics.overdueTasks > 0 ? 'Needs attention' : 'All caught up'}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Due Today</span>
        <span class="kpi-value" style="color:${analytics.dueTodayTasks > 0 ? 'var(--warning)' : 'var(--text-primary)'};">${analytics.dueTodayTasks}</span>
        <span class="kpi-meta">Scheduled for today</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Weekly Productivity</span>
        <span class="kpi-value" style="color:var(--accent);">${analytics.weeklyRate}%</span>
        <span class="kpi-meta">7-day completion rate</span>
      </div>
    </section>

    <section class="grid-dashboard-main">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">7-Day Productivity Trend</h3>
            <div class="card-subtitle">Created vs. completed tasks over the past 7 days</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="analytics">Full Analytics</button>
        </div>
        ${renderTrendChartSvg(analytics.trend, { height: 215 })}
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Priority Distribution</h3>
            <div class="card-subtitle">Breakdown across all saved tasks</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="tasks">View Tasks</button>
        </div>
        ${renderPriorityChart(analytics.priorityCounts)}
      </div>
    </section>

    <section class="grid-2" style="margin-bottom:18px;">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Upcoming Deadlines</h3>
            <div class="card-subtitle">Tasks, assignments, exams &amp; project targets</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="calendar">Calendar</button>
        </div>
        ${
          upcomingDeadlines.length === 0
            ? `<div class="empty-state" style="padding:24px 12px;">
                 <div class="empty-state-title">No upcoming deadlines</div>
                 <div class="empty-state-desc">Tasks, assignments, exams, and project targets with dates will appear here automatically.</div>
                 <button type="button" class="btn btn-secondary btn-sm" id="dash-empty-add-task">Add a Task</button>
               </div>`
            : `<div class="task-list">
                ${upcomingDeadlines
                  .slice(0, 6)
                  .map(
                    (item) => `
                  <div class="task-row" style="padding:10px 2px;">
                    <div style="min-width:0;flex:1;">
                      <div style="font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.title)}</div>
                      <div class="meta-line" style="margin-top:3px;">
                        <span>${escapeHtml(item.type)}</span>
                        <span class="meta-sep">·</span>
                        <span class="mono">${escapeHtml(formatDate(item.date, s.settings.dateFormat))}${item.time ? ' ' + escapeHtml(formatTime(item.time, s.settings.timeFormat)) : ''}</span>
                        <span class="meta-sep">·</span>
                        <span class="tone-${item.meta.tone}">${escapeHtml(item.meta.label)}</span>
                      </div>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" data-nav="${item.route}">Open</button>
                  </div>
                `
                  )
                  .join('')}
               </div>`
        }
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Today's Schedule</h3>
            <div class="card-subtitle">${escapeHtml(todayDayName)} routine slots, events &amp; due tasks</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="planner">Daily Planner</button>
        </div>
        ${
          todayRoutine.length === 0 && todayEvents.length === 0 && todayTasks.length === 0
            ? `<div class="empty-state" style="padding:24px 12px;">
                 <div class="empty-state-title">Your day is open</div>
                 <div class="empty-state-desc">Configure your daily routine or schedule tasks for today to see your timeline here.</div>
                 <button type="button" class="btn btn-secondary btn-sm" data-nav="planner">Set Up Routine</button>
               </div>`
            : `<div class="task-list">
                ${todayRoutine
                  .slice(0, 5)
                  .map((slot) => {
                    const done = completedRoutineIds.includes(slot.id);
                    return `
                      <div class="task-row" style="padding:9px 2px;">
                        <div class="task-row-left">
                          <button type="button" class="task-checkbox ${done ? 'checked' : ''}" data-dash-routine="${slot.id}" aria-label="Toggle routine slot">
                            ${done ? icon('check', 13) : ''}
                          </button>
                          <div style="min-width:0;">
                            <div class="task-title ${done ? 'completed' : ''}" style="font-size:13.5px;">${escapeHtml(slot.title)}</div>
                            <div class="meta-line">
                              <span class="mono">${escapeHtml(formatTime(slot.startTime, s.settings.timeFormat))} – ${escapeHtml(formatTime(slot.endTime, s.settings.timeFormat))}</span>
                              <span class="meta-sep">·</span>
                              <span>${escapeHtml(slot.category)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
                ${todayEvents
                  .map(
                    (ev) => `
                  <div class="task-row" style="padding:9px 2px;">
                    <div style="min-width:0;">
                      <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(ev.title)}</div>
                      <div class="meta-line">
                        <span>Event · ${escapeHtml(ev.category)}</span>
                        ${ev.time ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatTime(ev.time, s.settings.timeFormat))}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
                ${todayTasks
                  .slice(0, 4)
                  .map(
                    (t) => `
                  <div class="task-row" style="padding:9px 2px;">
                    <div class="task-row-left">
                      <button type="button" class="task-checkbox" data-dash-task-done="${t.id}" aria-label="Complete task"></button>
                      <div style="min-width:0;">
                        <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(t.title)}</div>
                        <div class="meta-line">
                          <span class="priority-text-${t.priority}">${escapeHtml(t.priority)}</span>
                          <span class="meta-sep">·</span>
                          <span>Task due today${t.deadlineTime ? ' at ' + escapeHtml(formatTime(t.deadlineTime, s.settings.timeFormat)) : ''}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
               </div>`
        }
      </div>
    </section>

    <section class="grid-2">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Project Progress</h3>
            <div class="card-subtitle">Completion computed from linked tasks &amp; milestones</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-nav="projects">All Projects</button>
        </div>
        ${
          s.projects.length === 0
            ? `<div class="empty-state" style="padding:24px 12px;">
                 <div class="empty-state-desc">No active projects yet. Create a project to track milestones and linked tasks.</div>
                 <button type="button" class="btn btn-secondary btn-sm" data-nav="projects">Go to Projects</button>
               </div>`
            : s.projects
                .slice(0, 5)
                .map((p) => {
                  const st = store.getProjectStats(p.id);
                  return `
                    <div style="margin-bottom:14px;">
                      <div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:5px;font-size:13.5px;">
                        <span style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.title)}</span>
                        <span class="mono" style="font-size:12.5px;color:var(--accent);">${st.progress}%</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill ${st.progress === 100 ? 'success' : ''}" style="width:${st.progress}%"></div>
                      </div>
                      <div class="meta-line" style="margin-top:4px;font-size:12px;">
                        <span>${escapeHtml(p.status)}</span>
                        <span class="meta-sep">·</span>
                        <span>${st.completedTasks}/${st.totalTasks} tasks</span>
                        <span class="meta-sep">·</span>
                        <span>${st.completedMilestones}/${st.totalMilestones} milestones</span>
                      </div>
                    </div>
                  `;
                })
                .join('')
        }
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Recent Activity</h3>
            <div class="card-subtitle">Latest changes saved to your workspace</div>
          </div>
        </div>
        ${
          s.activities.length === 0
            ? `<div class="empty-state" style="padding:24px 12px;">
                 <div class="empty-state-desc">Your recent actions will appear here as you create and complete work.</div>
               </div>`
            : `<div class="task-list">
                ${s.activities
                  .slice(0, 7)
                  .map(
                    (act) => `
                  <div class="task-row" style="padding:9px 2px;">
                    <div style="min-width:0;flex:1;">
                      <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${escapeHtml(act.action)}</div>
                      <div style="font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(act.detail)}</div>
                    </div>
                    <span class="mono" style="font-size:11.5px;color:var(--text-muted);flex-shrink:0;">${escapeHtml(formatRelativeTimestamp(act.timestamp))}</span>
                  </div>
                `
                  )
                  .join('')}
               </div>`
        }
      </div>
    </section>
  `;

  container.querySelector('#dash-quick-add').addEventListener('click', () => openTaskModal());
  container.querySelector('#dash-focus-btn').addEventListener('click', () => navigate('focus'));
  container.querySelector('#dash-empty-add-task')?.addEventListener('click', () => openTaskModal());
  container.querySelector('#dash-remove-sample')?.addEventListener('click', () => {
    confirmAction({
      title: 'Remove Example Items',
      message: 'Remove all sample tasks, projects, subjects, assignments, and notes? Your own items will not be touched.',
      confirmLabel: 'Remove Examples',
      onConfirm: () => {
        store.removeSampleWorkspace();
        showToast('Example items removed', 'success');
      },
    });
  });

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navigate(el.getAttribute('data-nav')));
  });

  container.querySelectorAll('[data-dash-routine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleRoutineSlotCompletion(btn.getAttribute('data-dash-routine'), t0);
    });
  });

  container.querySelectorAll('[data-dash-task-done]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleTaskComplete(btn.getAttribute('data-dash-task-done'));
      showToast('Task marked completed', 'success');
    });
  });
}
