/**
 * Twitter/X Platform Adapter
 *
 * Fetches recent tweets mentioning the brand using Twitter API v2.
 * Uses search/recent endpoint with app-only authentication.
 */

import type { PlatformAdapter, SocialMention } from "./types";
import type { TenantConfig } from "../config";

/** Twitter API v2 tweet object */
interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
}

/** Twitter API v2 user object */
interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

/** Twitter API v2 search response */
interface TwitterSearchResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    result_count: number;
    next_token?: string;
  };
}

export class TwitterAdapter implements PlatformAdapter {
  name = "Twitter/X";
  platform = "twitter" as const;

  private baseUrl = "https://api.twitter.com/2";

  async fetch(config: TenantConfig): Promise<SocialMention[]> {
    const twitterConfig = config.platforms.twitter;
    if (!twitterConfig?.enabled) {
      return [];
    }

    const { bearerToken, searchQuery } = twitterConfig;

    // Fetch tweets from last 15 minutes (cron interval)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const startTime = fifteenMinutesAgo.toISOString();

    const params = new URLSearchParams({
      query: searchQuery,
      "tweet.fields": "created_at,author_id,text",
      "user.fields": "username,name",
      expansions: "author_id",
      start_time: startTime,
      max_results: "100",
    });

    const response = await fetch(`${this.baseUrl}/tweets/search/recent?${params}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twitter API error: ${response.status} ${error}`);
    }

    const data: TwitterSearchResponse = await response.json();

    if (!data.data || data.data.length === 0) {
      return [];
    }

    // Build user lookup map
    const userMap = new Map<string, TwitterUser>();
    if (data.includes?.users) {
      for (const user of data.includes.users) {
        userMap.set(user.id, user);
      }
    }

    // Convert to SocialMention format
    return data.data.map((tweet): SocialMention => {
      const author = tweet.author_id ? userMap.get(tweet.author_id) : undefined;

      return {
        id: tweet.id,
        platform: "twitter",
        text: tweet.text,
        author: author?.name || author?.username,
        timestamp: new Date(tweet.created_at).getTime(),
        url: `https://twitter.com/i/status/${tweet.id}`,
      };
    });
  }
}
