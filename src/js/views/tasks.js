import { store } from '../store.js';
import {
  escapeHtml,
  formatDate,
  formatTime,
  formatDuration,
  getDeadlineMeta,
  getDaysDiff,
  PRIORITY_WEIGHT,
  todayStr,
} from '../utils.js';
import { icon } from '../icons.js';
import { openTaskModal, confirmAction, showToast } from '../components/modals.js';

const viewState = {
  search: '',
  category: 'All',
  priority: 'All',
  status: 'All',
  deadline: 'All',
  sortBy: 'dueDateAsc',
  expandedTaskIds: new Set(),
};

export function renderTasksView(container) {
  const s = store.getState();
  const projectMap = Object.fromEntries(s.projects.map((p) => [p.id, p]));
  const t0 = todayStr();

  // Filter tasks
  const filtered = s.tasks.filter((task) => {
    if (viewState.search.trim()) {
      const q = viewState.search.trim().toLowerCase();
      const prjName = projectMap[task.projectId]?.title || '';
      const hay = `${task.title} ${task.description} ${task.notes} ${task.category} ${prjName} ${(task.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (viewState.category !== 'All' && task.category !== viewState.category) return false;
    if (viewState.priority !== 'All' && task.priority !== viewState.priority) return false;
    if (viewState.status !== 'All' && task.status !== viewState.status) return false;

    if (viewState.deadline !== 'All') {
      const diff = task.dueDate ? getDaysDiff(task.dueDate, t0) : null;
      if (viewState.deadline === 'Overdue') {
        if (task.status === 'Completed' || diff === null || diff >= 0) return false;
      } else if (viewState.deadline === 'Today') {
        if (diff !== 0) return false;
      } else if (viewState.deadline === 'Tomorrow') {
        if (diff !== 1) return false;
      } else if (viewState.deadline === 'Week') {
        if (diff === null || diff < 0 || diff > 7) return false;
      } else if (viewState.deadline === 'NoDeadline') {
        if (task.dueDate) return false;
      }
    }
    return true;
  });

  // Sort tasks
  filtered.sort((a, b) => {
    if (viewState.sortBy === 'dueDateAsc') {
      const da = a.dueDate || '9999-12-31';
      const db = b.dueDate || '9999-12-31';
      if (da !== db) return da.localeCompare(db);
      return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
    }
    if (viewState.sortBy === 'dueDateDesc') {
      const da = a.dueDate || '0000-01-01';
      const db = b.dueDate || '0000-01-01';
      return db.localeCompare(da);
    }
    if (viewState.sortBy === 'priorityDesc') {
      const diff = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      if (diff !== 0) return diff;
      return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
    }
    if (viewState.sortBy === 'createdDesc') {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    if (viewState.sortBy === 'createdAsc') {
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    }
    return 0;
  });

  const categories = ['All', ...s.settings.categories];

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Task Management</h2>
        <div class="meta-line" style="margin-top:2px;">
          <span class="mono">${filtered.length}</span> shown
          <span class="meta-sep">·</span>
          <span class="mono">${s.tasks.filter((t) => t.status !== 'Completed').length}</span> pending
          <span class="meta-sep">·</span>
          <span class="mono">${s.tasks.filter((t) => t.status === 'Completed').length}</span> completed
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" id="tasks-reset-filters">Reset Filters</button>
        <button type="button" class="btn btn-primary" id="tasks-new-btn">${icon('plus', 15)} New Task</button>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:16px;">
      <div class="filter-bar" style="margin-bottom:0;">
        <input id="tf-task-search" class="input" type="search" placeholder="Search title, tags, project, notes..." value="${escapeHtml(viewState.search)}" style="flex:1;min-width:210px;" />
        <select id="tf-filter-cat" class="select" aria-label="Filter by category">
          ${categories.map((c) => `<option value="${escapeHtml(c)}" ${viewState.category === c ? 'selected' : ''}>Category: ${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="tf-filter-pri" class="select" aria-label="Filter by priority">
          ${['All', 'Critical', 'High', 'Medium', 'Low'].map((p) => `<option value="${p}" ${viewState.priority === p ? 'selected' : ''}>Priority: ${p}</option>`).join('')}
        </select>
        <select id="tf-filter-stat" class="select" aria-label="Filter by status">
          ${['All', 'Not Started', 'In Progress', 'Completed', 'On Hold'].map((st) => `<option value="${st}" ${viewState.status === st ? 'selected' : ''}>Status: ${st}</option>`).join('')}
        </select>
        <select id="tf-filter-dead" class="select" aria-label="Filter by deadline">
          <option value="All" ${viewState.deadline === 'All' ? 'selected' : ''}>Deadline: All</option>
          <option value="Overdue" ${viewState.deadline === 'Overdue' ? 'selected' : ''}>Overdue</option>
          <option value="Today" ${viewState.deadline === 'Today' ? 'selected' : ''}>Due Today</option>
          <option value="Tomorrow" ${viewState.deadline === 'Tomorrow' ? 'selected' : ''}>Due Tomorrow</option>
          <option value="Week" ${viewState.deadline === 'Week' ? 'selected' : ''}>Next 7 Days</option>
          <option value="NoDeadline" ${viewState.deadline === 'NoDeadline' ? 'selected' : ''}>No Deadline</option>
        </select>
        <select id="tf-sort-by" class="select" aria-label="Sort tasks">
          <option value="dueDateAsc" ${viewState.sortBy === 'dueDateAsc' ? 'selected' : ''}>Sort: Due Date (Soonest)</option>
          <option value="dueDateDesc" ${viewState.sortBy === 'dueDateDesc' ? 'selected' : ''}>Sort: Due Date (Latest)</option>
          <option value="priorityDesc" ${viewState.sortBy === 'priorityDesc' ? 'selected' : ''}>Sort: Priority (Highest)</option>
          <option value="createdDesc" ${viewState.sortBy === 'createdDesc' ? 'selected' : ''}>Sort: Created (Newest)</option>
          <option value="createdAsc" ${viewState.sortBy === 'createdAsc' ? 'selected' : ''}>Sort: Created (Oldest)</option>
        </select>
      </div>
    </div>

    <div class="card">
      ${
        filtered.length === 0
          ? `<div class="empty-state">
               <div class="empty-state-title">${s.tasks.length === 0 ? 'No tasks created yet' : 'No tasks match your filters'}</div>
               <div class="empty-state-desc">${
                 s.tasks.length === 0
                   ? 'Create your first task with deadlines, priorities, subtasks, and time estimates.'
                   : 'Try clearing one or more filters or adjusting your search query.'
               }</div>
               <button type="button" class="btn btn-primary btn-sm" id="tasks-empty-create">${icon('plus', 14)} Create Task</button>
             </div>`
          : `<div class="task-list">
              ${filtered
                .map((task) => {
                  const isDone = task.status === 'Completed';
                  const dMeta = getDeadlineMeta(task);
                  const project = projectMap[task.projectId];
                  const subtasks = task.subtasks || [];
                  const doneSubCount = subtasks.filter((st) => st.done).length;
                  const expanded = viewState.expandedTaskIds.has(task.id);
                  const isUrgent = !isDone && (dMeta.tone === 'danger' || task.priority === 'Critical');

                  return `
                    <article class="task-row ${isUrgent ? 'task-row-urgent' : ''}">
                      <div class="task-row-left">
                        <button type="button" class="task-checkbox ${isDone ? 'checked' : ''}" data-toggle-task="${task.id}" aria-label="${isDone ? 'Reopen task' : 'Complete task'}">
                          ${isDone ? icon('check', 13) : ''}
                        </button>
                        <div style="min-width:0;flex:1;">
                          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span class="task-title ${isDone ? 'completed' : ''}">${escapeHtml(task.title)}</span>
                            ${task.recurrence && task.recurrence !== 'None' ? `<span class="meta-line" title="Recurring: ${escapeHtml(task.recurrence)}">${icon('repeat', 12)} ${escapeHtml(task.recurrence)}</span>` : ''}
                          </div>
                          ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
                          <div class="meta-line" style="margin-top:6px;">
                            <span class="priority-text-${task.priority}">${escapeHtml(task.priority)}</span>
                            <span class="meta-sep">·</span>
                            <span>${escapeHtml(task.status)}</span>
                            <span class="meta-sep">·</span>
                            <span>${escapeHtml(task.category)}</span>
                            ${project ? `<span class="meta-sep">·</span><span>Project: ${escapeHtml(project.title)}</span>` : ''}
                            ${
                              task.dueDate
                                ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatDate(task.dueDate, s.settings.dateFormat))}${task.deadlineTime ? ' ' + escapeHtml(formatTime(task.deadlineTime, s.settings.timeFormat)) : ''}</span>`
                                : ''
                            }
                            <span class="meta-sep">·</span>
                            <span class="tone-${dMeta.tone}">${escapeHtml(dMeta.label)}</span>
                            ${
                              task.estimatedMinutes || task.actualMinutes
                                ? `<span class="meta-sep">·</span><span class="mono">${formatDuration(task.actualMinutes)} / ${formatDuration(task.estimatedMinutes)}</span>`
                                : ''
                            }
                            ${
                              subtasks.length > 0
                                ? `<span class="meta-sep">·</span><span class="mono">${doneSubCount}/${subtasks.length} subtasks</span>`
                                : ''
                            }
                            ${
                              (task.tags || []).length > 0
                                ? `<span class="meta-sep">·</span><span>${task.tags.map(escapeHtml).join(', ')}</span>`
                                : ''
                            }
                          </div>

                          ${
                            subtasks.length > 0 || task.notes || (task.attachments || []).length > 0
                              ? `<div style="margin-top:6px;">
                                  <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;min-height:24px;font-size:12px;" data-expand-task="${task.id}">
                                    ${expanded ? 'Hide details' : `Show details${subtasks.length > 0 ? ` (${subtasks.length} subtasks)` : ''}`}
                                  </button>
                                </div>`
                              : ''
                          }

                          ${
                            expanded
                              ? `<div style="margin-top:8px;padding:10px 12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);">
                                  ${
                                    subtasks.length > 0
                                      ? `<div class="subtask-inline-list">
                                          ${subtasks
                                            .map(
                                              (st) => `
                                            <label class="subtask-inline-item ${st.done ? 'done' : ''}">
                                              <input type="checkbox" ${st.done ? 'checked' : ''} data-subtask-task="${task.id}" data-subtask-id="${st.id}" />
                                              <span>${escapeHtml(st.text)}</span>
                                            </label>
                                          `
                                            )
                                            .join('')}
                                         </div>`
                                      : ''
                                  }
                                  ${
                                    task.notes
                                      ? `<div style="margin-top:8px;font-size:12.5px;color:var(--text-secondary);"><strong>Notes:</strong> ${escapeHtml(task.notes)}</div>`
                                      : ''
                                  }
                                  ${
                                    (task.attachments || []).length > 0
                                      ? `<div style="margin-top:8px;font-size:12.5px;color:var(--text-secondary);">
                                          <strong>Attachments:</strong>
                                          ${task.attachments
                                            .map((a) =>
                                              a.ref && /^https?:\/\//i.test(a.ref)
                                                ? `<a href="${escapeHtml(a.ref)}" target="_blank" rel="noopener noreferrer" style="margin-left:8px;">${escapeHtml(a.name)}</a>`
                                                : `<span style="margin-left:8px;">${escapeHtml(a.name)}${a.ref ? ` (${escapeHtml(a.ref)})` : ''}</span>`
                                            )
                                            .join('')}
                                         </div>`
                                      : ''
                                  }
                                 </div>`
                              : ''
                          }
                        </div>
                      </div>
                      <div class="task-actions">
                        <button type="button" class="btn-icon btn-icon-ghost" title="Edit task" aria-label="Edit task" data-edit-task="${task.id}">${icon('edit', 15)}</button>
                        <button type="button" class="btn-icon btn-icon-ghost" title="Duplicate task" aria-label="Duplicate task" data-dup-task="${task.id}">${icon('copy', 15)}</button>
                        <button type="button" class="btn-icon btn-icon-ghost" title="Delete task" aria-label="Delete task" data-del-task="${task.id}">${icon('trash', 15)}</button>
                      </div>
                    </article>
                  `;
                })
                .join('')}
             </div>`
      }
    </div>
  `;

  container.querySelector('#tasks-new-btn').addEventListener('click', () => openTaskModal());
  container.querySelector('#tasks-empty-create')?.addEventListener('click', () => openTaskModal());

  container.querySelector('#tasks-reset-filters').addEventListener('click', () => {
    viewState.search = '';
    viewState.category = 'All';
    viewState.priority = 'All';
    viewState.status = 'All';
    viewState.deadline = 'All';
    viewState.sortBy = 'dueDateAsc';
    renderTasksView(container);
  });

  const searchInp = container.querySelector('#tf-task-search');
  searchInp.addEventListener('input', () => {
    viewState.search = searchInp.value;
    const pos = searchInp.selectionStart;
    renderTasksView(container);
    const nextInp = container.querySelector('#tf-task-search');
    if (nextInp) {
      nextInp.focus();
      if (pos !== null) nextInp.setSelectionRange(pos, pos);
    }
  });

  container.querySelector('#tf-filter-cat').addEventListener('change', (e) => {
    viewState.category = e.target.value;
    renderTasksView(container);
  });
  container.querySelector('#tf-filter-pri').addEventListener('change', (e) => {
    viewState.priority = e.target.value;
    renderTasksView(container);
  });
  container.querySelector('#tf-filter-stat').addEventListener('change', (e) => {
    viewState.status = e.target.value;
    renderTasksView(container);
  });
  container.querySelector('#tf-filter-dead').addEventListener('change', (e) => {
    viewState.deadline = e.target.value;
    renderTasksView(container);
  });
  container.querySelector('#tf-sort-by').addEventListener('change', (e) => {
    viewState.sortBy = e.target.value;
    renderTasksView(container);
  });

  container.querySelectorAll('[data-toggle-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const updated = store.toggleTaskComplete(btn.getAttribute('data-toggle-task'));
      if (updated) {
        showToast(updated.status === 'Completed' ? 'Task completed' : 'Task reopened', 'success');
      }
    });
  });

  container.querySelectorAll('[data-expand-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-expand-task');
      if (viewState.expandedTaskIds.has(id)) viewState.expandedTaskIds.delete(id);
      else viewState.expandedTaskIds.add(id);
      renderTasksView(container);
    });
  });

  container.querySelectorAll('[data-subtask-task]').forEach((cb) => {
    cb.addEventListener('change', () => {
      store.toggleSubtask(cb.getAttribute('data-subtask-task'), cb.getAttribute('data-subtask-id'));
    });
  });

  container.querySelectorAll('[data-edit-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = s.tasks.find((t) => t.id === btn.getAttribute('data-edit-task'));
      if (task) openTaskModal(task);
    });
  });

  container.querySelectorAll('[data-dup-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.duplicateTask(btn.getAttribute('data-dup-task'));
      showToast('Task duplicated', 'success');
    });
  });

  container.querySelectorAll('[data-del-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del-task');
      const task = s.tasks.find((t) => t.id === id);
      if (!task) return;
      confirmAction({
        title: 'Delete Task',
        message: `Permanently delete "${task.title}"? This action cannot be undone.`,
        confirmLabel: 'Delete Task',
        onConfirm: () => {
          store.deleteTask(id);
          showToast('Task deleted', 'info');
        },
      });
    });
  });
}
