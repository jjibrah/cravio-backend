const sanitize = (value) => typeof value === 'string' ? value.replace(/:\/\/[^\s:@/]+:[^\s@/]+@/g, '://[REDACTED]@').replace(/\b(Bearer\s+|sk_|whsec_)[^\s]+/gi, '[REDACTED]') : value && typeof value === 'object' ? redact(value) : value;
const redact = (value) => Object.fromEntries(Object.entries(value).map(([key, item]) => /authorization|cookie|token|secret|password|database_url/i.test(key) ? [key, '[REDACTED]'] : [key, sanitize(item)]));
/** @param {{ sink?: any, level?: string }} [options] */
export function createLogger({ sink = console, level = 'info' } = {}) {
  const levels = { debug: 10, info: 20, warn: 30, error: 40 }; const threshold = levels[level] || 20;
  return Object.fromEntries(Object.entries(levels).map(([name, priority]) => [name, (message, context = {}) => { if (priority < threshold) return; const entry = JSON.stringify({ timestamp: new Date().toISOString(), level: name, message, ...redact(context) }); (sink[name] || sink.log).call(sink, entry); }]));
}
export const logger = createLogger({ level: process.env.NODE_ENV === 'development' ? 'debug' : 'info' });
