import { store } from '../store.js';
import { escapeHtml, uid, todayStr } from '../utils.js';
import { icon } from '../icons.js';

let modalRoot = null;
let toastRoot = null;

function ensureRoots() {
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'tf-modal-root';
    document.body.appendChild(modalRoot);
  }
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toast-container';
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }
}

export function showToast(message, tone = 'info') {
  ensureRoots();
  const el = document.createElement('div');
  el.className = 'toast';
  const colorMap = {
    success: 'var(--success)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    info: 'var(--accent)',
  };
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:8px;height:8px;border-radius:2px;background:${colorMap[tone] || colorMap.info};flex-shrink:0;"></span>
      <span>${escapeHtml(message)}</span>
    </div>
    <button class="btn-icon btn-icon-ghost" aria-label="Dismiss notification" style="width:26px;height:26px;min-height:26px;">
      ${icon('x', 14)}
    </button>
  `;
  const closeBtn = el.querySelector('button');
  const remove = () => {
    if (el.parentNode) el.remove();
  };
  closeBtn.addEventListener('click', remove);
  toastRoot.appendChild(el);
  setTimeout(remove, 3600);
}

export function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
}

export function openModal({ title, bodyHtml, footerHtml = '', size = '', onMount, preventBackdropClose = false }) {
  ensureRoots();
  modalRoot.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tf-modal-title">
      <div class="modal-panel ${size}">
        <div class="modal-header">
          <h2 id="tf-modal-title" class="modal-title">${escapeHtml(title)}</h2>
          <button type="button" class="btn-icon btn-icon-ghost" data-modal-close aria-label="Close modal">
            ${icon('x', 18)}
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;

  const backdrop = modalRoot.querySelector('.modal-backdrop');
  const closeBtn = modalRoot.querySelector('[data-modal-close]');
  closeBtn.addEventListener('click', closeModal);
  if (!preventBackdropClose) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });
  }
  const onEsc = (e) => {
    if (e.key === 'Escape' && !preventBackdropClose) {
      closeModal();
      document.removeEventListener('keydown', onEsc);
    }
  };
  document.addEventListener('keydown', onEsc);

  if (typeof onMount === 'function') {
    onMount(modalRoot.querySelector('.modal-panel'));
  }
}

export function confirmAction({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  openModal({
    title,
    size: 'modal-sm',
    bodyHtml: `<p style="margin:0;color:var(--text-secondary);line-height:1.55;">${escapeHtml(message)}</p>`,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      panel.querySelector('[data-confirm]').addEventListener('click', () => {
        closeModal();
        onConfirm();
      });
    },
  });
}

// Full Task Add/Edit Modal
export function openTaskModal(existingTask = null, preset = {}) {
  const s = store.getState();
  const isEdit = Boolean(existingTask);
  const task = existingTask || {
    title: preset.title || '',
    description: '',
    category: preset.category || s.settings.categories[0] || 'Personal',
    projectId: preset.projectId || '',
    startDate: preset.startDate || '',
    dueDate: preset.dueDate || '',
    deadlineTime: preset.deadlineTime || '',
    priority: preset.priority || s.settings.defaultPriority || 'Medium',
    status: preset.status || 'Not Started',
    estimatedMinutes: 30,
    actualMinutes: 0,
    subtasks: [],
    notes: '',
    tags: [],
    attachments: [],
    recurrence: 'None',
    reminderTiming: s.settings.defaultReminderTiming || '1d',
  };

  let subtasks = (task.subtasks || []).map((st) => ({ ...st }));
  let selectedTags = [...(task.tags || [])];
  let attachments = (task.attachments || []).map((a) => ({ ...a }));
  let submitting = false;

  const categoryOpts = s.settings.categories
    .map((c) => `<option value="${escapeHtml(c)}" ${task.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');

  const projectOpts = [
    '<option value="">No project (Standalone)</option>',
    ...s.projects.map(
      (p) => `<option value="${escapeHtml(p.id)}" ${task.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`
    ),
  ].join('');

  const bodyHtml = `
    <form id="tf-task-form" novalidate>
      <div class="form-grid">
        <div class="form-field full">
          <label class="form-label" for="tsk-title">Task Title *</label>
          <input id="tsk-title" class="input" type="text" required maxlength="160" value="${escapeHtml(task.title)}" placeholder="e.g., Complete Algorithms problem set 4" />
          <div id="tsk-title-err" class="form-error" style="display:none;"></div>
        </div>

        <div class="form-field full">
          <label class="form-label" for="tsk-desc">Detailed Description</label>
          <textarea id="tsk-desc" class="textarea" placeholder="Context, deliverables, acceptance criteria...">${escapeHtml(task.description)}</textarea>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-cat">Category</label>
          <select id="tsk-cat" class="select">${categoryOpts}</select>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-proj">Project</label>
          <select id="tsk-proj" class="select">${projectOpts}</select>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-priority">Priority</label>
          <select id="tsk-priority" class="select">
            ${['Critical', 'High', 'Medium', 'Low']
              .map((p) => `<option value="${p}" ${task.priority === p ? 'selected' : ''}>${p}</option>`)
              .join('')}
          </select>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-status">Status</label>
          <select id="tsk-status" class="select">
            ${['Not Started', 'In Progress', 'Completed', 'On Hold']
              .map((st) => `<option value="${st}" ${task.status === st ? 'selected' : ''}>${st}</option>`)
              .join('')}
          </select>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-start">Start Date</label>
          <input id="tsk-start" class="input" type="date" value="${escapeHtml(task.startDate)}" />
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-due">Due Date</label>
          <input id="tsk-due" class="input" type="date" value="${escapeHtml(task.dueDate)}" />
          <div id="tsk-date-err" class="form-error" style="display:none;"></div>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-time">Deadline Time</label>
          <input id="tsk-time" class="input" type="time" value="${escapeHtml(task.deadlineTime)}" />
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-recur">Recurring Schedule</label>
          <select id="tsk-recur" class="select">
            ${['None', 'Daily', 'Weekly', 'Monthly']
              .map((r) => `<option value="${r}" ${task.recurrence === r ? 'selected' : ''}>${r}</option>`)
              .join('')}
          </select>
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-est">Estimated Time (minutes)</label>
          <input id="tsk-est" class="input" type="number" min="0" max="10000" value="${Number(task.estimatedMinutes) || 0}" />
        </div>

        <div class="form-field">
          <label class="form-label" for="tsk-actual">Actual Time Spent (minutes)</label>
          <input id="tsk-actual" class="input" type="number" min="0" max="10000" value="${Number(task.actualMinutes) || 0}" />
        </div>

        <div class="form-field full">
          <label class="form-label" for="tsk-rem">Reminder Lead Time</label>
          <select id="tsk-rem" class="select">
            <option value="none" ${task.reminderTiming === 'none' ? 'selected' : ''}>No reminder</option>
            <option value="0d" ${task.reminderTiming === '0d' ? 'selected' : ''}>On the due date</option>
            <option value="1d" ${task.reminderTiming === '1d' ? 'selected' : ''}>One day before</option>
            <option value="3d" ${task.reminderTiming === '3d' ? 'selected' : ''}>Three days before</option>
            <option value="7d" ${task.reminderTiming === '7d' ? 'selected' : ''}>One week before</option>
          </select>
        </div>

        <div class="form-field full">
          <label class="form-label">Tags</label>
          <div id="tsk-tags-box" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input id="tsk-custom-tag" class="input" type="text" placeholder="Add custom tag..." style="flex:1;" />
            <button type="button" id="tsk-add-tag-btn" class="btn btn-secondary btn-sm">Add Tag</button>
          </div>
        </div>

        <div class="form-field full">
          <label class="form-label">Subtasks & Checklist</label>
          <div id="tsk-subtasks-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input id="tsk-new-sub" class="input" type="text" placeholder="Add subtask step..." style="flex:1;" />
            <button type="button" id="tsk-add-sub-btn" class="btn btn-secondary btn-sm">Add Step</button>
          </div>
        </div>

        <div class="form-field full">
          <label class="form-label">Attachment References (Links or File Names)</label>
          <div id="tsk-attach-list" style="display:flex;flex-direction:column;gap:6px;"></div>
          <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
            <input id="tsk-att-name" class="input" type="text" placeholder="Label / Filename (e.g., Syllabus.pdf)" style="flex:1;min-width:160px;" />
            <input id="tsk-att-url" class="input" type="text" placeholder="URL or local path reference (optional)" style="flex:1;min-width:160px;" />
            <button type="button" id="tsk-add-att-btn" class="btn btn-secondary btn-sm">Attach Ref</button>
          </div>
        </div>

        <div class="form-field full">
          <label class="form-label" for="tsk-notes">Personal Notes</label>
          <textarea id="tsk-notes" class="textarea" placeholder="Extra reminders, observations, or blockers...">${escapeHtml(task.notes)}</textarea>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Edit Task' : 'Create New Task',
    size: 'modal-lg',
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-task-form" class="btn btn-primary" id="tsk-save-btn">${isEdit ? 'Save Changes' : 'Create Task'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const form = panel.querySelector('#tf-task-form');
      const titleInput = panel.querySelector('#tsk-title');
      setTimeout(() => titleInput.focus(), 40);

      const renderTags = () => {
        const allTags = Array.from(new Set([...s.settings.tags, ...selectedTags]));
        const box = panel.querySelector('#tsk-tags-box');
        box.innerHTML = allTags
          .map((tg) => {
            const active = selectedTags.includes(tg);
            return `<button type="button" class="segmented-btn ${active ? 'active' : ''}" data-tag="${escapeHtml(tg)}" style="border:1px solid var(--border-hairline);">${escapeHtml(tg)}</button>`;
          })
          .join('');
        box.querySelectorAll('[data-tag]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-tag');
            if (selectedTags.includes(t)) selectedTags = selectedTags.filter((x) => x !== t);
            else selectedTags.push(t);
            renderTags();
          });
        });
      };

      const renderSubtasks = () => {
        const list = panel.querySelector('#tsk-subtasks-list');
        if (subtasks.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No subtasks added yet.</div>';
          return;
        }
        list.innerHTML = subtasks
          .map(
            (st, idx) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);">
            <input type="checkbox" ${st.done ? 'checked' : ''} data-sub-toggle="${idx}" />
            <span style="flex:1;font-size:13px;${st.done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${escapeHtml(st.text)}</span>
            <button type="button" class="btn-icon btn-icon-ghost" data-sub-del="${idx}" aria-label="Remove subtask" style="width:26px;height:26px;min-height:26px;">${icon('x', 13)}</button>
          </div>
        `
          )
          .join('');
        list.querySelectorAll('[data-sub-toggle]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const i = Number(cb.getAttribute('data-sub-toggle'));
            subtasks[i].done = cb.checked;
            renderSubtasks();
          });
        });
        list.querySelectorAll('[data-sub-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = Number(btn.getAttribute('data-sub-del'));
            subtasks.splice(i, 1);
            renderSubtasks();
          });
        });
      };

      const renderAttachments = () => {
        const list = panel.querySelector('#tsk-attach-list');
        if (attachments.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No attachment references added.</div>';
          return;
        }
        list.innerHTML = attachments
          .map(
            (att, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:13px;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(att.name)}${att.ref ? ` · <span style="color:var(--text-muted)">${escapeHtml(att.ref)}</span>` : ''}</span>
            <button type="button" class="btn-icon btn-icon-ghost" data-att-del="${idx}" aria-label="Remove attachment" style="width:26px;height:26px;min-height:26px;">${icon('x', 13)}</button>
          </div>
        `
          )
          .join('');
        list.querySelectorAll('[data-att-del]').forEach((btn) => {
          btn.addEventListener('click', () => {
            attachments.splice(Number(btn.getAttribute('data-att-del')), 1);
            renderAttachments();
          });
        });
      };

      renderTags();
      renderSubtasks();
      renderAttachments();

      panel.querySelector('#tsk-add-tag-btn').addEventListener('click', () => {
        const inp = panel.querySelector('#tsk-custom-tag');
        const val = inp.value.trim();
        if (!val) return;
        store.addTag(val);
        if (!selectedTags.includes(val)) selectedTags.push(val);
        inp.value = '';
        renderTags();
      });

      const addSub = () => {
        const inp = panel.querySelector('#tsk-new-sub');
        const val = inp.value.trim();
        if (!val) return;
        subtasks.push({ id: uid('st'), text: val, done: false });
        inp.value = '';
        renderSubtasks();
      };
      panel.querySelector('#tsk-add-sub-btn').addEventListener('click', addSub);
      panel.querySelector('#tsk-new-sub').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addSub();
        }
      });

      panel.querySelector('#tsk-add-att-btn').addEventListener('click', () => {
        const nameInp = panel.querySelector('#tsk-att-name');
        const refInp = panel.querySelector('#tsk-att-url');
        const name = nameInp.value.trim();
        const ref = refInp.value.trim();
        if (!name && !ref) return;
        attachments.push({ id: uid('att'), name: name || ref, ref });
        nameInp.value = '';
        refInp.value = '';
        renderAttachments();
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;

        const title = titleInput.value.trim();
        const startDate = panel.querySelector('#tsk-start').value;
        const dueDate = panel.querySelector('#tsk-due').value;
        const titleErr = panel.querySelector('#tsk-title-err');
        const dateErr = panel.querySelector('#tsk-date-err');
        titleErr.style.display = 'none';
        dateErr.style.display = 'none';

        if (!title) {
          titleErr.textContent = 'Please enter a task title.';
          titleErr.style.display = 'block';
          titleInput.focus();
          return;
        }

        if (startDate && dueDate && dueDate < startDate) {
          dateErr.textContent = 'Due date cannot be earlier than start date.';
          dateErr.style.display = 'block';
          return;
        }

        submitting = true;
        const payload = {
          title,
          description: panel.querySelector('#tsk-desc').value.trim(),
          category: panel.querySelector('#tsk-cat').value,
          projectId: panel.querySelector('#tsk-proj').value,
          priority: panel.querySelector('#tsk-priority').value,
          status: panel.querySelector('#tsk-status').value,
          startDate,
          dueDate,
          deadlineTime: panel.querySelector('#tsk-time').value,
          recurrence: panel.querySelector('#tsk-recur').value,
          estimatedMinutes: Number(panel.querySelector('#tsk-est').value) || 0,
          actualMinutes: Number(panel.querySelector('#tsk-actual').value) || 0,
          reminderTiming: panel.querySelector('#tsk-rem').value,
          tags: selectedTags,
          subtasks,
          attachments,
          notes: panel.querySelector('#tsk-notes').value.trim(),
        };

        if (isEdit) {
          store.updateTask(existingTask.id, payload);
          showToast('Task updated', 'success');
        } else {
          store.addTask(payload);
          showToast('Task created', 'success');
        }
        closeModal();
      });
    },
  });
}

// Quick Capture Modal (Task or Note from anywhere)
export function openQuickCaptureModal(defaultMode = 'task') {
  const s = store.getState();
  let mode = defaultMode;
  let submitting = false;

  const bodyHtml = `
    <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
      <div class="segmented" role="tablist">
        <button type="button" class="segmented-btn ${mode === 'task' ? 'active' : ''}" data-qc-mode="task">Quick Task</button>
        <button type="button" class="segmented-btn ${mode === 'note' ? 'active' : ''}" data-qc-mode="note">Quick Note</button>
      </div>
      <span style="font-size:12px;color:var(--text-muted);">Saves immediately to workspace</span>
    </div>
    <form id="tf-qc-form" novalidate>
      <div id="tf-qc-fields"></div>
    </form>
  `;

  openModal({
    title: 'Quick Capture',
    size: 'modal-sm',
    bodyHtml,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-qc-form" class="btn btn-primary" id="qc-submit-btn">Save</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const fieldsEl = panel.querySelector('#tf-qc-fields');
      const submitBtn = panel.querySelector('#qc-submit-btn');

      const renderFields = () => {
        if (mode === 'task') {
          submitBtn.textContent = 'Add Task';
          fieldsEl.innerHTML = `
            <div class="form-grid" style="grid-template-columns:1fr;">
              <div class="form-field">
                <label class="form-label" for="qc-task-title">Task Title *</label>
                <input id="qc-task-title" class="input" type="text" placeholder="What needs to get done?" required />
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-field">
                  <label class="form-label" for="qc-task-due">Due Date</label>
                  <input id="qc-task-due" class="input" type="date" value="${todayStr()}" />
                </div>
                <div class="form-field">
                  <label class="form-label" for="qc-task-pri">Priority</label>
                  <select id="qc-task-pri" class="select">
                    ${['Critical', 'High', 'Medium', 'Low']
                      .map((p) => `<option value="${p}" ${s.settings.defaultPriority === p ? 'selected' : ''}>${p}</option>`)
                      .join('')}
                  </select>
                </div>
              </div>
              <div class="form-field">
                <label class="form-label" for="qc-task-cat">Category</label>
                <select id="qc-task-cat" class="select">
                  ${s.settings.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                </select>
              </div>
              <div id="qc-err" class="form-error" style="display:none;"></div>
            </div>
          `;
          setTimeout(() => panel.querySelector('#qc-task-title')?.focus(), 30);
        } else {
          submitBtn.textContent = 'Save Note';
          fieldsEl.innerHTML = `
            <div class="form-grid" style="grid-template-columns:1fr;">
              <div class="form-field">
                <label class="form-label" for="qc-note-title">Note Title</label>
                <input id="qc-note-title" class="input" type="text" placeholder="Title or topic..." />
              </div>
              <div class="form-field">
                <label class="form-label" for="qc-note-cat">Category</label>
                <select id="qc-note-cat" class="select">
                  ${['Quick Note', 'Academic Note', 'Project Note', 'Idea', 'Important Info']
                    .map((c) => `<option value="${c}">${c}</option>`)
                    .join('')}
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="qc-note-body">Content *</label>
                <textarea id="qc-note-body" class="textarea" rows="4" placeholder="Write down an idea, formula, or reminder..." required></textarea>
              </div>
              <div id="qc-err" class="form-error" style="display:none;"></div>
            </div>
          `;
          setTimeout(() => panel.querySelector('#qc-note-title')?.focus(), 30);
        }
      };

      panel.querySelectorAll('[data-qc-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          mode = btn.getAttribute('data-qc-mode');
          panel.querySelectorAll('[data-qc-mode]').forEach((b) => b.classList.toggle('active', b === btn));
          renderFields();
        });
      });

      renderFields();

      panel.querySelector('#tf-qc-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const errEl = panel.querySelector('#qc-err');
        errEl.style.display = 'none';

        if (mode === 'task') {
          const title = panel.querySelector('#qc-task-title').value.trim();
          if (!title) {
            errEl.textContent = 'Please enter a task title.';
            errEl.style.display = 'block';
            return;
          }
          submitting = true;
          store.addTask({
            title,
            dueDate: panel.querySelector('#qc-task-due').value,
            priority: panel.querySelector('#qc-task-pri').value,
            category: panel.querySelector('#qc-task-cat').value,
          });
          showToast('Task added via Quick Capture', 'success');
          closeModal();
        } else {
          const title = panel.querySelector('#qc-note-title').value.trim();
          const content = panel.querySelector('#qc-note-body').value.trim();
          if (!content && !title) {
            errEl.textContent = 'Please enter note content or a title.';
            errEl.style.display = 'block';
            return;
          }
          submitting = true;
          store.addNote({
            title: title || 'Quick Note',
            content,
            category: panel.querySelector('#qc-note-cat').value,
          });
          showToast('Note saved via Quick Capture', 'success');
          closeModal();
        }
      });
    },
  });
}

// Project Add/Edit Modal
export function openProjectModal(existingProject = null) {
  const isEdit = Boolean(existingProject);
  const project = existingProject || {
    title: '',
    description: '',
    startDate: todayStr(),
    expectedEndDate: '',
    priority: 'Medium',
    status: 'Active',
    notes: '',
    milestones: [],
  };
  let milestones = (project.milestones || []).map((m) => ({ ...m }));
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Project' : 'Create Project',
    bodyHtml: `
      <form id="tf-project-form" novalidate>
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label" for="prj-title">Project Title *</label>
            <input id="prj-title" class="input" type="text" value="${escapeHtml(project.title)}" required placeholder="e.g., Final Year Capstone System" />
            <div id="prj-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field full">
            <label class="form-label" for="prj-desc">Description</label>
            <textarea id="prj-desc" class="textarea" placeholder="Scope, objectives, deliverables...">${escapeHtml(project.description)}</textarea>
          </div>
          <div class="form-field">
            <label class="form-label" for="prj-start">Start Date</label>
            <input id="prj-start" class="input" type="date" value="${escapeHtml(project.startDate)}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="prj-end">Expected Completion Date</label>
            <input id="prj-end" class="input" type="date" value="${escapeHtml(project.expectedEndDate)}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="prj-priority">Project Priority</label>
            <select id="prj-priority" class="select">
              ${['Critical', 'High', 'Medium', 'Low']
                .map((p) => `<option value="${p}" ${project.priority === p ? 'selected' : ''}>${p}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="prj-status">Current Status</label>
            <select id="prj-status" class="select">
              ${['Planning', 'Active', 'On Hold', 'Completed']
                .map((st) => `<option value="${st}" ${project.status === st ? 'selected' : ''}>${st}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-field full">
            <label class="form-label">Milestones</label>
            <div id="prj-milestones-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">
              <input id="prj-ms-title" class="input" type="text" placeholder="Milestone title..." style="flex:1;min-width:180px;" />
              <input id="prj-ms-date" class="input" type="date" style="width:150px;" />
              <button type="button" id="prj-add-ms" class="btn btn-secondary btn-sm">Add Milestone</button>
            </div>
          </div>
          <div class="form-field full">
            <label class="form-label" for="prj-notes">Project Notes</label>
            <textarea id="prj-notes" class="textarea" placeholder="Architecture notes, links, decisions...">${escapeHtml(project.notes)}</textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-project-form" class="btn btn-primary">${isEdit ? 'Save Project' : 'Create Project'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const renderMilestones = () => {
        const list = panel.querySelector('#prj-milestones-list');
        if (milestones.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No milestones added yet.</div>';
          return;
        }
        list.innerHTML = milestones
          .map(
            (m, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);">
            <input type="checkbox" ${m.completed ? 'checked' : ''} data-ms-tog="${i}" />
            <span style="flex:1;font-size:13px;">${escapeHtml(m.title)}</span>
            ${m.dueDate ? `<span class="mono" style="font-size:12px;color:var(--text-muted);">${escapeHtml(m.dueDate)}</span>` : ''}
            <button type="button" class="btn-icon btn-icon-ghost" data-ms-del="${i}" style="width:26px;height:26px;min-height:26px;">${icon('x', 13)}</button>
          </div>
        `
          )
          .join('');
        list.querySelectorAll('[data-ms-tog]').forEach((cb) => {
          cb.addEventListener('change', () => {
            milestones[Number(cb.getAttribute('data-ms-tog'))].completed = cb.checked;
          });
        });
        list.querySelectorAll('[data-ms-del]').forEach((b) => {
          b.addEventListener('click', () => {
            milestones.splice(Number(b.getAttribute('data-ms-del')), 1);
            renderMilestones();
          });
        });
      };
      renderMilestones();

      panel.querySelector('#prj-add-ms').addEventListener('click', () => {
        const title = panel.querySelector('#prj-ms-title').value.trim();
        if (!title) return;
        const dueDate = panel.querySelector('#prj-ms-date').value;
        milestones.push({ id: uid('mil'), title, dueDate, completed: false });
        panel.querySelector('#prj-ms-title').value = '';
        panel.querySelector('#prj-ms-date').value = '';
        renderMilestones();
      });

      panel.querySelector('#tf-project-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const title = panel.querySelector('#prj-title').value.trim();
        const startDate = panel.querySelector('#prj-start').value;
        const expectedEndDate = panel.querySelector('#prj-end').value;
        const err = panel.querySelector('#prj-err');
        err.style.display = 'none';

        if (!title) {
          err.textContent = 'Project title is required.';
          err.style.display = 'block';
          return;
        }
        if (startDate && expectedEndDate && expectedEndDate < startDate) {
          err.textContent = 'Expected completion date cannot be earlier than start date.';
          err.style.display = 'block';
          return;
        }

        submitting = true;
        const payload = {
          title,
          description: panel.querySelector('#prj-desc').value.trim(),
          startDate,
          expectedEndDate,
          priority: panel.querySelector('#prj-priority').value,
          status: panel.querySelector('#prj-status').value,
          notes: panel.querySelector('#prj-notes').value.trim(),
          milestones,
        };
        if (isEdit) {
          store.updateProject(existingProject.id, payload);
          showToast('Project updated', 'success');
        } else {
          store.addProject(payload);
          showToast('Project created', 'success');
        }
        closeModal();
      });
    },
  });
}

// Personal Calendar Event Modal
export function openCalendarEventModal(existingEvent = null, presetDate = todayStr()) {
  const isEdit = Boolean(existingEvent);
  const evt = existingEvent || {
    title: '',
    date: presetDate || todayStr(),
    time: '',
    category: 'Personal',
    notes: '',
  };
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Calendar Event' : 'Add Personal Event',
    size: 'modal-sm',
    bodyHtml: `
      <form id="tf-evt-form" novalidate>
        <div class="form-grid" style="grid-template-columns:1fr;">
          <div class="form-field">
            <label class="form-label" for="evt-title">Event Title *</label>
            <input id="evt-title" class="input" type="text" value="${escapeHtml(evt.title)}" required placeholder="e.g., Project Demo / Dentist / Study Group" />
            <div id="evt-err" class="form-error" style="display:none;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-field">
              <label class="form-label" for="evt-date">Date *</label>
              <input id="evt-date" class="input" type="date" value="${escapeHtml(evt.date)}" required />
            </div>
            <div class="form-field">
              <label class="form-label" for="evt-time">Time</label>
              <input id="evt-time" class="input" type="time" value="${escapeHtml(evt.time)}" />
            </div>
          </div>
          <div class="form-field">
            <label class="form-label" for="evt-cat">Event Type</label>
            <select id="evt-cat" class="select">
              ${['Personal', 'Academic', 'Meeting', 'Milestone']
                .map((c) => `<option value="${c}" ${evt.category === c ? 'selected' : ''}>${c}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="evt-notes">Notes</label>
            <textarea id="evt-notes" class="textarea">${escapeHtml(evt.notes)}</textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-evt-form" class="btn btn-primary">${isEdit ? 'Save Event' : 'Add Event'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      panel.querySelector('#tf-evt-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const title = panel.querySelector('#evt-title').value.trim();
        const date = panel.querySelector('#evt-date').value;
        const err = panel.querySelector('#evt-err');
        if (!title || !date) {
          err.textContent = 'Title and date are required.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const payload = {
          title,
          date,
          time: panel.querySelector('#evt-time').value,
          category: panel.querySelector('#evt-cat').value,
          notes: panel.querySelector('#evt-notes').value.trim(),
        };
        if (isEdit) {
          store.updateCalendarEvent(existingEvent.id, payload);
          showToast('Event updated', 'success');
        } else {
          store.addCalendarEvent(payload);
          showToast('Event scheduled', 'success');
        }
        closeModal();
      });
    },
  });
}

// Onboarding Welcome Flow
export function openOnboardingModal() {
  openModal({
    title: 'Welcome to TASKFLOW — Personal Productivity OS',
    preventBackdropClose: true,
    bodyHtml: `
      <p style="margin:0 0 16px;color:var(--text-secondary);font-size:14px;line-height:1.55;">
        Set up your workspace in seconds. Your workspace starts clean and stores all data locally in your browser.
      </p>
      <form id="tf-onboard-form" novalidate>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="ob-name">Your Name</label>
            <input id="ob-name" class="input" type="text" placeholder="e.g., Harshal" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ob-goal">Main Goal</label>
            <input id="ob-goal" class="input" type="text" placeholder="e.g., Excel in Semester 5 & ship projects" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ob-start">Preferred Work Start</label>
            <input id="ob-start" class="input" type="time" value="08:00" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ob-end">Preferred Work End</label>
            <input id="ob-end" class="input" type="time" value="22:00" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ob-inst">Institution / Role (Optional)</label>
            <input id="ob-inst" class="input" type="text" placeholder="e.g., B.Tech Computer Science" />
          </div>
          <div class="form-field">
            <label class="form-label" for="ob-sem">Current Semester / Term (Optional)</label>
            <input id="ob-sem" class="input" type="text" placeholder="e.g., Semester 5" />
          </div>
          <div class="form-field full" style="padding:12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);">
            <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13.5px;">
              <input id="ob-sample" type="checkbox" style="margin-top:3px;accent-color:var(--accent);" />
              <span>
                <strong>Include a few optional example tasks &amp; project</strong><br />
                <span style="color:var(--text-muted);font-size:12.5px;">Leave unchecked for a completely empty workspace. Example items can be removed in one click anytime.</span>
              </span>
            </label>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-ghost" id="ob-skip-btn">Skip Setup</button>
      <button type="submit" form="tf-onboard-form" class="btn btn-primary">Launch Workspace</button>
    `,
    onMount: (panel) => {
      panel.querySelector('#ob-skip-btn').addEventListener('click', () => {
        store.skipOnboarding();
        closeModal();
      });
      panel.querySelector('#tf-onboard-form').addEventListener('submit', (e) => {
        e.preventDefault();
        store.completeOnboarding({
          name: panel.querySelector('#ob-name').value,
          mainGoal: panel.querySelector('#ob-goal').value,
          workHoursStart: panel.querySelector('#ob-start').value,
          workHoursEnd: panel.querySelector('#ob-end').value,
          institution: panel.querySelector('#ob-inst').value,
          semester: panel.querySelector('#ob-sem').value,
          includeExamples: panel.querySelector('#ob-sample').checked,
        });
        closeModal();
        showToast('Workspace ready', 'success');
      });
    },
  });
}

export function openMigrationModal(summary, onDone) {
  const c = summary.counts;
  const parts = [];
  if (c.tasks) parts.push(`${c.tasks} task${c.tasks === 1 ? '' : 's'}`);
  if (c.projects) parts.push(`${c.projects} project${c.projects === 1 ? '' : 's'}`);
  if (c.subjects) parts.push(`${c.subjects} subject${c.subjects === 1 ? '' : 's'}`);
  if (c.assignments) parts.push(`${c.assignments} assignment${c.assignments === 1 ? '' : 's'}`);
  if (c.exams) parts.push(`${c.exams} exam${c.exams === 1 ? '' : 's'}`);
  if (c.studySessions) parts.push(`${c.studySessions} study session${c.studySessions === 1 ? '' : 's'}`);
  if (c.routineSlots) parts.push(`${c.routineSlots} routine block${c.routineSlots === 1 ? '' : 's'}`);
  if (c.calendarEvents) parts.push(`${c.calendarEvents} event${c.calendarEvents === 1 ? '' : 's'}`);
  if (c.notes) parts.push(`${c.notes} note${c.notes === 1 ? '' : 's'}`);

  openModal({
    title: 'Migrate Existing Local Data to Cloud Account',
    size: 'modal-sm',
    preventBackdropClose: true,
    bodyHtml: `
      <p style="margin:0 0 12px;color:var(--text-secondary);font-size:14px;line-height:1.55;">
        We found existing TASKFLOW data stored locally on this browser:
      </p>
      <div style="padding:10px 12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:13px;color:var(--text-primary);margin-bottom:12px;">
        ${escapeHtml(parts.join(' · ') || 'Personal profile & settings')}
      </div>
      <p style="margin:0;color:var(--text-muted);font-size:12.5px;line-height:1.5;">
        Merging copies only items that do not already exist in your cloud account. Existing cloud data will never be overwritten, and your local copy remains preserved.
      </p>
    `,
    footerHtml: `
      <button type="button" class="btn btn-ghost" id="mig-skip-btn">Skip for Now</button>
      <button type="button" class="btn btn-primary" id="mig-merge-btn">Merge into Cloud Account</button>
    `,
    onMount: (panel) => {
      const skipBtn = panel.querySelector('#mig-skip-btn');
      const mergeBtn = panel.querySelector('#mig-merge-btn');

      skipBtn.addEventListener('click', () => {
        store.skipLocalMigrationPrompt();
        closeModal();
        if (typeof onDone === 'function') onDone(false);
      });

      mergeBtn.addEventListener('click', async () => {
        mergeBtn.disabled = true;
        skipBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';
        try {
          const res = await store.migrateLocalDataToCloud();
          closeModal();
          showToast(`Migrated ${res.migratedCount} local item${res.migratedCount === 1 ? '' : 's'} to cloud`, 'success');
          if (typeof onDone === 'function') onDone(true);
        } catch {
          mergeBtn.disabled = false;
          skipBtn.disabled = false;
          mergeBtn.textContent = 'Merge into Cloud Account';
          showToast('Migration failed. Please check your connection and try again.', 'danger');
        }
      });
    },
  });
}
