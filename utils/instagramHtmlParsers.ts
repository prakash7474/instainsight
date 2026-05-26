export type ParsedLikedPosts = {
  total: number;
  topUsers: { user: string; count: number }[];
  monthly: Record<string, number>;
};

export type ParsedLikedComments = {
  total: number;
  topUsers: { user: string; count: number }[];
};

export type ParsedComments = {
  total: number;
  topTargets: { user: string; count: number }[];
  monthly: Record<string, number>;
};

export type LoginEntryParsed = {
  time: string;
  device: string;
  monthKey: string | null;
  ip: string;
  userAgent: string;
};

export type ParsedLoginActivity = {
  total: number;
  logins: LoginEntryParsed[];
  deviceCounts: Record<string, number>;
  monthly: Record<string, number>;
};

export type ParsedPolls = {
  total: number;
  monthly: Record<string, number>;
};

export type ParsedQuestions = {
  total: number;
  monthly: Record<string, number>;
};

export type TimelineEntry = {
  month: string;
  label: string;
  postComments: number;
  reelComments: number;
  polls: number;
  questions: number;
  logins: number;
};

export type ActivitySources = {
  postComments?: { monthly?: Record<string, number> };
  reelComments?: { monthly?: Record<string, number> };
  polls?: { monthly?: Record<string, number> };
  questions?: { monthly?: Record<string, number> };
  logins?: { monthly?: Record<string, number> };
};

const FIELD_BLACKLIST = new Set([
  'Name','URL','Caption','Owner','Username','Hashtags','',
  'Instagram','Followers','Following','Date','Type',
]);

function extractField(text: string, key: string): string | null {
  const m = text.match(new RegExp(`${key}[|\\n]([^|\\n]{1,80})`));
  return m ? m[1].trim() : null;
}

function parseMonthKey(s: string): string | null {
  if (!s) return null;
  const months: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  };
  const m = s.match(/(\w{3})\s+\d+,\s+(\d{4})/);
  return m ? `${m[2]}-${months[m[1]] || '00'}` : null;
}

function parseDevice(ua: string): string {
  if (!ua) return 'Unknown';
  if (/Android/i.test(ua))     return 'Android';
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Windows NT/i.test(ua))  return 'Windows';
  if (/Mac/i.test(ua))         return 'Mac';
  return 'Web/Other';
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Parse liked_posts.html — Instagram's "likes" export in newer HTML format.
 * Splits on URL div blocks and extracts username + timestamp per like.
 */
export function parseLikedPosts(html: string): ParsedLikedPosts {
  const userCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  // Safety: skip files larger than 50MB
  if (html.length > 50 * 1024 * 1024) {
    console.warn('[HTML Parser] parseLikedPosts: input too large, skipping');
    return { total: 0, topUsers: [], monthly: {} };
  }
  const blocks = html.split(/(?=<div[^>]*>\s*(?:<div[^>]*>)?\s*URL)/g);
  blocks.forEach((block) => {
    const uMatch = block.match(
      /Username(?:<[^>]+>)*([^<\n|]{2,50}?)(?:<|Username|Name|URL|Caption|Owner|Hashtags)/,
    );
    if (!uMatch) return;
    const u = uMatch[1].trim();
    if (!u || FIELD_BLACKLIST.has(u)) return;
    userCounts[u] = (userCounts[u] || 0) + 1;
    const tMatch = block.match(/(\w{3} \d+, \d{4})/);
    if (tMatch) {
      const mk = parseMonthKey(tMatch[1]);
      if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    }
  });
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));
  return {
    total: Object.values(userCounts).reduce((a, b) => a + b, 0),
    topUsers,
    monthly,
  };
}

/**
 * Parse liked_comments.html — extracts usernames from <h2 class="_a6-h"> blocks.
 */
export function parseLikedComments(html: string): ParsedLikedComments {
  const userCounts: Record<string, number> = {};
  const re = /<h2[^>]*_a6-h[^>]*>([^<]+)<\/h2>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[1].trim();
    if (u && !FIELD_BLACKLIST.has(u)) {
      userCounts[u] = (userCounts[u] || 0) + 1;
    }
  }
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));
  return {
    total: Object.values(userCounts).reduce((a, b) => a + b, 0),
    topUsers,
  };
}

/**
 * Parse post_comments_1.html or reels_comments.html — splits on _a6-g class,
 * extracts "Media Owner" and "Time" fields.
 */
export function parseComments(html: string): ParsedComments {
  const entries = html.split('class="_a6-g"').slice(1);
  const targetCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  entries.forEach((block) => {
    const text = stripTags(block);
    const owner = extractField(text, 'Media Owner');
    const time = extractField(text, 'Time');
    if (!time) return;
    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    if (owner) targetCounts[owner] = (targetCounts[owner] || 0) + 1;
  });
  const topTargets = Object.entries(targetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([user, count]) => ({ user, count }));
  return { total: entries.length, topTargets, monthly };
}

/**
 * Parse login_activity.html — splits on _a6-g class, extracts Time and User agent.
 */
export function parseLoginActivity(html: string): ParsedLoginActivity {
  const entries = html.split('class="_a6-g"').slice(1);
  const logins: LoginEntryParsed[] = [];
  const deviceCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  entries.forEach((block) => {
    const text = stripTags(block);
    const time = extractField(text, 'Time');
    const ua = extractField(text, 'User agent');
    const ip = extractField(text, 'IP address');
    if (!time) return;
    const device = parseDevice(ua || '');
    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    logins.push({ time, device, monthKey: mk, ip: ip ?? '', userAgent: ua ?? '' });
  });
  return { total: logins.length, logins, deviceCounts, monthly };
}

/**
 * Parse polls.html — extracts timestamps from poll vote entries.
 */
export function parsePolls(html: string): ParsedPolls {
  const monthly: Record<string, number> = {};
  let total = 0;
  const re = /(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s+[apm]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const mk = parseMonthKey(m[1]);
    if (mk) {
      monthly[mk] = (monthly[mk] || 0) + 1;
      total++;
    }
  }
  return { total, monthly };
}

/**
 * Parse questions.html — splits on _a6-g class, extracts "Update time".
 */
export function parseQuestions(html: string): ParsedQuestions {
  const entries = html.split('class="_a6-g"').slice(1);
  const monthly: Record<string, number> = {};
  const seen = new Set<string>();
  entries.forEach((block) => {
    const text = stripTags(block);
    const time = extractField(text, 'Update time');
    if (!time || seen.has(time)) return;
    seen.add(time);
    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
  });
  return { total: seen.size, monthly };
}

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

/**
 * Build a unified timeline from all activity sources.
 */
export function buildTimeline(sources: ActivitySources): TimelineEntry[] {
  const allMonths = new Set<string>();
  Object.values(sources).forEach(
    (s) => s?.monthly && Object.keys(s.monthly).forEach((m) => allMonths.add(m)),
  );
  return Array.from(allMonths)
    .sort()
    .map((month) => {
      const [y, mo] = month.split('-');
      return {
        month,
        label: `${MONTH_NAMES[+mo - 1]}'${y.slice(2)}`,
        postComments: sources.postComments?.monthly?.[month] || 0,
        reelComments: sources.reelComments?.monthly?.[month] || 0,
        polls: sources.polls?.monthly?.[month] || 0,
        questions: sources.questions?.monthly?.[month] || 0,
        logins: sources.logins?.monthly?.[month] || 0,
      };
    });
}
