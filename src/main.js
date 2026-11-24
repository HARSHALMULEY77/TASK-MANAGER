import { store } from './js/store.js';
import { auth, onAuthStateChanged } from './js/firebase.js';
import { escapeHtml, formatLiveClock } from './js/utils.js';
import { icon } from './js/icons.js';
import {
  openTaskModal,
  openQuickCaptureModal,
  openOnboardingModal,
  openMigrationModal,
  closeModal,
  showToast,
} from './js/components/modals.js';

import { renderAuthView, resetAuthUiState } from './js/views/auth.js';
import { renderDashboard } from './js/views/dashboard.js';
import { renderTasksView } from './js/views/tasks.js';
import { renderFocusView } from './js/views/focus.js';
import { renderCalendarView } from './js/views/calendar.js';
import { renderProjectsView } from './js/views/projects.js';
import { renderAcademicView } from './js/views/academic.js';
import { renderPlannerView } from './js/views/planner.js';
import { renderRemindersView } from './js/views/reminders.js';
import { renderNotesView } from './js/views/notes.js';
import { renderAnalyticsView } from './js/views/analytics.js';
import { renderSettingsView } from './js/views/settings.js';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Core' },
  { id: 'tasks', label: 'My Tasks', icon: 'tasks', group: 'Core' },
  { id: 'focus', label: 'Focus Today', icon: 'focus', group: 'Core' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', group: 'Core' },
  { id: 'projects', label: 'Projects', icon: 'projects', group: 'Workspace' },
  { id: 'academic', label: 'Academic Manager', icon: 'academic', group: 'Workspace' },
  { id: 'planner', label: 'Daily Planner', icon: 'planner', group: 'Workspace' },
  { id: 'reminders', label: 'Reminders', icon: 'reminders', group: 'Workspace' },
  { id: 'notes', label: 'Notes', icon: 'notes', group: 'Knowledge' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics', group: 'Knowledge' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'System' },
];

const VIEW_MAP = {
  dashboard: renderDashboard,
  tasks: renderTasksView,
  focus: renderFocusView,
  calendar: renderCalendarView,
  projects: renderProjectsView,
  academic: renderAcademicView,
  planner: renderPlannerView,
  reminders: renderRemindersView,
  notes: renderNotesView,
  analytics: renderAnalyticsView,
  settings: renderSettingsView,
};

let currentRoute = 'dashboard';
let mobileSidebarOpen = false;
let globalSearchQuery = '';
let authReady = false;
let activeAuthUser = null;
let promptSequenceStartedForUid = null;

function navigate(routeId) {
  if (!VIEW_MAP[routeId]) return;
  currentRoute = routeId;
  mobileSidebarOpen = false;
  renderApp();
}

function getGlobalSearchMatches(query, s) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];

  s.tasks.forEach((t) => {
    if (`${t.title} ${t.description} ${t.category} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q)) {
      results.push({ type: 'Task', title: t.title, sub: `${t.priority} · ${t.status}`, route: 'tasks' });
    }
  });
  s.projects.forEach((p) => {
    if (`${p.title} ${p.description}`.toLowerCase().includes(q)) {
      results.push({ type: 'Project', title: p.title, sub: p.status, route: 'projects' });
    }
  });
  s.subjects.forEach((sub) => {
    if (`${sub.name} ${sub.code} ${sub.faculty}`.toLowerCase().includes(q)) {
      results.push({ type: 'Subject', title: sub.name, sub: sub.code || 'Academic', route: 'academic' });
    }
  });
  s.assignments.forEach((a) => {
    if (`${a.title} ${a.description}`.toLowerCase().includes(q)) {
      results.push({ type: 'Assignment', title: a.title, sub: a.status, route: 'academic' });
    }
  });
  s.exams.forEach((ex) => {
    if (`${ex.name} ${ex.notes}`.toLowerCase().includes(q)) {
      results.push({ type: 'Exam', title: ex.name, sub: ex.examDate, route: 'academic' });
    }
  });
  s.notes.forEach((n) => {
    if (`${n.title} ${n.content}`.toLowerCase().includes(q)) {
      results.push({ type: 'Note', title: n.title, sub: n.category, route: 'notes' });
    }
  });

  return results.slice(0, 10);
}

function renderApp() {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;

  if (!authReady) {
    appRoot.innerHTML = `
      <div class="auth-shell">
        <div class="card" style="padding:28px 32px;text-align:center;max-width:380px;width:100%;">
          <div class="tf-brand-logo" style="margin:0 auto 14px;">TF</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;">TASKFLOW</div>
          <div style="font-size:13.5px;color:var(--text-muted);">Verifying session...</div>
        </div>
      </div>
    `;
    return;
  }

  // Protected session gate: require login before accessing dashboard or workspace
  if (!activeAuthUser) {
    renderAuthView(appRoot);
    return;
  }

  const s = store.getState();
  const cloud = store.getCloudStatus();
  document.documentElement.setAttribute('data-theme', s.settings.theme || 'navy');

  const pendingCount = s.tasks.filter((t) => t.status !== 'Completed').length;
  const activeReminders = store.getActiveReminders();
  const urgentRemCount = s.settings.enableInAppReminders ? activeReminders.length : 0;
  const currentNav = NAV_ITEMS.find((n) => n.id === currentRoute) || NAV_ITEMS[0];

  const groups = ['Core', 'Workspace', 'Knowledge', 'System'];
  const navHtml = groups
    .map((grp) => {
      const items = NAV_ITEMS.filter((i) => i.group === grp);
      return `
        <div class="tf-nav-section-label">${grp}</div>
        ${items
          .map((item) => {
            let badge = '';
            if (item.id === 'tasks' && pendingCount > 0) badge = `<span class="tf-nav-count">${pendingCount}</span>`;
            if (item.id === 'reminders' && urgentRemCount > 0)
              badge = `<span class="tf-nav-count" style="color:var(--warning);">${urgentRemCount}</span>`;
            return `
              <button type="button" class="tf-nav-item ${currentRoute === item.id ? 'active' : ''}" data-route="${item.id}">
                <span class="tf-nav-item-left">
                  ${icon(item.icon, 16)}
                  <span class="tf-nav-item-label">${escapeHtml(item.label)}</span>
                </span>
                ${badge}
              </button>
            `;
          })
          .join('')}
      `;
    })
    .join('');

  const searchMatches = getGlobalSearchMatches(globalSearchQuery, s);
  const syncText =
    cloud.loadingCloud
      ? 'Loading cloud workspace...'
      : cloud.syncState === 'syncing'
      ? 'Syncing...'
      : cloud.syncState === 'offline'
      ? 'Offline mode (saved locally)'
      : cloud.syncState === 'error'
      ? 'Sync error (retrying)'
      : 'Cloud synced';

  appRoot.innerHTML = `
    <div class="tf-shell">
      <div class="sidebar-backdrop ${mobileSidebarOpen ? 'open' : ''}" id="tf-sidebar-backdrop"></div>
      <aside class="tf-sidebar ${mobileSidebarOpen ? 'open' : ''}" aria-label="Primary navigation">
        <div class="tf-brand">
          <div class="tf-brand-mark">
            <div class="tf-brand-logo" aria-hidden="true">TF</div>
            <span class="tf-brand-name">TASKFLOW</span>
          </div>
          <button type="button" class="btn-icon btn-icon-ghost tf-mobile-menu-btn" id="tf-close-sidebar" aria-label="Close navigation">
            ${icon('x', 18)}
          </button>
        </div>

        <nav class="tf-nav">
          ${navHtml}
        </nav>

        <div class="tf-sidebar-footer">
          <div class="tf-user-name">${escapeHtml(s.profile.name || activeAuthUser.displayName || activeAuthUser.email || 'Account')}</div>
          <div class="tf-user-goal">${escapeHtml(activeAuthUser.email || '')}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;">
            <span style="font-size:11.5px;color:${cloud.syncState === 'error' ? 'var(--danger)' : cloud.syncState === 'offline' ? 'var(--warning)' : 'var(--text-muted)'};">${escapeHtml(syncText)}</span>
            <button type="button" id="tf-sidebar-logout" class="btn btn-ghost btn-sm" style="padding:3px 8px;min-height:28px;font-size:12px;">Sign Out</button>
          </div>
        </div>
      </aside>

      <div class="tf-main-wrap">
        <header class="tf-topbar">
          <div class="tf-topbar-left">
            <button type="button" class="tf-mobile-menu-btn" id="tf-open-sidebar" aria-label="Open navigation">
              ${icon('menu', 18)}
            </button>
            <h1 class="tf-page-title">${escapeHtml(currentNav.label)}</h1>
          </div>

          <div class="tf-topbar-search-wrap">
            <span class="tf-topbar-search-icon">${icon('search', 15)}</span>
            <input
              id="tf-global-search"
              class="tf-topbar-search-input"
              type="search"
              placeholder="Search tasks, projects, notes, subjects..."
              value="${escapeHtml(globalSearchQuery)}"
              autocomplete="off"
              aria-label="Global workspace search"
            />
            ${
              globalSearchQuery.trim()
                ? `<div class="tf-search-results" role="listbox">
                    ${
                      searchMatches.length === 0
                        ? `<div style="padding:12px 14px;font-size:13px;color:var(--text-muted);">No matching records found.</div>`
                        : searchMatches
                            .map(
                              (m) => `
                          <button type="button" class="tf-search-result-item" data-search-route="${m.route}">
                            <div style="min-width:0;">
                              <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.title)}</div>
                              <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(m.sub)}</div>
                            </div>
                            <span style="font-size:11.5px;color:var(--accent);font-weight:600;flex-shrink:0;">${escapeHtml(m.type)}</span>
                          </button>
                        `
                            )
                            .join('')
                    }
                   </div>`
                : ''
            }
          </div>

          <div class="tf-topbar-actions">
            <button type="button" class="btn-icon" id="tf-bell-btn" title="Reminders" aria-label="Open reminders">
              ${icon('reminders', 16)}
              ${urgentRemCount > 0 ? `<span class="tf-notif-count">${urgentRemCount > 99 ? '99+' : urgentRemCount}</span>` : ''}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="tf-quick-capture-btn" title="Quick Capture Task or Note">
              ${icon('zap', 14)} Quick Capture
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="tf-global-add-task">
              ${icon('plus', 14)} Add Task
            </button>
          </div>
        </header>

        <main id="tf-main-view" class="tf-content">
          ${
            cloud.syncState === 'error'
              ? `<div class="notice-banner" style="border-color:rgba(239,68,68,0.35);">
                   <span style="color:var(--danger);font-weight:500;">Cloud synchronization issue: ${escapeHtml(cloud.syncError || 'Please check your internet connection.')}</span>
                 </div>`
              : ''
          }
          <div id="tf-view-inner"></div>
        </main>
      </div>
    </div>
  `;

  // Bind navigation
  appRoot.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-route')));
  });

  appRoot.querySelector('#tf-open-sidebar')?.addEventListener('click', () => {
    mobileSidebarOpen = true;
    renderApp();
  });
  appRoot.querySelector('#tf-close-sidebar')?.addEventListener('click', () => {
    mobileSidebarOpen = false;
    renderApp();
  });
  appRoot.querySelector('#tf-sidebar-backdrop')?.addEventListener('click', () => {
    mobileSidebarOpen = false;
    renderApp();
  });

  appRoot.querySelector('#tf-sidebar-logout')?.addEventListener('click', async () => {
    const btn = appRoot.querySelector('#tf-sidebar-logout');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await store.logoutUser();
    } catch {
      showToast('Failed to sign out cleanly. Try again.', 'danger');
      btn.disabled = false;
      btn.textContent = 'Sign Out';
    }
  });

  // Topbar actions
  appRoot.querySelector('#tf-bell-btn').addEventListener('click', () => navigate('reminders'));
  appRoot.querySelector('#tf-quick-capture-btn').addEventListener('click', () => openQuickCaptureModal('task'));
  appRoot.querySelector('#tf-global-add-task').addEventListener('click', () => openTaskModal());

  // Global search
  const gsInput = appRoot.querySelector('#tf-global-search');
  gsInput.addEventListener('input', () => {
    globalSearchQuery = gsInput.value;
    const pos = gsInput.selectionStart;
    renderApp();
    const nextInput = document.getElementById('tf-global-search');
    if (nextInput) {
      nextInput.focus();
      if (pos !== null) nextInput.setSelectionRange(pos, pos);
    }
  });

  appRoot.querySelectorAll('[data-search-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-search-route');
      globalSearchQuery = '';
      navigate(target);
    });
  });

  // Render active view
  const viewContainer = appRoot.querySelector('#tf-view-inner');
  if (cloud.loadingCloud && s.tasks.length === 0 && s.projects.length === 0 && !s.onboarded) {
    viewContainer.innerHTML = `
      <div class="card" style="padding:36px 20px;text-align:center;">
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">Loading your cloud workspace...</div>
        <div style="font-size:13px;color:var(--text-muted);">Synchronizing tasks, projects, academics, and settings.</div>
      </div>
    `;
    return;
  }

  const renderFn = VIEW_MAP[currentRoute] || renderDashboard;
  renderFn(viewContainer, { navigate });
}

function handlePostSyncPrompts(uidVal) {
  if (promptSequenceStartedForUid === uidVal) return;
  promptSequenceStartedForUid = uidVal;

  const migSummary = store.getLocalMigrationSummary();
  const maybeShowOnboarding = () => {
    if (!store.getState().onboarded) {
      openOnboardingModal();
    }
  };

  if (migSummary) {
    openMigrationModal(migSummary, () => {
      maybeShowOnboarding();
    });
  } else {
    maybeShowOnboarding();
  }
}

// Re-render automatically on store mutations
store.subscribe(() => {
  if (activeAuthUser) {
    renderApp();
  }
});

// Monitor online/offline transitions
window.addEventListener('online', () => {
  if (activeAuthUser) renderApp();
});
window.addEventListener('offline', () => {
  if (activeAuthUser) renderApp();
});

// Live Clock Tick
setInterval(() => {
  const clockEl = document.getElementById('dash-live-clock');
  if (clockEl) {
    const s = store.getState();
    clockEl.textContent = formatLiveClock(new Date(), s.settings.timeFormat);
  }
}, 1000);

// Reminder check every 60s
setInterval(() => {
  store.dispatchBrowserNotificationsIfEnabled();
}, 60000);

// Global keyboard shortcuts (active only when logged in)
document.addEventListener('keydown', (e) => {
  if (!activeAuthUser) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    document.getElementById('tf-global-search')?.focus();
  }
  if (e.altKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    openQuickCaptureModal('task');
  }
});

// Firebase Auth State Gate
renderApp();

onAuthStateChanged(auth, async (user) => {
  authReady = true;
  if (user) {
    activeAuthUser = user;
    resetAuthUiState();
    currentRoute = 'dashboard';
    renderApp();
    await store.startUserSession(user, () => {
      store.dispatchBrowserNotificationsIfEnabled();
      handlePostSyncPrompts(user.uid);
    });
  } else {
    activeAuthUser = null;
    promptSequenceStartedForUid = null;
    closeModal();
    store.clearUserSession();
    renderApp();
  }
});
