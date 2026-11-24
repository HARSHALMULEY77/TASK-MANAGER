import { store } from '../store.js';
import { escapeHtml, formatDate, formatDuration, pad2 } from '../utils.js';
import { icon } from '../icons.js';
import { openTaskModal, showToast } from '../components/modals.js';

// Persistent focus timer state across view switches
const timer = {
  activeTaskId: '',
  durationMinutes: 25,
  remainingSeconds: 25 * 60,
  running: false,
  intervalId: null,
  elapsedSeconds: 0,
  onTick: null,
};

function stopTimerInterval() {
  if (timer.intervalId) {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
  }
  timer.running = false;
}

export function renderFocusView(container) {
  const s = store.getState();
  const org = store.getSmartTaskOrganization();

  if (!timer.activeTaskId && org.focusToday.length > 0) {
    timer.activeTaskId = org.focusToday[0].task.id;
  }
  const activeTask = s.tasks.find((t) => t.id === timer.activeTaskId) || null;

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const sc = sec % 60;
    return `${pad2(m)}:${pad2(sc)}`;
  };

  const renderBucketList = (title, subtitle, items, emptyMsg) => `
    <div class="card">
      <div class="card-header" style="margin-bottom:10px;">
        <div>
          <h3 class="card-title">${escapeHtml(title)}</h3>
          <div class="card-subtitle">${escapeHtml(subtitle)}</div>
        </div>
        <span class="mono" style="font-size:13px;color:var(--text-muted);">${items.length}</span>
      </div>
      ${
        items.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">${escapeHtml(emptyMsg)}</div>`
          : `<div class="task-list">
              ${items
                .slice(0, 6)
                .map(
                  (t) => `
                <div class="task-row" style="padding:9px 2px;">
                  <div class="task-row-left">
                    <button type="button" class="task-checkbox" data-focus-done="${t.id}" aria-label="Complete task"></button>
                    <div style="min-width:0;">
                      <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(t.title)}</div>
                      <div class="meta-line">
                        <span class="priority-text-${t.priority}">${escapeHtml(t.priority)}</span>
                        ${t.dueDate ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatDate(t.dueDate, s.settings.dateFormat))}</span>` : ''}
                        <span class="meta-sep">·</span>
                        <span>${escapeHtml(t.status)}</span>
                      </div>
                    </div>
                  </div>
                  <button type="button" class="btn btn-ghost btn-sm" data-focus-edit="${t.id}">Edit</button>
                </div>
              `
                )
                .join('')}
             </div>`
      }
    </div>
  `;

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Focus Today &amp; Priority Triage</h2>
        <div class="card-subtitle">Ranked deterministically by deadline proximity, priority, and task status without altering your saved settings</div>
      </div>
      <button type="button" class="btn btn-primary" id="focus-add-btn">${icon('plus', 15)} Add Task</button>
    </div>

    <section class="grid-dashboard-main" style="margin-bottom:18px;">
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Focus Today Queue</h3>
            <div class="card-subtitle">Most important tasks to tackle right now</div>
          </div>
          <span class="mono" style="font-size:12.5px;color:var(--accent);">${org.focusToday.length} prioritized</span>
        </div>
        ${
          org.focusToday.length === 0
            ? `<div class="empty-state">
                 <div class="empty-state-title">Nothing pending in your focus queue</div>
                 <div class="empty-state-desc">Add tasks to see them prioritized here automatically by urgency and deadlines.</div>
                 <button type="button" class="btn btn-primary btn-sm" id="focus-empty-add">Create First Task</button>
               </div>`
            : `<div class="task-list">
                ${org.focusToday
                  .map(
                    ({ task, reason }, idx) => `
                  <div class="task-row ${idx === 0 ? 'task-row-urgent' : ''}">
                    <div class="task-row-left">
                      <span class="mono" style="width:22px;color:var(--text-muted);font-size:12.5px;margin-top:3px;">${idx + 1}.</span>
                      <button type="button" class="task-checkbox" data-focus-done="${task.id}" aria-label="Mark completed"></button>
                      <div style="min-width:0;flex:1;">
                        <div class="task-title">${escapeHtml(task.title)}</div>
                        <div class="meta-line" style="margin-top:4px;">
                          <span class="tone-accent">${escapeHtml(reason)}</span>
                          <span class="meta-sep">·</span>
                          <span>${escapeHtml(task.category)}</span>
                          ${task.estimatedMinutes ? `<span class="meta-sep">·</span><span class="mono">Est. ${formatDuration(task.estimatedMinutes)}</span>` : ''}
                          ${task.actualMinutes ? `<span class="meta-sep">·</span><span class="mono">Logged ${formatDuration(task.actualMinutes)}</span>` : ''}
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                      <button type="button" class="btn btn-secondary btn-sm" data-focus-select="${task.id}">
                        ${timer.activeTaskId === task.id ? 'Selected' : 'Focus'}
                      </button>
                      <button type="button" class="btn-icon btn-icon-ghost" data-focus-edit="${task.id}" aria-label="Edit task">${icon('edit', 14)}</button>
                    </div>
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
            <h3 class="card-title">Focus Session Timer</h3>
            <div class="card-subtitle">Logs actual time spent directly to your selected task</div>
          </div>
        </div>
        <div class="focus-timer-box">
          <div style="width:100%;">
            <label class="form-label" for="focus-task-select" style="display:block;margin-bottom:6px;">Active Focus Task</label>
            <select id="focus-task-select" class="select">
              <option value="">-- Select a pending task --</option>
              ${org.allRanked
                .map(
                  ({ task }) =>
                    `<option value="${escapeHtml(task.id)}" ${timer.activeTaskId === task.id ? 'selected' : ''}>${escapeHtml(task.title)} (${escapeHtml(task.priority)})</option>`
                )
                .join('')}
            </select>
          </div>

          <div id="focus-timer-display" class="focus-timer-digits">${formatTimer(timer.remainingSeconds)}</div>
          <div style="font-size:12.5px;color:var(--text-muted);text-align:center;">
            ${activeTask ? `Tracking: ${escapeHtml(activeTask.title)} · Logged ${formatDuration(activeTask.actualMinutes)}` : 'Pick a task above to log focus minutes'}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button type="button" class="btn btn-primary" id="focus-start-pause">
              ${timer.running ? `${icon('pause', 15)} Pause` : `${icon('play', 15)} Start`}
            </button>
            <button type="button" class="btn btn-secondary" id="focus-reset-btn">
              ${icon('rotate', 15)} Reset
            </button>
            <button type="button" class="btn btn-secondary" id="focus-log-btn">
              Log Elapsed
            </button>
          </div>

          <div class="segmented" style="margin-top:4px;">
            ${[15, 25, 45, 60]
              .map(
                (mins) =>
                  `<button type="button" class="segmented-btn ${timer.durationMinutes === mins ? 'active' : ''}" data-timer-preset="${mins}">${mins}m</button>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </section>

    <section class="grid-3">
      ${renderBucketList('Overdue Tasks', 'Past their due date', org.overdue, 'No overdue tasks.')}
      ${renderBucketList('Critical / Urgent Tasks', 'Marked Critical priority', org.criticalUrgent, 'No critical tasks pending.')}
      ${renderBucketList('Approaching Deadlines', 'Due today or within 3 days', org.approaching, 'No deadlines within 3 days.')}
      ${renderBucketList('High-Priority Tasks', 'Marked High priority', org.highPriority, 'No high-priority tasks pending.')}
      ${renderBucketList('Tasks Without Deadlines', 'Assign dates to stay on track', org.noDeadline, 'All active tasks have due dates.')}
      ${renderBucketList('Incomplete (3+ Days Old)', 'Created 3+ days ago, not started or on hold', org.staleIncomplete, 'No stale incomplete tasks.')}
    </section>
  `;

  timer.onTick = () => {
    const disp = document.getElementById('focus-timer-display');
    if (disp) disp.textContent = formatTimer(timer.remainingSeconds);
  };

  container.querySelector('#focus-add-btn').addEventListener('click', () => openTaskModal());
  container.querySelector('#focus-empty-add')?.addEventListener('click', () => openTaskModal());

  container.querySelector('#focus-task-select').addEventListener('change', (e) => {
    timer.activeTaskId = e.target.value;
    renderFocusView(container);
  });

  container.querySelectorAll('[data-focus-select]').forEach((btn) => {
    btn.addEventListener('click', () => {
      timer.activeTaskId = btn.getAttribute('data-focus-select');
      renderFocusView(container);
    });
  });

  container.querySelectorAll('[data-timer-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopTimerInterval();
      timer.durationMinutes = Number(btn.getAttribute('data-timer-preset'));
      timer.remainingSeconds = timer.durationMinutes * 60;
      timer.elapsedSeconds = 0;
      renderFocusView(container);
    });
  });

  container.querySelector('#focus-start-pause').addEventListener('click', () => {
    if (timer.running) {
      stopTimerInterval();
      renderFocusView(container);
    } else {
      timer.running = true;
      timer.intervalId = setInterval(() => {
        if (timer.remainingSeconds > 0) {
          timer.remainingSeconds -= 1;
          timer.elapsedSeconds += 1;
          if (typeof timer.onTick === 'function') timer.onTick();
        } else {
          stopTimerInterval();
          const mins = Math.max(1, Math.round(timer.elapsedSeconds / 60) || timer.durationMinutes);
          if (timer.activeTaskId) {
            store.logTaskTime(timer.activeTaskId, mins);
            showToast(`Focus session complete! Logged ${mins}m.`, 'success');
          } else {
            showToast('Focus session timer finished!', 'success');
          }
          timer.elapsedSeconds = 0;
          timer.remainingSeconds = timer.durationMinutes * 60;
        }
      }, 1000);
      renderFocusView(container);
    }
  });

  container.querySelector('#focus-reset-btn').addEventListener('click', () => {
    stopTimerInterval();
    timer.remainingSeconds = timer.durationMinutes * 60;
    timer.elapsedSeconds = 0;
    renderFocusView(container);
  });

  container.querySelector('#focus-log-btn').addEventListener('click', () => {
    if (!timer.activeTaskId) {
      showToast('Select a task first to log focus time.', 'warning');
      return;
    }
    const mins = Math.max(1, Math.round(timer.elapsedSeconds / 60) || timer.durationMinutes);
    stopTimerInterval();
    store.logTaskTime(timer.activeTaskId, mins);
    timer.elapsedSeconds = 0;
    timer.remainingSeconds = timer.durationMinutes * 60;
    showToast(`Logged ${mins}m to task`, 'success');
  });

  container.querySelectorAll('[data-focus-done]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleTaskComplete(btn.getAttribute('data-focus-done'));
      showToast('Task completed', 'success');
    });
  });

  container.querySelectorAll('[data-focus-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = s.tasks.find((t) => t.id === btn.getAttribute('data-focus-edit'));
      if (task) openTaskModal(task);
    });
  });
}
