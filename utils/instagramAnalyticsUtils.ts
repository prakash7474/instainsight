/* =========================================================
   INSTAGRAM ANALYTICS ENGINE (FIXED)
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
   NORMALIZE
========================================================= */

export const normalize = (value: string) =>
  value?.trim()?.toLowerCase()?.replace(/^@/, '') || '';

/* =========================================================
   UNIQUE USERS
========================================================= */

export const uniqueUsers = (users: User[]): User[] => {
  const map = new Map<string, User>();

  for (const user of users) {
    const key = normalize(user.username);

    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        ...user,
        username: key,
      });
    }
  }

  return Array.from(map.values());
};

const uniqueHashtags = (hashtags: string[]) => {
  const map = new Map<string, string>();

  hashtags.forEach((tag) => {
    const key = normalize(tag).replace('#', '');

    if (!key) return;

    if (!map.has(key)) {
      map.set(key, key);
    }
  });

  return Array.from(map.values());
};

/* =========================================================
   SET HELPERS
========================================================= */

const createSet = (users: User[]) =>
  new Set(users.map((u) => normalize(u.username)).filter(Boolean));

const intersectionUsers = (a: User[], b: User[]): User[] => {
  const aSet = createSet(a);

  const out: User[] = [];
  const seen = new Set<string>();

  for (const user of b) {
    const key = normalize(user.username);

    if (!key) continue;
    if (seen.has(key)) continue;

    if (aSet.has(key)) {
      seen.add(key);

      out.push({
        ...user,
        username: key,
      });
    }
  }

  return out;
};

const differenceUsers = (a: User[], b: User[]): User[] => {
  const bSet = createSet(b);

  const out: User[] = [];
  const seen = new Set<string>();

  for (const user of a) {
    const key = normalize(user.username);

    if (!key) continue;
    if (seen.has(key)) continue;

    if (!bSet.has(key)) {
      seen.add(key);

      out.push({
        ...user,
        username: key,
      });
    }
  }

  return out;
};

/* =========================================================
   INSTAGRAM USERNAME EXTRACTION (FIXED)
========================================================= */

const extractInstagramUsername = (href: string): string => {
  if (!href) return '';

  try {
    const cleanHref = href.trim();

    const match = cleanHref.match(
      /instagram\.com\/([a-zA-Z0-9._]+)\/?/i
    );

    if (!match?.[1]) return '';

    const username = normalize(match[1]);

    // Ignore non-profile routes
    const invalidRoutes = new Set([
      'p',
      'reel',
      'stories',
      'explore',
      'accounts',
      'tv',
      'direct',
    ]);

    if (invalidRoutes.has(username)) {
      return '';
    }

    return username;
  } catch {
    return '';
  }
};

/* =========================================================
   TIMESTAMP DETECTION (FIXED)
========================================================= */

const looksLikeTimestamp = (text: string) => {
  const t = text.trim().toLowerCase();

  return (
    /\b(20\d{2})\b/.test(t) ||
    /\b(am|pm)\b/.test(t) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(t)
  );
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

/* =========================================================
   USERNAME EXTRACTION FROM HTML
========================================================= */

export const extractUsernamesFromInstagramHtml = (
  html: string
): string[] => {
  const usernamesSet = new Set<string>();

  if (typeof html !== 'string' || !html) {
    return [];
  }

  // Match all <a href="..."> links
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;

  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];

    if (!href.includes('instagram.com/')) continue;

    // Normalize → remove trailing slash
    const cleaned = href.replace(/\/+$/, '');

    const username = cleaned.split('/').pop() || '';

    if (!username) continue;

    // Keep behavior consistent with the rest of the engine
    usernamesSet.add(normalize(username));
  }

  return Array.from(usernamesSet).filter(Boolean);
};

/* =========================================================
   GENERIC INSTAGRAM HTML PARSER (FIXED)
========================================================= */

export const parseInstagramHtmlUsers = (
  html: string
): User[] => {
  if (typeof html !== 'string' || !html) {
    return [];
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const blocks = Array.from(
      doc.querySelectorAll('div.pam')
    );

    const effectiveBlocks =
      blocks.length > 0
        ? blocks
        : Array.from(
            doc.querySelectorAll(
              'a[href*="instagram.com/"]'
            )
          ).map((a) => a.parentElement || a);

    const found: User[] = [];

    for (const block of effectiveBlocks) {
      const anchor = block.querySelector(
        'a[href*="instagram.com/"]'
      ) as HTMLAnchorElement | null;

      if (!anchor) continue;

      const href = anchor.getAttribute('href') || '';

      const username = extractInstagramUsername(href);

      if (!username || username.length < 2) {
        continue;
      }

      const profileUrl = safeHrefToProfile(href);

      // Extract timestamp
      let timestamp: string | undefined;

      const divs = Array.from(
        block.querySelectorAll('div')
      );

      for (const div of divs) {
        const text = (div.textContent || '').trim();

        if (!text) continue;

        if (looksLikeTimestamp(text)) {
          timestamp = text;
          break;
        }
      }

      found.push({
        username,
        profileUrl,
        timestamp,
      });
    }

    return uniqueUsers(found);
  } catch {
    return [];
  }
};

/* =========================================================
   PENDING FOLLOW REQUESTS PARSER
========================================================= */

export const parsePendingFollowRequestsHtml = (
  html: string
): User[] => {
  const pending = parseInstagramHtmlUsers(html);

  return [...pending].sort((a, b) => {
    const ta = a.timestamp
      ? Date.parse(a.timestamp)
      : NaN;

    const tb = b.timestamp
      ? Date.parse(b.timestamp)
      : NaN;

    if (!Number.isFinite(ta) && !Number.isFinite(tb)) {
      return 0;
    }

    if (!Number.isFinite(ta)) {
      return 1;
    }

    if (!Number.isFinite(tb)) {
      return -1;
    }

    return tb - ta;
  });
};

/* =========================================================
   SECTION HELPERS
========================================================= */

export const createSection = (
  users: User[]
): AnalyticsSection => {
  const unique = uniqueUsers(users);

  return {
    count: unique.length,
    users: unique,
  };
};

/* =========================================================
   CATEGORY CALCULATIONS
========================================================= */

export const getMutuals = (
  followers: User[],
  following: User[]
) =>
  createSection(
    intersectionUsers(followers, following)
  );

export const getNotFollowingBack = (
  followers: User[],
  following: User[]
) =>
  createSection(
    differenceUsers(following, followers)
  );

export const getFans = (
  followers: User[],
  following: User[]
) =>
  createSection(
    differenceUsers(followers, following)
  );

/* =========================================================
   VALIDATION
========================================================= */

export const validateAnalytics = (
  analytics: Pick<
    Analytics,
    | 'followers'
    | 'following'
    | 'mutuals'
    | 'notFollowingBack'
    | 'fans'
  >
) => {
  const followers = analytics.followers.count;
  const following = analytics.following.count;
  const mutuals = analytics.mutuals.count;
  const notFollowingBack =
    analytics.notFollowingBack.count;
  const fans = analytics.fans.count;

  const followingValid =
    mutuals + notFollowingBack === following;

  const followersValid =
    mutuals + fans === followers;

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
  const followersUnique = uniqueUsers(
    params.followers || []
  );

  const followingUnique = uniqueUsers(
    params.following || []
  );

  const followers = createSection(
    followersUnique
  );

  const following = createSection(
    followingUnique
  );

  const mutuals = getMutuals(
    followersUnique,
    followingUnique
  );

  const notFollowingBack =
    getNotFollowingBack(
      followersUnique,
      followingUnique
    );

  const fans = getFans(
    followersUnique,
    followingUnique
  );

  const validation = validateAnalytics({
    followers,
    following,
    mutuals,
    notFollowingBack,
    fans,
  });

  if (!validation.valid) {
    console.error(
      'Analytics Validation Failed',
      validation
    );
  }

  return {
    followers,
    following,
    mutuals,
    notFollowingBack,
    fans,

    pending: createSection(
      params.pending || []
    ),

    blocked: createSection(
      params.blocked || []
    ),

    restricted: createSection(
      params.restricted || []
    ),

    closeFriends: createSection(
      params.closeFriends || []
    ),

    recentlyUnfollowed: createSection(
      params.recentlyUnfollowed || []
    ),

    removedSuggestions: createSection(
      params.removedSuggestions || []
    ),

    recentFollowRequests: createSection(
      params.recentFollowRequests || []
    ),

    hashtags: {
      count: uniqueHashtags(
        params.hashtags || []
      ).length,

      hashtags: uniqueHashtags(
        params.hashtags || []
      ),
    },
  };
};