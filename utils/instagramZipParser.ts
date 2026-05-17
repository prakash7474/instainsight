import JSZip from 'jszip';

export interface ParsedInsights {
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
}

const FOLLOWERS_FOLLOWING_PREFIX = 'connections/followers_and_following/';

export function extractUsernamesFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const regex = /<a[^>]+href="https?:\/\/(?:www\.)?instagram\.com\/([^"\/?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const username = match[1].trim().toLowerCase().replace(/\/+$/, '');
    if (username && !seen.has(username) && username.length >= 2) {
      seen.add(username);
      result.push(username);
    }
  }
  return result;
}

export function extractHashtagsFromHtml(html: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const regex = /<a[^>]+href="https?:\/\/(?:www\.)?instagram\.com\/explore\/tags\/([^"\/?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1].trim().toLowerCase();
    if (tag && !seen.has(tag) && tag.length >= 1) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

async function findAndParse(
  zip: JSZip,
  paths: string[],
  parser: (html: string) => string[]
): Promise<string[]> {
  for (const path of paths) {
    const file = zip.file(path);
    if (file) {
      const content = await file.async('string');
      return parser(content);
    }
  }
  const allFiles = Object.keys(zip.files);
  for (const path of paths) {
    const base = path.split('/').pop()!;
    const match = allFiles.find(f => f.endsWith(base));
    if (match) {
      const content = await zip.file(match)!.async('string');
      return parser(content);
    }
  }
  return [];
}

export async function parseInstagramZip(zip: JSZip): Promise<ParsedInsights> {
  const p = FOLLOWERS_FOLLOWING_PREFIX;

  const [followers, following, blocked, restricted, closeFriends, recentlyUnfollowed, recentRequests, removedSuggestions, hashtags, pendingRequests] = await Promise.all([
    findAndParse(zip, [
      `${p}followers_1.html`,
      `${p}followers_1.json`,
      `followers_1.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}following.html`,
      `${p}following.json`,
      `following.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}blocked_profiles.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}restricted_profiles.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}close_friends.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}recently_unfollowed_profiles.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}recent_follow_requests.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}removed_suggestions.html`,
    ], extractUsernamesFromHtml),
    findAndParse(zip, [
      `${p}following_hashtags.html`,
    ], extractHashtagsFromHtml),
    findAndParse(zip, [
      `${p}pending_follow_requests.html`,
    ], extractUsernamesFromHtml),
  ]);

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
  };
}

export function computeInsights(followers: string[], following: string[]) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  const notFollowingBack: string[] = [];
  const youDontFollowBack: string[] = [];
  const mutuals: string[] = [];

  for (const u of following) {
    if (followerSet.has(u)) {
      mutuals.push(u);
    } else {
      notFollowingBack.push(u);
    }
  }

  for (const u of followers) {
    if (!followingSet.has(u)) {
      youDontFollowBack.push(u);
    }
  }

  return { notFollowingBack, youDontFollowBack, mutuals };
}
