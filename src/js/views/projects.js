import { store } from '../store.js';
import { escapeHtml, formatDate, getDaysDiff, todayStr } from '../utils.js';
import { icon } from '../icons.js';
import { openProjectModal, openTaskModal, confirmAction, showToast } from '../components/modals.js';

const prjViewState = {
  viewMode: 'grid', // grid | list | kanban
  selectedProjectId: 'all', // 'all' or specific projectId
  detailProjectId: null,
};

export function renderProjectsView(container) {
  const s = store.getState();
  const t0 = todayStr();

  // If a project detail view is open and still exists
  const detailProject = prjViewState.detailProjectId
    ? s.projects.find((p) => p.id === prjViewState.detailProjectId)
    : null;

  if (detailProject) {
    const stats = store.getProjectStats(detailProject.id);
    const linkedTasks = s.tasks.filter((t) => t.projectId === detailProject.id);

    container.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:12px;">
          <button type="button" class="btn btn-secondary btn-sm" id="prj-back-btn">${icon('chevronLeft', 15)} All Projects</button>
          <div>
            <h2 style="font-size:20px;font-weight:700;">${escapeHtml(detailProject.title)}</h2>
            <div class="meta-line">
              <span>${escapeHtml(detailProject.status)}</span>
              <span class="meta-sep">·</span>
              <span class="priority-text-${detailProject.priority}">${escapeHtml(detailProject.priority)} Priority</span>
              ${detailProject.expectedEndDate ? `<span class="meta-sep">·</span><span class="mono">Target: ${escapeHtml(formatDate(detailProject.expectedEndDate, s.settings.dateFormat))}</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="prj-detail-edit">${icon('edit', 14)} Edit Project</button>
          <button type="button" class="btn btn-primary btn-sm" id="prj-detail-add-task">${icon('plus', 14)} Add Project Task</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;">Overall Project Progress</span>
          <span class="mono" style="font-size:16px;font-weight:700;color:var(--accent);">${stats.progress}%</span>
        </div>
        <div class="progress-track" style="height:10px;margin-bottom:12px;">
          <div class="progress-fill ${stats.progress === 100 ? 'success' : ''}" style="width:${stats.progress}%"></div>
        </div>
        <div class="meta-line">
          <span>${stats.completedTasks}/${stats.totalTasks} tasks completed</span>
          <span class="meta-sep">·</span>
          <span>${stats.completedMilestones}/${stats.totalMilestones} milestones reached</span>
        </div>
        ${detailProject.description ? `<p style="margin:12px 0 0;color:var(--text-secondary);font-size:14px;">${escapeHtml(detailProject.description)}</p>` : ''}
        ${detailProject.notes ? `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:var(--bg-input);font-size:13px;color:var(--text-secondary);"><strong>Notes:</strong> ${escapeHtml(detailProject.notes)}</div>` : ''}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Milestones</h3>
              <div class="card-subtitle">Track major project checkpoints</div>
            </div>
          </div>
          ${
            (detailProject.milestones || []).length === 0
              ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-desc">No milestones yet. Edit the project to add milestones.</div></div>`
              : `<div class="task-list">
                  ${detailProject.milestones
                    .map(
                      (m) => `
                    <div class="task-row" style="padding:10px 2px;">
                      <div class="task-row-left">
                        <button type="button" class="task-checkbox ${m.completed ? 'checked' : ''}" data-prj-ms="${m.id}" aria-label="Toggle milestone">
                          ${m.completed ? icon('check', 13) : ''}
                        </button>
                        <div>
                          <div class="task-title ${m.completed ? 'completed' : ''}" style="font-size:14px;">${escapeHtml(m.title)}</div>
                          ${m.dueDate ? `<div class="meta-line"><span class="mono">${escapeHtml(formatDate(m.dueDate, s.settings.dateFormat))}</span></div>` : ''}
                        </div>
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
              <h3 class="card-title">Related Tasks</h3>
              <div class="card-subtitle">Break project down into actionable tasks</div>
            </div>
          </div>
          ${
            linkedTasks.length === 0
              ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-desc">No tasks linked to this project yet.</div></div>`
              : `<div class="task-list">
                  ${linkedTasks
                    .map((t) => {
                      const done = t.status === 'Completed';
                      return `
                        <div class="task-row" style="padding:10px 2px;">
                          <div class="task-row-left">
                            <button type="button" class="task-checkbox ${done ? 'checked' : ''}" data-prj-task-tog="${t.id}" aria-label="Toggle task">
                              ${done ? icon('check', 13) : ''}
                            </button>
                            <div style="min-width:0;">
                              <div class="task-title ${done ? 'completed' : ''}" style="font-size:14px;">${escapeHtml(t.title)}</div>
                              <div class="meta-line">
                                <span>${escapeHtml(t.status)}</span>
                                <span class="meta-sep">·</span>
                                <span class="priority-text-${t.priority}">${escapeHtml(t.priority)}</span>
                                ${t.dueDate ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatDate(t.dueDate, s.settings.dateFormat))}</span>` : ''}
                              </div>
                            </div>
                          </div>
                          <button type="button" class="btn-icon btn-icon-ghost" data-prj-task-edit="${t.id}" aria-label="Edit task">${icon('edit', 14)}</button>
                        </div>
                      `;
                    })
                    .join('')}
                 </div>`
          }
        </div>
      </div>
    `;

    container.querySelector('#prj-back-btn').addEventListener('click', () => {
      prjViewState.detailProjectId = null;
      renderProjectsView(container);
    });
    container.querySelector('#prj-detail-edit').addEventListener('click', () => openProjectModal(detailProject));
    container.querySelector('#prj-detail-add-task').addEventListener('click', () =>
      openTaskModal(null, { projectId: detailProject.id, category: 'Project' })
    );
    container.querySelectorAll('[data-prj-ms]').forEach((b) => {
      b.addEventListener('click', () => store.toggleProjectMilestone(detailProject.id, b.getAttribute('data-prj-ms')));
    });
    container.querySelectorAll('[data-prj-task-tog]').forEach((b) => {
      b.addEventListener('click', () => store.toggleTaskComplete(b.getAttribute('data-prj-task-tog')));
    });
    container.querySelectorAll('[data-prj-task-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const task = s.tasks.find((t) => t.id === b.getAttribute('data-prj-task-edit'));
        if (task) openTaskModal(task);
      });
    });
    return;
  }

  let mainBody = '';
  if (prjViewState.viewMode === 'kanban') {
    const kanbanTasks =
      prjViewState.selectedProjectId === 'all'
        ? s.tasks
        : s.tasks.filter((t) => t.projectId === prjViewState.selectedProjectId);
    const projectMap = Object.fromEntries(s.projects.map((p) => [p.id, p.title]));
    const cols = ['Not Started', 'In Progress', 'On Hold', 'Completed'];

    mainBody = `
      <div class="card card-compact" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <label class="form-label" for="kanban-prj-filter">Scope:</label>
          <select id="kanban-prj-filter" class="select" style="width:auto;min-width:210px;">
            <option value="all" ${prjViewState.selectedProjectId === 'all' ? 'selected' : ''}>All Tasks &amp; Projects</option>
            ${s.projects.map((p) => `<option value="${escapeHtml(p.id)}" ${prjViewState.selectedProjectId === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="kanban-add-task">${icon('plus', 14)} Add Task</button>
      </div>
      <div class="kanban-grid">
        ${cols
          .map((colStatus) => {
            const colTasks = kanbanTasks.filter((t) => t.status === colStatus);
            return `
              <div class="kanban-col" data-kanban-col="${colStatus}">
                <div class="kanban-col-header">
                  <span>${escapeHtml(colStatus)}</span>
                  <span class="mono" style="color:var(--text-muted);">${colTasks.length}</span>
                </div>
                ${
                  colTasks.length === 0
                    ? `<div style="font-size:12.5px;color:var(--text-muted);padding:12px 4px;">Drop task here or move via selector</div>`
                    : colTasks
                        .map(
                          (t) => `
                      <div class="kanban-card" draggable="true" data-kanban-card="${t.id}">
                        <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${escapeHtml(t.title)}</div>
                        <div class="meta-line" style="font-size:11.5px;margin-bottom:8px;">
                          <span class="priority-text-${t.priority}">${escapeHtml(t.priority)}</span>
                          ${projectMap[t.projectId] ? `<span class="meta-sep">·</span><span>${escapeHtml(projectMap[t.projectId])}</span>` : ''}
                          ${t.dueDate ? `<span class="meta-sep">·</span><span class="mono">${escapeHtml(formatDate(t.dueDate, s.settings.dateFormat))}</span>` : ''}
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                          <select class="select" data-kanban-move="${t.id}" aria-label="Move task status" style="padding:4px 8px;font-size:12px;">
                            ${cols.map((c) => `<option value="${c}" ${t.status === c ? 'selected' : ''}>${c}</option>`).join('')}
                          </select>
                          <button type="button" class="btn-icon btn-icon-ghost" data-kanban-edit="${t.id}" style="width:28px;height:28px;min-height:28px;">${icon('edit', 13)}</button>
                        </div>
                      </div>
                    `
                        )
                        .join('')
                }
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } else if (s.projects.length === 0) {
    mainBody = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-title">No projects yet</div>
          <div class="empty-state-desc">Create structured projects with start/target dates, milestones, notes, and linked tasks.</div>
          <button type="button" class="btn btn-primary btn-sm" id="prj-empty-new">${icon('plus', 14)} Create First Project</button>
        </div>
      </div>
    `;
  } else if (prjViewState.viewMode === 'list') {
    mainBody = `
      <div class="card">
        <div class="table-wrap">
          <table class="tf-table">
            <thead>
              <tr>
                <th>Project Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Target Date</th>
                <th class="num">Tasks</th>
                <th class="num">Progress</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${s.projects
                .map((p) => {
                  const st = store.getProjectStats(p.id);
                  const diff = p.expectedEndDate ? getDaysDiff(p.expectedEndDate, t0) : null;
                  return `
                    <tr>
                      <td>
                        <button type="button" class="btn btn-ghost btn-sm" style="padding:0;font-weight:600;color:var(--text-primary);" data-prj-open="${p.id}">
                          ${escapeHtml(p.title)}
                        </button>
                      </td>
                      <td>${escapeHtml(p.status)}</td>
                      <td><span class="priority-text-${p.priority}">${escapeHtml(p.priority)}</span></td>
                      <td class="mono">${
                        p.expectedEndDate
                          ? `${escapeHtml(formatDate(p.expectedEndDate, s.settings.dateFormat))}${
                              p.status !== 'Completed' && diff !== null && diff < 0
                                ? ` <span style="color:var(--danger);">(Overdue)</span>`
                                : ''
                            }`
                          : '—'
                      }</td>
                      <td class="num">${st.completedTasks}/${st.totalTasks}</td>
                      <td class="num">${st.progress}%</td>
                      <td style="text-align:right;white-space:nowrap;">
                        <button type="button" class="btn btn-ghost btn-sm" data-prj-open="${p.id}">Open</button>
                        <button type="button" class="btn-icon btn-icon-ghost" data-prj-edit="${p.id}" aria-label="Edit project">${icon('edit', 14)}</button>
                        <button type="button" class="btn-icon btn-icon-ghost" data-prj-del="${p.id}" aria-label="Delete project">${icon('trash', 14)}</button>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    mainBody = `
      <div class="grid-3">
        ${s.projects
          .map((p) => {
            const st = store.getProjectStats(p.id);
            const diff = p.expectedEndDate ? getDaysDiff(p.expectedEndDate, t0) : null;
            return `
              <article class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);cursor:pointer;" data-prj-open="${p.id}">${escapeHtml(p.title)}</h3>
                    <div style="display:flex;gap:2px;">
                      <button type="button" class="btn-icon btn-icon-ghost" data-prj-edit="${p.id}" style="width:30px;height:30px;min-height:30px;">${icon('edit', 14)}</button>
                      <button type="button" class="btn-icon btn-icon-ghost" data-prj-del="${p.id}" style="width:30px;height:30px;min-height:30px;">${icon('trash', 14)}</button>
                    </div>
                  </div>
                  <div class="meta-line" style="margin-top:4px;">
                    <span>${escapeHtml(p.status)}</span>
                    <span class="meta-sep">·</span>
                    <span class="priority-text-${p.priority}">${escapeHtml(p.priority)}</span>
                    ${
                      p.expectedEndDate
                        ? `<span class="meta-sep">·</span><span class="mono ${p.status !== 'Completed' && diff !== null && diff < 0 ? 'tone-danger' : ''}">${escapeHtml(formatDate(p.expectedEndDate, s.settings.dateFormat))}</span>`
                        : ''
                    }
                  </div>
                  ${p.description ? `<p style="margin:10px 0 0;font-size:13px;color:var(--text-secondary);">${escapeHtml(p.description)}</p>` : ''}
                </div>

                <div>
                  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;">
                    <span style="color:var(--text-muted);">${st.completedTasks}/${st.totalTasks} tasks · ${st.completedMilestones}/${st.totalMilestones} milestones</span>
                    <span class="mono" style="font-weight:600;color:var(--accent);">${st.progress}%</span>
                  </div>
                  <div class="progress-track" style="margin-bottom:12px;">
                    <div class="progress-fill ${st.progress === 100 ? 'success' : ''}" style="width:${st.progress}%"></div>
                  </div>
                  <div style="display:flex;gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" data-prj-open="${p.id}">Open Workspace</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-prj-quick-task="${p.id}">+ Task</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Project Management</h2>
        <div class="card-subtitle">Organize large initiatives into milestones and tasks</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="segmented" role="tablist">
          <button type="button" class="segmented-btn ${prjViewState.viewMode === 'grid' ? 'active' : ''}" data-prj-view="grid">${icon('grid', 13)} Cards</button>
          <button type="button" class="segmented-btn ${prjViewState.viewMode === 'list' ? 'active' : ''}" data-prj-view="list">${icon('list', 13)} List</button>
          <button type="button" class="segmented-btn ${prjViewState.viewMode === 'kanban' ? 'active' : ''}" data-prj-view="kanban">${icon('kanban', 13)} Kanban</button>
        </div>
        <button type="button" class="btn btn-primary" id="prj-new-btn">${icon('plus', 15)} New Project</button>
      </div>
    </div>
    ${mainBody}
  `;

  container.querySelector('#prj-new-btn').addEventListener('click', () => openProjectModal());
  container.querySelector('#prj-empty-new')?.addEventListener('click', () => openProjectModal());

  container.querySelectorAll('[data-prj-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      prjViewState.viewMode = btn.getAttribute('data-prj-view');
      renderProjectsView(container);
    });
  });

  container.querySelectorAll('[data-prj-open]').forEach((el) => {
    el.addEventListener('click', () => {
      prjViewState.detailProjectId = el.getAttribute('data-prj-open');
      renderProjectsView(container);
    });
  });

  container.querySelectorAll('[data-prj-quick-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openTaskModal(null, { projectId: btn.getAttribute('data-prj-quick-task'), category: 'Project' });
    });
  });

  container.querySelectorAll('[data-prj-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = s.projects.find((x) => x.id === btn.getAttribute('data-prj-edit'));
      if (p) openProjectModal(p);
    });
  });

  container.querySelectorAll('[data-prj-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-prj-del');
      const p = s.projects.find((x) => x.id === id);
      if (!p) return;
      const linkedCount = s.tasks.filter((t) => t.projectId === id).length;
      confirmAction({
        title: 'Delete Project',
        message:
          linkedCount > 0
            ? `Delete project "${p.title}"? Its ${linkedCount} associated task${linkedCount === 1 ? '' : 's'} will NOT be deleted and will remain in My Tasks as standalone tasks.`
            : `Delete project "${p.title}"? This action cannot be undone.`,
        confirmLabel: 'Delete Project',
        onConfirm: () => {
          store.deleteProject(id);
          showToast('Project deleted (associated tasks preserved)', 'info');
        },
      });
    });
  });

  // Kanban Handlers
  container.querySelector('#kanban-prj-filter')?.addEventListener('change', (e) => {
    prjViewState.selectedProjectId = e.target.value;
    renderProjectsView(container);
  });
  container.querySelector('#kanban-add-task')?.addEventListener('click', () => {
    openTaskModal(null, {
      projectId: prjViewState.selectedProjectId === 'all' ? '' : prjViewState.selectedProjectId,
      category: 'Project',
    });
  });
  container.querySelectorAll('[data-kanban-move]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      store.updateTask(sel.getAttribute('data-kanban-move'), { status: e.target.value });
      showToast(`Moved to ${e.target.value}`, 'success');
    });
  });
  container.querySelectorAll('[data-kanban-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = s.tasks.find((x) => x.id === btn.getAttribute('data-kanban-edit'));
      if (t) openTaskModal(t);
    });
  });

  let draggedTaskId = null;
  container.querySelectorAll('[data-kanban-card]').forEach((card) => {
    card.addEventListener('dragstart', () => {
      draggedTaskId = card.getAttribute('data-kanban-card');
    });
  });
  container.querySelectorAll('[data-kanban-col]').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (draggedTaskId) {
        const nextStatus = col.getAttribute('data-kanban-col');
        store.updateTask(draggedTaskId, { status: nextStatus });
        draggedTaskId = null;
      }
    });
  });
}
