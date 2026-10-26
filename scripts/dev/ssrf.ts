import { assertPublicUrl, isPrivateIp } from '../../src/server/net';
for (const u of ['http://localhost:4000/feed.xml', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/x', 'http://[::1]/', 'http://[::ffff:127.0.0.1]:5432/', 'http://[::ffff:a9fe:a9fe]/latest', 'http://[64:ff9b::a9fe:a9fe]/', 'http://[::]/', 'http://0.0.0.0/', 'file:///etc/passwd', 'http://[2a01:4f8::1]/', 'http://8.8.8.8/']) {
  try { await assertPublicUrl(u); console.log('ALLOWED ', u); } catch (e) { console.log('blocked ', u, '-', (e as Error).message); }
}
console.log('fd00::1', isPrivateIp('fd00::1'), '2001:4860::8888', isPrivateIp('2001:4860::8888'));
