import { store } from '../store.js';
import {
  escapeHtml,
  todayStr,
  parseLocalDate,
  toDateStr,
  addDays,
  addMonths,
  getWeekDates,
  getMonthMatrix,
  formatDate,
  formatTime,
  getDaysDiff,
} from '../utils.js';
import { icon } from '../icons.js';
import {
  openTaskModal,
  openCalendarEventModal,
  confirmAction,
  showToast,
} from '../components/modals.js';

const calState = {
  mode: 'month', // month | week | day
  anchorDate: todayStr(),
  selectedDate: todayStr(),
};

function getCalendarItemsForDate(dateStr, s) {
  const items = [];
  const t0 = todayStr();

  // Tasks due on dateStr
  s.tasks.forEach((t) => {
    if (t.dueDate === dateStr) {
      const isOverdue = t.status !== 'Completed' && getDaysDiff(t.dueDate, t0) < 0;
      items.push({
        kind: 'Task',
        id: t.id,
        title: t.title,
        time: t.deadlineTime || '',
        priority: t.priority,
        completed: t.status === 'Completed',
        overdue: isOverdue,
        important: t.priority === 'Critical' || t.priority === 'High',
        raw: t,
      });
    }
  });

  // Assignments
  s.assignments.forEach((a) => {
    if (a.dueDate === dateStr) {
      const done = a.status === 'Submitted' || a.status === 'Graded';
      const isOverdue = !done && getDaysDiff(a.dueDate, t0) < 0;
      items.push({
        kind: 'Assignment',
        id: a.id,
        title: a.title,
        time: '',
        priority: a.priority,
        completed: done,
        overdue: isOverdue,
        important: true,
        raw: a,
      });
    }
  });

  // Exams
  s.exams.forEach((ex) => {
    if (ex.examDate === dateStr) {
      items.push({
        kind: 'Exam',
        id: ex.id,
        title: ex.name,
        time: ex.examTime || '',
        priority: 'Critical',
        completed: false,
        overdue: false,
        important: true,
        raw: ex,
      });
    }
  });

  // Project deadlines & milestones
  s.projects.forEach((p) => {
    if (p.expectedEndDate === dateStr) {
      items.push({
        kind: 'Project Deadline',
        id: p.id,
        title: p.title,
        time: '',
        priority: p.priority,
        completed: p.status === 'Completed',
        overdue: p.status !== 'Completed' && getDaysDiff(p.expectedEndDate, t0) < 0,
        important: true,
        raw: p,
      });
    }
    (p.milestones || []).forEach((m) => {
      if (m.dueDate === dateStr) {
        items.push({
          kind: 'Milestone',
          id: m.id,
          title: `${p.title}: ${m.title}`,
          time: '',
          priority: p.priority,
          completed: m.completed,
          overdue: !m.completed && getDaysDiff(m.dueDate, t0) < 0,
          important: false,
          raw: { project: p, milestone: m },
        });
      }
    });
  });

  // Personal Events
  s.calendarEvents.forEach((ev) => {
    if (ev.date === dateStr) {
      items.push({
        kind: `Event · ${ev.category}`,
        id: ev.id,
        title: ev.title,
        time: ev.time || '',
        priority: 'Medium',
        completed: false,
        overdue: false,
        important: ev.category === 'Academic' || ev.category === 'Milestone',
        isPersonalEvent: true,
        raw: ev,
      });
    }
  });

  return items.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

export function renderCalendarView(container) {
  const s = store.getState();
  const t0 = todayStr();
  const anchorDt = parseLocalDate(calState.anchorDate) || new Date();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let headerLabel = `${monthNames[anchorDt.getMonth()]} ${anchorDt.getFullYear()}`;
  if (calState.mode === 'week') {
    const wk = getWeekDates(calState.anchorDate);
    headerLabel = `${formatDate(wk[0], s.settings.dateFormat)} – ${formatDate(wk[6], s.settings.dateFormat)}`;
  } else if (calState.mode === 'day') {
    headerLabel = formatDate(calState.selectedDate, s.settings.dateFormat);
  }

  let calendarBody = '';

  if (calState.mode === 'month') {
    const matrix = getMonthMatrix(anchorDt.getFullYear(), anchorDt.getMonth());
    calendarBody = `
      <div class="cal-weekdays">
        ${weekdayNames.map((w) => `<div class="cal-weekday">${w}</div>`).join('')}
      </div>
      <div class="cal-grid">
        ${matrix
          .map((cell) => {
            const items = getCalendarItemsForDate(cell.dateStr, s);
            const isToday = cell.dateStr === t0;
            const isSelected = cell.dateStr === calState.selectedDate;
            const hasOverdue = items.some((i) => i.overdue);
            const hasImportant = items.some((i) => !i.completed && i.important);
            return `
              <button type="button" class="cal-cell ${cell.inCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-date="${cell.dateStr}">
                <div class="cal-day-num">
                  <span>${cell.dayNumber}</span>
                  ${hasOverdue ? `<span style="font-size:10px;color:var(--danger);">!</span>` : hasImportant ? `<span style="font-size:10px;color:var(--warning);">*</span>` : ''}
                </div>
                ${items
                  .slice(0, 3)
                  .map((it) => {
                    const cls = it.completed ? 'completed' : it.overdue ? 'overdue' : it.kind === 'Exam' ? 'exam' : '';
                    return `<div class="cal-item-line ${cls}">${escapeHtml(it.title)}</div>`;
                  })
                  .join('')}
                ${items.length > 3 ? `<div style="font-size:10.5px;color:var(--text-muted);">+${items.length - 3} more</div>` : ''}
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  } else if (calState.mode === 'week') {
    const wk = getWeekDates(calState.anchorDate);
    calendarBody = `
      <div class="week-grid">
        ${wk
          .map((dStr, idx) => {
            const items = getCalendarItemsForDate(dStr, s);
            const dt = parseLocalDate(dStr);
            const isToday = dStr === t0;
            const isSelected = dStr === calState.selectedDate;
            return `
              <div class="week-col ${isToday ? 'today' : ''}" style="${isSelected ? 'background:var(--accent-soft);' : ''}">
                <button type="button" data-cal-date="${dStr}" style="border:0;background:transparent;padding:0;text-align:left;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-hairline);padding-bottom:6px;">
                  <span style="font-size:12.5px;font-weight:600;color:var(--text-secondary);">${weekdayNames[idx]}</span>
                  <span class="mono" style="font-size:13px;font-weight:700;color:${isToday ? 'var(--accent)' : 'var(--text-primary)'};">${dt.getDate()}</span>
                </button>
                ${
                  items.length === 0
                    ? `<div style="font-size:12px;color:var(--text-muted);padding-top:8px;">Free day</div>`
                    : items
                        .map((it) => {
                          const cls = it.completed ? 'completed' : it.overdue ? 'overdue' : it.kind === 'Exam' ? 'exam' : '';
                          return `<div class="cal-item-line ${cls}" title="${escapeHtml(it.kind)}: ${escapeHtml(it.title)}">${it.time ? escapeHtml(formatTime(it.time, s.settings.timeFormat)) + ' · ' : ''}${escapeHtml(it.title)}</div>`;
                        })
                        .join('')
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else {
    const dayItems = getCalendarItemsForDate(calState.selectedDate, s);
    calendarBody = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:700;">Schedule for ${escapeHtml(formatDate(calState.selectedDate, s.settings.dateFormat))}</h3>
            <div class="card-subtitle">${dayItems.length} scheduled item${dayItems.length === 1 ? '' : 's'}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn btn-secondary btn-sm" id="cal-day-add-evt">+ Event</button>
            <button type="button" class="btn btn-primary btn-sm" id="cal-day-add-tsk">+ Task</button>
          </div>
        </div>
        ${
          dayItems.length === 0
            ? `<div class="empty-state">
                 <div class="empty-state-title">Nothing scheduled on this day</div>
                 <div class="empty-state-desc">Create a task or personal event for this date to organize your schedule.</div>
               </div>`
            : `<div class="task-list">
                ${dayItems
                  .map(
                    (it) => `
                  <div class="task-row">
                    <div style="min-width:0;flex:1;">
                      <div class="task-title ${it.completed ? 'completed' : ''}">${escapeHtml(it.title)}</div>
                      <div class="meta-line" style="margin-top:4px;">
                        <span>${escapeHtml(it.kind)}</span>
                        ${it.time ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatTime(it.time, s.settings.timeFormat))}</span>` : ''}
                        ${it.overdue ? `<span class="meta-sep">·</span><span class="tone-danger">Overdue</span>` : ''}
                        ${it.completed ? `<span class="meta-sep">·</span><span class="tone-success">Completed</span>` : ''}
                      </div>
                    </div>
                  </div>
                `
                  )
                  .join('')}
               </div>`
        }
      </div>
    `;
  }

  const selectedItems = getCalendarItemsForDate(calState.selectedDate, s);

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Calendar &amp; Deadlines</h2>
        <div class="card-subtitle">Synchronized with tasks, assignments, exams, project deadlines &amp; personal events</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="segmented" role="tablist">
          <button type="button" class="segmented-btn ${calState.mode === 'month' ? 'active' : ''}" data-cal-mode="month">Month</button>
          <button type="button" class="segmented-btn ${calState.mode === 'week' ? 'active' : ''}" data-cal-mode="week">Week</button>
          <button type="button" class="segmented-btn ${calState.mode === 'day' ? 'active' : ''}" data-cal-mode="day">Day</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="cal-today-btn">Today</button>
      </div>
    </div>

    <div class="calendar-layout">
      <div class="card">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="btn-icon" id="cal-prev-btn" aria-label="Previous period">${icon('chevronLeft', 16)}</button>
            <h3 class="card-title">${escapeHtml(headerLabel)}</h3>
            <button type="button" class="btn-icon" id="cal-next-btn" aria-label="Next period">${icon('chevronRight', 16)}</button>
          </div>
          <div class="meta-line" style="font-size:12px;">
            <span style="color:var(--accent);">Blue border: Today</span>
            <span class="meta-sep">·</span>
            <span style="color:var(--danger);">Red: Overdue</span>
            <span class="meta-sep">·</span>
            <span style="color:var(--warning);">Amber: Exam / Important</span>
          </div>
        </div>
        ${calendarBody}
      </div>

      <aside class="card" aria-label="Selected date schedule">
        <div class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(formatDate(calState.selectedDate, s.settings.dateFormat))}</h3>
            <div class="card-subtitle">${selectedItems.length} scheduled item${selectedItems.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="cal-side-add-task" style="flex:1;">${icon('plus', 14)} Task on Date</button>
          <button type="button" class="btn btn-secondary btn-sm" id="cal-side-add-event" style="flex:1;">${icon('plus', 14)} Personal Event</button>
        </div>

        ${
          selectedItems.length === 0
            ? `<div class="empty-state" style="padding:24px 8px;">
                 <div class="empty-state-desc">No deadlines or events on this date.</div>
               </div>`
            : `<div class="task-list">
                ${selectedItems
                  .map(
                    (it) => `
                  <div class="task-row" style="padding:10px 2px;">
                    <div style="min-width:0;flex:1;">
                      <div class="task-title ${it.completed ? 'completed' : ''}" style="font-size:13.5px;">${escapeHtml(it.title)}</div>
                      <div class="meta-line" style="margin-top:3px;">
                        <span>${escapeHtml(it.kind)}</span>
                        ${it.time ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatTime(it.time, s.settings.timeFormat))}</span>` : ''}
                        ${it.overdue ? `<span class="meta-sep">·</span><span class="tone-danger">Overdue</span>` : ''}
                        ${it.completed ? `<span class="meta-sep">·</span><span class="tone-success">Completed</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;">
                      ${
                        it.kind === 'Task'
                          ? `<button type="button" class="btn btn-ghost btn-sm" data-cal-toggle-task="${it.id}">${it.completed ? 'Reopen' : 'Done'}</button>`
                          : it.isPersonalEvent
                          ? `<button type="button" class="btn-icon btn-icon-ghost" data-cal-edit-evt="${it.id}" aria-label="Edit event">${icon('edit', 14)}</button>
                             <button type="button" class="btn-icon btn-icon-ghost" data-cal-del-evt="${it.id}" aria-label="Delete event">${icon('trash', 14)}</button>`
                          : ''
                      }
                    </div>
                  </div>
                `
                  )
                  .join('')}
               </div>`
        }
      </aside>
    </div>
  `;

  container.querySelectorAll('[data-cal-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calState.mode = btn.getAttribute('data-cal-mode');
      renderCalendarView(container);
    });
  });

  container.querySelector('#cal-today-btn').addEventListener('click', () => {
    calState.anchorDate = todayStr();
    calState.selectedDate = todayStr();
    renderCalendarView(container);
  });

  container.querySelector('#cal-prev-btn').addEventListener('click', () => {
    if (calState.mode === 'month') calState.anchorDate = addMonths(calState.anchorDate, -1);
    else if (calState.mode === 'week') calState.anchorDate = addDays(calState.anchorDate, -7);
    else {
      calState.selectedDate = addDays(calState.selectedDate, -1);
      calState.anchorDate = calState.selectedDate;
    }
    renderCalendarView(container);
  });

  container.querySelector('#cal-next-btn').addEventListener('click', () => {
    if (calState.mode === 'month') calState.anchorDate = addMonths(calState.anchorDate, 1);
    else if (calState.mode === 'week') calState.anchorDate = addDays(calState.anchorDate, 7);
    else {
      calState.selectedDate = addDays(calState.selectedDate, 1);
      calState.anchorDate = calState.selectedDate;
    }
    renderCalendarView(container);
  });

  container.querySelectorAll('[data-cal-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calState.selectedDate = btn.getAttribute('data-cal-date');
      calState.anchorDate = calState.selectedDate;
      renderCalendarView(container);
    });
  });

  const addTaskOnDate = () => openTaskModal(null, { dueDate: calState.selectedDate, startDate: calState.selectedDate });
  const addEventOnDate = () => openCalendarEventModal(null, calState.selectedDate);

  container.querySelector('#cal-side-add-task').addEventListener('click', addTaskOnDate);
  container.querySelector('#cal-side-add-event').addEventListener('click', addEventOnDate);
  container.querySelector('#cal-day-add-tsk')?.addEventListener('click', addTaskOnDate);
  container.querySelector('#cal-day-add-evt')?.addEventListener('click', addEventOnDate);

  container.querySelectorAll('[data-cal-toggle-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleTaskComplete(btn.getAttribute('data-cal-toggle-task'));
      showToast('Task status updated', 'success');
    });
  });

  container.querySelectorAll('[data-cal-edit-evt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ev = s.calendarEvents.find((e) => e.id === btn.getAttribute('data-cal-edit-evt'));
      if (ev) openCalendarEventModal(ev);
    });
  });

  container.querySelectorAll('[data-cal-del-evt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-cal-del-evt');
      confirmAction({
        title: 'Delete Event',
        message: 'Remove this personal event from your calendar?',
        confirmLabel: 'Delete Event',
        onConfirm: () => {
          store.deleteCalendarEvent(id);
          showToast('Event deleted', 'info');
        },
      });
    });
  });
}
