type Lvl = 'info' | 'warn' | 'error';
function out(level: Lvl, obj: Record<string, unknown> | string, msg?: string) {
  const rec = typeof obj === 'string' ? { msg: obj } : { ...obj, msg };
  const line = JSON.stringify({ t: new Date().toISOString(), level, ...rec });
  (level === 'error' ? console.error : console.log)(line);
}
export const log = {
  info: (o: Record<string, unknown> | string, m?: string) => out('info', o, m),
  warn: (o: Record<string, unknown> | string, m?: string) => out('warn', o, m),
  error: (o: Record<string, unknown> | string, m?: string) => out('error', o, m),
};
