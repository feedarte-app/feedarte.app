import path from 'node:path';

function bool(v: string | undefined, d: boolean) {
  if (v == null || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://feed:feed@localhost:5432/feedcraft',
  /** Public base URL used in output feeds and image links, no trailing slash */
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  fontsDir: path.resolve(process.env.FONTS_DIR ?? './assets/fonts'),
  webDir: path.resolve(process.env.WEB_DIR ?? './dist/web'),
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  renderConcurrency: Number(process.env.RENDER_CONCURRENCY ?? 6),
  allowPrivateUrls: bool(process.env.ALLOW_PRIVATE_URLS, false),
  maxFeedBytes: Number(process.env.MAX_FEED_MB ?? 300) * 1024 * 1024,
  secureCookies: bool(process.env.SECURE_COOKIES, process.env.NODE_ENV === 'production'),
  adminEmail: process.env.ADMIN_EMAIL ?? '',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
};
