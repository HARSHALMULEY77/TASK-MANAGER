import { store } from '../store.js';
import { escapeHtml, formatDate, formatTime } from '../utils.js';
import { icon } from '../icons.js';
import { showToast } from '../components/modals.js';

export function renderRemindersView(container, { navigate }) {
  const s = store.getState();
  const reminders = store.getActiveReminders();
  const overdue = reminders.filter((r) => r.severity === 'overdue');
  const todayList = reminders.filter((r) => r.severity === 'today');
  const upcoming = reminders.filter((r) => r.severity === 'upcoming');

  const notifSupported = typeof Notification !== 'undefined';
  const perm = notifSupported ? Notification.permission : 'unsupported';
  const permLabel =
    perm === 'granted'
      ? 'Granted'
      : perm === 'denied'
      ? 'Blocked by browser'
      : perm === 'default'
      ? 'Not requested yet'
      : 'Not supported in this browser';

  const renderGroup = (title, items, toneClass, emptyText) => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header" style="margin-bottom:10px;">
        <div>
          <h3 class="card-title ${toneClass}">${escapeHtml(title)}</h3>
        </div>
        <span class="mono" style="font-size:13px;color:var(--text-muted);">${items.length}</span>
      </div>
      ${
        items.length === 0
          ? `<div style="font-size:13.5px;color:var(--text-muted);padding:6px 0;">${escapeHtml(emptyText)}</div>`
          : `<div class="task-list">
              ${items
                .map((r) => {
                  const route =
                    r.sourceType === 'Task'
                      ? 'tasks'
                      : r.sourceType === 'Project'
                      ? 'projects'
                      : 'academic';
                  return `
                    <div class="task-row" style="padding:11px 2px;">
                      <div style="min-width:0;flex:1;">
                        <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escapeHtml(r.title)}</div>
                        <div class="meta-line" style="margin-top:3px;">
                          <span>${escapeHtml(r.category)}</span>
                          <span class="meta-sep">·</span>
                          <span class="mono">${escapeHtml(formatDate(r.dueDate, s.settings.dateFormat))}${r.dueTime ? ' ' + escapeHtml(formatTime(r.dueTime, s.settings.timeFormat)) : ''}</span>
                          <span class="meta-sep">·</span>
                          <span class="${r.severity === 'overdue' ? 'tone-danger' : r.severity === 'today' ? 'tone-warning' : 'tone-accent'}">${escapeHtml(r.message)}</span>
                        </div>
                      </div>
                      <div style="display:flex;gap:6px;">
                        ${
                          r.sourceType === 'Task'
                            ? `<button type="button" class="btn btn-secondary btn-sm" data-rem-done-task="${r.sourceId}">Complete</button>`
                            : ''
                        }
                        <button type="button" class="btn btn-ghost btn-sm" data-rem-go="${route}">Open</button>
                      </div>
                    </div>
                  `;
                })
                .join('')}
             </div>`
      }
    </div>
  `;

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="font-size:20px;font-weight:700;">Reminders &amp; Notification Center</h2>
        <div class="card-subtitle">Automated deadline monitoring across tasks, assignments, exams &amp; projects</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px;">
      <div class="card-header">
        <div>
          <h3 class="card-title">Browser Notification &amp; Reminder Preferences</h3>
          <div class="card-subtitle">Permission status: <strong style="color:var(--text-primary);">${escapeHtml(permLabel)}</strong></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${
            notifSupported && perm !== 'granted'
              ? `<button type="button" class="btn btn-primary btn-sm" id="rem-req-perm">Request Browser Permission</button>`
              : ''
          }
          ${
            notifSupported && perm === 'granted'
              ? `<button type="button" class="btn btn-secondary btn-sm" id="rem-test-notif">Send Test Notification</button>`
              : ''
          }
        </div>
      </div>

      <div class="form-grid" style="margin-bottom:14px;">
        <div class="form-field">
          <label class="form-label" for="rem-default-lead">Default Reminder Interval</label>
          <select id="rem-default-lead" class="select">
            <option value="0d" ${s.settings.defaultReminderTiming === '0d' ? 'selected' : ''}>On the due date</option>
            <option value="1d" ${s.settings.defaultReminderTiming === '1d' ? 'selected' : ''}>One day before</option>
            <option value="3d" ${s.settings.defaultReminderTiming === '3d' ? 'selected' : ''}>Three days before</option>
            <option value="7d" ${s.settings.defaultReminderTiming === '7d' ? 'selected' : ''}>One week before</option>
            <option value="none" ${s.settings.defaultReminderTiming === 'none' ? 'selected' : ''}>Disabled by default</option>
          </select>
        </div>
        <div class="form-field" style="justify-content:flex-end;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:13.5px;">
            <input type="checkbox" id="rem-toggle-browser" ${s.settings.enableBrowserNotifications ? 'checked' : ''} style="accent-color:var(--accent);" />
            <span>Trigger browser notifications for due &amp; overdue items</span>
          </label>
        </div>
      </div>

      <div style="padding:10px 12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:12.5px;color:var(--text-muted);line-height:1.5;">
        <strong>Note on Browser Notifications:</strong> Desktop/browser notifications require explicit browser permission and are delivered while TASKFLOW is open in your browser. Local web applications without a background push server cannot guarantee system notifications when the browser is completely closed.
      </div>
    </div>

    ${renderGroup('Overdue Notifications', overdue, 'tone-danger', 'No overdue items right now.')}
    ${renderGroup('Due Today & Urgent', todayList, 'tone-warning', 'Nothing due today.')}
    ${renderGroup('Upcoming Reminders', upcoming, 'tone-accent', 'No upcoming deadlines within your configured reminder window.')}
  `;

  container.querySelector('#rem-default-lead').addEventListener('change', (e) => {
    store.updateSettings({ defaultReminderTiming: e.target.value });
    showToast('Default reminder lead time updated', 'success');
  });

  container.querySelector('#rem-toggle-browser').addEventListener('change', (e) => {
    store.updateSettings({ enableBrowserNotifications: e.target.checked });
    if (e.target.checked && notifSupported && Notification.permission === 'default') {
      Notification.requestPermission().then(() => renderRemindersView(container, { navigate }));
    }
  });

  container.querySelector('#rem-req-perm')?.addEventListener('click', async () => {
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        store.updateSettings({ enableBrowserNotifications: true });
        showToast('Browser notifications enabled', 'success');
      } else {
        showToast(`Notification permission: ${res}`, 'warning');
      }
      renderRemindersView(container, { navigate });
    } catch {
      showToast('Browser blocked notification prompt.', 'warning');
    }
  });

  container.querySelector('#rem-test-notif')?.addEventListener('click', () => {
    try {
      new Notification('TASKFLOW · Test Reminder', {
        body: 'Notifications are active while your workspace is open.',
      });
      showToast('Test notification sent', 'success');
    } catch {
      showToast('Could not display browser notification.', 'warning');
    }
  });

  container.querySelectorAll('[data-rem-done-task]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.toggleTaskComplete(btn.getAttribute('data-rem-done-task'));
      showToast('Task completed', 'success');
    });
  });

  container.querySelectorAll('[data-rem-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-rem-go')));
  });
}
