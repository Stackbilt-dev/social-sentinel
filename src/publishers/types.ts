/**
 * Publisher adapter interface — mirrors PlatformAdapter for outbound operations.
 * Each platform implements this to handle posting, scheduling, and engagement.
 */

export type Platform = 'bluesky' | 'twitter' | 'facebook';

export interface PublishOptions {
  /** Post text content */
  text: string;
  /** Optional image URL to attach */
  imageUrl?: string;
  /** Alt text for image (accessibility) */
  imageAlt?: string;
  /** Optional link URL (for link cards) */
  linkUrl?: string;
  /** Language tags (default: ['en']) */
  langs?: string[];
}

export interface PublishResult {
  /** Platform-specific post URI/ID */
  id: string;
  /** Human-readable URL to the post */
  url: string;
  /** Platform that published */
  platform: Platform;
  /** ISO timestamp of publication */
  publishedAt: string;
}

export interface EngageOptions {
  /** Target post URI/ID */
  targetId: string;
  /** Target post CID (Bluesky-specific, optional for other platforms) */
  targetCid?: string;
  /** Engagement action */
  action: 'like' | 'repost' | 'reply' | 'follow';
  /** Reply text (required if action is 'reply') */
  text?: string;
}

export interface EngageResult {
  /** Platform-specific result URI/ID */
  id: string;
  /** Action performed */
  action: EngageOptions['action'];
}

export interface FeedItem {
  id: string;
  text: string;
  url: string;
  createdAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
}

export interface PublisherCredentials {
  [key: string]: string | undefined;
}

/**
 * Interface that all publisher adapters must implement.
 * Stateless — credentials passed per-call via tenant config.
 */
export interface PublisherAdapter {
  /** Human-readable name */
  name: string;
  /** Platform identifier */
  platform: Platform;

  /** Publish a new post */
  publish(options: PublishOptions, credentials: PublisherCredentials): Promise<PublishResult>;

  /** Delete a post */
  delete(postId: string, credentials: PublisherCredentials): Promise<void>;

  /** Engage with a post (like, repost, reply, follow) */
  engage(options: EngageOptions, credentials: PublisherCredentials): Promise<EngageResult>;

  /** Get recent posts from the authenticated account */
  feed(credentials: PublisherCredentials, limit?: number): Promise<FeedItem[]>;
}

/**
 * Content queue item — stored in D1 for scheduling
 */
export interface QueueItem {
  id: string;
  platform: Platform;
  content: string;
  mediaUrl: string | null;
  mediaAlt: string | null;
  linkUrl: string | null;
  scheduledAt: string;
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  publishedAt: string | null;
  postUrl: string | null;
  postId: string | null;
  error: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}
