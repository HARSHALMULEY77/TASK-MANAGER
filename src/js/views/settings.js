import { store } from '../store.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { confirmAction, openMigrationModal, showToast } from '../components/modals.js';
import { sendEmailVerification, mapAuthError } from '../firebase.js';

export function renderSettingsView(container) {
  const s = store.getState();
  const user = store.getUser();
  const cloud = store.getCloudStatus();
  const migSummary = store.getLocalMigrationSummary();

  const syncLabel =
    cloud.syncState === 'synced'
      ? 'Synced with Cloud Firestore'
      : cloud.syncState === 'syncing'
      ? 'Syncing changes...'
      : cloud.syncState === 'offline'
      ? 'Offline (changes cached locally and will sync when online)'
      : cloud.syncState === 'error'
      ? `Sync error: ${cloud.syncError || 'Check connection'}`
      : 'Connected';

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Settings &amp; Data Management</h2>
        <div class="card-subtitle">Account, cloud sync, profile, themes, formats &amp; backup tools</div>
      </div>
    </div>

    <section class="card" style="margin-bottom:18px;">
      <div class="card-header">
        <div>
          <h3 class="card-title">Account &amp; Cloud Synchronization</h3>
          <div class="card-subtitle">Isolated private workspace encrypted and stored under your Firebase UID</div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="set-logout-btn">Sign Out</button>
      </div>
      <div class="form-grid" style="margin-bottom:12px;">
        <div>
          <div class="form-label">Signed-in Email</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-top:4px;word-break:break-word;">
            ${escapeHtml(user?.email || 'No email')}
            ${
              user?.emailVerified
                ? '<span style="color:var(--success);font-size:12px;margin-left:6px;">(Verified)</span>'
                : '<span style="color:var(--warning);font-size:12px;margin-left:6px;">(Unverified)</span>'
            }
          </div>
        </div>
        <div>
          <div class="form-label">Firebase UID</div>
          <div class="mono" style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;word-break:break-all;">${escapeHtml(user?.uid || '—')}</div>
        </div>
        <div>
          <div class="form-label">Cloud Sync Status</div>
          <div style="font-size:13.5px;color:${cloud.syncState === 'error' ? 'var(--danger)' : cloud.syncState === 'offline' ? 'var(--warning)' : 'var(--success)'};margin-top:4px;font-weight:500;">
            ${escapeHtml(syncLabel)}
          </div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;">
          ${
            user && !user.emailVerified
              ? `<button type="button" class="btn btn-secondary btn-sm" id="set-verify-email">Send Verification Email</button>`
              : ''
          }
          ${
            migSummary
              ? `<button type="button" class="btn btn-primary btn-sm" id="set-migrate-local">Migrate Local Data (${migSummary.totalItems})</button>`
              : ''
          }
        </div>
      </div>
    </section>

    <div class="grid-2" style="margin-bottom:18px;">
      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">User Profile</h3>
            <div class="card-subtitle">Personalize your greeting and daily context</div>
          </div>
        </div>
        <form id="set-profile-form">
          <div class="form-grid">
            <div class="form-field">
              <label class="form-label" for="prof-name">Your Name</label>
              <input id="prof-name" class="input" type="text" value="${escapeHtml(s.profile.name)}" placeholder="Your name" />
            </div>
            <div class="form-field">
              <label class="form-label" for="prof-goal">Main Goal</label>
              <input id="prof-goal" class="input" type="text" value="${escapeHtml(s.profile.mainGoal)}" placeholder="Primary focus" />
            </div>
            <div class="form-field">
              <label class="form-label" for="prof-wstart">Work Start</label>
              <input id="prof-wstart" class="input" type="time" value="${escapeHtml(s.profile.workHoursStart)}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="prof-wend">Work End</label>
              <input id="prof-wend" class="input" type="time" value="${escapeHtml(s.profile.workHoursEnd)}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="prof-inst">Institution / Role</label>
              <input id="prof-inst" class="input" type="text" value="${escapeHtml(s.profile.institution)}" />
            </div>
            <div class="form-field">
              <label class="form-label" for="prof-sem">Semester / Term</label>
              <input id="prof-sem" class="input" type="text" value="${escapeHtml(s.profile.semester)}" />
            </div>
            <div class="form-field full">
              <button type="submit" class="btn btn-primary btn-sm">Save Profile</button>
            </div>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Appearance &amp; Defaults</h3>
            <div class="card-subtitle">Changes apply and sync across devices immediately</div>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label" for="set-theme">Application Theme</label>
            <select id="set-theme" class="select">
              <option value="navy" ${s.settings.theme === 'navy' ? 'selected' : ''}>Deep Navy (Default)</option>
              <option value="charcoal" ${s.settings.theme === 'charcoal' ? 'selected' : ''}>Dark Charcoal</option>
              <option value="midnight" ${s.settings.theme === 'midnight' ? 'selected' : ''}>Midnight Slate</option>
              <option value="light" ${s.settings.theme === 'light' ? 'selected' : ''}>Crisp Light</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="set-datefmt">Date Format</label>
            <select id="set-datefmt" class="select">
              <option value="MMM DD, YYYY" ${s.settings.dateFormat === 'MMM DD, YYYY' ? 'selected' : ''}>MMM DD, YYYY (Nov 24, 2026)</option>
              <option value="YYYY-MM-DD" ${s.settings.dateFormat === 'YYYY-MM-DD' ? 'selected' : ''}>YYYY-MM-DD (2026-11-24)</option>
              <option value="DD/MM/YYYY" ${s.settings.dateFormat === 'DD/MM/YYYY' ? 'selected' : ''}>DD/MM/YYYY (24/11/2026)</option>
              <option value="MM/DD/YYYY" ${s.settings.dateFormat === 'MM/DD/YYYY' ? 'selected' : ''}>MM/DD/YYYY (11/24/2026)</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="set-timefmt">Time Format</label>
            <select id="set-timefmt" class="select">
              <option value="12h" ${s.settings.timeFormat === '12h' ? 'selected' : ''}>12-hour (AM/PM)</option>
              <option value="24h" ${s.settings.timeFormat === '24h' ? 'selected' : ''}>24-hour (00:00–23:59)</option>
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="set-defpri">Default Task Priority</label>
            <select id="set-defpri" class="select">
              ${['Critical', 'High', 'Medium', 'Low']
                .map((p) => `<option value="${p}" ${s.settings.defaultPriority === p ? 'selected' : ''}>${p}</option>`)
                .join('')}
            </select>
          </div>
          <div class="form-field full">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;">
              <input type="checkbox" id="set-inapp-rem" ${s.settings.enableInAppReminders ? 'checked' : ''} style="accent-color:var(--accent);" />
              <span>Enable in-app reminder badge &amp; alerts</span>
            </label>
          </div>
          <div class="form-field full">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px;">
              <input type="checkbox" id="set-browser-rem" ${s.settings.enableBrowserNotifications ? 'checked' : ''} style="accent-color:var(--accent);" />
              <span>Enable browser desktop notifications (when permission granted)</span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <div class="grid-2" style="margin-bottom:18px;">
      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Custom Categories</h3>
            <div class="card-subtitle">Organize tasks across life domains</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          ${s.settings.categories
            .map(
              (c) => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:7px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:13px;">
              ${escapeHtml(c)}
              ${
                s.settings.categories.length > 1
                  ? `<button type="button" data-del-cat="${escapeHtml(c)}" style="border:0;background:transparent;cursor:pointer;color:var(--text-muted);padding:0;" aria-label="Remove category ${escapeHtml(c)}">×</button>`
                  : ''
              }
            </span>
          `
            )
            .join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <input id="set-new-cat" class="input" type="text" placeholder="Add category..." style="flex:1;" />
          <button type="button" id="set-add-cat-btn" class="btn btn-secondary btn-sm">Add</button>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Custom Tags</h3>
            <div class="card-subtitle">Quick labels for filtering and context</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          ${s.settings.tags
            .map(
              (t) => `
            <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:7px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:13px;">
              ${escapeHtml(t)}
              <button type="button" data-del-tag="${escapeHtml(t)}" style="border:0;background:transparent;cursor:pointer;color:var(--text-muted);padding:0;" aria-label="Remove tag ${escapeHtml(t)}">×</button>
            </span>
          `
            )
            .join('')}
        </div>
        <div style="display:flex;gap:8px;">
          <input id="set-new-tag" class="input" type="text" placeholder="Add tag..." style="flex:1;" />
          <button type="button" id="set-add-tag-btn" class="btn btn-secondary btn-sm">Add</button>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-header">
        <div>
          <h3 class="card-title">Data Management &amp; Backup</h3>
          <div class="card-subtitle">Your data syncs to Cloud Firestore and caches locally for offline resilience. Export backups anytime.</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" class="btn btn-secondary" id="data-export-json">${icon('download', 15)} Export All Data (JSON)</button>
        <button type="button" class="btn btn-secondary" id="data-export-csv">${icon('download', 15)} Export Tasks (CSV)</button>
        <label class="btn btn-secondary" style="cursor:pointer;">
          ${icon('upload', 15)} Import JSON Backup
          <input type="file" id="data-import-json" accept="application/json,.json" style="display:none;" />
        </label>
        ${
          store.hasSampleData()
            ? `<button type="button" class="btn btn-secondary" id="data-clear-samples">Remove Example Items</button>`
            : `<button type="button" class="btn btn-secondary" id="data-load-samples">Load Example Items</button>`
        }
        <button type="button" class="btn btn-danger" id="data-reset-all" style="margin-left:auto;">Reset Cloud Workspace Data</button>
      </div>
    </section>
  `;

  // Account Actions
  container.querySelector('#set-logout-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#set-logout-btn');
    btn.disabled = true;
    btn.textContent = 'Signing out...';
    try {
      await store.logoutUser();
    } catch {
      showToast('Sign out failed. Please try again.', 'danger');
      btn.disabled = false;
      btn.textContent = 'Sign Out';
    }
  });

  container.querySelector('#set-verify-email')?.addEventListener('click', async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      showToast(`Verification email sent to ${user.email}`, 'success');
    } catch (err) {
      showToast(mapAuthError(err), 'warning');
    }
  });

  container.querySelector('#set-migrate-local')?.addEventListener('click', () => {
    if (migSummary) openMigrationModal(migSummary);
  });

  // Profile form
  container.querySelector('#set-profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateProfile({
      name: container.querySelector('#prof-name').value.trim(),
      mainGoal: container.querySelector('#prof-goal').value.trim(),
      workHoursStart: container.querySelector('#prof-wstart').value,
      workHoursEnd: container.querySelector('#prof-wend').value,
      institution: container.querySelector('#prof-inst').value.trim(),
      semester: container.querySelector('#prof-sem').value.trim(),
    });
    showToast('Profile saved', 'success');
  });

  // Appearance & Defaults
  container.querySelector('#set-theme').addEventListener('change', (e) => {
    store.updateSettings({ theme: e.target.value });
    document.documentElement.setAttribute('data-theme', e.target.value);
    showToast('Theme updated', 'success');
  });
  container.querySelector('#set-datefmt').addEventListener('change', (e) => {
    store.updateSettings({ dateFormat: e.target.value });
  });
  container.querySelector('#set-timefmt').addEventListener('change', (e) => {
    store.updateSettings({ timeFormat: e.target.value });
  });
  container.querySelector('#set-defpri').addEventListener('change', (e) => {
    store.updateSettings({ defaultPriority: e.target.value });
  });
  container.querySelector('#set-inapp-rem').addEventListener('change', (e) => {
    store.updateSettings({ enableInAppReminders: e.target.checked });
  });
  container.querySelector('#set-browser-rem').addEventListener('change', (e) => {
    store.updateSettings({ enableBrowserNotifications: e.target.checked });
  });

  // Categories
  container.querySelector('#set-add-cat-btn').addEventListener('click', () => {
    const inp = container.querySelector('#set-new-cat');
    if (store.addCategory(inp.value)) {
      inp.value = '';
      showToast('Category added', 'success');
    }
  });
  container.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.removeCategory(btn.getAttribute('data-del-cat'));
    });
  });

  // Tags
  container.querySelector('#set-add-tag-btn').addEventListener('click', () => {
    const inp = container.querySelector('#set-new-tag');
    if (store.addTag(inp.value)) {
      inp.value = '';
      showToast('Tag added', 'success');
    }
  });
  container.querySelectorAll('[data-del-tag]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.removeTag(btn.getAttribute('data-del-tag'));
    });
  });

  // Data Management
  container.querySelector('#data-export-json').addEventListener('click', () => {
    store.exportAllJson();
    showToast('JSON backup exported', 'success');
  });

  container.querySelector('#data-export-csv').addEventListener('click', () => {
    store.exportTasksCsv();
    showToast('Tasks CSV exported', 'success');
  });

  container.querySelector('#data-import-json').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const check = store.validateImportJson(String(reader.result || ''));
      if (!check.ok) {
        showToast(check.error, 'danger');
        return;
      }
      confirmAction({
        title: 'Restore JSON Backup',
        message: `Import backup containing ${check.data.tasks.length} tasks and ${check.data.projects.length} projects? This will replace your current cloud workspace data.`,
        confirmLabel: 'Import & Replace',
        onConfirm: async () => {
          await store.importJsonData(check.data);
          document.documentElement.setAttribute('data-theme', check.data.settings.theme || 'navy');
          showToast('Backup imported and synced to cloud', 'success');
        },
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  container.querySelector('#data-clear-samples')?.addEventListener('click', () => {
    confirmAction({
      title: 'Remove Example Items',
      message: 'Remove all sample items while keeping everything you created?',
      confirmLabel: 'Remove Examples',
      onConfirm: () => {
        store.removeSampleWorkspace();
        showToast('Example items removed', 'success');
      },
    });
  });

  container.querySelector('#data-load-samples')?.addEventListener('click', () => {
    store.loadSampleWorkspace(true);
    showToast('Example items loaded', 'success');
  });

  container.querySelector('#data-reset-all').addEventListener('click', () => {
    confirmAction({
      title: 'Reset Cloud Workspace Data',
      message:
        'This will permanently erase ALL tasks, projects, academic records, routine blocks, notes, and settings from your cloud account. Your local backup (if any) is untouched. Continue?',
      confirmLabel: 'Yes, Reset Everything',
      onConfirm: async () => {
        await store.resetAllData();
        document.documentElement.setAttribute('data-theme', 'navy');
        showToast('Cloud workspace data reset', 'info');
      },
    });
  });
}
