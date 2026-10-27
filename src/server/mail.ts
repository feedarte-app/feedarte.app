import nodemailer from 'nodemailer';
import { getSetting } from './auth';
import { env } from './env';

/**
 * Outgoing email. Configured in the admin panel:
 *  - provider "resend": HTTPS API (works even where SMTP ports are blocked, e.g. new Hetzner accounts)
 *  - provider "smtp":   any SMTP server (Brevo, Gmail app password, Mailgun…)
 */
export interface MailConfig {
  provider: 'none' | 'resend' | 'smtp';
  from: string; // "Feedarte <no-reply@feedarte.com>"
  resendKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

export const MAIL_DEFAULT: MailConfig = { provider: 'none', from: '', resendKey: '', smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '' };

export async function getMailConfig(): Promise<MailConfig> {
  return { ...MAIL_DEFAULT, ...(await getSetting<Partial<MailConfig>>('mail', {})) };
}

export async function mailEnabled() {
  const c = await getMailConfig();
  return c.provider !== 'none' && !!c.from && (c.provider === 'resend' ? !!c.resendKey : !!c.smtpHost);
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(m: Mail, cfg?: MailConfig): Promise<void> {
  const c = cfg ?? (await getMailConfig());
  if (c.provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: c.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Resend: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (c.provider === 'smtp') {
    const t = nodemailer.createTransport({
      host: c.smtpHost,
      port: c.smtpPort,
      secure: c.smtpPort === 465,
      auth: c.smtpUser ? { user: c.smtpUser, pass: c.smtpPass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
    await t.sendMail({ from: c.from, to: m.to, subject: m.subject, html: m.html, text: m.text });
    return;
  }
  throw new Error('Пошта не налаштована');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** Simple branded letter with one call-to-action button. */
export function letter(o: { title: string; lines: string[]; button?: { label: string; url: string }; footer?: string }): { html: string; text: string } {
  const p = o.lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3a44">${l}</p>`).join('');
  const btn = o.button
    ? `<p style="margin:26px 0 10px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#FF6B1A;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${esc(o.button.label)}</a></p>
       <p style="margin:0 0 6px;font-size:12px;color:#8a8a95">Якщо кнопка не працює, відкрийте посилання:<br><a href="${esc(o.button.url)}" style="color:#FF6B1A;word-break:break-all">${esc(o.button.url)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#F2F2F4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F2F4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:22px;padding:32px">
<tr><td>
<div style="font-weight:700;font-size:18px;color:#16161a;margin-bottom:22px"><span style="display:inline-block;width:26px;height:26px;border-radius:8px;background:#FF6B1A;color:#fff;text-align:center;line-height:26px;font-size:15px;margin-right:8px;vertical-align:middle">f</span><span style="vertical-align:middle">Feedarte</span></div>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#16161a">${esc(o.title)}</h1>
${p}${btn}
${o.footer ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #ececf0;font-size:12px;line-height:1.5;color:#8a8a95">${o.footer}</p>` : ''}
</td></tr></table>
<div style="font-size:12px;color:#8a8a95;margin-top:14px"><a href="${esc(env.publicUrl)}" style="color:#8a8a95">${esc(env.publicUrl.replace(/^https?:\/\//, ''))}</a></div>
</td></tr></table></body></html>`;
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»');
  const text = [o.title, '', ...o.lines.map(strip), '', o.button ? `${o.button.label}: ${o.button.url}` : '', o.footer ? `\n${strip(o.footer)}` : ''].join('\n');
  return { html, text };
}

export { esc as escapeHtml };
