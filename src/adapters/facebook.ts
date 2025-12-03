/**
 * Facebook Platform Adapter
 *
 * Fetches page reviews and feed mentions using Facebook Graph API.
 * Requires page access token with appropriate permissions.
 */

import type { PlatformAdapter, SocialMention } from "./types";
import type { TenantConfig } from "../config";

/** Facebook Graph API review/rating object */
interface FacebookReview {
  reviewer: {
    id: string;
    name: string;
  };
  rating?: number;
  review_text?: string;
  created_time: string;
}

/** Facebook Graph API feed post object */
interface FacebookPost {
  id: string;
  message?: string;
  from?: {
    id: string;
    name: string;
  };
  created_time: string;
  permalink_url?: string;
}

/** Facebook Graph API response wrapper */
interface FacebookResponse<T> {
  data?: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
  error?: {
    message: string;
    code: number;
  };
}

export class FacebookAdapter implements PlatformAdapter {
  name = "Facebook";
  platform = "facebook" as const;

  private baseUrl = "https://graph.facebook.com/v18.0";

  async fetch(config: TenantConfig): Promise<SocialMention[]> {
    const fbConfig = config.platforms.facebook;
    if (!fbConfig?.enabled) {
      return [];
    }

    const { pageAccessToken, pageId } = fbConfig;
    const mentions: SocialMention[] = [];

    // Fetch reviews/ratings
    const reviews = await this.fetchReviews(pageId, pageAccessToken);
    mentions.push(...reviews);

    // Fetch feed mentions (posts on page, comments mentioning page)
    const feedMentions = await this.fetchFeedMentions(pageId, pageAccessToken);
    mentions.push(...feedMentions);

    return mentions;
  }

  private async fetchReviews(
    pageId: string,
    accessToken: string
  ): Promise<SocialMention[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "reviewer,rating,review_text,created_time",
    });

    const response = await fetch(`${this.baseUrl}/${pageId}/ratings?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Facebook API error (ratings): ${response.status} ${error}`);
    }

    const data: FacebookResponse<FacebookReview> = await response.json();

    if (data.error) {
      throw new Error(`Facebook API error: ${data.error.code} ${data.error.message}`);
    }

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // Filter to last 15 minutes
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

    return data.data
      .filter((review) => new Date(review.created_time).getTime() > fifteenMinutesAgo)
      .map((review): SocialMention => ({
        id: `review-${review.reviewer.id}-${new Date(review.created_time).getTime()}`,
        platform: "facebook",
        text: review.review_text || `Rating: ${review.rating}/5`,
        author: review.reviewer.name,
        timestamp: new Date(review.created_time).getTime(),
        rating: review.rating,
      }));
  }

  private async fetchFeedMentions(
    pageId: string,
    accessToken: string
  ): Promise<SocialMention[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: "id,message,from,created_time,permalink_url",
      since: Math.floor((Date.now() - 15 * 60 * 1000) / 1000).toString(),
    });

    const response = await fetch(`${this.baseUrl}/${pageId}/feed?${params}`);

    if (!response.ok) {
      const error = await response.text();
      // Feed endpoint might fail without proper permissions - log and continue
      console.warn(`Facebook feed API warning: ${response.status} ${error}`);
      return [];
    }

    const data: FacebookResponse<FacebookPost> = await response.json();

    if (data.error) {
      console.warn(`Facebook feed API warning: ${data.error.code} ${data.error.message}`);
      return [];
    }

    if (!data.data || data.data.length === 0) {
      return [];
    }

    return data.data
      .filter((post) => post.message) // Only posts with text
      .map((post): SocialMention => ({
        id: post.id,
        platform: "facebook",
        text: post.message!,
        author: post.from?.name,
        timestamp: new Date(post.created_time).getTime(),
        url: post.permalink_url,
      }));
  }
}
