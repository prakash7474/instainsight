// adapters/toActivityData.ts
// Maps the raw instagram-data.json output → ActivityData for ActivityScreen

import type { ActivityData, TopUser, MonthBar, LoginEntry, DeviceCount } from '../screens/ActivityScreen';

// ─── Raw types from parse-instagram-full.js output ────────────────────────────
type RawUserCount = { user: string; count: number };

type RawTimeline = {
  month:        string;   // "2025-08"
  label:        string;   // "Aug'25"
  postComments: number;
  reelComments: number;
  polls:        number;
  questions:    number;
  logins:       number;
};

type RawLogin = {
  time:     string;   // "Mar 07, 2026 3:33 am"
  device:   string;
  ip?:      string;
  monthKey: string;
};

type RawInstagramData = {
  summary: {
    totalLogins:        number;
    totalPostComments:  number;
    totalReelComments:  number;
    totalPolls:         number;
    totalQuestions:     number;
    totalLikedPosts:    number;
    totalLikedComments: number;
  };
  loginHistory:      RawLogin[];
  deviceCounts:      Record<string, number>;
  timeline:          RawTimeline[];
  topLikedPostUsers: RawUserCount[];
  topLikedCmtUsers:  RawUserCount[];
  topCommentedOn:    RawUserCount[];
  topCombined:       Array<{ user:string; total:number; likedPosts:number; likedComments:number; commented:number }>;

  // From media files (if you add stories/posts parsing)
  storiesCount?:    number;
  postsCount?:      number;
  mostActiveMonth?: string;   // "Jun'25 (24 stories)"
};

// ─── COLOR PALETTE for top users (cycles if more than 5) ──────────────────────
const USER_COLORS = [
  { color:'#b8a9ff', colorA:'rgba(139,127,245,0.18)' },
  { color:'#2cb67d', colorA:'rgba(44,182,125,0.18)'  },
  { color:'#e85d9e', colorA:'rgba(232,93,158,0.18)'  },
  { color:'#f5a623', colorA:'rgba(245,166,35,0.18)'  },
  { color:'#4fa3e8', colorA:'rgba(79,163,232,0.18)'  },
  { color:'#e85d5d', colorA:'rgba(232,93,93,0.18)'   },
];

function getInitials(username: string): string {
  // "@mr_blackyyyyy_" → "MB"
  const clean   = username.replace(/^@/,'').replace(/[_.\-]/g,' ').trim();
  const words   = clean.split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0,2).toUpperCase();
}

function mostActiveLoginMonth(timeline: RawTimeline[]): string {
  const best = timeline.reduce(
    (acc, m) => (m.logins > acc.logins ? m : acc),
    { label:'—', logins: 0 } as any
  );
  return best.label;
}

function buildTopUsers(raw: RawInstagramData): TopUser[] {
  const source = raw.topCombined ?? [];

  return source.slice(0, 5).map((u, i) => {
    const palette = USER_COLORS[i % USER_COLORS.length];
    const parts:string[] = [];
    if (u.likedPosts)    parts.push(`${u.likedPosts} posts liked`);
    if (u.commented)     parts.push(`${u.commented} comments`);
    if (u.likedComments) parts.push(`${u.likedComments} cmts liked`);

    return {
      rank:     i + 1,
      name:     u.user,
      sub:      parts.slice(0,2).join(' + '),
      count:    u.total,
      color:    palette.color,
      colorA:   palette.colorA,
      initials: getInitials(u.user),
    };
  });
}

function buildMonthlyBars(timeline: RawTimeline[], limit = 8): MonthBar[] {
  return timeline
    .filter(m => m.postComments + m.reelComments + m.polls + m.questions + m.logins > 0)
    .slice(-limit)
    .map(m => ({
      month:    m.label,
      comments: m.postComments + m.reelComments,
      polls:    m.polls,
      qa:       m.questions,
      logins:   m.logins,
    }));
}

function buildDeviceBreakdown(deviceCounts: Record<string, number>): DeviceCount[] {
  const total = Object.values(deviceCounts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(deviceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / total) * 100),
    }));
}

function mapDevice(raw: string): 'Phone' | 'Desktop' | 'Tablet' | 'Unknown' {
  if (/Android|iOS|iPhone|iPad/i.test(raw)) return 'Phone';
  if (/Windows|Mac|Web\/Other|Desktop/i.test(raw)) return 'Desktop';
  return 'Unknown';
}

function buildLoginHistory(logins: RawLogin[]): LoginEntry[] {
  return logins.slice(0, 10).map(l => ({
    time:   l.time,
    ip:     l.ip ? maskIp(l.ip) : 'Unknown',
    device: mapDevice(l.device),
  }));
}

function maskIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  if (ip.includes(':')) return ip.slice(0, 18) + '::';
  return ip;
}

// ─── MAIN ADAPTER ─────────────────────────────────────────────────────────────
export function toActivityData(raw: RawInstagramData): ActivityData {
  const totalSessions = raw.summary.totalLogins;
  const devicesUsed   = Object.keys(raw.deviceCounts ?? {}).length;

  return {
    // Media Intelligence
    storiesCount:         raw.storiesCount    ?? 0,
    postsCount:           raw.postsCount      ?? 0,
    activeMonths:         raw.timeline.length,
    mostActiveMonth:      raw.mostActiveMonth ?? '—',

    // Top users
    topUsers:             buildTopUsers(raw),

    // Chart
    monthlyBars:          buildMonthlyBars(raw.timeline),

    // Login details
    totalSessions,
    devicesUsed,
    mostActiveLoginMonth: mostActiveLoginMonth(raw.timeline),
    deviceBreakdown:      buildDeviceBreakdown(raw.deviceCounts ?? {}),
    loginHistory:         buildLoginHistory(raw.loginHistory ?? []),
  };
}
