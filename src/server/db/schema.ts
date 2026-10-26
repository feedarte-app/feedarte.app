import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  bigserial,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DesignDoc, FeedField, ProductData, Condition } from '../../shared/types';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<'admin' | 'user'>().notNull().default('user'),
  status: text('status').$type<'active' | 'pending' | 'blocked'>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256 of token
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('projects_owner_idx').on(t.ownerId)],
);

export const feeds = pgTable(
  'feeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceUrl: text('source_url').notNull(),
    format: text('format').$type<'rss' | 'atom' | 'yml' | 'generic' | null>(),
    intervalMinutes: integer('interval_minutes').notNull().default(60),
    enabled: boolean('enabled').notNull().default(true),
    status: text('status').$type<'new' | 'queued' | 'syncing' | 'ok' | 'error'>().notNull().default('new'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    productCount: integer('product_count').notNull().default(0),
    fields: jsonb('fields').$type<FeedField[]>().notNull().default([]),
    sourceEtag: text('source_etag'),
    sourceHash: text('source_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('feeds_project_idx').on(t.projectId), index('feeds_next_idx').on(t.nextSyncAt)],
);

export const products = pgTable(
  'products',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    position: integer('position').notNull().default(0),
    title: text('title').notNull().default(''),
    data: jsonb('data').$type<ProductData>().notNull(),
    hash: text('hash').notNull(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_feed_ext_uq').on(t.feedId, t.externalId),
    index('products_feed_pos_idx').on(t.feedId, t.position),
  ],
);

export interface DesignOutputSettings {
  filter: Condition | null; // which products get the custom image
  mode: 'only' | 'all'; // only matching products, or all (non-matching keep original image)
  keepOriginalAsAdditional: boolean;
  imageFormat: 'jpg' | 'png';
  quality: number;
}

export const DEFAULT_OUTPUT: DesignOutputSettings = {
  filter: null,
  mode: 'all',
  keepOriginalAsAdditional: true,
  imageFormat: 'jpg',
  quality: 90,
};

export const designs = pgTable(
  'designs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    formatId: text('format_id').notNull().default('square'),
    draft: jsonb('draft').$type<DesignDoc>().notNull(),
    published: jsonb('published').$type<DesignDoc | null>(),
    version: integer('version').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    output: jsonb('output').$type<DesignOutputSettings>().notNull().default(DEFAULT_OUTPUT),
    publicToken: text('public_token').notNull().unique(),
    thumbnail: text('thumbnail'),
    renderStatus: text('render_status').$type<'idle' | 'queued' | 'rendering' | 'ok' | 'error'>().notNull().default('idle'),
    renderStats: jsonb('render_stats').$type<{
      total: number;
      rendered: number;
      reused: number;
      failed: number;
      failures?: { id: string; title: string; reason: string; url?: string }[];
      included: number;
      ms: number;
      at: string;
    } | null>(),
    renderError: text('render_error'),
    renderProgress: integer('render_progress').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('designs_feed_idx').on(t.feedId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_project_idx').on(t.projectId)],
);

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  formatId: text('format_id').notNull(),
  doc: jsonb('doc').$type<DesignDoc>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').$type<'running' | 'ok' | 'error' | 'unchanged'>().notNull().default('running'),
    stats: jsonb('stats').$type<Record<string, number>>(),
    error: text('error'),
  },
  (t) => [index('sync_runs_feed_idx').on(t.feedId, t.startedAt)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').$type<'queued' | 'running' | 'done' | 'failed'>().notNull().default('queued'),
    dedupeKey: text('dedupe_key'),
    priority: integer('priority').notNull().default(5),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_pick_idx').on(t.status, t.priority, t.runAfter),
    uniqueIndex('jobs_dedupe_queued_uq').on(t.dedupeKey).where(sql`status = 'queued'`),
  ],
);
