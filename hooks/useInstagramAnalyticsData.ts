import { useEffect, useMemo, useState } from 'react';
import type { ExtractedMedia } from '@/utils/mediaTypes';
import type { MediaStore } from '@/utils/mediaTypes';
import type { ViewerItem } from '@/utils/viewerUtils';
import { buildViewerItems } from '@/utils/viewerUtils';

import type { ExtractedMedia as MediaExtraction } from '@/utils/mediaTypes';
import { getJsonFromStorage } from '@/utils/storageService';

const STORAGE_KEY_DATA = 'instainsight_data';
const STORAGE_KEY_MEDIA = 'instainsight_media';
const STORAGE_KEY_ANALYTICS = 'instainsight_analytics';

import type { Analytics } from '@/utils/instagramAnalyticsUtils';




export type InstagramData = {
  followers: string[];
  following: string[];
  blocked: string[];
  restricted: string[];
  closeFriends: string[];
  recentlyUnfollowed: string[];
  recentRequests: string[];
  removedSuggestions: string[];
  hashtags: string[];
  pendingRequests: string[];
  engagement?: {
    topLikes: { user: string; count: number }[];
    topCombined: { user: string; likedPosts: number; likedComments: number; total: number }[];
    totalLikes: number;
    totalComments: number;
  };
  activity?: {
    loginHistory: number[];
  };
  processedAt: number;
};

export type DashboardStats = {
  totalFollowers: number;
  totalFollowing: number;
  notFollowingBack: number;
  dontFollowBack: number;
  mutuals: number;
  pendingRequests: number;
};

type StoredAnalytics = {
  analytics: Analytics;
  processedAt: number;
};


function safeStringArray(input: unknown): string[] {
  return Array.isArray(input) ? (input.filter((x) => typeof x === 'string') as string[]) : [];
}

function safeNumber(input: unknown, fallback: number): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : fallback;
}

function normalizeStoredInstagramData(input: unknown): InstagramData | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;

  const followers = safeStringArray(obj.followers);
  const following = safeStringArray(obj.following);
  const processedAt = safeNumber(obj.processedAt, NaN);
  if (!Number.isFinite(processedAt)) return null;

  const blocked = safeStringArray(obj.blocked);
  const restricted = safeStringArray(obj.restricted);
  const closeFriends = safeStringArray(obj.closeFriends);
  const recentlyUnfollowed = safeStringArray(obj.recentlyUnfollowed);
  const recentRequests = safeStringArray(obj.recentRequests);
  const removedSuggestions = safeStringArray(obj.removedSuggestions);
  const hashtags = safeStringArray(obj.hashtags);
  const pendingRequests = safeStringArray(obj.pendingRequests);

  const engagementRaw = obj.engagement as any;
  const topLikesRaw = engagementRaw?.topLikes;
  const topLikes = Array.isArray(topLikesRaw)
    ? topLikesRaw
        .map((x: any) => ({
          user: typeof x?.user === 'string' ? x.user : '',
          count: safeNumber(x?.count, 0),
        }))
        .filter((x: any) => x.user)
    : [];

  const topCombinedRaw = engagementRaw?.topCombined;
  const topCombined = Array.isArray(topCombinedRaw)
    ? topCombinedRaw
        .map((x: any) => ({
          user: typeof x?.user === 'string' ? x.user : '',
          likedPosts: safeNumber(x?.likedPosts, 0),
          likedComments: safeNumber(x?.likedComments, 0),
          total: safeNumber(x?.total, 0),
        }))
        .filter((x: any) => x.user)
    : [];

  const engagement = engagementRaw
    ? {
        topLikes,
        topCombined,
        totalLikes: safeNumber(engagementRaw.totalLikes, 0),
        totalComments: safeNumber(engagementRaw.totalComments, 0),
      }
    : undefined;

  const activityRaw = obj.activity as any;
  const loginHistoryRaw = activityRaw?.loginHistory;
  const loginHistory = Array.isArray(loginHistoryRaw)
    ? loginHistoryRaw.map((ts: unknown) => (typeof ts === 'number' && Number.isFinite(ts) ? ts : null)).filter(Boolean)
    : undefined;

  const activity = loginHistory ? { loginHistory: loginHistory as number[] } : undefined;

  return {
    followers,
    following,
    blocked,
    restricted,
    closeFriends,
    recentlyUnfollowed,
    recentRequests,
    removedSuggestions,
    hashtags,
    pendingRequests,
    engagement,
    activity,
    processedAt,
  };
}

function computeStatsSafe(data: InstagramData | null): DashboardStats | null {
  if (!data) return null;
  const followers = Array.isArray(data.followers) ? data.followers : [];
  const following = Array.isArray(data.following) ? data.following : [];
  const pendingRequests = Array.isArray(data.pendingRequests) ? data.pendingRequests : [];

  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  const mutuals = following.filter((u) => followerSet.has(u)).length;
  const notFollowingBack = following.filter((u) => !followerSet.has(u)).length;
  const dontFollowBack = followers.filter((u) => !followingSet.has(u)).length;

  return {
    totalFollowers: followers.length,
    totalFollowing: following.length,
    notFollowingBack,
    dontFollowBack,
    mutuals,
    pendingRequests: pendingRequests.length,
  };
}

function normalizeMediaStore(raw: unknown): MediaStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as any;

  const normalizeBucket = (bucket: any): string[] => {
    if (!Array.isArray(bucket)) return [];
    if (bucket.length === 0) return [];
    if (typeof bucket[0] === 'string') return bucket as string[];

    // array of {uri}
    return (bucket as any[])
      .map((x) => (typeof x?.uri === 'string' ? x.uri : null))
      .filter((x): x is string => !!x);
  };

  const postsIn = obj.posts ?? {};
  const storiesIn = obj.stories ?? {};

  const posts: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(postsIn)) posts[k] = normalizeBucket(v);

  const stories: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(storiesIn)) stories[k] = normalizeBucket(v);

  const processedAt = typeof obj.processedAt === 'number' ? obj.processedAt : Date.now();

  return {
    posts,
    stories,
    processedAt,
    meta: obj?.meta,
  };
}

export function useInstagramAnalyticsData() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [data, setData] = useState<InstagramData | null>(null);
  const [mediaStore, setMediaStore] = useState<MediaStore | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const stored = await getJsonFromStorage<unknown>(STORAGE_KEY_DATA, {
          defaultValue: null,
        });

        const normalized = normalizeStoredInstagramData(stored);
        if (mounted) setData(normalized);

        const storedMedia = await getJsonFromStorage<unknown>(STORAGE_KEY_MEDIA, {
          defaultValue: null,
        });

        const normalizedMedia = normalizeMediaStore(storedMedia);
        if (mounted) setMediaStore(normalizedMedia);
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(e?.message || 'Failed to load stored data.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => computeStatsSafe(data), [data]);

  const galleryViewerItems = useMemo<ViewerItem[]>(() => {
    if (!mediaStore?.posts) return [];
    const uris: string[] = [];
    const posts = mediaStore.posts;
    const monthSortKey = (k: string) => {
      const [y, m] = k.split('-').map((x) => Number(x));
      return (y || 0) * 100 + (m || 0);
    };

    const keys = Object.keys(posts).sort((a, b) => monthSortKey(b) - monthSortKey(a));
    for (const k of keys) uris.push(...(posts[k] ?? []));
    return buildViewerItems(uris);
  }, [mediaStore]);

  const storyViewerItems = useMemo<ViewerItem[]>(() => {
    if (!mediaStore?.stories) return [];
    const uris: string[] = [];
    const stories = mediaStore.stories;
    const monthSortKey = (k: string) => {
      const [y, m] = k.split('-').map((x) => Number(x));
      return (y || 0) * 100 + (m || 0);
    };

    const keys = Object.keys(stories).sort((a, b) => monthSortKey(b) - monthSortKey(a));
    for (const k of keys) uris.push(...(stories[k] ?? []));
    return buildViewerItems(uris);
  }, [mediaStore]);

  return {
    loading,
    errorMsg,
    data,
    stats,
    mediaStore,
    galleryViewerItems,
    storyViewerItems,
  };
}

