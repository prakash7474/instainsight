export type MediaType = 'archived' | 'stories' | 'media';

export type MediaImageKind = 'jpg' | 'jpeg' | 'png' | 'webp';

export type MediaImage = {
  uri: string; // web-safe OR native-safe URI
  filename: string;
  createdAt: number; // best-effort timestamp
  type: MediaImageKind;
  category: MediaType;

  // grouping helpers
  year: number;
  month: number; // 1-12
  monthLabel: string;

  // identity (for dedupe + favorites)
  dedupeKey: string;
  sourcePath: string; // path inside zip
  // dimensions if available later
};

export type MediaMonthGroup = {
  year: number;
  month: number; // 1-12
  label: string; // e.g. February 2026
  images: MediaImage[];
};

export type MediaYearGroup = {
  year: number;
  months: MediaMonthGroup[];
};

export type ExtractedMedia = {
  archived: MediaMonthGroup[];
  stories: MediaMonthGroup[];
  media: MediaImage[];
  processedAt: number;
  meta: {
    totalPhotos: number;
    archivedCount: number;
    storiesCount: number;
  };
};

/**
 * New persisted structure for Gallery & Stories.
 * Required by prompt:
 * {
 *   posts: { "2026-02": [ { uri: string } ] },
 *   stories: { "2026-03": [ { uri: string } ] }
 * }
 */
export type MediaStore = {
  // "YYYY-MM" -> [uri, uri]
  posts: Record<string, string[]>;
  stories: Record<string, string[]>;
  processedAt: number;
  meta?: {
    postsCount: number;
    storiesCount: number;
  };
};
