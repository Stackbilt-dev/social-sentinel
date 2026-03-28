/**
 * Bluesky Publisher Adapter — AT Protocol client for posting and engagement.
 * Standalone — no external dependencies beyond fetch().
 * Ported from AEGIS bluesky.ts, adapted to PublisherAdapter interface.
 */

import type {
  PublisherAdapter,
  PublisherCredentials,
  PublishOptions,
  PublishResult,
  EngageOptions,
  EngageResult,
  FeedItem,
} from './types';

const BSKY_API = 'https://bsky.social/xrpc';
const BSKY_PUBLIC_API = 'https://public.api.bsky.app/xrpc';
const TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 30_000;

// ─── Session Management ──────────────────────────────────────

interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

// Per-credential session cache (keyed by handle)
const sessionCache = new Map<string, { session: BlueskySession; expiresAt: number }>();

async function createSession(handle: string, appPassword: string): Promise<BlueskySession> {
  const cached = sessionCache.get(handle);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.session;
  }

  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bluesky auth failed: ${res.status} ${err}`);
  }

  const session = await res.json() as BlueskySession;
  sessionCache.set(handle, { session, expiresAt: Date.now() + 90 * 60 * 1000 });
  return session;
}

function getCredentialPair(credentials: PublisherCredentials): { handle: string; appPassword: string } {
  const handle = credentials.handle ?? credentials.BLUESKY_HANDLE;
  const appPassword = credentials.appPassword ?? credentials.BLUESKY_APP_PASSWORD;
  if (!handle || !appPassword) {
    throw new Error('Bluesky credentials require handle and appPassword');
  }
  return { handle, appPassword };
}

// ─── Facets (rich text links) ────────────────────────────────

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; uri?: string }>;
}

function extractLinkFacets(text: string): Facet[] {
  const facets: Facet[] = [];
  const urlRegex = /https?:\/\/[^\s)]+/g;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const encoder = new TextEncoder();
    const byteStart = encoder.encode(text.slice(0, match.index)).length;
    const byteEnd = byteStart + encoder.encode(url).length;

    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }

  return facets;
}

// ─── Image Upload ────────────────────────────────────────────

interface BlobRef {
  $type: 'blob';
  ref: { $link: string };
  mimeType: string;
  size: number;
}

async function uploadImage(session: BlueskySession, imageUrl: string): Promise<BlobRef> {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
  if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);

  const contentType = imgRes.headers.get('content-type') ?? 'image/png';
  const imageData = await imgRes.arrayBuffer();

  const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.accessJwt}`,
      'Content-Type': contentType,
    },
    body: imageData,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Bluesky blob upload failed: ${uploadRes.status} ${err}`);
  }

  const result = await uploadRes.json() as { blob: BlobRef };
  return result.blob;
}

// ─── Adapter Implementation ──────────────────────────────────

export class BlueskyPublisher implements PublisherAdapter {
  name = 'Bluesky';
  platform = 'bluesky' as const;

  async publish(options: PublishOptions, credentials: PublisherCredentials): Promise<PublishResult> {
    const { handle, appPassword } = getCredentialPair(credentials);
    const session = await createSession(handle, appPassword);

    // Bluesky limit: 300 graphemes
    const text = options.text.length > 300
      ? options.text.slice(0, 297) + '...'
      : options.text;

    const facets = extractLinkFacets(text);

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text,
      langs: options.langs ?? ['en'],
      createdAt: new Date().toISOString(),
    };

    if (facets.length > 0) {
      record.facets = facets;
    }

    // Upload and embed image if provided
    if (options.imageUrl) {
      try {
        const blob = await uploadImage(session, options.imageUrl);
        record.embed = {
          $type: 'app.bsky.embed.images',
          images: [{
            alt: options.imageAlt ?? '',
            image: blob,
          }],
        };
      } catch (err) {
        console.warn('[bluesky] Image upload failed (posting without image):', err instanceof Error ? err.message : String(err));
      }
    }

    const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bluesky post failed: ${res.status} ${err}`);
    }

    const result = await res.json() as { uri: string; cid: string };
    const rkey = result.uri.split('/').pop() ?? '';
    const url = `https://bsky.app/profile/${session.handle}/post/${rkey}`;

    return {
      id: result.uri,
      url,
      platform: 'bluesky',
      publishedAt: new Date().toISOString(),
    };
  }

  async delete(postId: string, credentials: PublisherCredentials): Promise<void> {
    const { handle, appPassword } = getCredentialPair(credentials);
    const session = await createSession(handle, appPassword);
    const rkey = postId.split('/').pop() ?? '';

    const res = await fetch(`${BSKY_API}/com.atproto.repo.deleteRecord`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        rkey,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bluesky delete failed: ${res.status} ${err}`);
    }
  }

  async engage(options: EngageOptions, credentials: PublisherCredentials): Promise<EngageResult> {
    const { handle, appPassword } = getCredentialPair(credentials);
    const session = await createSession(handle, appPassword);

    let collection: string;
    let record: Record<string, unknown>;

    switch (options.action) {
      case 'like':
        collection = 'app.bsky.feed.like';
        record = {
          $type: collection,
          subject: { uri: options.targetId, cid: options.targetCid },
          createdAt: new Date().toISOString(),
        };
        break;

      case 'repost':
        collection = 'app.bsky.feed.repost';
        record = {
          $type: collection,
          subject: { uri: options.targetId, cid: options.targetCid },
          createdAt: new Date().toISOString(),
        };
        break;

      case 'follow':
        collection = 'app.bsky.graph.follow';
        record = {
          $type: collection,
          subject: options.targetId, // DID for follows
          createdAt: new Date().toISOString(),
        };
        break;

      case 'reply':
        if (!options.text) throw new Error('Reply text is required');
        collection = 'app.bsky.feed.post';
        record = {
          $type: collection,
          text: options.text,
          reply: {
            root: { uri: options.targetId, cid: options.targetCid },
            parent: { uri: options.targetId, cid: options.targetCid },
          },
          langs: ['en'],
          createdAt: new Date().toISOString(),
        };
        break;
    }

    const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection,
        record,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bluesky ${options.action} failed: ${res.status} ${err}`);
    }

    const result = await res.json() as { uri: string };
    return { id: result.uri, action: options.action };
  }

  async feed(credentials: PublisherCredentials, limit = 20): Promise<FeedItem[]> {
    const { handle } = getCredentialPair(credentials);
    const clampedLimit = Math.min(limit, 100);

    const res = await fetch(
      `${BSKY_PUBLIC_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${clampedLimit}&filter=posts_no_replies`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bluesky feed fetch failed: ${res.status} ${err}`);
    }

    const data = await res.json() as { feed: Array<{ post: Record<string, unknown> }> };

    return data.feed.map((item) => {
      const p = item.post;
      const rec = p.record as Record<string, unknown>;
      const author = p.author as Record<string, unknown>;
      const authorHandle = (author.handle as string) ?? handle;
      const rkey = (p.uri as string).split('/').pop() ?? '';

      return {
        id: p.uri as string,
        text: (rec.text as string) ?? '',
        url: `https://bsky.app/profile/${authorHandle}/post/${rkey}`,
        createdAt: (rec.createdAt as string) ?? '',
        likeCount: (p.likeCount as number) ?? 0,
        repostCount: (p.repostCount as number) ?? 0,
        replyCount: (p.replyCount as number) ?? 0,
      };
    });
  }
}
