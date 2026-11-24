export function uid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateStr(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function addDays(dateStr, days) {
  const dt = parseLocalDate(dateStr) || new Date();
  const next = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + days);
  return toDateStr(next);
}

export function addMonths(dateStr, months) {
  const dt = parseLocalDate(dateStr) || new Date();
  const targetMonth = dt.getMonth() + months;
  const next = new Date(dt.getFullYear(), targetMonth, 1);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(dt.getDate(), maxDay));
  return toDateStr(next);
}

export function getDaysDiff(targetDateStr, fromDateStr = todayStr()) {
  const target = parseLocalDate(targetDateStr);
  const base = parseLocalDate(fromDateStr);
  if (!target || !base) return null;
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

export function formatDate(dateStr, format = 'MMM DD, YYYY') {
  const dt = parseLocalDate(dateStr);
  if (!dt) return '—';
  const yyyy = dt.getFullYear();
  const mm = pad2(dt.getMonth() + 1);
  const dd = pad2(dt.getDate());
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthsShort[dt.getMonth()];

  switch (format) {
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'MMM DD, YYYY':
    default:
      return `${monthName} ${dt.getDate()}, ${yyyy}`;
  }
}

export function formatShortDate(dateStr) {
  const dt = parseLocalDate(dateStr);
  if (!dt) return '—';
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthsShort[dt.getMonth()]} ${dt.getDate()}`;
}

export function formatTime(timeStr, timeFormat = '12h') {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const [hRaw, mRaw] = timeStr.split(':').map(Number);
  if (Number.isNaN(hRaw) || Number.isNaN(mRaw)) return timeStr;
  if (timeFormat === '24h') {
    return `${pad2(hRaw)}:${pad2(mRaw)}`;
  }
  const period = hRaw >= 12 ? 'PM' : 'AM';
  const h12 = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h12}:${pad2(mRaw)} ${period}`;
}

export function formatLiveClock(date, timeFormat = '12h') {
  const hours = date.getHours();
  const mins = pad2(date.getMinutes());
  const secs = pad2(date.getSeconds());
  if (timeFormat === '24h') {
    return `${pad2(hours)}:${mins}:${secs}`;
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad2(h12)}:${mins}:${secs} ${period}`;
}

export function formatFullDisplayDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatDuration(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) return '0m';
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  if (hrs === 0) return `${rem}m`;
  if (rem === 0) return `${hrs}h`;
  return `${hrs}h ${rem}m`;
}

export function formatRelativeTimestamp(isoStr) {
  if (!isoStr) return '';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return '';
  const diffSec = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatShortDate(toDateStr(dt));
}

export function getDeadlineMeta(task) {
  if (!task) return { label: 'No deadline', tone: 'neutral', diff: null, urgent: false };
  if (task.status === 'Completed') {
    return { label: 'Completed', tone: 'success', diff: null, urgent: false };
  }
  if (!task.dueDate) {
    return { label: 'No deadline', tone: 'neutral', diff: null, urgent: false };
  }
  const diff = getDaysDiff(task.dueDate);
  if (diff === null) {
    return { label: 'No deadline', tone: 'neutral', diff: null, urgent: false };
  }
  if (diff < 0) {
    const overdueDays = Math.abs(diff);
    return {
      label: overdueDays === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`,
      shortLabel: 'Overdue',
      tone: 'danger',
      diff,
      urgent: true,
    };
  }
  if (diff === 0) {
    return { label: 'Due today', shortLabel: 'Due today', tone: 'warning', diff: 0, urgent: true };
  }
  if (diff === 1) {
    return { label: 'Due tomorrow', shortLabel: 'Due tomorrow', tone: 'warning', diff: 1, urgent: true };
  }
  if (diff <= 3) {
    return { label: `Due in ${diff} days`, shortLabel: `${diff}d left`, tone: 'accent', diff, urgent: false };
  }
  if (diff <= 7) {
    return { label: `Due in ${diff} days`, shortLabel: `${diff}d left`, tone: 'neutral', diff, urgent: false };
  }
  return { label: `Due in ${diff} days`, shortLabel: `${diff}d left`, tone: 'neutral', diff, urgent: false };
}

export const PRIORITY_WEIGHT = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

export const STATUS_ORDER = {
  'In Progress': 1,
  'Not Started': 2,
  'On Hold': 3,
  Completed: 4,
};

export function getWeekDates(anchorDateStr = todayStr()) {
  const anchor = parseLocalDate(anchorDateStr) || new Date();
  const day = anchor.getDay(); // 0=Sun
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - day);
  const result = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    result.push(toDateStr(d));
  }
  return result;
}

export function getMonthMatrix(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(year, monthIndex, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    cells.push({
      dateStr: toDateStr(d),
      dayNumber: d.getDate(),
      inCurrentMonth: d.getMonth() === monthIndex,
    });
  }
  return cells;
}

export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function escapeCsvCell(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
