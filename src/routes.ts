/**
 * HTTP routes for the Social Sentinel publishing hub.
 * All publishing endpoints require Bearer token auth (TRIGGER_API_KEY).
 */

import type { Env } from './env';
import { BlueskyPublisher } from './publishers/bluesky';
import type { PublisherAdapter, Platform, QueueItem } from './publishers/types';
import { loadPublisherCredentials } from './config';

// ─── Publisher Registry ──────────────────────────────────────

const publishers: Record<string, PublisherAdapter> = {
  bluesky: new BlueskyPublisher(),
};

function getPublisher(platform: string): PublisherAdapter {
  const pub = publishers[platform];
  if (!pub) throw new Error(`Unsupported platform: ${platform}. Available: ${Object.keys(publishers).join(', ')}`);
  return pub;
}

// ─── Auth Middleware ─────────────────────────────────────────

function requireAuth(request: Request, env: Env): Response | null {
  if (!env.TRIGGER_API_KEY) {
    return jsonResponse({ error: 'Publishing is disabled — set TRIGGER_API_KEY' }, 403);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.TRIGGER_API_KEY}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  return null; // Auth passed
}

// ─── Route Handler ───────────────────────────────────────────

export async function handlePublishRoutes(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  // POST /publish — immediate publish
  if (url.pathname === '/publish' && request.method === 'POST') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    return handlePublish(request, env);
  }

  // POST /schedule — schedule a post for later
  if (url.pathname === '/schedule' && request.method === 'POST') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    return handleSchedule(request, env);
  }

  // GET /drafts — list drafts and scheduled posts
  if (url.pathname === '/drafts' && request.method === 'GET') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    return handleListDrafts(request, env);
  }

  // DELETE /drafts/:id — cancel a draft/scheduled post
  if (url.pathname.startsWith('/drafts/') && request.method === 'DELETE') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    const id = url.pathname.split('/')[2];
    return handleDeleteDraft(id, env);
  }

  // GET /history — publish history
  if (url.pathname === '/history' && request.method === 'GET') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    return handleHistory(request, env);
  }

  // POST /engage — like, repost, reply, follow
  if (url.pathname === '/engage' && request.method === 'POST') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    return handleEngage(request, env);
  }

  // GET /feed/:platform — get recent posts
  if (url.pathname.startsWith('/feed/') && request.method === 'GET') {
    const authErr = requireAuth(request, env);
    if (authErr) return authErr;
    const platform = url.pathname.split('/')[2];
    return handleFeed(platform, request, env);
  }

  return null; // Not a publishing route
}

// ─── POST /publish ───────────────────────────────────────────

async function handlePublish(request: Request, env: Env): Promise<Response> {
  let body: {
    platform: string;
    text: string;
    tenant_id?: string;
    image_url?: string;
    image_alt?: string;
    link_url?: string;
    langs?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body.platform || !body.text) {
    return jsonResponse({ error: 'platform and text are required' }, 400);
  }

  const tenantId = body.tenant_id ?? 'default';
  const publisher = getPublisher(body.platform);
  const credentials = await loadPublisherCredentials(env.TENANT_CONFIG, tenantId, body.platform as Platform);

  const start = Date.now();

  try {
    const result = await publisher.publish({
      text: body.text,
      imageUrl: body.image_url,
      imageAlt: body.image_alt,
      linkUrl: body.link_url,
      langs: body.langs,
    }, credentials);

    const durationMs = Date.now() - start;

    // Record in content_queue as published
    const queueId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO content_queue (id, tenant_id, platform, content, media_url, media_alt, link_url, scheduled_at, status, published_at, post_url, post_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), 'published', datetime('now'), ?, ?)
      `).bind(queueId, tenantId, body.platform, body.text, body.image_url ?? null, body.image_alt ?? null, body.link_url ?? null, result.url, result.id),

      env.DB.prepare(`
        INSERT INTO publish_history (id, queue_id, tenant_id, platform, content, post_url, post_id, action, status, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'publish', 'success', ?)
      `).bind(crypto.randomUUID(), queueId, tenantId, body.platform, body.text, result.url, result.id, durationMs),
    ]);

    return jsonResponse({ ...result, queue_id: queueId });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);

    // Record failure
    await env.DB.prepare(`
      INSERT INTO publish_history (id, tenant_id, platform, content, action, status, error, duration_ms)
      VALUES (?, ?, ?, ?, 'publish', 'failed', ?, ?)
    `).bind(crypto.randomUUID(), tenantId, body.platform, body.text, msg, durationMs).run();

    return jsonResponse({ error: msg }, 500);
  }
}

// ─── POST /schedule ──────────────────────────────────────────

async function handleSchedule(request: Request, env: Env): Promise<Response> {
  let body: {
    platform: string;
    text: string;
    scheduled_at: string;
    tenant_id?: string;
    image_url?: string;
    image_alt?: string;
    link_url?: string;
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body.platform || !body.text || !body.scheduled_at) {
    return jsonResponse({ error: 'platform, text, and scheduled_at are required' }, 400);
  }

  // Validate scheduled_at is a valid ISO date in the future
  const scheduledTime = new Date(body.scheduled_at);
  if (isNaN(scheduledTime.getTime())) {
    return jsonResponse({ error: 'scheduled_at must be a valid ISO date' }, 400);
  }

  const tenantId = body.tenant_id ?? 'default';
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO content_queue (id, tenant_id, platform, content, media_url, media_alt, link_url, scheduled_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
  `).bind(id, tenantId, body.platform, body.text, body.image_url ?? null, body.image_alt ?? null, body.link_url ?? null, body.scheduled_at).run();

  return jsonResponse({
    id,
    status: 'scheduled',
    platform: body.platform,
    scheduled_at: body.scheduled_at,
  }, 201);
}

// ─── GET /drafts ─────────────────────────────────────────────

async function handleListDrafts(_request: Request, env: Env): Promise<Response> {
  const items = await env.DB.prepare(`
    SELECT id, tenant_id, platform, content, media_url, scheduled_at, status, post_url, error, created_at
    FROM content_queue
    WHERE status IN ('draft', 'scheduled', 'failed')
    ORDER BY COALESCE(scheduled_at, created_at) ASC
    LIMIT 100
  `).all<{
    id: string; tenant_id: string; platform: string; content: string;
    media_url: string | null; scheduled_at: string | null; status: string;
    post_url: string | null; error: string | null; created_at: string;
  }>();

  return jsonResponse({ items: items.results, count: items.results.length });
}

// ─── DELETE /drafts/:id ──────────────────────────────────────

async function handleDeleteDraft(id: string, env: Env): Promise<Response> {
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  const existing = await env.DB.prepare(
    `SELECT status FROM content_queue WHERE id = ?`
  ).bind(id).first<{ status: string }>();

  if (!existing) return jsonResponse({ error: 'Not found' }, 404);

  if (existing.status === 'published') {
    return jsonResponse({ error: 'Cannot delete a published post from the queue — use DELETE on the platform directly' }, 400);
  }

  await env.DB.prepare(
    `UPDATE content_queue SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run();

  return jsonResponse({ id, status: 'cancelled' });
}

// ─── GET /history ────────────────────────────────────────────

async function handleHistory(_request: Request, env: Env): Promise<Response> {
  const items = await env.DB.prepare(`
    SELECT id, queue_id, tenant_id, platform, content, post_url, action, status, error, duration_ms, created_at
    FROM publish_history
    ORDER BY created_at DESC
    LIMIT 50
  `).all();

  return jsonResponse({ items: items.results, count: items.results.length });
}

// ─── POST /engage ────────────────────────────────────────────

async function handleEngage(request: Request, env: Env): Promise<Response> {
  let body: {
    platform: string;
    action: string;
    target_id: string;
    target_cid?: string;
    text?: string;
    tenant_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body.platform || !body.action || !body.target_id) {
    return jsonResponse({ error: 'platform, action, and target_id are required' }, 400);
  }

  const validActions = ['like', 'repost', 'reply', 'follow'];
  if (!validActions.includes(body.action)) {
    return jsonResponse({ error: `action must be one of: ${validActions.join(', ')}` }, 400);
  }

  const tenantId = body.tenant_id ?? 'default';
  const publisher = getPublisher(body.platform);
  const credentials = await loadPublisherCredentials(env.TENANT_CONFIG, tenantId, body.platform as Platform);

  try {
    const result = await publisher.engage({
      targetId: body.target_id,
      targetCid: body.target_cid,
      action: body.action as 'like' | 'repost' | 'reply' | 'follow',
      text: body.text,
    }, credentials);

    // Record engagement
    await env.DB.prepare(`
      INSERT INTO engagement_log (id, tenant_id, platform, action, target_id, result_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), tenantId, body.platform, body.action, body.target_id, result.id).run();

    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
}

// ─── GET /feed/:platform ─────────────────────────────────────

async function handleFeed(platform: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenant_id') ?? 'default';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);

  const publisher = getPublisher(platform);
  const credentials = await loadPublisherCredentials(env.TENANT_CONFIG, tenantId, platform as Platform);

  try {
    const items = await publisher.feed(credentials, limit);
    return jsonResponse({ items, count: items.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, 500);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
