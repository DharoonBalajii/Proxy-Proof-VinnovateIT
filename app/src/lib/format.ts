const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');

export const fmtClock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${p2(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
};
export const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
};
export const fmtAgo = (ms: number, now = Date.now()) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmtDay(ms);
};
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

export const REASON_LABEL: Record<string, string> = {
  session_closed: 'Session already ended',
  not_registered: 'Not enrolled',
  wrong_device: 'Wrong phone',
  stale_token: 'Expired or guessed code',
  too_far: 'Too far away',
  device_already_used: 'Phone already used',
};
