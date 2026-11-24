import { store } from '../store.js';
import { escapeHtml, formatRelativeTimestamp } from '../utils.js';
import { icon } from '../icons.js';
import { openModal, closeModal, confirmAction, showToast } from '../components/modals.js';

const noteState = {
  search: '',
  category: 'All',
};

const NOTE_CATEGORIES = ['Quick Note', 'Academic Note', 'Project Note', 'Idea', 'Important Info'];

function openNoteModal(existing = null) {
  const isEdit = Boolean(existing);
  const note = existing || {
    title: '',
    content: '',
    category: 'Quick Note',
    tags: [],
    pinned: false,
  };
  let submitting = false;

  openModal({
    title: isEdit ? 'Edit Note' : 'New Note',
    bodyHtml: `
      <form id="tf-note-form" novalidate>
        <div class="form-grid">
          <div class="form-field full">
            <label class="form-label" for="nte-title">Note Title *</label>
            <input id="nte-title" class="input" type="text" value="${escapeHtml(note.title)}" required placeholder="e.g., Operating Systems Semaphore Summary" />
            <div id="nte-err" class="form-error" style="display:none;"></div>
          </div>
          <div class="form-field">
            <label class="form-label" for="nte-cat">Category</label>
            <select id="nte-cat" class="select">
              ${NOTE_CATEGORIES.map((c) => `<option value="${c}" ${note.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="nte-tags">Tags (comma separated)</label>
            <input id="nte-tags" class="input" type="text" value="${escapeHtml((note.tags || []).join(', '))}" placeholder="e.g., Exam Prep, Concept" />
          </div>
          <div class="form-field full">
            <label class="form-label" for="nte-body">Content *</label>
            <textarea id="nte-body" class="textarea" rows="7" placeholder="Write your note, snippet, or key takeaway...">${escapeHtml(note.content)}</textarea>
          </div>
          <div class="form-field full">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;">
              <input type="checkbox" id="nte-pin" ${note.pinned ? 'checked' : ''} style="accent-color:var(--accent);" />
              <span>Pin this note to the top</span>
            </label>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
      <button type="submit" form="tf-note-form" class="btn btn-primary">${isEdit ? 'Save Note' : 'Create Note'}</button>
    `,
    onMount: (panel) => {
      panel.querySelector('[data-cancel]').addEventListener('click', closeModal);
      setTimeout(() => panel.querySelector('#nte-title').focus(), 30);

      panel.querySelector('#tf-note-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (submitting) return;
        const title = panel.querySelector('#nte-title').value.trim();
        const content = panel.querySelector('#nte-body').value.trim();
        const err = panel.querySelector('#nte-err');
        if (!title && !content) {
          err.textContent = 'Please enter a title or note content.';
          err.style.display = 'block';
          return;
        }
        submitting = true;
        const tags = panel
          .querySelector('#nte-tags')
          .value.split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        const payload = {
          title: title || 'Untitled Note',
          content,
          category: panel.querySelector('#nte-cat').value,
          tags,
          pinned: panel.querySelector('#nte-pin').checked,
        };
        if (isEdit) {
          store.updateNote(existing.id, payload);
          showToast('Note updated', 'success');
        } else {
          store.addNote(payload);
          showToast('Note saved', 'success');
        }
        closeModal();
      });
    },
  });
}

export function renderNotesView(container) {
  const s = store.getState();

  const filtered = s.notes
    .filter((n) => {
      if (noteState.category !== 'All' && n.category !== noteState.category) return false;
      if (noteState.search.trim()) {
        const q = noteState.search.trim().toLowerCase();
        const hay = `${n.title} ${n.content} ${n.category} ${(n.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Personal Notes</h2>
        <div class="card-subtitle">Quick notes, academic summaries, project architecture &amp; ideas</div>
      </div>
      <button type="button" class="btn btn-primary" id="notes-new-btn">${icon('plus', 15)} New Note</button>
    </div>

    <div class="card card-compact" style="margin-bottom:16px;">
      <div class="filter-bar" style="margin-bottom:0;">
        <input id="notes-search" class="input" type="search" placeholder="Search notes by title, content, or tag..." value="${escapeHtml(noteState.search)}" style="flex:1;min-width:220px;" />
        <div class="segmented" role="tablist">
          ${['All', ...NOTE_CATEGORIES]
            .map(
              (c) =>
                `<button type="button" class="segmented-btn ${noteState.category === c ? 'active' : ''}" data-note-cat="${c}">${c}</button>`
            )
            .join('')}
        </div>
      </div>
    </div>

    ${
      filtered.length === 0
        ? `<div class="card"><div class="empty-state">
             <div class="empty-state-title">${s.notes.length === 0 ? 'No notes saved yet' : 'No matching notes'}</div>
             <div class="empty-state-desc">Capture ideas, lecture takeaways, project specs, or use Quick Capture anytime.</div>
             <button type="button" class="btn btn-primary btn-sm" id="notes-empty-add">${icon('plus', 14)} Create Note</button>
           </div></div>`
        : `<div class="notes-grid">
            ${filtered
              .map(
                (n) => `
              <article class="note-card">
                <div>
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <h3 style="font-size:15.5px;font-weight:700;color:var(--text-primary);">${escapeHtml(n.title)}</h3>
                    <div style="display:flex;gap:2px;flex-shrink:0;">
                      <button type="button" class="btn-icon btn-icon-ghost" title="${n.pinned ? 'Unpin' : 'Pin'}" data-note-pin="${n.id}" style="width:28px;height:28px;min-height:28px;color:${n.pinned ? 'var(--accent)' : 'var(--text-muted)'};">${icon('pin', 14)}</button>
                      <button type="button" class="btn-icon btn-icon-ghost" title="Edit note" data-note-edit="${n.id}" style="width:28px;height:28px;min-height:28px;">${icon('edit', 14)}</button>
                      <button type="button" class="btn-icon btn-icon-ghost" title="Delete note" data-note-del="${n.id}" style="width:28px;height:28px;min-height:28px;">${icon('trash', 14)}</button>
                    </div>
                  </div>
                  <div class="meta-line" style="margin-bottom:10px;font-size:12px;">
                    <span>${escapeHtml(n.category)}</span>
                    ${n.pinned ? `<span class="meta-sep">·</span><span class="tone-accent">Pinned</span>` : ''}
                    ${(n.tags || []).length > 0 ? `<span class="meta-sep">·</span><span>${n.tags.map(escapeHtml).join(', ')}</span>` : ''}
                  </div>
                  <div class="note-card-body">${escapeHtml(n.content)}</div>
                </div>
                <div class="meta-line" style="font-size:11.5px;border-top:1px solid var(--border-hairline);padding-top:8px;">
                  <span>Updated ${escapeHtml(formatRelativeTimestamp(n.updatedAt))}</span>
                </div>
              </article>
            `
              )
              .join('')}
           </div>`
    }
  `;

  container.querySelector('#notes-new-btn').addEventListener('click', () => openNoteModal());
  container.querySelector('#notes-empty-add')?.addEventListener('click', () => openNoteModal());

  const searchEl = container.querySelector('#notes-search');
  searchEl.addEventListener('input', () => {
    noteState.search = searchEl.value;
    const pos = searchEl.selectionStart;
    renderNotesView(container);
    const next = container.querySelector('#notes-search');
    if (next) {
      next.focus();
      if (pos !== null) next.setSelectionRange(pos, pos);
    }
  });

  container.querySelectorAll('[data-note-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      noteState.category = btn.getAttribute('data-note-cat');
      renderNotesView(container);
    });
  });

  container.querySelectorAll('[data-note-pin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-note-pin');
      const n = s.notes.find((x) => x.id === id);
      if (n) store.updateNote(id, { pinned: !n.pinned });
    });
  });

  container.querySelectorAll('[data-note-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = s.notes.find((x) => x.id === btn.getAttribute('data-note-edit'));
      if (n) openNoteModal(n);
    });
  });

  container.querySelectorAll('[data-note-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-note-del');
      const n = s.notes.find((x) => x.id === id);
      if (!n) return;
      confirmAction({
        title: 'Delete Note',
        message: `Delete note "${n.title}"? This action cannot be undone.`,
        confirmLabel: 'Delete Note',
        onConfirm: () => {
          store.deleteNote(id);
          showToast('Note deleted', 'info');
        },
      });
    });
  });
}
