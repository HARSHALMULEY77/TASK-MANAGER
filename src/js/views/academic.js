import { store } from '../store.js';
import {
  escapeHtml,
  uid,
  todayStr,
  formatDate,
  formatTime,
  formatDuration,
  getDaysDiff,
  addDays,
} from '../utils.js';
import { icon } from '../icons.js';
import { openModal, closeModal, confirmAction, showToast } from '../components/modals.js';

const acadState = {
  tab: 'subjects', // subjects | assignments | exams | study
};

function openSubjectModal(existing = null) {
  const s = store.getState();
  const isEdit = Boolean(existing);
  const sub = existing || {
    name: '',
    code: '',
    faculty: '',
    semester: s.profile.semester || '',
    chapters: [],
    syllabusCompletion: 0,
  };
  let chapters = (sub.chapters || []).map((c) => ({ ...c }));
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Subject' : 'Add Subject',
    bodyHtml: `
      <form id="tf-sub-form" novalidate>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="sub-name">Subject Name *</label>
            <input id="sub-name" class="input" type="text" value="${escapeHtml(sub.name)}" required placeholder="e.g., Operating Systems" />
            <div id="sub-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field">
            <label class="form-label" for="sub-code">Subject Code</label>
            <input id="sub-code" class="input" type="text" value="${escapeHtml(sub.code)}" placeholder="e.g., CS-402" />
          </div>
          <div class="form-field">
            <label class="form-label" for="sub-fac">Faculty Name</label>
            <input id="sub-fac" class="input" type="text" value="${escapeHtml(sub.faculty)}" placeholder="e.g., Prof. R. Sharma" />
          </div>
          <div class="form-field">
            <label class="form-label" for="sub-sem">Semester</label>
            <input id="sub-sem" class="input" type="text" value="${escapeHtml(sub.semester)}" placeholder="e.g., Semester 5" />
          </div>
          <div class="form-field full">
            <label class="form-label" for="sub-pct">Manual Syllabus Completion % (used if no chapters added)</label>
            <input id="sub-pct" class="input" type="number" min="0" max="100" value="${Number(sub.syllabusCompletion) || 0}" />
          </div>
          <div class="form-field full">
            <label class="form-label">Important Chapters / Units</label>
            <div id="sub-ch-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <input id="sub-new-ch" class="input" type="text" placeholder="Add chapter or module name..." style="flex:1;" />
              <button type="button" id="sub-add-ch" class="btn btn-secondary btn-sm">Add Chapter</button>
            </div>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-sub-form" class="btn btn-primary">${isEdit ? 'Save Subject' : 'Add Subject'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const renderCh = () => {
        const list = panel.querySelector('#sub-ch-list');
        if (chapters.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No chapters listed yet.</div>';
          return;
        }
        list.innerHTML = chapters
          .map(
            (c, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);">
            <input type="checkbox" ${c.completed ? 'checked' : ''} data-ch-tog="${i}" />
            <span style="flex:1;font-size:13px;">${escapeHtml(c.title)}</span>
            <button type="button" class="btn-icon btn-icon-ghost" data-ch-del="${i}" style="width:26px;height:26px;min-height:26px;">${icon('x', 13)}</button>
          </div>
        `
          )
          .join('');
        list.querySelectorAll('[data-ch-tog]').forEach((cb) => {
          cb.addEventListener('change', () => {
            chapters[Number(cb.getAttribute('data-ch-tog'))].completed = cb.checked;
          });
        });
        list.querySelectorAll('[data-ch-del]').forEach((b) => {
          b.addEventListener('click', () => {
            chapters.splice(Number(b.getAttribute('data-ch-del')), 1);
            renderCh();
          });
        });
      };
      renderCh();

      const addChapter = () => {
        const inp = panel.querySelector('#sub-new-ch');
        const val = inp.value.trim();
        if (!val) return;
        chapters.push({ id: uid('ch'), title: val, completed: false });
        inp.value = '';
        renderCh();
      };
      panel.querySelector('#sub-add-ch').addEventListener('click', addChapter);
      panel.querySelector('#sub-new-ch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addChapter();
        }
      });

      panel.querySelector('#tf-sub-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const name = panel.querySelector('#sub-name').value.trim();
        const err = panel.querySelector('#sub-err');
        if (!name) {
          err.textContent = 'Subject name is required.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const payload = {
          name,
          code: panel.querySelector('#sub-code').value.trim(),
          faculty: panel.querySelector('#sub-fac').value.trim(),
          semester: panel.querySelector('#sub-sem').value.trim(),
          chapters,
          syllabusCompletion: Number(panel.querySelector('#sub-pct').value) || 0,
        };
        if (isEdit) {
          store.updateSubject(existing.id, payload);
          showToast('Subject updated', 'success');
        } else {
          store.addSubject(payload);
          showToast('Subject added', 'success');
        }
        closeModal();
      });
    },
  });
}

function openAssignmentModal(existing = null) {
  const s = store.getState();
  const isEdit = Boolean(existing);
  const asg = existing || {
    title: '',
    subjectId: s.subjects[0]?.id || '',
    description: '',
    assignedDate: todayStr(),
    dueDate: addDays(todayStr(), 5),
    status: 'Pending',
    priority: 'High',
    notes: '',
  };
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Assignment' : 'Add Assignment',
    bodyHtml: `
      <form id="tf-asg-form" novalidate>
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label" for="asg-title">Assignment Title *</label>
            <input id="asg-title" class="input" type="text" value="${escapeHtml(asg.title)}" required placeholder="e.g., DBMS Normalization Lab Report" />
            <div id="asg-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field">
            <label class="form-label" for="asg-sub">Subject</label>
            <select id="asg-sub" class="select">
              <option value="">General / Unlinked</option>
              ${s.subjects.map((sub) => `<option value="${escapeHtml(sub.id)}" ${asg.subjectId === sub.id ? 'selected' : ''}>${escapeHtml(sub.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="asg-pri">Priority</label>
            <select id="asg-pri" class="select">
              ${['Critical', 'High', 'Medium', 'Low'].map((p) => `<option value="${p}" ${asg.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="asg-assigned">Assigned Date</label>
            <input id="asg-assigned" class="input" type="date" value="${escapeHtml(asg.assignedDate)}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="asg-due">Submission Deadline *</label>
            <input id="asg-due" class="input" type="date" value="${escapeHtml(asg.dueDate)}" required />
          </div>
          <div class="form-field full">
            <label class="form-label" for="asg-stat">Submission Status</label>
            <select id="asg-stat" class="select">
              ${['Pending', 'In Progress', 'Submitted', 'Graded'].map((st) => `<option value="${st}" ${asg.status === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-field full">
            <label class="form-label" for="asg-desc">Description</label>
            <textarea id="asg-desc" class="textarea">${escapeHtml(asg.description)}</textarea>
          </div>
          <div class="form-field full">
            <label class="form-label" for="asg-notes">Notes</label>
            <textarea id="asg-notes" class="textarea">${escapeHtml(asg.notes)}</textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-asg-form" class="btn btn-primary">${isEdit ? 'Save Assignment' : 'Add Assignment'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      panel.querySelector('#tf-asg-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const title = panel.querySelector('#asg-title').value.trim();
        const dueDate = panel.querySelector('#asg-due').value;
        const err = panel.querySelector('#asg-err');
        if (!title || !dueDate) {
          err.textContent = 'Title and submission deadline are required.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const payload = {
          title,
          subjectId: panel.querySelector('#asg-sub').value,
          priority: panel.querySelector('#asg-pri').value,
          assignedDate: panel.querySelector('#asg-assigned').value,
          dueDate,
          status: panel.querySelector('#asg-stat').value,
          description: panel.querySelector('#asg-desc').value.trim(),
          notes: panel.querySelector('#asg-notes').value.trim(),
        };
        if (isEdit) {
          store.updateAssignment(existing.id, payload);
          showToast('Assignment updated', 'success');
        } else {
          store.addAssignment(payload);
          showToast('Assignment added', 'success');
        }
        closeModal();
      });
    },
  });
}

function openExamModal(existing = null) {
  const s = store.getState();
  const isEdit = Boolean(existing);
  const exam = existing || {
    name: '',
    subjectId: s.subjects[0]?.id || '',
    examDate: addDays(todayStr(), 7),
    examTime: '09:30',
    topics: [],
    preparationStatus: 'Not Started',
    revisionDates: [],
    notes: '',
  };
  let topics = (exam.topics || []).map((t) => ({ ...t }));
  let revisionDates = [...(exam.revisionDates || [])];
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Examination' : 'Schedule Examination',
    bodyHtml: `
      <form id="tf-exm-form" novalidate>
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label" for="exm-name">Examination Name *</label>
            <input id="exm-name" class="input" type="text" value="${escapeHtml(exam.name)}" required placeholder="e.g., Mid-Semester Examination" />
            <div id="exm-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field">
            <label class="form-label" for="exm-sub">Subject</label>
            <select id="exm-sub" class="select">
              <option value="">General</option>
              ${s.subjects.map((sub) => `<option value="${escapeHtml(sub.id)}" ${exam.subjectId === sub.id ? 'selected' : ''}>${escapeHtml(sub.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="exm-stat">Preparation Status</label>
            <select id="exm-stat" class="select">
              ${['Not Started', 'Preparing', 'Revision', 'Ready'].map((st) => `<option value="${st}" ${exam.preparationStatus === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="exm-date">Examination Date *</label>
            <input id="exm-date" class="input" type="date" value="${escapeHtml(exam.examDate)}" required />
          </div>
          <div class="form-field">
            <label class="form-label" for="exm-time">Start Time</label>
            <input id="exm-time" class="input" type="time" value="${escapeHtml(exam.examTime)}" />
          </div>
          <div class="form-field full">
            <label class="form-label">Topics to Prepare</label>
            <div id="exm-topics-list" style="display:flex;flex-direction:column;gap:6px;"></div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <input id="exm-new-top" class="input" type="text" placeholder="Add exam topic..." style="flex:1;" />
              <button type="button" id="exm-add-top" class="btn btn-secondary btn-sm">Add Topic</button>
            </div>
          </div>
          <div class="form-field full">
            <label class="form-label">Revision Schedule Dates</label>
            <div id="exm-rev-list" style="display:flex;flex-wrap:wrap;gap:6px;"></div>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <input id="exm-new-rev" class="input" type="date" style="width:170px;" />
              <button type="button" id="exm-add-rev" class="btn btn-secondary btn-sm">Add Revision Date</button>
            </div>
          </div>
          <div class="form-field full">
            <label class="form-label" for="exm-notes">Important Notes</label>
            <textarea id="exm-notes" class="textarea">${escapeHtml(exam.notes)}</textarea>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-exm-form" class="btn btn-primary">${isEdit ? 'Save Exam' : 'Schedule Exam'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const renderTopics = () => {
        const list = panel.querySelector('#exm-topics-list');
        if (topics.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No topics listed yet.</div>';
          return;
        }
        list.innerHTML = topics
          .map(
            (tp, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);">
            <input type="checkbox" ${tp.prepared ? 'checked' : ''} data-tp-tog="${i}" />
            <span style="flex:1;font-size:13px;">${escapeHtml(tp.title)}</span>
            <button type="button" class="btn-icon btn-icon-ghost" data-tp-del="${i}" style="width:26px;height:26px;min-height:26px;">${icon('x', 13)}</button>
          </div>
        `
          )
          .join('');
        list.querySelectorAll('[data-tp-tog]').forEach((cb) => {
          cb.addEventListener('change', () => {
            topics[Number(cb.getAttribute('data-tp-tog'))].prepared = cb.checked;
          });
        });
        list.querySelectorAll('[data-tp-del]').forEach((b) => {
          b.addEventListener('click', () => {
            topics.splice(Number(b.getAttribute('data-tp-del')), 1);
            renderTopics();
          });
        });
      };

      const renderRevs = () => {
        const list = panel.querySelector('#exm-rev-list');
        if (revisionDates.length === 0) {
          list.innerHTML = '<div style="font-size:12.5px;color:var(--text-muted);">No revision dates added.</div>';
          return;
        }
        list.innerHTML = revisionDates
          .map(
            (d, i) => `
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:12.5px;" class="mono">
            ${escapeHtml(d)}
            <button type="button" data-rev-del="${i}" style="border:0;background:transparent;cursor:pointer;color:var(--text-muted);padding:0;">×</button>
          </span>
        `
          )
          .join('');
        list.querySelectorAll('[data-rev-del]').forEach((b) => {
          b.addEventListener('click', () => {
            revisionDates.splice(Number(b.getAttribute('data-rev-del')), 1);
            renderRevs();
          });
        });
      };

      renderTopics();
      renderRevs();

      panel.querySelector('#exm-add-top').addEventListener('click', () => {
        const inp = panel.querySelector('#exm-new-top');
        const val = inp.value.trim();
        if (!val) return;
        topics.push({ id: uid('top'), title: val, prepared: false });
        inp.value = '';
        renderTopics();
      });

      panel.querySelector('#exm-add-rev').addEventListener('click', () => {
        const inp = panel.querySelector('#exm-new-rev');
        const val = inp.value;
        if (!val || revisionDates.includes(val)) return;
        revisionDates.push(val);
        revisionDates.sort();
        inp.value = '';
        renderRevs();
      });

      panel.querySelector('#tf-exm-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const name = panel.querySelector('#exm-name').value.trim();
        const examDate = panel.querySelector('#exm-date').value;
        const err = panel.querySelector('#exm-err');
        if (!name || !examDate) {
          err.textContent = 'Examination name and date are required.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const payload = {
          name,
          subjectId: panel.querySelector('#exm-sub').value,
          preparationStatus: panel.querySelector('#exm-stat').value,
          examDate,
          examTime: panel.querySelector('#exm-time').value,
          topics,
          revisionDates,
          notes: panel.querySelector('#exm-notes').value.trim(),
        };
        if (isEdit) {
          store.updateExam(existing.id, payload);
          showToast('Examination updated', 'success');
        } else {
          store.addExam(payload);
          showToast('Examination scheduled', 'success');
        }
        closeModal();
      });
    },
  });
}

export function renderAcademicView(container) {
  const s = store.getState();
  const subjectMap = Object.fromEntries(s.subjects.map((sub) => [sub.id, sub]));
  const analytics = store.getAnalytics(7);
  const t0 = todayStr();

  let tabContent = '';

  if (acadState.tab === 'subjects') {
    const avgSyllabus =
      s.subjects.length > 0
        ? Math.round(s.subjects.reduce((acc, sub) => acc + (Number(sub.syllabusCompletion) || 0), 0) / s.subjects.length)
        : 0;

    tabContent = `
      <div class="toolbar">
        <div class="meta-line">
          <span><strong style="color:var(--text-primary);">${s.subjects.length}</strong> subjects</span>
          <span class="meta-sep">·</span>
          <span>Overall syllabus completion: <strong class="mono" style="color:var(--accent);">${avgSyllabus}%</strong></span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="acad-add-subject">${icon('plus', 14)} Add Subject</button>
      </div>
      ${
        s.subjects.length === 0
          ? `<div class="card"><div class="empty-state">
               <div class="empty-state-title">No subjects added yet</div>
               <div class="empty-state-desc">Add your courses with faculty details, chapters, and syllabus completion tracking.</div>
               <button type="button" class="btn btn-primary btn-sm" id="acad-empty-sub">Add First Subject</button>
             </div></div>`
          : `<div class="grid-2">
              ${s.subjects
                .map(
                  (sub) => `
                <article class="card">
                  <div class="card-header" style="margin-bottom:10px;">
                    <div>
                      <h3 class="card-title">${escapeHtml(sub.name)}</h3>
                      <div class="meta-line" style="margin-top:3px;">
                        ${sub.code ? `<span class="mono">${escapeHtml(sub.code)}</span>` : ''}
                        ${sub.faculty ? `<span class="meta-sep">·</span><span>${escapeHtml(sub.faculty)}</span>` : ''}
                        ${sub.semester ? `<span class="meta-sep">·</span><span>${escapeHtml(sub.semester)}</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;gap:4px;">
                      <button type="button" class="btn-icon btn-icon-ghost" data-sub-edit="${sub.id}" style="width:30px;height:30px;min-height:30px;">${icon('edit', 14)}</button>
                      <button type="button" class="btn-icon btn-icon-ghost" data-sub-del="${sub.id}" style="width:30px;height:30px;min-height:30px;">${icon('trash', 14)}</button>
                    </div>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;">
                    <span style="color:var(--text-muted);">Syllabus Progress</span>
                    <span class="mono" style="color:var(--accent);font-weight:600;">${sub.syllabusCompletion}%</span>
                  </div>
                  <div class="progress-track" style="margin-bottom:12px;">
                    <div class="progress-fill ${sub.syllabusCompletion === 100 ? 'success' : ''}" style="width:${sub.syllabusCompletion}%"></div>
                  </div>
                  ${
                    (sub.chapters || []).length > 0
                      ? `<div class="subtask-inline-list">
                          ${sub.chapters
                            .map(
                              (ch) => `
                            <label class="subtask-inline-item ${ch.completed ? 'done' : ''}">
                              <input type="checkbox" ${ch.completed ? 'checked' : ''} data-sub-id="${sub.id}" data-ch-id="${ch.id}" />
                              <span>${escapeHtml(ch.title)}</span>
                            </label>
                          `
                            )
                            .join('')}
                         </div>`
                      : `<div style="font-size:12.5px;color:var(--text-muted);">Edit subject to add chapter checklist.</div>`
                  }
                </article>
              `
                )
                .join('')}
             </div>`
      }
    `;
  } else if (acadState.tab === 'assignments') {
    const sorted = [...s.assignments].sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
    tabContent = `
      <div class="toolbar">
        <div class="meta-line">
          <span><strong style="color:var(--text-primary);">${s.assignments.length}</strong> assignments</span>
          <span class="meta-sep">·</span>
          <span>${s.assignments.filter((a) => a.status === 'Pending' || a.status === 'In Progress').length} pending</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="acad-add-asg">${icon('plus', 14)} Add Assignment</button>
      </div>
      <div class="card">
        ${
          sorted.length === 0
            ? `<div class="empty-state">
                 <div class="empty-state-title">No assignments tracked</div>
                 <div class="empty-state-desc">Add coursework assignments with submission deadlines to keep everything synced with your calendar and reminders.</div>
                 <button type="button" class="btn btn-primary btn-sm" id="acad-empty-asg">Add First Assignment</button>
               </div>`
            : `<div class="task-list">
                ${sorted
                  .map((asg) => {
                    const sub = subjectMap[asg.subjectId];
                    const diff = asg.dueDate ? getDaysDiff(asg.dueDate, t0) : null;
                    const done = asg.status === 'Submitted' || asg.status === 'Graded';
                    return `
                      <div class="task-row">
                        <div style="min-width:0;flex:1;">
                          <div class="task-title ${done ? 'completed' : ''}">${escapeHtml(asg.title)}</div>
                          ${asg.description ? `<div class="task-desc">${escapeHtml(asg.description)}</div>` : ''}
                          <div class="meta-line" style="margin-top:6px;">
                            ${sub ? `<span>${escapeHtml(sub.name)}</span><span class="meta-sep">·</span>` : ''}
                            <span>Status: <strong>${escapeHtml(asg.status)}</strong></span>
                            <span class="meta-sep">·</span>
                            <span class="priority-text-${asg.priority}">${escapeHtml(asg.priority)}</span>
                            <span class="meta-sep">·</span>
                            <span class="mono ${!done && diff !== null && diff < 0 ? 'tone-danger' : !done && diff !== null && diff <= 1 ? 'tone-warning' : ''}">
                              Due ${escapeHtml(formatDate(asg.dueDate, s.settings.dateFormat))}
                              ${!done && diff !== null ? (diff < 0 ? ` (Overdue ${Math.abs(diff)}d)` : diff === 0 ? ' (Today)' : ` (${diff}d left)`) : ''}
                            </span>
                          </div>
                        </div>
                        <div class="task-actions">
                          <select class="select" data-asg-stat="${asg.id}" style="width:auto;padding:5px 8px;font-size:12.5px;">
                            ${['Pending', 'In Progress', 'Submitted', 'Graded'].map((st) => `<option value="${st}" ${asg.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                          </select>
                          <button type="button" class="btn-icon btn-icon-ghost" data-asg-edit="${asg.id}">${icon('edit', 14)}</button>
                          <button type="button" class="btn-icon btn-icon-ghost" data-asg-del="${asg.id}">${icon('trash', 14)}</button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
               </div>`
        }
      </div>
    `;
  } else if (acadState.tab === 'exams') {
    const sortedExams = [...s.exams].sort((a, b) => (a.examDate || '9999-12-31').localeCompare(b.examDate || '9999-12-31'));
    tabContent = `
      <div class="toolbar">
        <div class="meta-line">
          <span><strong style="color:var(--text-primary);">${s.exams.length}</strong> examinations scheduled</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="acad-add-exam">${icon('plus', 14)} Schedule Exam</button>
      </div>
      ${
        sortedExams.length === 0
          ? `<div class="card"><div class="empty-state">
               <div class="empty-state-title">No examinations scheduled</div>
               <div class="empty-state-desc">Add upcoming exams with preparation topics and revision dates to sync with Calendar and Reminders.</div>
               <button type="button" class="btn btn-primary btn-sm" id="acad-empty-exam">Schedule First Exam</button>
             </div></div>`
          : `<div class="grid-2">
              ${sortedExams
                .map((ex) => {
                  const sub = subjectMap[ex.subjectId];
                  const diff = ex.examDate ? getDaysDiff(ex.examDate, t0) : null;
                  const prepCount = (ex.topics || []).filter((t) => t.prepared).length;
                  const totalTopics = (ex.topics || []).length;
                  return `
                    <article class="card">
                      <div class="card-header" style="margin-bottom:10px;">
                        <div>
                          <h3 class="card-title">${escapeHtml(ex.name)}</h3>
                          <div class="meta-line" style="margin-top:3px;">
                            ${sub ? `<span>${escapeHtml(sub.name)}</span><span class="meta-sep">·</span>` : ''}
                            <span class="mono">${escapeHtml(formatDate(ex.examDate, s.settings.dateFormat))}${ex.examTime ? ' ' + escapeHtml(formatTime(ex.examTime, s.settings.timeFormat)) : ''}</span>
                            ${diff !== null && diff >= 0 ? `<span class="meta-sep">·</span><span class="${diff <= 3 ? 'tone-warning' : 'tone-accent'}">${diff === 0 ? 'Today' : `In ${diff} days`}</span>` : ''}
                          </div>
                        </div>
                        <div style="display:flex;gap:4px;">
                          <button type="button" class="btn-icon btn-icon-ghost" data-exm-edit="${ex.id}" style="width:30px;height:30px;min-height:30px;">${icon('edit', 14)}</button>
                          <button type="button" class="btn-icon btn-icon-ghost" data-exm-del="${ex.id}" style="width:30px;height:30px;min-height:30px;">${icon('trash', 14)}</button>
                        </div>
                      </div>
                      <div class="meta-line" style="margin-bottom:10px;">
                        <span>Preparation: <strong>${escapeHtml(ex.preparationStatus)}</strong></span>
                        ${totalTopics > 0 ? `<span class="meta-sep">·</span><span class="mono">${prepCount}/${totalTopics} topics ready</span>` : ''}
                      </div>
                      ${
                        totalTopics > 0
                          ? `<div class="subtask-inline-list" style="margin-bottom:10px;">
                              ${ex.topics
                                .map(
                                  (tp) => `
                                <label class="subtask-inline-item ${tp.prepared ? 'done' : ''}">
                                  <input type="checkbox" ${tp.prepared ? 'checked' : ''} data-exm-id="${ex.id}" data-top-id="${tp.id}" />
                                  <span>${escapeHtml(tp.title)}</span>
                                </label>
                              `
                                )
                                .join('')}
                             </div>`
                          : ''
                      }
                      ${
                        (ex.revisionDates || []).length > 0
                          ? `<div class="meta-line" style="font-size:12px;"><span>Revision dates: ${ex.revisionDates.map((d) => escapeHtml(formatDate(d, s.settings.dateFormat))).join(', ')}</span></div>`
                          : ''
                      }
                      ${ex.notes ? `<div style="margin-top:8px;font-size:12.5px;color:var(--text-secondary);">${escapeHtml(ex.notes)}</div>` : ''}
                    </article>
                  `;
                })
                .join('')}
             </div>`
      }
    `;
  } else {
    // Study Planner
    const pendingChapters = [];
    s.subjects.forEach((sub) => {
      (sub.chapters || []).forEach((ch) => {
        if (!ch.completed) pendingChapters.push({ subject: sub.name, chapter: ch.title });
      });
    });

    const dailyGoalMins = (Number(s.settings.dailyStudyTargetHours) || 3) * 60;
    const weeklyGoalMins = (Number(s.settings.weeklyStudyTargetHours) || 20) * 60;
    const dailyPct = Math.min(100, Math.round((analytics.todayStudyMinutes / dailyGoalMins) * 100));
    const weeklyPct = Math.min(100, Math.round((analytics.weekStudyMinutes / weeklyGoalMins) * 100));

    // Revision reminders from upcoming exams
    const revisionReminders = s.exams.filter((ex) => {
      if (!ex.examDate) return false;
      const diff = getDaysDiff(ex.examDate, t0);
      return diff !== null && diff >= 0 && diff <= 14;
    });

    tabContent = `
      <div class="grid-3" style="margin-bottom:18px;">
        <div class="kpi-card">
          <span class="kpi-label">Daily Study Target</span>
          <span class="kpi-value">${formatDuration(analytics.todayStudyMinutes)}</span>
          <div class="progress-track" style="margin:6px 0;"><div class="progress-fill" style="width:${dailyPct}%"></div></div>
          <span class="kpi-meta">${dailyPct}% of ${s.settings.dailyStudyTargetHours}h daily goal</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Weekly Study Goal</span>
          <span class="kpi-value">${formatDuration(analytics.weekStudyMinutes)}</span>
          <div class="progress-track" style="margin:6px 0;"><div class="progress-fill success" style="width:${weeklyPct}%"></div></div>
          <span class="kpi-meta">${weeklyPct}% of ${s.settings.weeklyStudyTargetHours}h weekly goal</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Logged Study</span>
          <span class="kpi-value">${formatDuration(analytics.totalStudyMinutes)}</span>
          <span class="kpi-meta">${pendingChapters.length} pending chapters across subjects</span>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:18px;">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Log Study Session</h3>
              <div class="card-subtitle">Track subject-wise study hours</div>
            </div>
          </div>
          <form id="study-session-form" novalidate>
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="ss-sub">Subject</label>
                <select id="ss-sub" class="select">
                  <option value="">General Study</option>
                  ${s.subjects.map((sub) => `<option value="${escapeHtml(sub.id)}">${escapeHtml(sub.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="ss-mins">Duration (minutes) *</label>
                <input id="ss-mins" class="input" type="number" min="5" max="720" value="45" required />
              </div>
              <div class="form-field">
                <label class="form-label" for="ss-date">Date</label>
                <input id="ss-date" class="input" type="date" value="${t0}" />
              </div>
              <div class="form-field">
                <label class="form-label" for="ss-topic">Chapter / Topic Covered</label>
                <input id="ss-topic" class="input" type="text" placeholder="e.g., Dijkstra algorithm" />
              </div>
              <div class="form-field full">
                <button type="submit" class="btn btn-primary">Log Study Session</button>
              </div>
            </div>
          </form>

          <hr style="border:0;border-top:1px solid var(--border-hairline);margin:16px 0;" />
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="form-field">
              <label class="form-label" for="goal-daily">Daily Target (hrs)</label>
              <input id="goal-daily" class="input" type="number" min="0.5" max="16" step="0.5" value="${s.settings.dailyStudyTargetHours}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="goal-weekly">Weekly Goal (hrs)</label>
              <input id="goal-weekly" class="input" type="number" min="1" max="100" step="1" value="${s.settings.weeklyStudyTargetHours}" />
            </div>
          </div>
          <button type="button" id="save-study-goals" class="btn btn-secondary btn-sm" style="margin-top:10px;">Update Study Targets</button>
        </div>

        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Pending Chapters &amp; Revision Reminders</h3>
              <div class="card-subtitle">What needs study attention next</div>
            </div>
          </div>
          ${
            revisionReminders.length > 0
              ? `<div style="margin-bottom:14px;">
                  <div style="font-size:12.5px;font-weight:600;color:var(--warning);margin-bottom:6px;">Upcoming Exam Revisions</div>
                  ${revisionReminders
                    .map(
                      (ex) => `
                    <div style="padding:8px 10px;border-radius:6px;background:var(--warning-soft);margin-bottom:6px;font-size:13px;">
                      <strong>${escapeHtml(ex.name)}</strong> · ${escapeHtml(formatDate(ex.examDate, s.settings.dateFormat))} (${escapeHtml(ex.preparationStatus)})
                    </div>
                  `
                    )
                    .join('')}
                 </div>`
              : ''
          }
          ${
            pendingChapters.length === 0
              ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-desc">No pending chapters. Add chapters inside your Subjects tab to track them here.</div></div>`
              : `<div class="task-list">
                  ${pendingChapters
                    .slice(0, 8)
                    .map(
                      (pc) => `
                    <div class="task-row" style="padding:8px 2px;">
                      <div>
                        <div style="font-size:13.5px;font-weight:500;color:var(--text-primary);">${escapeHtml(pc.chapter)}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(pc.subject)}</div>
                      </div>
                    </div>
                  `
                    )
                    .join('')}
                 </div>`
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Study Sessions</h3>
        </div>
        ${
          s.studySessions.length === 0
            ? `<div class="empty-state" style="padding:20px;"><div class="empty-state-desc">Log your first study session above to track completed hours.</div></div>`
            : `<div class="task-list">
                ${s.studySessions
                  .slice(0, 12)
                  .map((ss) => {
                    const sub = subjectMap[ss.subjectId];
                    return `
                      <div class="task-row" style="padding:9px 2px;">
                        <div>
                          <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(sub ? sub.name : 'General Study')}${ss.topic ? ' · ' + escapeHtml(ss.topic) : ''}</div>
                          <div class="meta-line">
                            <span class="mono">${escapeHtml(formatDate(ss.date, s.settings.dateFormat))}</span>
                            <span class="meta-sep">·</span>
                            <span class="mono tone-accent">${formatDuration(ss.durationMinutes)}</span>
                          </div>
                        </div>
                        <button type="button" class="btn-icon btn-icon-ghost" data-del-ss="${ss.id}" aria-label="Delete study session">${icon('trash', 14)}</button>
                      </div>
                    `;
                  })
                  .join('')}
               </div>`
        }
      </div>
    `;
  }

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Academic Manager</h2>
        <div class="card-subtitle">Manage subjects, syllabus progress, assignments, exams &amp; study targets</div>
      </div>
      <div class="segmented" role="tablist">
        <button type="button" class="segmented-btn ${acadState.tab === 'subjects' ? 'active' : ''}" data-acad-tab="subjects">Subjects</button>
        <button type="button" class="segmented-btn ${acadState.tab === 'assignments' ? 'active' : ''}" data-acad-tab="assignments">Assignments</button>
        <button type="button" class="segmented-btn ${acadState.tab === 'exams' ? 'active' : ''}" data-acad-tab="exams">Exams</button>
        <button type="button" class="segmented-btn ${acadState.tab === 'study' ? 'active' : ''}" data-acad-tab="study">Study Planner</button>
      </div>
    </div>
    ${tabContent}
  `;

  container.querySelectorAll('[data-acad-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      acadState.tab = btn.getAttribute('data-acad-tab');
      renderAcademicView(container);
    });
  });

  // Subjects bindings
  container.querySelector('#acad-add-subject')?.addEventListener('click', () => openSubjectModal());
  container.querySelector('#acad-empty-sub')?.addEventListener('click', () => openSubjectModal());
  container.querySelectorAll('[data-sub-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = s.subjects.find((x) => x.id === btn.getAttribute('data-sub-edit'));
      if (sub) openSubjectModal(sub);
    });
  });
  container.querySelectorAll('[data-sub-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-sub-del');
      const sub = s.subjects.find((x) => x.id === id);
      if (!sub) return;
      confirmAction({
        title: 'Delete Subject',
        message: `Remove "${sub.name}"? Linked assignments and exams will remain in your workspace.`,
        confirmLabel: 'Delete Subject',
        onConfirm: () => {
          store.deleteSubject(id);
          showToast('Subject removed', 'info');
        },
      });
    });
  });
  container.querySelectorAll('[data-sub-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      store.toggleSubjectChapter(cb.getAttribute('data-sub-id'), cb.getAttribute('data-ch-id'));
    });
  });

  // Assignments bindings
  container.querySelector('#acad-add-asg')?.addEventListener('click', () => openAssignmentModal());
  container.querySelector('#acad-empty-asg')?.addEventListener('click', () => openAssignmentModal());
  container.querySelectorAll('[data-asg-stat]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      store.updateAssignment(sel.getAttribute('data-asg-stat'), { status: e.target.value });
      showToast('Assignment status updated', 'success');
    });
  });
  container.querySelectorAll('[data-asg-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = s.assignments.find((x) => x.id === btn.getAttribute('data-asg-edit'));
      if (item) openAssignmentModal(item);
    });
  });
  container.querySelectorAll('[data-asg-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-asg-del');
      confirmAction({
        title: 'Delete Assignment',
        message: 'Delete this assignment permanently?',
        confirmLabel: 'Delete Assignment',
        onConfirm: () => {
          store.deleteAssignment(id);
          showToast('Assignment deleted', 'info');
        },
      });
    });
  });

  // Exams bindings
  container.querySelector('#acad-add-exam')?.addEventListener('click', () => openExamModal());
  container.querySelector('#acad-empty-exam')?.addEventListener('click', () => openExamModal());
  container.querySelectorAll('[data-exm-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = s.exams.find((x) => x.id === btn.getAttribute('data-exm-edit'));
      if (item) openExamModal(item);
    });
  });
  container.querySelectorAll('[data-exm-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-exm-del');
      confirmAction({
        title: 'Delete Exam',
        message: 'Remove this scheduled examination?',
        confirmLabel: 'Delete Exam',
        onConfirm: () => {
          store.deleteExam(id);
          showToast('Exam removed', 'info');
        },
      });
    });
  });
  container.querySelectorAll('[data-exm-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      store.toggleExamTopic(cb.getAttribute('data-exm-id'), cb.getAttribute('data-top-id'));
    });
  });

  // Study Planner bindings
  container.querySelector('#study-session-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const mins = Number(container.querySelector('#ss-mins').value);
    if (!mins || mins < 5) {
      showToast('Enter at least 5 minutes for a study session.', 'warning');
      return;
    }
    store.addStudySession({
      subjectId: container.querySelector('#ss-sub').value,
      durationMinutes: mins,
      date: container.querySelector('#ss-date').value || todayStr(),
      topic: container.querySelector('#ss-topic').value,
    });
    showToast(`Logged ${mins}m study session`, 'success');
  });

  container.querySelector('#save-study-goals')?.addEventListener('click', () => {
    const daily = Number(container.querySelector('#goal-daily').value) || 3;
    const weekly = Number(container.querySelector('#goal-weekly').value) || 20;
    store.updateSettings({ dailyStudyTargetHours: daily, weeklyStudyTargetHours: weekly });
    showToast('Study goals updated', 'success');
  });

  container.querySelectorAll('[data-del-ss]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.deleteStudySession(btn.getAttribute('data-del-ss'));
      showToast('Study session removed', 'info');
    });
  });
}
