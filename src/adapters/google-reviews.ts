/**
 * Google Reviews Platform Adapter
 *
 * Fetches reviews for a business using Google Places API.
 * Note: The Places API only returns 5 most recent reviews,
 * so deduplication is handled via AiDoctor's eventId system.
 */

import type { PlatformAdapter, SocialMention } from "./types";
import type { TenantConfig } from "../config";

/** Google Places API review object */
interface GoogleReview {
  author_name: string;
  rating: number;
  text: string;
  time: number; // Unix timestamp in seconds
  author_url?: string;
  relative_time_description?: string;
}

/** Google Places API response */
interface GooglePlacesResponse {
  result?: {
    reviews?: GoogleReview[];
    name?: string;
    place_id?: string;
  };
  status: string;
  error_message?: string;
}

export class GoogleReviewsAdapter implements PlatformAdapter {
  name = "Google Reviews";
  platform = "google_reviews" as const;

  private baseUrl = "https://maps.googleapis.com/maps/api/place/details/json";

  async fetch(config: TenantConfig): Promise<SocialMention[]> {
    const googleConfig = config.platforms.googleReviews;
    if (!googleConfig?.enabled) {
      return [];
    }

    const { apiKey, placeId } = googleConfig;

    const params = new URLSearchParams({
      place_id: placeId,
      fields: "reviews,name",
      key: apiKey,
    });

    const response = await fetch(`${this.baseUrl}?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Places API error: ${response.status} ${error}`);
    }

    const data: GooglePlacesResponse = await response.json();

    if (data.status !== "OK") {
      throw new Error(`Google Places API error: ${data.status} ${data.error_message || ""}`);
    }

    if (!data.result?.reviews || data.result.reviews.length === 0) {
      return [];
    }

    // Convert to SocialMention format
    // Note: Google API returns max 5 most recent reviews
    return data.result.reviews.map((review): SocialMention => {
      // Create a deterministic ID from author + time
      // This ensures the same review always has the same ID
      // Use btoa for base64 encoding (available in Workers)
      const authorHash = btoa(review.author_name).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
      const id = `${authorHash}-${review.time}`;

      return {
        id,
        platform: "google_reviews",
        text: review.text,
        author: review.author_name,
        timestamp: review.time * 1000, // Convert to milliseconds
        rating: review.rating,
        url: review.author_url,
        metadata: {
          relativeTime: review.relative_time_description,
          placeName: data.result?.name,
        },
      };
    });
  }
}
