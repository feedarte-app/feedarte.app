import { assertPublicUrl } from '../../src/server/net';
for (const u of ['http://localhost:4000/feed.xml', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/x', 'http://[::1]/', 'file:///etc/passwd', 'https://usmall.com.ua/feed']) {
  try { await assertPublicUrl(u); console.log('ALLOWED ', u); } catch (e) { console.log('blocked ', u, '-', (e as Error).message); }
}
