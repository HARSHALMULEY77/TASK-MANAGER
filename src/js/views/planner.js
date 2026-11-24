import { store, ROUTINE_CATEGORIES } from '../store.js';
import { escapeHtml, formatTime, todayStr, timeToMinutes } from '../utils.js';
import { icon } from '../icons.js';
import { openModal, closeModal, confirmAction, showToast } from '../components/modals.js';

const plannerState = {
  filterDay: 'Today', // Today | All | Everyday | Weekdays | Weekends | Mon..Sun
};

function openRoutineSlotModal(existing = null) {
  const isEdit = Boolean(existing);
  const slot = existing || {
    title: '',
    category: 'Study Session',
    startTime: '08:00',
    endTime: '09:00',
    dayScope: 'Everyday',
    notes: '',
  };
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Routine Block' : 'Add Routine Block',
    size: 'modal-sm',
    bodyHtml: `
      <form id="tf-rtn-form" novalidate>
        <div class="form-grid" style="grid-template-columns:1fr;">
          <div class="form-field">
            <label class="form-label" for="rtn-title">Activity Title *</label>
            <input id="rtn-title" class="input" type="text" value="${escapeHtml(slot.title)}" required placeholder="e.g., Coding Practice" />
            <div id="rtn-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field">
            <label class="form-label" for="rtn-cat">Routine Category</label>
            <select id="rtn-cat" class="select">
              ${ROUTINE_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}" ${slot.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-field">
              <label class="form-label" for="rtn-start">Start Time *</label>
              <input id="rtn-start" class="input" type="time" value="${escapeHtml(slot.startTime)}" required />
            </div>
            <div class="form-field">
              <label class="form-label" for="rtn-end">End Time *</label>
              <input id="rtn-end" class="input" type="time" value="${escapeHtml(slot.endTime)}" required />
            </div>
          </div>
          <div class="form-field">
            <label class="form-label" for="rtn-scope">Schedule Days</label>
            <select id="rtn-scope" class="select">
              ${['Everyday', 'Weekdays', 'Weekends', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                .map((d) => `<option value="${d}" ${slot.dayScope === d ? 'selected' : ''}>${d}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="rtn-notes">Notes</label>
            <textarea id="rtn-notes" class="textarea" rows="2">${escapeHtml(slot.notes)}</textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-rtn-form" class="btn btn-primary">${isEdit ? 'Save Block' : 'Add Block'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      panel.querySelector('#tf-rtn-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const title = panel.querySelector('#rtn-title').value.trim();
        const startTime = panel.querySelector('#rtn-start').value;
        const endTime = panel.querySelector('#rtn-end').value;
        const err = panel.querySelector('#rtn-err');
        err.style.display = 'none';

        if (!title || !startTime || !endTime) {
          err.textContent = 'Title, start time, and end time are required.';
          err.style.display = 'block';
          return;
        }
        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
          err.textContent = 'End time must be after start time.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const payload = {
          title,
          category: panel.querySelector('#rtn-cat').value,
          startTime,
          endTime,
          dayScope: panel.querySelector('#rtn-scope').value,
          notes: panel.querySelector('#rtn-notes').value.trim(),
        };
        if (isEdit) {
          store.updateRoutineSlot(existing.id, payload);
          showToast('Routine block updated', 'success');
        } else {
          store.addRoutineSlot(payload);
          showToast('Routine block added', 'success');
        }
        closeModal();
      });
    },
  });
}

export function renderPlannerView(container) {
  const s = store.getState();
  const now = new Date();
  const t0 = todayStr();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayName = dayNames[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const completedToday = s.routineCompletions[t0] || [];

  const filteredSlots = s.routineSlots.filter((slot) => {
    if (plannerState.filterDay === 'All') return true;
    if (plannerState.filterDay === 'Today') {
      if (slot.dayScope === 'Everyday') return true;
      if (slot.dayScope === 'Weekdays') return !isWeekend;
      if (slot.dayScope === 'Weekends') return isWeekend;
      return slot.dayScope === todayName;
    }
    return slot.dayScope === plannerState.filterDay;
  });

  // Detect overlapping time blocks in visible list
  const overlaps = new Set();
  for (let i = 0; i < filteredSlots.length - 1; i += 1) {
    const a = filteredSlots[i];
    const b = filteredSlots[i + 1];
    if (timeToMinutes(a.endTime) > timeToMinutes(b.startTime)) {
      overlaps.add(a.id);
      overlaps.add(b.id);
    }
  }

  const totalPlannedMins = filteredSlots.reduce(
    (sum, sl) => sum + Math.max(0, timeToMinutes(sl.endTime) - timeToMinutes(sl.startTime)),
    0
  );
  const doneCount = filteredSlots.filter((sl) => completedToday.includes(sl.id)).length;

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Daily Routine &amp; Timeline Planner</h2>
        <div class="meta-line" style="margin-top:2px;">
          <span>Today (${todayName}): <strong class="mono">${doneCount}/${filteredSlots.length}</strong> blocks completed</span>
          <span class="meta-sep">·</span>
          <span>Total planned: <strong class="mono">${Math.floor(totalPlannedMins / 60)}h ${totalPlannedMins % 60}m</strong></span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <select id="planner-day-filter" class="select" style="width:auto;">
          <option value="Today" ${plannerState.filterDay === 'Today' ? 'selected' : ''}>Showing: Today (${todayName})</option>
          <option value="All" ${plannerState.filterDay === 'All' ? 'selected' : ''}>Showing: All Blocks</option>
          ${['Everyday', 'Weekdays', 'Weekends', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            .map((d) => `<option value="${d}" ${plannerState.filterDay === d ? 'selected' : ''}>Scope: ${d}</option>`)
            .join('')}
        </select>
        <button type="button" class="btn btn-secondary" id="planner-template-btn">Load Balanced Template</button>
        <button type="button" class="btn btn-primary" id="planner-add-btn">${icon('plus', 15)} Add Time Slot</button>
      </div>
    </div>

    <div class="card">
      ${
        filteredSlots.length === 0
          ? `<div class="empty-state">
               <div class="empty-state-title">No routine time slots configured</div>
               <div class="empty-state-desc">Build your morning routine, college schedule, study sessions, coding practice, breaks, and evening review—or apply the balanced starter template.</div>
               <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
                 <button type="button" class="btn btn-secondary btn-sm" id="planner-empty-tpl">Apply Starter Routine</button>
                 <button type="button" class="btn btn-primary btn-sm" id="planner-empty-add">${icon('plus', 14)} Add Custom Slot</button>
               </div>
             </div>`
          : `<div class="timeline-list">
              ${filteredSlots
                .map((slot) => {
                  const done = completedToday.includes(slot.id);
                  const durMins = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
                  const hasOverlap = overlaps.has(slot.id);
                  return `
                    <div class="timeline-row ${done ? 'completed' : ''}">
                      <div class="timeline-time">
                        ${escapeHtml(formatTime(slot.startTime, s.settings.timeFormat))} – ${escapeHtml(formatTime(slot.endTime, s.settings.timeFormat))}
                        <div style="font-size:11.5px;color:var(--text-muted);font-weight:400;">${durMins} mins</div>
                      </div>
                      <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;">
                        <button type="button" class="task-checkbox ${done ? 'checked' : ''}" data-rtn-toggle="${slot.id}" aria-label="Mark routine slot completed today">
                          ${done ? icon('check', 13) : ''}
                        </button>
                        <div style="min-width:0;">
                          <div class="task-title ${done ? 'completed' : ''}">${escapeHtml(slot.title)}</div>
                          <div class="meta-line" style="margin-top:3px;">
                            <span>${escapeHtml(slot.category)}</span>
                            <span class="meta-sep">·</span>
                            <span>${escapeHtml(slot.dayScope)}</span>
                            ${hasOverlap ? `<span class="meta-sep">·</span><span class="tone-warning">Overlaps adjacent slot</span>` : ''}
                          </div>
                          ${slot.notes ? `<div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${escapeHtml(slot.notes)}</div>` : ''}
                        </div>
                      </div>
                      <div style="display:flex;gap:4px;">
                        <button type="button" class="btn-icon btn-icon-ghost" data-rtn-edit="${slot.id}" aria-label="Edit slot">${icon('edit', 14)}</button>
                        <button type="button" class="btn-icon btn-icon-ghost" data-rtn-del="${slot.id}" aria-label="Delete slot">${icon('trash', 14)}</button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
             </div>`
      }
    </div>
  `;

  container.querySelector('#planner-add-btn').addEventListener('click', () => openRoutineSlotModal());
  container.querySelector('#planner-empty-add')?.addEventListener('click', () => openRoutineSlotModal());
  container.querySelector('#planner-day-filter').addEventListener('change', (e) => {
    plannerState.filterDay = e.target.value;
    renderPlannerView(container);
  });

  const applyTpl = () => {
    if (s.routineSlots.length > 0) {
      confirmAction({
        title: 'Add Balanced Routine Template',
        message: 'Append the 8 standard student/developer daily routine blocks to your planner?',
        confirmLabel: 'Add Template Blocks',
        danger: false,
        onConfirm: () => {
          store.loadDefaultRoutineTemplate();
          showToast('Routine template added', 'success');
        },
      });
    } else {
      store.loadDefaultRoutineTemplate();
      showToast('Routine template added', 'success');
    }
  };
  container.querySelector('#planner-template-btn').addEventListener('click', applyTpl);
  container.querySelector('#planner-empty-tpl')?.addEventListener('click', applyTpl);

  container.querySelectorAll('[data-rtn-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleRoutineSlotCompletion(btn.getAttribute('data-rtn-toggle'), t0);
    });
  });

  container.querySelectorAll('[data-rtn-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = s.routineSlots.find((r) => r.id === btn.getAttribute('data-rtn-edit'));
      if (slot) openRoutineSlotModal(slot);
    });
  });

  container.querySelectorAll('[data-rtn-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-rtn-del');
      confirmAction({
        title: 'Delete Routine Slot',
        message: 'Remove this time slot from your daily routine?',
        confirmLabel: 'Delete Slot',
        onConfirm: () => {
          store.deleteRoutineSlot(id);
          showToast('Routine slot removed', 'info');
        },
      });
    });
  });
}
