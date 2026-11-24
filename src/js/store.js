import {
  uid,
  todayStr,
  addDays,
  addMonths,
  getDaysDiff,
  PRIORITY_WEIGHT,
  STATUS_ORDER,
  escapeCsvCell,
  downloadFile,
} from './utils.js';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  waitForPendingWrites,
  signOut,
} from './firebase.js';

const LEGACY_STORAGE_KEY = 'taskflow_os_v1';
const CACHE_KEY_PREFIX = 'taskflow_cloud_cache_';
const MIGRATED_UIDS_KEY = 'taskflow_migrated_uids_v1';
const NOTIFIED_KEY = 'taskflow_notified_v1';

export const DEFAULT_CATEGORIES = [
  'Academic',
  'Work',
  'Personal',
  'Coding',
  'Project',
  'Health',
  'Admin',
];

export const DEFAULT_TAGS = [
  'Deep Work',
  'Quick Win',
  'Exam Prep',
  'Submission',
  'Research',
  'Errand',
];

export const ROUTINE_CATEGORIES = [
  'Morning Routine',
  'College Schedule',
  'Study Session',
  'Coding Practice',
  'Project Development',
  'Break',
  'Personal Activity',
  'Evening Review',
];

export function createDefaultState() {
  return {
    version: 1,
    onboarded: false,
    migratedFromLocal: false,
    profile: {
      name: '',
      mainGoal: '',
      workHoursStart: '08:00',
      workHoursEnd: '22:00',
      institution: '',
      semester: '',
    },
    settings: {
      theme: 'navy',
      dateFormat: 'MMM DD, YYYY',
      timeFormat: '12h',
      defaultPriority: 'Medium',
      enableInAppReminders: true,
      enableBrowserNotifications: false,
      defaultReminderTiming: '1d',
      dailyStudyTargetHours: 3,
      weeklyStudyTargetHours: 20,
      categories: [...DEFAULT_CATEGORIES],
      tags: [...DEFAULT_TAGS],
    },
    tasks: [],
    projects: [],
    subjects: [],
    assignments: [],
    exams: [],
    studySessions: [],
    routineSlots: [],
    routineCompletions: {},
    calendarEvents: [],
    notes: [],
    activities: [],
  };
}

function clampStr(val, max = 5000) {
  const s = val === null || val === undefined ? '' : String(val);
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeProfile(p) {
  const base = createDefaultState().profile;
  const src = p && typeof p === 'object' ? p : {};
  return {
    name: clampStr(src.name ?? base.name, 120),
    mainGoal: clampStr(src.mainGoal ?? base.mainGoal, 300),
    workHoursStart: clampStr(src.workHoursStart || base.workHoursStart, 10),
    workHoursEnd: clampStr(src.workHoursEnd || base.workHoursEnd, 10),
    institution: clampStr(src.institution ?? base.institution, 160),
    semester: clampStr(src.semester ?? base.semester, 80),
  };
}

function sanitizeSettings(st) {
  const base = createDefaultState().settings;
  const src = st && typeof st === 'object' ? st : {};
  const categories =
    Array.isArray(src.categories) && src.categories.length > 0
      ? src.categories.map((c) => clampStr(c, 64)).filter(Boolean).slice(0, 50)
      : [...DEFAULT_CATEGORIES];
  const tags =
    Array.isArray(src.tags)
      ? src.tags.map((t) => clampStr(t, 64)).filter(Boolean).slice(0, 100)
      : [...DEFAULT_TAGS];

  return {
    theme: ['navy', 'charcoal', 'midnight', 'light'].includes(src.theme) ? src.theme : base.theme,
    dateFormat: clampStr(src.dateFormat || base.dateFormat, 24),
    timeFormat: ['12h', '24h'].includes(src.timeFormat) ? src.timeFormat : base.timeFormat,
    defaultPriority: ['Critical', 'High', 'Medium', 'Low'].includes(src.defaultPriority)
      ? src.defaultPriority
      : base.defaultPriority,
    enableInAppReminders: src.enableInAppReminders !== undefined ? Boolean(src.enableInAppReminders) : true,
    enableBrowserNotifications: Boolean(src.enableBrowserNotifications),
    defaultReminderTiming: ['none', '0d', '1d', '3d', '7d'].includes(src.defaultReminderTiming)
      ? src.defaultReminderTiming
      : base.defaultReminderTiming,
    dailyStudyTargetHours: Math.min(24, Math.max(0.5, Number(src.dailyStudyTargetHours) || 3)),
    weeklyStudyTargetHours: Math.min(168, Math.max(1, Number(src.weeklyStudyTargetHours) || 20)),
    categories: categories.length > 0 ? categories : [...DEFAULT_CATEGORIES],
    tags,
  };
}

function sanitizeState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    version: 1,
    onboarded: Boolean(raw.onboarded),
    migratedFromLocal: Boolean(raw.migratedFromLocal),
    profile: sanitizeProfile(raw.profile),
    settings: sanitizeSettings(raw.settings),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    subjects: Array.isArray(raw.subjects) ? raw.subjects : [],
    assignments: Array.isArray(raw.assignments) ? raw.assignments : [],
    exams: Array.isArray(raw.exams) ? raw.exams : [],
    studySessions: Array.isArray(raw.studySessions) ? raw.studySessions : [],
    routineSlots: Array.isArray(raw.routineSlots) ? raw.routineSlots : [],
    routineCompletions:
      raw.routineCompletions && typeof raw.routineCompletions === 'object'
        ? raw.routineCompletions
        : {},
    calendarEvents: Array.isArray(raw.calendarEvents) ? raw.calendarEvents : [],
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
  };
}

function sanitizeDocId(id, prefix) {
  const clean = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (clean && clean.length <= 128) return clean;
  return uid(prefix);
}

// Payload formatters strictly matching firebase-blueprint.json & firestore.rules
function toTaskDoc(t, ownerUid) {
  return {
    id: sanitizeDocId(t.id, 'tsk'),
    ownerUid,
    title: clampStr(t.title || 'Untitled Task', 200),
    description: clampStr(t.description || '', 5000),
    category: clampStr(t.category || 'Personal', 64),
    projectId: clampStr(t.projectId || '', 128),
    startDate: clampStr(t.startDate || '', 20),
    dueDate: clampStr(t.dueDate || '', 20),
    deadlineTime: clampStr(t.deadlineTime || '', 10),
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(t.priority) ? t.priority : 'Medium',
    status: ['Not Started', 'In Progress', 'Completed', 'On Hold'].includes(t.status) ? t.status : 'Not Started',
    estimatedMinutes: Math.min(100000, Math.max(0, Number(t.estimatedMinutes) || 0)),
    actualMinutes: Math.min(100000, Math.max(0, Number(t.actualMinutes) || 0)),
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks.slice(0, 100).map((s) => ({
          id: sanitizeDocId(s.id, 'st'),
          text: clampStr(s.text || '', 300),
          done: Boolean(s.done),
        }))
      : [],
    notes: clampStr(t.notes || '', 5000),
    tags: Array.isArray(t.tags) ? t.tags.slice(0, 30).map((x) => clampStr(x, 64)) : [],
    attachments: Array.isArray(t.attachments)
      ? t.attachments.slice(0, 30).map((a) => ({
          id: sanitizeDocId(a.id, 'att'),
          name: clampStr(a.name || '', 200),
          ref: clampStr(a.ref || '', 500),
        }))
      : [],
    recurrence: ['None', 'Daily', 'Weekly', 'Monthly'].includes(t.recurrence) ? t.recurrence : 'None',
    reminderTiming: ['none', '0d', '1d', '3d', '7d'].includes(t.reminderTiming) ? t.reminderTiming : '1d',
    isSample: Boolean(t.isSample),
    createdAt: clampStr(t.createdAt || new Date().toISOString(), 40),
    updatedAt: clampStr(t.updatedAt || new Date().toISOString(), 40),
    completedAt: t.completedAt ? clampStr(t.completedAt, 40) : null,
  };
}

function toProjectDoc(p, ownerUid) {
  return {
    id: sanitizeDocId(p.id, 'prj'),
    ownerUid,
    title: clampStr(p.title || 'Untitled Project', 200),
    description: clampStr(p.description || '', 5000),
    startDate: clampStr(p.startDate || '', 20),
    expectedEndDate: clampStr(p.expectedEndDate || '', 20),
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(p.priority) ? p.priority : 'Medium',
    status: ['Planning', 'Active', 'On Hold', 'Completed'].includes(p.status) ? p.status : 'Active',
    notes: clampStr(p.notes || '', 5000),
    milestones: Array.isArray(p.milestones)
      ? p.milestones.slice(0, 100).map((m) => ({
          id: sanitizeDocId(m.id, 'mil'),
          title: clampStr(m.title || '', 200),
          dueDate: clampStr(m.dueDate || '', 20),
          completed: Boolean(m.completed),
        }))
      : [],
    isSample: Boolean(p.isSample),
    createdAt: clampStr(p.createdAt || new Date().toISOString(), 40),
    updatedAt: clampStr(p.updatedAt || new Date().toISOString(), 40),
  };
}

function toSubjectDoc(sub, ownerUid) {
  return {
    id: sanitizeDocId(sub.id, 'sub'),
    ownerUid,
    name: clampStr(sub.name || 'Untitled Subject', 160),
    code: clampStr(sub.code || '', 40),
    faculty: clampStr(sub.faculty || '', 120),
    semester: clampStr(sub.semester || '', 60),
    chapters: Array.isArray(sub.chapters)
      ? sub.chapters.slice(0, 150).map((c) => ({
          id: sanitizeDocId(c.id, 'ch'),
          title: clampStr(c.title || '', 200),
          completed: Boolean(c.completed),
        }))
      : [],
    syllabusCompletion: Math.min(100, Math.max(0, Number(sub.syllabusCompletion) || 0)),
    isSample: Boolean(sub.isSample),
    createdAt: clampStr(sub.createdAt || new Date().toISOString(), 40),
  };
}

function toAssignmentDoc(a, ownerUid) {
  return {
    id: sanitizeDocId(a.id, 'asg'),
    ownerUid,
    title: clampStr(a.title || 'Untitled Assignment', 200),
    subjectId: clampStr(a.subjectId || '', 128),
    description: clampStr(a.description || '', 4000),
    assignedDate: clampStr(a.assignedDate || '', 20),
    dueDate: clampStr(a.dueDate || '', 20),
    status: ['Pending', 'In Progress', 'Submitted', 'Graded'].includes(a.status) ? a.status : 'Pending',
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(a.priority) ? a.priority : 'High',
    notes: clampStr(a.notes || '', 4000),
    isSample: Boolean(a.isSample),
    createdAt: clampStr(a.createdAt || new Date().toISOString(), 40),
  };
}

function toExamDoc(ex, ownerUid) {
  return {
    id: sanitizeDocId(ex.id, 'exm'),
    ownerUid,
    name: clampStr(ex.name || 'Untitled Exam', 200),
    subjectId: clampStr(ex.subjectId || '', 128),
    examDate: clampStr(ex.examDate || '', 20),
    examTime: clampStr(ex.examTime || '', 10),
    topics: Array.isArray(ex.topics)
      ? ex.topics.slice(0, 150).map((t) => ({
          id: sanitizeDocId(t.id, 'top'),
          title: clampStr(t.title || '', 200),
          prepared: Boolean(t.prepared),
        }))
      : [],
    preparationStatus: ['Not Started', 'Preparing', 'Revision', 'Ready'].includes(ex.preparationStatus)
      ? ex.preparationStatus
      : 'Not Started',
    revisionDates: Array.isArray(ex.revisionDates)
      ? ex.revisionDates.slice(0, 50).map((d) => clampStr(d, 20))
      : [],
    notes: clampStr(ex.notes || '', 4000),
    isSample: Boolean(ex.isSample),
    createdAt: clampStr(ex.createdAt || new Date().toISOString(), 40),
  };
}

function toStudySessionDoc(ss, ownerUid) {
  return {
    id: sanitizeDocId(ss.id, 'std'),
    ownerUid,
    subjectId: clampStr(ss.subjectId || '', 128),
    date: clampStr(ss.date || todayStr(), 20),
    durationMinutes: Math.min(1440, Math.max(1, Number(ss.durationMinutes) || 30)),
    topic: clampStr(ss.topic || '', 200),
    notes: clampStr(ss.notes || '', 2000),
    isSample: Boolean(ss.isSample),
    createdAt: clampStr(ss.createdAt || new Date().toISOString(), 40),
  };
}

function toRoutineSlotDoc(r, ownerUid) {
  return {
    id: sanitizeDocId(r.id, 'rtn'),
    ownerUid,
    title: clampStr(r.title || 'Routine Block', 160),
    category: clampStr(r.category || 'Study Session', 64),
    startTime: clampStr(r.startTime || '08:00', 10),
    endTime: clampStr(r.endTime || '09:00', 10),
    dayScope: clampStr(r.dayScope || 'Everyday', 20),
    notes: clampStr(r.notes || '', 1000),
    isSample: Boolean(r.isSample),
  };
}

function toCalendarEventDoc(ev, ownerUid) {
  return {
    id: sanitizeDocId(ev.id, 'evt'),
    ownerUid,
    title: clampStr(ev.title || 'Event', 200),
    date: clampStr(ev.date || todayStr(), 20),
    time: clampStr(ev.time || '', 10),
    category: clampStr(ev.category || 'Personal', 64),
    notes: clampStr(ev.notes || '', 2000),
    isSample: Boolean(ev.isSample),
    createdAt: clampStr(ev.createdAt || new Date().toISOString(), 40),
  };
}

function toNoteDoc(n, ownerUid) {
  return {
    id: sanitizeDocId(n.id, 'nte'),
    ownerUid,
    title: clampStr(n.title || 'Untitled Note', 200),
    content: clampStr(n.content || '', 20000),
    category: clampStr(n.category || 'Quick Note', 64),
    tags: Array.isArray(n.tags) ? n.tags.slice(0, 30).map((t) => clampStr(t, 64)) : [],
    pinned: Boolean(n.pinned),
    isSample: Boolean(n.isSample),
    createdAt: clampStr(n.createdAt || new Date().toISOString(), 40),
    updatedAt: clampStr(n.updatedAt || new Date().toISOString(), 40),
  };
}

function toActivityDoc(act, ownerUid) {
  return {
    id: sanitizeDocId(act.id, 'act'),
    ownerUid,
    action: clampStr(act.action || 'Action', 120),
    detail: clampStr(act.detail || '', 500),
    entityType: clampStr(act.entityType || 'system', 40),
    timestamp: clampStr(act.timestamp || new Date().toISOString(), 40),
  };
}

// Runtime session & cloud sync state
let currentUser = null;
let state = createDefaultState();
let cloudStatus = {
  loadingCloud: false,
  syncState: 'idle', // idle | syncing | synced | offline | error
  syncError: '',
  lastSyncedAt: null,
};
let unsubscribers = [];
const listeners = new Set();
const loadedCollections = new Set();
let workspaceReadyPromise = null;

function readUserCache(userId) {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    return sanitizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeUserCache(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(state));
  } catch (err) {
    console.warn('TaskFlow: Could not write local offline cache.', err);
  }
}

function getMigratedUids() {
  try {
    const arr = JSON.parse(localStorage.getItem(MIGRATED_UIDS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function markUidMigratedLocally(userId) {
  try {
    const list = getMigratedUids();
    if (!list.includes(userId)) {
      list.push(userId);
      localStorage.setItem(MIGRATED_UIDS_KEY, JSON.stringify(list));
    }
  } catch {
    // Ignore storage error
  }
}

function readLegacyLocalData() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeState(parsed);
  } catch {
    return null;
  }
}

function notify() {
  if (currentUser?.uid) {
    writeUserCache(currentUser.uid);
  }
  listeners.forEach((fn) => {
    try {
      fn(state, cloudStatus, currentUser);
    } catch (err) {
      console.error('TaskFlow subscriber error:', err);
    }
  });
}

function tearDownListeners() {
  unsubscribers.forEach((u) => {
    try {
      u();
    } catch {
      // Ignore unsubscribe errors
    }
  });
  unsubscribers = [];
  loadedCollections.clear();
}

function setSyncState(nextState, errorMsg = '') {
  cloudStatus.syncState = nextState;
  cloudStatus.syncError = errorMsg;
  if (nextState === 'synced') {
    cloudStatus.lastSyncedAt = new Date().toISOString();
  }
  notify();
}

function handleCloudWriteError(err, opType, path) {
  if (err?.code === 'unavailable' || !navigator.onLine) {
    setSyncState('offline', 'Offline: changes cached locally and will sync when online.');
    return;
  }
  setSyncState('error', err?.message || 'Cloud sync failed.');
  if (err?.code === 'permission-denied') {
    handleFirestoreError(err, opType, path);
  } else {
    console.error(`Firestore ${opType} error at ${path}:`, err);
  }
}

async function commitBatchOps(ops) {
  if (!currentUser?.uid || ops.length === 0) return;
  setSyncState('syncing');
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((op) => {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else if (op.type === 'update') batch.update(op.ref, op.data);
        else if (op.type === 'delete') batch.delete(op.ref);
      });
      await batch.commit();
    }
    setSyncState(navigator.onLine ? 'synced' : 'offline');
  } catch (err) {
    handleCloudWriteError(err, OperationType.WRITE, `users/${currentUser.uid}`);
  }
}

function writeWorkspaceDocFields(fields) {
  if (!currentUser?.uid) return;
  const uidVal = currentUser.uid;
  const path = `users/${uidVal}`;
  setSyncState('syncing');
  const ensureAndSave = workspaceReadyPromise || Promise.resolve();
  ensureAndSave
    .then(() =>
      updateDoc(doc(db, 'users', uidVal), {
        ...fields,
        updatedAt: serverTimestamp(),
      })
    )
    .then(() => setSyncState(navigator.onLine ? 'synced' : 'offline'))
    .catch((err) => handleCloudWriteError(err, OperationType.UPDATE, path));
}

function writeSubDoc(colName, docObj) {
  if (!currentUser?.uid) return;
  const uidVal = currentUser.uid;
  const path = `users/${uidVal}/${colName}/${docObj.id}`;
  setSyncState('syncing');
  setDoc(doc(db, 'users', uidVal, colName, docObj.id), docObj)
    .then(() => setSyncState(navigator.onLine ? 'synced' : 'offline'))
    .catch((err) => handleCloudWriteError(err, OperationType.CREATE, path));
}

function updateSubDoc(colName, id, allowedUpdates) {
  if (!currentUser?.uid) return;
  const uidVal = currentUser.uid;
  const path = `users/${uidVal}/${colName}/${id}`;
  setSyncState('syncing');
  updateDoc(doc(db, 'users', uidVal, colName, id), allowedUpdates)
    .then(() => setSyncState(navigator.onLine ? 'synced' : 'offline'))
    .catch((err) => handleCloudWriteError(err, OperationType.UPDATE, path));
}

function deleteSubDoc(colName, id) {
  if (!currentUser?.uid) return;
  const uidVal = currentUser.uid;
  const path = `users/${uidVal}/${colName}/${id}`;
  setSyncState('syncing');
  deleteDoc(doc(db, 'users', uidVal, colName, id))
    .then(() => setSyncState(navigator.onLine ? 'synced' : 'offline'))
    .catch((err) => handleCloudWriteError(err, OperationType.DELETE, path));
}

function logActivity(action, detail, entityType = 'system') {
  const entry = {
    id: uid('act'),
    action: clampStr(action, 120),
    detail: clampStr(detail, 500),
    entityType: clampStr(entityType, 40),
    timestamp: new Date().toISOString(),
  };
  state.activities = [entry, ...state.activities].slice(0, 60);
  if (currentUser?.uid) {
    writeSubDoc('activities', toActivityDoc(entry, currentUser.uid));
  }
}

const SUBCOLLECTIONS = [
  { key: 'tasks', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'projects', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'subjects', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'assignments', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'exams', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'studySessions', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'routineSlots', sort: (a, b) => (a.startTime || '').localeCompare(b.startTime || '') },
  { key: 'calendarEvents', sort: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  { key: 'notes', sort: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') },
  { key: 'activities', sort: (a, b) => (b.timestamp || '').localeCompare(a.timestamp || '') },
];

export const store = {
  getState() {
    return state;
  },

  getUser() {
    return currentUser;
  },

  getCloudStatus() {
    return cloudStatus;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async startUserSession(user, onInitialSyncReady) {
    tearDownListeners();
    currentUser = user;
    const uidVal = user.uid;

    const cached = readUserCache(uidVal);
    state = cached || createDefaultState();
    if (!state.profile.name && user.displayName) {
      state.profile.name = clampStr(user.displayName, 120);
    }

    cloudStatus = {
      loadingCloud: true,
      syncState: navigator.onLine ? 'syncing' : 'offline',
      syncError: '',
      lastSyncedAt: null,
    };
    notify();

    const wsRef = doc(db, 'users', uidVal);
    workspaceReadyPromise = (async () => {
      try {
        const snap = await getDoc(wsRef);
        if (!snap.exists()) {
          const initialProfile = sanitizeProfile({
            ...state.profile,
            name: state.profile.name || user.displayName || '',
          });
          await setDoc(wsRef, {
            uid: uidVal,
            email: clampStr(user.email || '', 254),
            onboarded: false,
            migratedFromLocal: false,
            profile: initialProfile,
            settings: sanitizeSettings(state.settings),
            routineCompletions: {},
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `users/${uidVal}`);
        } else {
          console.warn('Workspace bootstrap offline or deferred:', err);
        }
      }
    })();

    await workspaceReadyPromise;

    let initialDoneFired = false;
    const markCollectionReady = (colKey) => {
      loadedCollections.add(colKey);
      if (!initialDoneFired && loadedCollections.size >= SUBCOLLECTIONS.length + 1) {
        initialDoneFired = true;
        cloudStatus.loadingCloud = false;
        cloudStatus.syncState = navigator.onLine ? 'synced' : 'offline';
        cloudStatus.lastSyncedAt = new Date().toISOString();
        notify();
        if (typeof onInitialSyncReady === 'function') {
          onInitialSyncReady();
        }
      }
    };

    // Listen to workspace root document
    const unsubWs = onSnapshot(
      wsRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          state.onboarded = Boolean(data.onboarded);
          state.migratedFromLocal = Boolean(data.migratedFromLocal);
          state.profile = sanitizeProfile(data.profile);
          state.settings = sanitizeSettings(data.settings);
          state.routineCompletions =
            data.routineCompletions && typeof data.routineCompletions === 'object'
              ? data.routineCompletions
              : {};
        }
        markCollectionReady('workspace');
        notify();
      },
      (err) => {
        cloudStatus.loadingCloud = false;
        if (err?.code === 'permission-denied') {
          handleFirestoreError(err, OperationType.GET, `users/${uidVal}`);
        } else {
          setSyncState('error', err?.message || 'Unable to sync workspace.');
        }
      }
    );
    unsubscribers.push(unsubWs);

    // Listen to all 10 user subcollections with explicit ownerUid filter
    SUBCOLLECTIONS.forEach(({ key, sort }) => {
      const colPath = `users/${uidVal}/${key}`;
      const q = query(collection(db, 'users', uidVal, key), where('ownerUid', '==', uidVal));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const items = [];
          snapshot.forEach((d) => items.push(d.data()));
          items.sort(sort);
          state[key] = key === 'activities' ? items.slice(0, 60) : items;
          markCollectionReady(key);
          notify();
        },
        (err) => {
          cloudStatus.loadingCloud = false;
          if (err?.code === 'permission-denied') {
            handleFirestoreError(err, OperationType.LIST, colPath);
          } else {
            setSyncState('error', err?.message || `Sync issue in ${key}`);
          }
        }
      );
      unsubscribers.push(unsub);
    });
  },

  clearUserSession() {
    tearDownListeners();
    currentUser = null;
    state = createDefaultState();
    cloudStatus = {
      loadingCloud: false,
      syncState: 'idle',
      syncError: '',
      lastSyncedAt: null,
    };
    notify();
  },

  async logoutUser() {
    try {
      if (navigator.onLine) {
        await Promise.race([
          waitForPendingWrites(db),
          new Promise((resolve) => setTimeout(resolve, 2500)),
        ]);
      }
    } catch {
      // Proceed cleanly with signOut even if offline
    }
    tearDownListeners();
    await signOut(auth);
  },

  // Migration helpers (preserve legacy localStorage safely, never overwrite cloud data)
  getLocalMigrationSummary() {
    if (!currentUser?.uid) return null;
    if (state.migratedFromLocal || getMigratedUids().includes(currentUser.uid)) return null;
    const legacy = readLegacyLocalData();
    if (!legacy) return null;

    const counts = {
      tasks: legacy.tasks.length,
      projects: legacy.projects.length,
      subjects: legacy.subjects.length,
      assignments: legacy.assignments.length,
      exams: legacy.exams.length,
      studySessions: legacy.studySessions.length,
      routineSlots: legacy.routineSlots.length,
      calendarEvents: legacy.calendarEvents.length,
      notes: legacy.notes.length,
    };
    const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
    const hasProfileInfo = Boolean(legacy.profile?.name || legacy.profile?.mainGoal);
    if (totalItems === 0 && !hasProfileInfo) return null;

    return {
      counts,
      totalItems,
      hasProfileInfo,
      hasCloudData:
        state.tasks.length + state.projects.length + state.notes.length + state.subjects.length > 0,
    };
  },

  skipLocalMigrationPrompt() {
    if (!currentUser?.uid) return;
    markUidMigratedLocally(currentUser.uid);
  },

  async migrateLocalDataToCloud() {
    if (!currentUser?.uid) return { migratedCount: 0 };
    const uidVal = currentUser.uid;
    const legacy = readLegacyLocalData();
    if (!legacy) {
      markUidMigratedLocally(uidVal);
      return { migratedCount: 0 };
    }

    const ops = [];
    let migratedCount = 0;

    const queueMissing = (colKey, localItems, formatter) => {
      const existingIds = new Set((state[colKey] || []).map((x) => x.id));
      localItems.forEach((item) => {
        const cleanId = sanitizeDocId(item.id, colKey.slice(0, 3));
        if (!existingIds.has(cleanId)) {
          const formatted = formatter({ ...item, id: cleanId }, uidVal);
          ops.push({
            type: 'set',
            ref: doc(db, 'users', uidVal, colKey, cleanId),
            data: formatted,
          });
          state[colKey] = [formatted, ...state[colKey]];
          existingIds.add(cleanId);
          migratedCount += 1;
        }
      });
    };

    queueMissing('projects', legacy.projects, toProjectDoc);
    queueMissing('tasks', legacy.tasks, toTaskDoc);
    queueMissing('subjects', legacy.subjects, toSubjectDoc);
    queueMissing('assignments', legacy.assignments, toAssignmentDoc);
    queueMissing('exams', legacy.exams, toExamDoc);
    queueMissing('studySessions', legacy.studySessions, toStudySessionDoc);
    queueMissing('routineSlots', legacy.routineSlots, toRoutineSlotDoc);
    queueMissing('calendarEvents', legacy.calendarEvents, toCalendarEventDoc);
    queueMissing('notes', legacy.notes, toNoteDoc);

    // Merge profile/settings only if cloud workspace hasn't been configured yet
    const wsUpdates = { migratedFromLocal: true };
    state.migratedFromLocal = true;

    if (!state.onboarded) {
      state.onboarded = true;
      wsUpdates.onboarded = true;
      state.profile = sanitizeProfile({
        name: state.profile.name || legacy.profile?.name || '',
        mainGoal: state.profile.mainGoal || legacy.profile?.mainGoal || '',
        workHoursStart: legacy.profile?.workHoursStart || state.profile.workHoursStart,
        workHoursEnd: legacy.profile?.workHoursEnd || state.profile.workHoursEnd,
        institution: state.profile.institution || legacy.profile?.institution || '',
        semester: state.profile.semester || legacy.profile?.semester || '',
      });
      wsUpdates.profile = state.profile;
      state.settings = sanitizeSettings(legacy.settings);
      wsUpdates.settings = state.settings;
    }

    // Merge routineCompletions non-destructively
    const mergedRoutine = { ...(legacy.routineCompletions || {}), ...(state.routineCompletions || {}) };
    state.routineCompletions = mergedRoutine;
    wsUpdates.routineCompletions = mergedRoutine;

    await commitBatchOps(ops);
    writeWorkspaceDocFields(wsUpdates);
    markUidMigratedLocally(uidVal);
    logActivity('Local data migrated', `Merged ${migratedCount} local items into cloud account`);
    notify();
    return { migratedCount };
  },

  // Onboarding & Profile
  completeOnboarding({ name, mainGoal, workHoursStart, workHoursEnd, institution, semester, includeExamples }) {
    state.onboarded = true;
    state.profile = sanitizeProfile({
      name: (name || '').trim(),
      mainGoal: (mainGoal || '').trim(),
      workHoursStart: workHoursStart || '08:00',
      workHoursEnd: workHoursEnd || '22:00',
      institution: (institution || '').trim(),
      semester: (semester || '').trim(),
    });
    writeWorkspaceDocFields({
      onboarded: true,
      profile: state.profile,
    });
    if (includeExamples) {
      this.loadSampleWorkspace(false);
    }
    logActivity('Workspace initialized', state.profile.name ? `Welcome, ${state.profile.name}` : 'Started TASKFLOW workspace');
    notify();
  },

  skipOnboarding() {
    state.onboarded = true;
    writeWorkspaceDocFields({ onboarded: true });
    logActivity('Workspace initialized', 'Skipped initial setup');
    notify();
  },

  updateProfile(updates) {
    state.profile = sanitizeProfile({ ...state.profile, ...updates });
    writeWorkspaceDocFields({ profile: state.profile });
    logActivity('Profile updated', 'Updated personal preferences');
    notify();
  },

  updateSettings(updates) {
    state.settings = sanitizeSettings({ ...state.settings, ...updates });
    writeWorkspaceDocFields({ settings: state.settings });
    logActivity('Settings updated', 'Saved system preferences');
    notify();
  },

  addCategory(name) {
    const clean = clampStr((name || '').trim(), 64);
    if (!clean || state.settings.categories.includes(clean)) return false;
    state.settings = sanitizeSettings({
      ...state.settings,
      categories: [...state.settings.categories, clean],
    });
    writeWorkspaceDocFields({ settings: state.settings });
    notify();
    return true;
  },

  removeCategory(name) {
    if (state.settings.categories.length <= 1) return false;
    state.settings = sanitizeSettings({
      ...state.settings,
      categories: state.settings.categories.filter((c) => c !== name),
    });
    writeWorkspaceDocFields({ settings: state.settings });
    notify();
    return true;
  },

  addTag(name) {
    const clean = clampStr((name || '').trim(), 64);
    if (!clean || state.settings.tags.includes(clean)) return false;
    state.settings = sanitizeSettings({
      ...state.settings,
      tags: [...state.settings.tags, clean],
    });
    writeWorkspaceDocFields({ settings: state.settings });
    notify();
    return true;
  },

  removeTag(name) {
    state.settings = sanitizeSettings({
      ...state.settings,
      tags: state.settings.tags.filter((t) => t !== name),
    });
    writeWorkspaceDocFields({ settings: state.settings });
    notify();
    return true;
  },

  // Tasks
  addTask(taskInput) {
    const now = new Date().toISOString();
    const uidVal = currentUser?.uid || 'local';
    const task = toTaskDoc(
      {
        id: uid('tsk'),
        title: (taskInput.title || '').trim(),
        description: (taskInput.description || '').trim(),
        category: taskInput.category || state.settings.categories[0] || 'Personal',
        projectId: taskInput.projectId || '',
        startDate: taskInput.startDate || '',
        dueDate: taskInput.dueDate || '',
        deadlineTime: taskInput.deadlineTime || '',
        priority: taskInput.priority || state.settings.defaultPriority || 'Medium',
        status: taskInput.status || 'Not Started',
        estimatedMinutes: Number(taskInput.estimatedMinutes) || 0,
        actualMinutes: Number(taskInput.actualMinutes) || 0,
        subtasks: Array.isArray(taskInput.subtasks) ? taskInput.subtasks : [],
        notes: (taskInput.notes || '').trim(),
        tags: Array.isArray(taskInput.tags) ? taskInput.tags : [],
        attachments: Array.isArray(taskInput.attachments) ? taskInput.attachments : [],
        recurrence: taskInput.recurrence || 'None',
        reminderTiming: taskInput.reminderTiming || state.settings.defaultReminderTiming || 'none',
        isSample: Boolean(taskInput.isSample),
        createdAt: now,
        updatedAt: now,
        completedAt: taskInput.status === 'Completed' ? now : null,
      },
      uidVal
    );
    state.tasks = [task, ...state.tasks];
    writeSubDoc('tasks', task);
    logActivity('Task created', task.title, 'task');
    notify();
    return task;
  },

  updateTask(id, updates) {
    const idx = state.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const prev = state.tasks[idx];
    const now = new Date().toISOString();
    const nextStatus = updates.status !== undefined ? updates.status : prev.status;
    const wasCompleted = prev.status === 'Completed';
    const isNowCompleted = nextStatus === 'Completed';

    const merged = toTaskDoc(
      {
        ...prev,
        ...updates,
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: now,
        completedAt: isNowCompleted ? prev.completedAt || now : null,
      },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.tasks[idx] = merged;

    const patch = {
      title: merged.title,
      description: merged.description,
      category: merged.category,
      projectId: merged.projectId,
      startDate: merged.startDate,
      dueDate: merged.dueDate,
      deadlineTime: merged.deadlineTime,
      priority: merged.priority,
      status: merged.status,
      estimatedMinutes: merged.estimatedMinutes,
      actualMinutes: merged.actualMinutes,
      subtasks: merged.subtasks,
      notes: merged.notes,
      tags: merged.tags,
      attachments: merged.attachments,
      recurrence: merged.recurrence,
      reminderTiming: merged.reminderTiming,
      isSample: merged.isSample,
      updatedAt: merged.updatedAt,
      completedAt: merged.completedAt,
    };
    updateSubDoc('tasks', id, patch);

    if (!wasCompleted && isNowCompleted) {
      logActivity('Task completed', merged.title, 'task');
      this._spawnRecurringIfNeeded(merged);
    } else if (wasCompleted && !isNowCompleted) {
      logActivity('Task reopened', merged.title, 'task');
    } else {
      logActivity('Task updated', merged.title, 'task');
    }
    notify();
    return merged;
  },

  toggleTaskComplete(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    if (task.status === 'Completed') {
      return this.updateTask(id, { status: 'In Progress' });
    }
    return this.updateTask(id, { status: 'Completed' });
  },

  toggleSubtask(taskId, subtaskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    const subtasks = (task.subtasks || []).map((st) =>
      st.id === subtaskId ? { ...st, done: !st.done } : st
    );
    return this.updateTask(taskId, { subtasks });
  },

  logTaskTime(taskId, minutesToAdd) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    const add = Math.max(0, Math.round(Number(minutesToAdd) || 0));
    if (add === 0) return task;
    const nextActual = Math.min(100000, (Number(task.actualMinutes) || 0) + add);
    const now = new Date().toISOString();
    const idx = state.tasks.findIndex((t) => t.id === taskId);
    state.tasks[idx] = { ...task, actualMinutes: nextActual, updatedAt: now };
    updateSubDoc('tasks', taskId, { actualMinutes: nextActual, updatedAt: now });
    logActivity('Focus time logged', `+${add}m on "${task.title}"`, 'task');
    notify();
    return state.tasks[idx];
  },

  duplicateTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    const copy = {
      ...task,
      title: `${task.title} (Copy)`,
      status: 'Not Started',
      actualMinutes: 0,
      subtasks: (task.subtasks || []).map((s) => ({ id: uid('st'), text: s.text, done: false })),
      isSample: false,
    };
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.completedAt;
    return this.addTask(copy);
  },

  deleteTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return false;
    state.tasks = state.tasks.filter((t) => t.id !== id);
    deleteSubDoc('tasks', id);
    logActivity('Task deleted', task.title, 'task');
    notify();
    return true;
  },

  _spawnRecurringIfNeeded(task) {
    if (!task.recurrence || task.recurrence === 'None') return;
    const baseDate = task.dueDate || todayStr();
    let nextDue = '';
    if (task.recurrence === 'Daily') nextDue = addDays(baseDate, 1);
    else if (task.recurrence === 'Weekly') nextDue = addDays(baseDate, 7);
    else if (task.recurrence === 'Monthly') nextDue = addMonths(baseDate, 1);
    if (!nextDue) return;

    const nextStart = task.startDate
      ? task.recurrence === 'Daily'
        ? addDays(task.startDate, 1)
        : task.recurrence === 'Weekly'
        ? addDays(task.startDate, 7)
        : addMonths(task.startDate, 1)
      : '';

    const now = new Date().toISOString();
    const uidVal = currentUser?.uid || task.ownerUid || 'local';
    const nextTask = toTaskDoc(
      {
        ...task,
        id: uid('tsk'),
        startDate: nextStart,
        dueDate: nextDue,
        status: 'Not Started',
        actualMinutes: 0,
        subtasks: (task.subtasks || []).map((s) => ({ id: uid('st'), text: s.text, done: false })),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      uidVal
    );
    state.tasks = [nextTask, ...state.tasks];
    writeSubDoc('tasks', nextTask);
    logActivity('Recurring task scheduled', `${task.title} (${nextDue})`, 'task');
  },

  // Projects
  addProject(projectInput) {
    const now = new Date().toISOString();
    const project = toProjectDoc(
      {
        id: uid('prj'),
        title: (projectInput.title || '').trim(),
        description: (projectInput.description || '').trim(),
        startDate: projectInput.startDate || '',
        expectedEndDate: projectInput.expectedEndDate || '',
        priority: projectInput.priority || 'Medium',
        status: projectInput.status || 'Active',
        notes: (projectInput.notes || '').trim(),
        milestones: Array.isArray(projectInput.milestones) ? projectInput.milestones : [],
        isSample: Boolean(projectInput.isSample),
        createdAt: now,
        updatedAt: now,
      },
      currentUser?.uid || 'local'
    );
    state.projects = [project, ...state.projects];
    writeSubDoc('projects', project);
    logActivity('Project created', project.title, 'project');
    notify();
    return project;
  },

  updateProject(id, updates) {
    const idx = state.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const prev = state.projects[idx];
    const updated = toProjectDoc(
      {
        ...prev,
        ...updates,
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.projects[idx] = updated;
    updateSubDoc('projects', id, {
      title: updated.title,
      description: updated.description,
      startDate: updated.startDate,
      expectedEndDate: updated.expectedEndDate,
      priority: updated.priority,
      status: updated.status,
      notes: updated.notes,
      milestones: updated.milestones,
      isSample: updated.isSample,
      updatedAt: updated.updatedAt,
    });
    logActivity('Project updated', updated.title, 'project');
    notify();
    return updated;
  },

  toggleProjectMilestone(projectId, milestoneId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const milestones = (project.milestones || []).map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    return this.updateProject(projectId, { milestones });
  },

  deleteProject(id) {
    const project = state.projects.find((p) => p.id === id);
    if (!project) return false;
    const uidVal = currentUser?.uid;
    const ops = [];
    let unlinkedCount = 0;
    const now = new Date().toISOString();

    state.tasks = state.tasks.map((t) => {
      if (t.projectId === id) {
        unlinkedCount += 1;
        if (uidVal) {
          ops.push({
            type: 'update',
            ref: doc(db, 'users', uidVal, 'tasks', t.id),
            data: { projectId: '', updatedAt: now },
          });
        }
        return { ...t, projectId: '', updatedAt: now };
      }
      return t;
    });

    state.projects = state.projects.filter((p) => p.id !== id);
    if (uidVal) {
      ops.push({ type: 'delete', ref: doc(db, 'users', uidVal, 'projects', id) });
      commitBatchOps(ops);
    }
    logActivity(
      'Project deleted',
      unlinkedCount > 0
        ? `${project.title} (${unlinkedCount} task${unlinkedCount === 1 ? '' : 's'} preserved unassigned)`
        : project.title,
      'project'
    );
    notify();
    return true;
  },

  getProjectStats(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    const linkedTasks = state.tasks.filter((t) => t.projectId === projectId);
    const completedTasks = linkedTasks.filter((t) => t.status === 'Completed').length;
    const milestones = project?.milestones || [];
    const completedMilestones = milestones.filter((m) => m.completed).length;

    const totalItems = linkedTasks.length + milestones.length;
    const completedItems = completedTasks + completedMilestones;
    let progress = 0;
    if (project?.status === 'Completed' && totalItems === 0) {
      progress = 100;
    } else if (totalItems > 0) {
      progress = Math.round((completedItems / totalItems) * 100);
    }

    return {
      totalTasks: linkedTasks.length,
      completedTasks,
      totalMilestones: milestones.length,
      completedMilestones,
      progress,
    };
  },

  // Academic: Subjects
  addSubject(input) {
    const chapters = Array.isArray(input.chapters) ? input.chapters : [];
    const subject = toSubjectDoc(
      {
        id: uid('sub'),
        name: (input.name || '').trim(),
        code: (input.code || '').trim(),
        faculty: (input.faculty || '').trim(),
        semester: (input.semester || '').trim(),
        chapters,
        syllabusCompletion:
          chapters.length > 0
            ? Math.round((chapters.filter((c) => c.completed).length / chapters.length) * 100)
            : Math.min(100, Math.max(0, Number(input.syllabusCompletion) || 0)),
        isSample: Boolean(input.isSample),
        createdAt: new Date().toISOString(),
      },
      currentUser?.uid || 'local'
    );
    state.subjects = [subject, ...state.subjects];
    writeSubDoc('subjects', subject);
    logActivity('Subject added', `${subject.code ? subject.code + ' · ' : ''}${subject.name}`, 'academic');
    notify();
    return subject;
  },

  updateSubject(id, updates) {
    const idx = state.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    const prev = state.subjects[idx];
    const chapters = updates.chapters !== undefined ? updates.chapters : prev.chapters;
    let syllabusCompletion =
      updates.syllabusCompletion !== undefined ? Number(updates.syllabusCompletion) : prev.syllabusCompletion;
    if (Array.isArray(chapters) && chapters.length > 0) {
      syllabusCompletion = Math.round((chapters.filter((c) => c.completed).length / chapters.length) * 100);
    }
    const updated = toSubjectDoc(
      {
        ...prev,
        ...updates,
        id: prev.id,
        createdAt: prev.createdAt,
        chapters,
        syllabusCompletion: Math.min(100, Math.max(0, syllabusCompletion || 0)),
      },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.subjects[idx] = updated;
    updateSubDoc('subjects', id, {
      name: updated.name,
      code: updated.code,
      faculty: updated.faculty,
      semester: updated.semester,
      chapters: updated.chapters,
      syllabusCompletion: updated.syllabusCompletion,
      isSample: updated.isSample,
    });
    logActivity('Subject updated', updated.name, 'academic');
    notify();
    return updated;
  },

  toggleSubjectChapter(subjectId, chapterId) {
    const subject = state.subjects.find((s) => s.id === subjectId);
    if (!subject) return null;
    const chapters = (subject.chapters || []).map((c) =>
      c.id === chapterId ? { ...c, completed: !c.completed } : c
    );
    return this.updateSubject(subjectId, { chapters });
  },

  deleteSubject(id) {
    const subject = state.subjects.find((s) => s.id === id);
    if (!subject) return false;
    const uidVal = currentUser?.uid;
    const ops = [];

    state.subjects = state.subjects.filter((s) => s.id !== id);
    state.assignments = state.assignments.map((a) => {
      if (a.subjectId === id) {
        if (uidVal) ops.push({ type: 'update', ref: doc(db, 'users', uidVal, 'assignments', a.id), data: { subjectId: '' } });
        return { ...a, subjectId: '' };
      }
      return a;
    });
    state.exams = state.exams.map((e) => {
      if (e.subjectId === id) {
        if (uidVal) ops.push({ type: 'update', ref: doc(db, 'users', uidVal, 'exams', e.id), data: { subjectId: '' } });
        return { ...e, subjectId: '' };
      }
      return e;
    });
    state.studySessions = state.studySessions.map((ss) => {
      if (ss.subjectId === id) {
        if (uidVal) ops.push({ type: 'update', ref: doc(db, 'users', uidVal, 'studySessions', ss.id), data: { subjectId: '' } });
        return { ...ss, subjectId: '' };
      }
      return ss;
    });

    if (uidVal) {
      ops.push({ type: 'delete', ref: doc(db, 'users', uidVal, 'subjects', id) });
      commitBatchOps(ops);
    }
    logActivity('Subject removed', subject.name, 'academic');
    notify();
    return true;
  },

  // Academic: Assignments
  addAssignment(input) {
    const item = toAssignmentDoc(
      {
        id: uid('asg'),
        title: (input.title || '').trim(),
        subjectId: input.subjectId || '',
        description: (input.description || '').trim(),
        assignedDate: input.assignedDate || todayStr(),
        dueDate: input.dueDate || '',
        status: input.status || 'Pending',
        priority: input.priority || 'High',
        notes: (input.notes || '').trim(),
        isSample: Boolean(input.isSample),
        createdAt: new Date().toISOString(),
      },
      currentUser?.uid || 'local'
    );
    state.assignments = [item, ...state.assignments];
    writeSubDoc('assignments', item);
    logActivity('Assignment added', item.title, 'academic');
    notify();
    return item;
  },

  updateAssignment(id, updates) {
    const idx = state.assignments.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const prev = state.assignments[idx];
    const updated = toAssignmentDoc(
      { ...prev, ...updates, id: prev.id, createdAt: prev.createdAt },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.assignments[idx] = updated;
    updateSubDoc('assignments', id, {
      title: updated.title,
      subjectId: updated.subjectId,
      description: updated.description,
      assignedDate: updated.assignedDate,
      dueDate: updated.dueDate,
      status: updated.status,
      priority: updated.priority,
      notes: updated.notes,
      isSample: updated.isSample,
    });
    logActivity('Assignment updated', updated.title, 'academic');
    notify();
    return updated;
  },

  deleteAssignment(id) {
    const item = state.assignments.find((a) => a.id === id);
    if (!item) return false;
    state.assignments = state.assignments.filter((a) => a.id !== id);
    deleteSubDoc('assignments', id);
    logActivity('Assignment deleted', item.title, 'academic');
    notify();
    return true;
  },

  // Academic: Exams
  addExam(input) {
    const item = toExamDoc(
      {
        id: uid('exm'),
        name: (input.name || '').trim(),
        subjectId: input.subjectId || '',
        examDate: input.examDate || '',
        examTime: input.examTime || '',
        topics: Array.isArray(input.topics) ? input.topics : [],
        preparationStatus: input.preparationStatus || 'Not Started',
        revisionDates: Array.isArray(input.revisionDates) ? input.revisionDates : [],
        notes: (input.notes || '').trim(),
        isSample: Boolean(input.isSample),
        createdAt: new Date().toISOString(),
      },
      currentUser?.uid || 'local'
    );
    state.exams = [item, ...state.exams];
    writeSubDoc('exams', item);
    logActivity('Exam scheduled', item.name, 'academic');
    notify();
    return item;
  },

  updateExam(id, updates) {
    const idx = state.exams.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const prev = state.exams[idx];
    const updated = toExamDoc(
      { ...prev, ...updates, id: prev.id, createdAt: prev.createdAt },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.exams[idx] = updated;
    updateSubDoc('exams', id, {
      name: updated.name,
      subjectId: updated.subjectId,
      examDate: updated.examDate,
      examTime: updated.examTime,
      topics: updated.topics,
      preparationStatus: updated.preparationStatus,
      revisionDates: updated.revisionDates,
      notes: updated.notes,
      isSample: updated.isSample,
    });
    logActivity('Exam updated', updated.name, 'academic');
    notify();
    return updated;
  },

  toggleExamTopic(examId, topicId) {
    const exam = state.exams.find((e) => e.id === examId);
    if (!exam) return null;
    const topics = (exam.topics || []).map((t) =>
      t.id === topicId ? { ...t, prepared: !t.prepared } : t
    );
    return this.updateExam(examId, { topics });
  },

  deleteExam(id) {
    const item = state.exams.find((e) => e.id === id);
    if (!item) return false;
    state.exams = state.exams.filter((e) => e.id !== id);
    deleteSubDoc('exams', id);
    logActivity('Exam deleted', item.name, 'academic');
    notify();
    return true;
  },

  // Academic: Study Sessions
  addStudySession(input) {
    const session = toStudySessionDoc(
      {
        id: uid('std'),
        subjectId: input.subjectId || '',
        date: input.date || todayStr(),
        durationMinutes: Math.max(5, Number(input.durationMinutes) || 30),
        topic: (input.topic || '').trim(),
        notes: (input.notes || '').trim(),
        isSample: Boolean(input.isSample),
        createdAt: new Date().toISOString(),
      },
      currentUser?.uid || 'local'
    );
    state.studySessions = [session, ...state.studySessions];
    writeSubDoc('studySessions', session);
    logActivity('Study session logged', `${session.durationMinutes}m${session.topic ? ' · ' + session.topic : ''}`, 'academic');
    notify();
    return session;
  },

  deleteStudySession(id) {
    state.studySessions = state.studySessions.filter((s) => s.id !== id);
    deleteSubDoc('studySessions', id);
    notify();
  },

  // Daily Routine Planner
  addRoutineSlot(input) {
    const slot = toRoutineSlotDoc(
      {
        id: uid('rtn'),
        title: (input.title || '').trim(),
        category: input.category || 'Study Session',
        startTime: input.startTime || '08:00',
        endTime: input.endTime || '09:00',
        dayScope: input.dayScope || 'Everyday',
        notes: (input.notes || '').trim(),
        isSample: Boolean(input.isSample),
      },
      currentUser?.uid || 'local'
    );
    state.routineSlots = [...state.routineSlots, slot].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
    writeSubDoc('routineSlots', slot);
    logActivity('Routine slot added', `${slot.startTime}–${slot.endTime} ${slot.title}`, 'planner');
    notify();
    return slot;
  },

  updateRoutineSlot(id, updates) {
    const idx = state.routineSlots.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const prev = state.routineSlots[idx];
    const updated = toRoutineSlotDoc(
      { ...prev, ...updates, id: prev.id },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.routineSlots[idx] = updated;
    state.routineSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    updateSubDoc('routineSlots', id, {
      title: updated.title,
      category: updated.category,
      startTime: updated.startTime,
      endTime: updated.endTime,
      dayScope: updated.dayScope,
      notes: updated.notes,
      isSample: updated.isSample,
    });
    logActivity('Routine slot updated', updated.title, 'planner');
    notify();
    return updated;
  },

  deleteRoutineSlot(id) {
    const item = state.routineSlots.find((r) => r.id === id);
    if (!item) return false;
    state.routineSlots = state.routineSlots.filter((r) => r.id !== id);
    deleteSubDoc('routineSlots', id);
    logActivity('Routine slot removed', item.title, 'planner');
    notify();
    return true;
  },

  toggleRoutineSlotCompletion(slotId, dateStr = todayStr()) {
    const list = state.routineCompletions[dateStr] || [];
    const exists = list.includes(slotId);
    state.routineCompletions = {
      ...state.routineCompletions,
      [dateStr]: exists ? list.filter((id) => id !== slotId) : [...list, slotId],
    };
    writeWorkspaceDocFields({ routineCompletions: state.routineCompletions });
    notify();
  },

  loadDefaultRoutineTemplate() {
    const template = [
      { title: 'Morning Hydration, Stretch & Plan Review', category: 'Morning Routine', startTime: '06:30', endTime: '07:15', dayScope: 'Everyday' },
      { title: 'Breakfast & Preparation', category: 'Morning Routine', startTime: '07:15', endTime: '08:00', dayScope: 'Everyday' },
      { title: 'Core Lectures / College Schedule', category: 'College Schedule', startTime: '09:00', endTime: '12:30', dayScope: 'Weekdays' },
      { title: 'Lunch & Midday Reset', category: 'Break', startTime: '12:30', endTime: '13:30', dayScope: 'Everyday' },
      { title: 'Deep Study Session', category: 'Study Session', startTime: '14:00', endTime: '16:00', dayScope: 'Everyday' },
      { title: 'Coding Practice & Problem Solving', category: 'Coding Practice', startTime: '16:30', endTime: '18:00', dayScope: 'Everyday' },
      { title: 'Project Development Block', category: 'Project Development', startTime: '19:00', endTime: '20:30', dayScope: 'Everyday' },
      { title: 'Evening Review & Next-Day Prep', category: 'Evening Review', startTime: '21:15', endTime: '21:45', dayScope: 'Everyday' },
    ];
    const uidVal = currentUser?.uid || 'local';
    const ops = [];
    template.forEach((slot) => {
      const docObj = toRoutineSlotDoc({ id: uid('rtn'), notes: '', isSample: false, ...slot }, uidVal);
      state.routineSlots.push(docObj);
      if (currentUser?.uid) {
        ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'routineSlots', docObj.id), data: docObj });
      }
    });
    state.routineSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (ops.length > 0) commitBatchOps(ops);
    logActivity('Routine template applied', 'Added 8 balanced daily routine blocks', 'planner');
    notify();
  },

  // Calendar Personal Events
  addCalendarEvent(input) {
    const evt = toCalendarEventDoc(
      {
        id: uid('evt'),
        title: (input.title || '').trim(),
        date: input.date || todayStr(),
        time: input.time || '',
        category: input.category || 'Personal',
        notes: (input.notes || '').trim(),
        isSample: Boolean(input.isSample),
        createdAt: new Date().toISOString(),
      },
      currentUser?.uid || 'local'
    );
    state.calendarEvents = [evt, ...state.calendarEvents];
    writeSubDoc('calendarEvents', evt);
    logActivity('Event scheduled', `${evt.title} (${evt.date})`, 'calendar');
    notify();
    return evt;
  },

  updateCalendarEvent(id, updates) {
    const idx = state.calendarEvents.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const prev = state.calendarEvents[idx];
    const updated = toCalendarEventDoc(
      { ...prev, ...updates, id: prev.id, createdAt: prev.createdAt },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.calendarEvents[idx] = updated;
    updateSubDoc('calendarEvents', id, {
      title: updated.title,
      date: updated.date,
      time: updated.time,
      category: updated.category,
      notes: updated.notes,
      isSample: updated.isSample,
    });
    notify();
    return updated;
  },

  deleteCalendarEvent(id) {
    const evt = state.calendarEvents.find((e) => e.id === id);
    if (!evt) return false;
    state.calendarEvents = state.calendarEvents.filter((e) => e.id !== id);
    deleteSubDoc('calendarEvents', id);
    logActivity('Event removed', evt.title, 'calendar');
    notify();
    return true;
  },

  // Notes
  addNote(input) {
    const now = new Date().toISOString();
    const note = toNoteDoc(
      {
        id: uid('nte'),
        title: (input.title || '').trim() || 'Untitled Note',
        content: (input.content || '').trim(),
        category: input.category || 'Quick Note',
        tags: Array.isArray(input.tags) ? input.tags : [],
        pinned: Boolean(input.pinned),
        isSample: Boolean(input.isSample),
        createdAt: now,
        updatedAt: now,
      },
      currentUser?.uid || 'local'
    );
    state.notes = [note, ...state.notes];
    writeSubDoc('notes', note);
    logActivity('Note saved', note.title, 'note');
    notify();
    return note;
  },

  updateNote(id, updates) {
    const idx = state.notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const prev = state.notes[idx];
    const updated = toNoteDoc(
      {
        ...prev,
        ...updates,
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      },
      currentUser?.uid || prev.ownerUid || 'local'
    );
    state.notes[idx] = updated;
    updateSubDoc('notes', id, {
      title: updated.title,
      content: updated.content,
      category: updated.category,
      tags: updated.tags,
      pinned: updated.pinned,
      isSample: updated.isSample,
      updatedAt: updated.updatedAt,
    });
    logActivity('Note updated', updated.title, 'note');
    notify();
    return updated;
  },

  deleteNote(id) {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return false;
    state.notes = state.notes.filter((n) => n.id !== id);
    deleteSubDoc('notes', id);
    logActivity('Note deleted', note.title, 'note');
    notify();
    return true;
  },

  // Optional Sample Workspace Data
  hasSampleData() {
    return (
      state.tasks.some((t) => t.isSample) ||
      state.projects.some((p) => p.isSample) ||
      state.subjects.some((s) => s.isSample) ||
      state.notes.some((n) => n.isSample)
    );
  },

  loadSampleWorkspace(shouldNotify = true) {
    const t0 = todayStr();
    const tPlus1 = addDays(t0, 1);
    const tPlus2 = addDays(t0, 2);
    const tPlus5 = addDays(t0, 5);
    const tMinus1 = addDays(t0, -1);
    const uidVal = currentUser?.uid || 'local';
    const ops = [];

    const prj = toProjectDoc(
      {
        id: uid('prj'),
        title: 'Personal Portfolio & Case Studies',
        description: 'Design and ship updated portfolio showcasing engineering projects.',
        startDate: tMinus1,
        expectedEndDate: addDays(t0, 14),
        priority: 'High',
        status: 'Active',
        notes: 'Keep architecture documentation concise and include live demos.',
        milestones: [
          { id: uid('mil'), title: 'Draft case study outlines', dueDate: tPlus2, completed: true },
          { id: uid('mil'), title: 'Finalize responsive layout', dueDate: addDays(t0, 8), completed: false },
        ],
        isSample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      uidVal
    );
    state.projects.push(prj);
    if (currentUser?.uid) ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'projects', prj.id), data: prj });

    const sub = toSubjectDoc(
      {
        id: uid('sub'),
        name: 'Data Structures & Algorithms',
        code: 'CS-301',
        faculty: 'Dr. A. Menon',
        semester: state.profile.semester || 'Semester 5',
        chapters: [
          { id: uid('ch'), title: 'Asymptotic Analysis & Recurrences', completed: true },
          { id: uid('ch'), title: 'Trees, Heaps & Balanced BSTs', completed: true },
          { id: uid('ch'), title: 'Graph Algorithms & Shortest Paths', completed: false },
          { id: uid('ch'), title: 'Dynamic Programming Patterns', completed: false },
        ],
        syllabusCompletion: 50,
        isSample: true,
        createdAt: new Date().toISOString(),
      },
      uidVal
    );
    state.subjects.push(sub);
    if (currentUser?.uid) ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'subjects', sub.id), data: sub });

    const sampleTasks = [
      {
        title: 'Example: Review Graph Traversal Notes (BFS / DFS)',
        description: 'Summarize time complexity and trace adjacency list examples.',
        category: 'Academic',
        startDate: t0,
        dueDate: t0,
        deadlineTime: '18:00',
        priority: 'High',
        status: 'In Progress',
        estimatedMinutes: 60,
        actualMinutes: 20,
        subtasks: [
          { id: uid('st'), text: 'Write BFS queue trace', done: true },
          { id: uid('st'), text: 'Solve 3 practice problems', done: false },
        ],
        tags: ['Exam Prep'],
        reminderTiming: '0d',
        isSample: true,
      },
      {
        title: 'Example: Write Project Architecture Section',
        description: 'Document key system decisions for the portfolio case study.',
        category: 'Project',
        projectId: prj.id,
        startDate: t0,
        dueDate: tPlus2,
        deadlineTime: '20:00',
        priority: 'Medium',
        status: 'Not Started',
        estimatedMinutes: 90,
        tags: ['Deep Work'],
        reminderTiming: '1d',
        isSample: true,
      },
      {
        title: 'Example: Submit Weekly Reading Summary',
        description: 'Short 1-page reflection note. You can delete all example items anytime from Settings or Dashboard.',
        category: 'Academic',
        startDate: tMinus1,
        dueDate: tPlus1,
        deadlineTime: '17:00',
        priority: 'Critical',
        status: 'Not Started',
        estimatedMinutes: 45,
        tags: ['Submission'],
        reminderTiming: '1d',
        isSample: true,
      },
    ];

    sampleTasks.forEach((item) => {
      const now = new Date().toISOString();
      const tDoc = toTaskDoc({ id: uid('tsk'), createdAt: now, updatedAt: now, ...item }, uidVal);
      state.tasks.push(tDoc);
      if (currentUser?.uid) ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'tasks', tDoc.id), data: tDoc });
    });

    const asg = toAssignmentDoc(
      {
        id: uid('asg'),
        title: 'Example: Shortest Path Lab Assignment',
        subjectId: sub.id,
        description: 'Implement Dijkstra and Bellman-Ford with complexity comparison.',
        assignedDate: tMinus1,
        dueDate: tPlus5,
        status: 'In Progress',
        priority: 'High',
        notes: 'Test on sparse and dense graphs.',
        isSample: true,
        createdAt: new Date().toISOString(),
      },
      uidVal
    );
    state.assignments.push(asg);
    if (currentUser?.uid) ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'assignments', asg.id), data: asg });

    const note = toNoteDoc(
      {
        id: uid('nte'),
        title: 'Example: Getting Started with TASKFLOW',
        content:
          'Use Quick Capture in the top bar to log tasks or notes from anywhere. Your changes sync automatically to your cloud account.',
        category: 'Quick Note',
        tags: ['Guide'],
        pinned: true,
        isSample: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      uidVal
    );
    state.notes.push(note);
    if (currentUser?.uid) ops.push({ type: 'set', ref: doc(db, 'users', uidVal, 'notes', note.id), data: note });

    if (ops.length > 0) commitBatchOps(ops);
    if (shouldNotify) {
      logActivity('Example workspace loaded', 'Added starter sample tasks and project');
      notify();
    }
  },

  removeSampleWorkspace() {
    const uidVal = currentUser?.uid;
    const ops = [];
    const cols = ['tasks', 'projects', 'subjects', 'assignments', 'exams', 'studySessions', 'routineSlots', 'calendarEvents', 'notes'];
    cols.forEach((colKey) => {
      state[colKey].forEach((item) => {
        if (item.isSample && uidVal) {
          ops.push({ type: 'delete', ref: doc(db, 'users', uidVal, colKey, item.id) });
        }
      });
      state[colKey] = state[colKey].filter((item) => !item.isSample);
    });
    if (ops.length > 0) commitBatchOps(ops);
    logActivity('Example items cleared', 'Removed all optional sample workspace items');
    notify();
  },

  // Focus Today Smart Ranking
  getSmartTaskOrganization() {
    const activeTasks = state.tasks.filter((t) => t.status !== 'Completed');
    const overdue = [];
    const criticalUrgent = [];
    const highPriority = [];
    const approaching = [];
    const noDeadline = [];
    const staleIncomplete = [];
    const nowMs = Date.now();

    activeTasks.forEach((task) => {
      const diff = task.dueDate ? getDaysDiff(task.dueDate) : null;
      if (diff !== null && diff < 0) overdue.push(task);
      if (task.priority === 'Critical') criticalUrgent.push(task);
      if (task.priority === 'High') highPriority.push(task);
      if (diff !== null && diff >= 0 && diff <= 3) approaching.push(task);
      if (!task.dueDate) noDeadline.push(task);

      const createdMs = new Date(task.createdAt).getTime();
      const ageDays = Number.isNaN(createdMs) ? 0 : (nowMs - createdMs) / 86400000;
      if (ageDays >= 3 && (task.status === 'Not Started' || task.status === 'On Hold')) {
        staleIncomplete.push(task);
      }
    });

    const focusRanked = activeTasks
      .map((task) => {
        const diff = task.dueDate ? getDaysDiff(task.dueDate) : null;
        let score = 0;
        const reasons = [];

        if (diff !== null) {
          if (diff < 0) {
            score += 120 + Math.min(30, Math.abs(diff) * 4);
            reasons.push(`Overdue ${Math.abs(diff)}d`);
          } else if (diff === 0) {
            score += 100;
            reasons.push('Due today');
          } else if (diff === 1) {
            score += 72;
            reasons.push('Due tomorrow');
          } else if (diff <= 3) {
            score += 48;
            reasons.push(`Due in ${diff}d`);
          } else if (diff <= 7) {
            score += 20;
          }
        }

        const pWeight = PRIORITY_WEIGHT[task.priority] || 1;
        score += pWeight * 18;
        if (task.priority === 'Critical' || task.priority === 'High') {
          reasons.push(`${task.priority} priority`);
        }

        if (task.status === 'In Progress') {
          score += 14;
          reasons.push('In progress');
        } else if (task.status === 'On Hold') {
          score -= 18;
        }

        return {
          task,
          score,
          reason: reasons.length > 0 ? reasons.join(' · ') : `${task.priority} priority`,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const statusDiff = (STATUS_ORDER[a.task.status] || 9) - (STATUS_ORDER[b.task.status] || 9);
        if (statusDiff !== 0) return statusDiff;
        return (a.task.dueDate || '9999-12-31').localeCompare(b.task.dueDate || '9999-12-31');
      });

    return {
      overdue,
      criticalUrgent,
      highPriority,
      approaching,
      noDeadline,
      staleIncomplete,
      focusToday: focusRanked.slice(0, 8),
      allRanked: focusRanked,
    };
  },

  // Reminders & Notifications Center
  getActiveReminders() {
    const reminders = [];
    const t0 = todayStr();
    const leadMap = { none: -1, '0d': 0, '1d': 1, '3d': 3, '7d': 7 };
    const defaultLead = leadMap[state.settings.defaultReminderTiming] ?? 1;

    state.tasks.forEach((task) => {
      if (task.status === 'Completed' || !task.dueDate) return;
      const diff = getDaysDiff(task.dueDate, t0);
      if (diff === null) return;
      const lead =
        task.reminderTiming && task.reminderTiming !== 'none'
          ? leadMap[task.reminderTiming] ?? defaultLead
          : task.reminderTiming === 'none'
          ? -1
          : defaultLead;

      if (diff < 0) {
        reminders.push({
          id: `rem_tsk_${task.id}`,
          sourceType: 'Task',
          sourceId: task.id,
          title: task.title,
          dueDate: task.dueDate,
          dueTime: task.deadlineTime,
          diff,
          severity: 'overdue',
          category: 'Overdue Task',
          message: `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`,
        });
      } else if (lead >= 0 && diff <= lead) {
        reminders.push({
          id: `rem_tsk_${task.id}`,
          sourceType: 'Task',
          sourceId: task.id,
          title: task.title,
          dueDate: task.dueDate,
          dueTime: task.deadlineTime,
          diff,
          severity: diff === 0 ? 'today' : 'upcoming',
          category: diff === 0 ? 'Due Today' : 'Task Deadline',
          message: diff === 0 ? 'Due today' : diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`,
        });
      }
    });

    state.assignments.forEach((asg) => {
      if (asg.status === 'Submitted' || asg.status === 'Graded' || !asg.dueDate) return;
      const diff = getDaysDiff(asg.dueDate, t0);
      if (diff === null) return;
      const windowDays = Math.max(3, defaultLead);
      if (diff < 0 || diff <= windowDays) {
        reminders.push({
          id: `rem_asg_${asg.id}`,
          sourceType: 'Assignment',
          sourceId: asg.id,
          title: asg.title,
          dueDate: asg.dueDate,
          dueTime: '',
          diff,
          severity: diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'upcoming',
          category: 'Assignment Submission',
          message:
            diff < 0
              ? `Submission overdue by ${Math.abs(diff)}d`
              : diff === 0
              ? 'Submission due today'
              : `Submission due in ${diff}d`,
        });
      }
    });

    state.exams.forEach((exam) => {
      if (!exam.examDate) return;
      const diff = getDaysDiff(exam.examDate, t0);
      if (diff === null) return;
      const windowDays = Math.max(7, defaultLead);
      if (diff >= 0 && diff <= windowDays) {
        reminders.push({
          id: `rem_exm_${exam.id}`,
          sourceType: 'Exam',
          sourceId: exam.id,
          title: exam.name,
          dueDate: exam.examDate,
          dueTime: exam.examTime,
          diff,
          severity: diff <= 1 ? 'today' : 'upcoming',
          category: 'Upcoming Examination',
          message: diff === 0 ? 'Exam is today' : diff === 1 ? 'Exam tomorrow' : `Exam in ${diff} days`,
        });
      }
    });

    state.projects.forEach((prj) => {
      if (prj.status === 'Completed' || !prj.expectedEndDate) return;
      const diff = getDaysDiff(prj.expectedEndDate, t0);
      if (diff === null) return;
      const windowDays = Math.max(3, defaultLead);
      if (diff < 0 || diff <= windowDays) {
        reminders.push({
          id: `rem_prj_${prj.id}`,
          sourceType: 'Project',
          sourceId: prj.id,
          title: prj.title,
          dueDate: prj.expectedEndDate,
          dueTime: '',
          diff,
          severity: diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'upcoming',
          category: 'Project Deadline',
          message:
            diff < 0
              ? `Project target passed (${Math.abs(diff)}d ago)`
              : diff === 0
              ? 'Project due today'
              : `Project due in ${diff}d`,
        });
      }
    });

    return reminders.sort((a, b) => a.diff - b.diff);
  },

  dispatchBrowserNotificationsIfEnabled() {
    if (!currentUser || !state.settings.enableBrowserNotifications) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const today = todayStr();
    let notifiedToday = {};
    try {
      notifiedToday = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
    } catch {
      notifiedToday = {};
    }
    if (notifiedToday.date !== today) {
      notifiedToday = { date: today, ids: [] };
    }

    const active = this.getActiveReminders().filter((r) => r.diff <= 1);
    const fresh = active.filter((r) => !notifiedToday.ids.includes(r.id));
    if (fresh.length === 0) return;

    fresh.slice(0, 3).forEach((rem) => {
      try {
        new Notification(`TASKFLOW · ${rem.category}`, {
          body: `${rem.title} — ${rem.message}`,
          tag: rem.id,
        });
        notifiedToday.ids.push(rem.id);
      } catch {
        // Ignore browser restriction errors
      }
    });

    try {
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedToday));
    } catch {
      // Ignore storage quota errors
    }
  },

  // Analytics
  getAnalytics(trendDays = 7) {
    const t0 = todayStr();
    const totalTasks = state.tasks.length;
    const completedTasks = state.tasks.filter((t) => t.status === 'Completed').length;
    const pendingTasks = totalTasks - completedTasks;
    const overdueTasks = state.tasks.filter(
      (t) => t.status !== 'Completed' && t.dueDate && getDaysDiff(t.dueDate, t0) < 0
    ).length;
    const dueTodayTasks = state.tasks.filter(
      (t) => t.status !== 'Completed' && t.dueDate === t0
    ).length;

    const todayRelevant = state.tasks.filter(
      (t) => t.dueDate === t0 || (t.completedAt && t.completedAt.slice(0, 10) === t0)
    );
    const todayDone = todayRelevant.filter((t) => t.status === 'Completed').length;
    const dailyRate = todayRelevant.length > 0 ? Math.round((todayDone / todayRelevant.length) * 100) : 0;

    const weekStart = addDays(t0, -6);
    const weekRelevant = state.tasks.filter((t) => {
      const dueInWeek = t.dueDate && t.dueDate >= weekStart && t.dueDate <= t0;
      const doneInWeek = t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= t0;
      return dueInWeek || doneInWeek;
    });
    const weekDone = weekRelevant.filter((t) => t.status === 'Completed').length;
    const weeklyRate = weekRelevant.length > 0 ? Math.round((weekDone / weekRelevant.length) * 100) : 0;

    const monthStart = addDays(t0, -29);
    const monthRelevant = state.tasks.filter((t) => {
      const dueInMonth = t.dueDate && t.dueDate >= monthStart && t.dueDate <= t0;
      const doneInMonth =
        t.completedAt && t.completedAt.slice(0, 10) >= monthStart && t.completedAt.slice(0, 10) <= t0;
      return dueInMonth || doneInMonth;
    });
    const monthDone = monthRelevant.filter((t) => t.status === 'Completed').length;
    const monthlyRate = monthRelevant.length > 0 ? Math.round((monthDone / monthRelevant.length) * 100) : 0;

    const trend = [];
    for (let i = trendDays - 1; i >= 0; i -= 1) {
      const dStr = addDays(t0, -i);
      const completedOnDay = state.tasks.filter(
        (t) => t.status === 'Completed' && t.completedAt && t.completedAt.slice(0, 10) === dStr
      ).length;
      const createdOnDay = state.tasks.filter(
        (t) => t.createdAt && t.createdAt.slice(0, 10) === dStr
      ).length;
      const studyMins = state.studySessions
        .filter((s) => s.date === dStr)
        .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
      trend.push({ dateStr: dStr, completed: completedOnDay, created: createdOnDay, studyMinutes: studyMins });
    }

    const priorityCounts = {
      Critical: state.tasks.filter((t) => t.priority === 'Critical').length,
      High: state.tasks.filter((t) => t.priority === 'High').length,
      Medium: state.tasks.filter((t) => t.priority === 'Medium').length,
      Low: state.tasks.filter((t) => t.priority === 'Low').length,
    };

    const categoryCounts = {};
    state.tasks.forEach((t) => {
      const cat = t.category || 'Uncategorized';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const totalStudyMinutes = state.studySessions.reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
    const todayStudyMinutes = state.studySessions
      .filter((s) => s.date === t0)
      .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
    const weekStudyMinutes = state.studySessions
      .filter((s) => s.date >= weekStart && s.date <= t0)
      .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);

    const studyBySubject = state.subjects.map((sub) => {
      const mins = state.studySessions
        .filter((s) => s.subjectId === sub.id)
        .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
      return { subjectId: sub.id, name: sub.name, code: sub.code, minutes: mins };
    });

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      overdueTasks,
      dueTodayTasks,
      dailyRate,
      weeklyRate,
      monthlyRate,
      trend,
      priorityCounts,
      categoryCounts,
      totalStudyMinutes,
      todayStudyMinutes,
      weekStudyMinutes,
      studyBySubject,
    };
  },

  // Data Management: Export / Import / Reset
  exportAllJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'TASKFLOW',
      uid: currentUser?.uid || null,
      data: state,
    };
    downloadFile(`taskflow-backup-${todayStr()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    logActivity('Data exported', 'Downloaded full JSON backup');
    notify();
  },

  exportTasksCsv() {
    const headers = [
      'ID',
      'Title',
      'Description',
      'Category',
      'Project',
      'Start Date',
      'Due Date',
      'Deadline Time',
      'Priority',
      'Status',
      'Estimated Minutes',
      'Actual Minutes',
      'Tags',
      'Recurrence',
      'Reminder',
      'Created At',
      'Completed At',
    ];
    const projectMap = Object.fromEntries(state.projects.map((p) => [p.id, p.title]));
    const rows = state.tasks.map((t) => [
      t.id,
      t.title,
      t.description,
      t.category,
      projectMap[t.projectId] || '',
      t.startDate,
      t.dueDate,
      t.deadlineTime,
      t.priority,
      t.status,
      t.estimatedMinutes,
      t.actualMinutes,
      (t.tags || []).join('; '),
      t.recurrence,
      t.reminderTiming,
      t.createdAt,
      t.completedAt || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    downloadFile(`taskflow-tasks-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
    logActivity('Tasks exported', `Exported ${state.tasks.length} tasks to CSV`);
    notify();
  },

  validateImportJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, error: 'Invalid JSON file format.' };
    }
    const candidate = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.tasks)) {
      return { ok: false, error: 'This JSON file does not appear to be a valid TASKFLOW backup.' };
    }
    return { ok: true, data: sanitizeState(candidate) };
  },

  async importJsonData(sanitizedState) {
    const uidVal = currentUser?.uid;
    if (!uidVal) return;

    await this.resetAllData(false);

    const next = { ...sanitizedState, onboarded: true, migratedFromLocal: state.migratedFromLocal };
    const ops = [];

    const queueAll = (colKey, items, formatter) => {
      const formatted = items.map((it) => formatter(it, uidVal));
      next[colKey] = formatted;
      formatted.forEach((docObj) => {
        ops.push({ type: 'set', ref: doc(db, 'users', uidVal, colKey, docObj.id), data: docObj });
      });
    };

    queueAll('projects', next.projects, toProjectDoc);
    queueAll('tasks', next.tasks, toTaskDoc);
    queueAll('subjects', next.subjects, toSubjectDoc);
    queueAll('assignments', next.assignments, toAssignmentDoc);
    queueAll('exams', next.exams, toExamDoc);
    queueAll('studySessions', next.studySessions, toStudySessionDoc);
    queueAll('routineSlots', next.routineSlots, toRoutineSlotDoc);
    queueAll('calendarEvents', next.calendarEvents, toCalendarEventDoc);
    queueAll('notes', next.notes, toNoteDoc);

    state = next;
    await commitBatchOps(ops);
    writeWorkspaceDocFields({
      onboarded: true,
      profile: sanitizeProfile(next.profile),
      settings: sanitizeSettings(next.settings),
      routineCompletions: next.routineCompletions || {},
    });
    logActivity('Backup restored', `Imported ${state.tasks.length} tasks and ${state.projects.length} projects`);
    notify();
  },

  async resetAllData(shouldLog = true) {
    const uidVal = currentUser?.uid;
    if (uidVal) {
      const ops = [];
      for (const { key } of SUBCOLLECTIONS) {
        const q = query(collection(db, 'users', uidVal, key), where('ownerUid', '==', uidVal));
        const snap = await getDocs(q);
        snap.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
      }
      await commitBatchOps(ops);
    }

    const fresh = createDefaultState();
    fresh.onboarded = true;
    fresh.migratedFromLocal = state.migratedFromLocal;
    state = fresh;

    if (uidVal) {
      writeWorkspaceDocFields({
        onboarded: true,
        profile: fresh.profile,
        settings: fresh.settings,
        routineCompletions: {},
      });
    }
    localStorage.removeItem(NOTIFIED_KEY);
    if (shouldLog) {
      logActivity('Workspace reset', 'Cleared all cloud workspace data');
    }
    notify();
  },
};
