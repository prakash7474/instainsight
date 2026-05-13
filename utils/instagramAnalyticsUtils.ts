/* =========================================================
   INSTAGRAM ANALYTICS ENGINE
========================================================= */

export type User = {
  username: string;
  profileUrl?: string;
  timestamp?: string;
};

export type AnalyticsSection = {
  count: number;
  users: User[];
};

export type Analytics = {
  followers: AnalyticsSection;
  following: AnalyticsSection;
  mutuals: AnalyticsSection;
  notFollowingBack: AnalyticsSection;
  fans: AnalyticsSection;
  pending: AnalyticsSection;
  blocked: AnalyticsSection;
  restricted: AnalyticsSection;
  closeFriends: AnalyticsSection;
  recentlyUnfollowed: AnalyticsSection;
  removedSuggestions: AnalyticsSection;
  recentFollowRequests: AnalyticsSection;
  hashtags: {
    count: number;
    hashtags: string[];
  };
};

/* =========================================================
   NORMALIZE USERNAME (UNIVERSAL)
========================================================= */

export const normalize = (value: string) =>
  value
    ?.trim()
    ?.toLowerCase()
    ?.replace('@', '') || '';

/* =========================================================
   REMOVE DUPLICATES (UNIVERSAL)
========================================================= */

export const uniqueUsers = (users: User[]): User[] => {
  const map = new Map<string, User>();

  users.forEach((user) => {
    const key = normalize(user.username);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        ...user,
        username: key,
      });
    }
  });

  return Array.from(map.values());
};

const uniqueHashtags = (hashtags: string[]) => {
  const map = new Map<string, string>();
  hashtags.forEach((h) => {
    const key = normalize(h).replace('#', '');
    if (!key) return;
    if (!map.has(key)) map.set(key, key);
  });
  return Array.from(map.values());
};

/* =========================================================
   SET OPERATIONS (OPTIMIZED)
========================================================= */

const createSet = (users: User[]) =>
  new Set(users.map((u) => normalize(u.username)).filter(Boolean));

const intersectionUsers = (a: User[], b: User[]): User[] => {
  const aSet = createSet(a);
  const out: User[] = [];
  const seen = new Set<string>();
  for (const u of b) {
    const key = normalize(u.username);
    if (!key) continue;
    if (seen.has(key)) continue;
    if (aSet.has(key)) {
      seen.add(key);
      out.push({ ...u, username: key });
    }
  }
  return out;
};

const differenceUsers = (a: User[], b: User[]): User[] => {
  const bSet = createSet(b);
  const out: User[] = [];
  const seen = new Set<string>();
  for (const u of a) {
    const key = normalize(u.username);
    if (!key) continue;
    if (seen.has(key)) continue;
    if (!bSet.has(key)) {
      seen.add(key);
      out.push({ ...u, username: key });
    }
  }
  return out;
};

/* =========================================================
   GENERIC HTML PARSER
========================================================= */

const normalizeMaybeAt = (value: string) => normalize(value).replace('@', '');

const looksLikeTimestamp = (text: string) => {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes('202') ||
    t.includes('am') ||
    t.includes('pm') ||
    t.includes('apr') ||
    t.includes('may') ||
    t.includes('jun')
  );
};

const safeText = (node: Element | null | undefined): string => {
  if (!node) return '';
  return (node.textContent || '').trim();
};

const extractUsernameFromAnchor = (a: HTMLAnchorElement): string => {
  const hrefPart = (a.getAttribute('href') || '')
    .split('/')
    .filter(Boolean)
    .pop();
  const byHref = hrefPart || '';
  const byText = safeText(a);
  return byText || byHref;
};

const safeHrefToProfile = (href: string): string | undefined => {
  if (!href) return undefined;
  try {
    if (href.startsWith('/')) {
      return `https://www.instagram.com${href}`;
    }
    return href;
  } catch {
    return undefined;
  }
};

export const parseInstagramHtmlUsers = (html: string): User[] => {
  if (typeof html !== 'string' || !html) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Prefer Instagram list blocks.
    const blocks: Element[] = Array.from(doc.querySelectorAll('div.pam'));
    const effectiveBlocks = blocks.length
      ? blocks
      : Array.from(doc.querySelectorAll('a[href*="instagram.com/"]'));

    const found: User[] = [];

    for (const block of effectiveBlocks) {
      // In fallback mode, `block` may itself be an <a>
      const anchor =
        (block.tagName?.toLowerCase?.() === 'a'
          ? block
          : block.querySelector('a')) as HTMLAnchorElement | null;

      if (!anchor) continue;

      const href = anchor.getAttribute('href') || '';
      const profileUrl = safeHrefToProfile(href);

      const usernameRaw = extractUsernameFromAnchor(anchor);
      const usernameNorm = normalizeMaybeAt(usernameRaw);
      if (!usernameNorm || usernameNorm.length < 2) continue;

      // Best-effort timestamp extraction
      let timestamp: string | undefined;
      const divs: Element[] = Array.from(block.querySelectorAll('div'));
      for (const div of divs) {
        const t = (div.textContent || '').trim();
        if (!t) continue;
        if (looksLikeTimestamp(t)) {
          timestamp = t;
          break;
        }
      }

      found.push({ username: usernameNorm, profileUrl, timestamp });
    }

    return uniqueUsers(found);
  } catch {
    return [];
  }
};

export const parsePendingFollowRequestsHtml = (html: string): User[] => {
  const pending = parseInstagramHtmlUsers(html);
  return [...pending].sort((a, b) => {
    const ta = a.timestamp ? Date.parse(a.timestamp) : NaN;
    const tb = b.timestamp ? Date.parse(b.timestamp) : NaN;
    if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
    if (!Number.isFinite(ta)) return 1;
    if (!Number.isFinite(tb)) return -1;
    return tb - ta;
  });
};

/* =========================================================
   SECTION HELPERS
========================================================= */

export const createSection = (users: User[]): AnalyticsSection => {
  const unique = uniqueUsers(users);
  return {
    count: unique.length,
    users: unique,
  };
};

/* =========================================================
   CATEGORY CALCULATIONS
========================================================= */

export const getMutuals = (followers: User[], following: User[]) =>
  createSection(intersectionUsers(followers, following));

export const getNotFollowingBack = (followers: User[], following: User[]) =>
  createSection(differenceUsers(following, followers));

export const getFans = (followers: User[], following: User[]) =>
  createSection(differenceUsers(followers, following));

export const validateAnalytics = (analytics: Pick<Analytics, 'followers' | 'following' | 'mutuals' | 'notFollowingBack' | 'fans'>) => {
  const followers = analytics.followers.count;
  const following = analytics.following.count;
  const mutuals = analytics.mutuals.count;
  const notFollowingBack = analytics.notFollowingBack.count;
  const fans = analytics.fans.count;

  const followingValid = mutuals + notFollowingBack === following;
  const followersValid = mutuals + fans === followers;

  return {
    followingValid,
    followersValid,
    valid: followingValid && followersValid,
  };
};

/* =========================================================
   MAIN ANALYTICS ENGINE
========================================================= */

export const buildAnalytics = (params: {
  followers: User[];
  following: User[];
  pending?: User[];
  blocked?: User[];
  restricted?: User[];
  closeFriends?: User[];
  recentlyUnfollowed?: User[];
  removedSuggestions?: User[];
  recentFollowRequests?: User[];
  hashtags?: string[];
}): Analytics => {
  const followersUnique = uniqueUsers(params.followers || []);
  const followingUnique = uniqueUsers(params.following || []);

  const followers = createSection(followersUnique);
  const following = createSection(followingUnique);

  const mutuals = getMutuals(followersUnique, followingUnique);
  const notFollowingBack = getNotFollowingBack(followersUnique, followingUnique);
  const fans = getFans(followersUnique, followingUnique);

  const validation = validateAnalytics({
    followers,
    following,
    mutuals,
    notFollowingBack,
    fans,
  });

  if (!validation.valid) {
    console.error('Analytics Validation Failed', validation);
    // Prevent invalid UI rendering: return empty relationship sections.
    return {
      followers: { count: 0, users: [] },
      following: { count: 0, users: [] },
      mutuals: { count: 0, users: [] },
      notFollowingBack: { count: 0, users: [] },
      fans: { count: 0, users: [] },
      pending: createSection(params.pending || []),
      blocked: createSection(params.blocked || []),
      restricted: createSection(params.restricted || []),
      closeFriends: createSection(params.closeFriends || []),
      recentlyUnfollowed: createSection(params.recentlyUnfollowed || []),
      removedSuggestions: createSection(params.removedSuggestions || []),
      recentFollowRequests: createSection(params.recentFollowRequests || []),
      hashtags: {
        count: (params.hashtags || []).length,
        hashtags: uniqueHashtags(params.hashtags || []),
      },
    };
  }

  return {
    followers,
    following,
    mutuals,
    notFollowingBack,
    fans,

    pending: createSection(params.pending || []),
    blocked: createSection(params.blocked || []),
    restricted: createSection(params.restricted || []),
    closeFriends: createSection(params.closeFriends || []),

    recentlyUnfollowed: createSection(params.recentlyUnfollowed || []),
    removedSuggestions: createSection(params.removedSuggestions || []),
    recentFollowRequests: createSection(params.recentFollowRequests || []),

    hashtags: {
      count: uniqueHashtags(params.hashtags || []).length,
      hashtags: uniqueHashtags(params.hashtags || []),
    },
  };
};

