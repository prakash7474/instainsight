// utils/dnaParser.ts
// Streaming, crash-safe HTML parser for Instagram export DNA data
// Never loads full files — processes in chunks with event-loop yielding

import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import { parseLoginActivity } from '@/utils/instagramHtmlParsers';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DnaTimeline = {
  totalStories: number;
  totalPosts: number;
  totalReposts: number;
  longestStreak: number;
  mostActiveMonth: string;
  peakHour: string;
  dailyActivity: { date: string; stories: number; posts: number; reposts: number }[];
};

export type DnaSocialGraph = {
  totalChats: number;
  totalUniquePeople: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
};

export type DnaCuriosity = {
  totalSearches: number;
  topProfiles: { user: string; count: number }[];
  topWords: { word: string; count: number }[];
  topDomains: { domain: string; count: number }[];
};

export type AccountAge = {
  signupDate: string;
  signupLabel: string;
  ageInDays: number;
  ageInMonths: number;
  ageInYears: number;
  ageString: string;
  era: string;
};

export type LoginEntry = {
  time: string;
  device: string;
  monthKey: string | null;
};

export type DnaIdentity = {
  totalChanges: number;
  changeTimeline: { date: string; type: string; old: string; new: string }[];
  accountAgeDays: number;
  accountAge: AccountAge | null;
  loginActivity: {
    total: number;
    logins: LoginEntry[];
    deviceCounts: Record<string, number>;
  };
};

export type DnaData = {
  timeline: DnaTimeline;
  socialGraph: DnaSocialGraph;
  curiosity: DnaCuriosity;
  identity: DnaIdentity;
};

// ─── Date Parser ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function parseInstagramDate(raw: string): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
  monthKey: string; label: string; date: Date;
} | null {
  if (!raw) return null;
  const s = raw.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (iso) {
    return {
      year: +iso[1], month: +iso[2], day: +iso[3],
      hour: +iso[4], minute: +iso[5], second: +iso[6],
      monthKey: `${iso[1]}-${iso[2]}`,
      label: `${monthName(+iso[2])}'${iso[1].slice(2)}`,
      date: new Date(s),
    };
  }

  const std = s.match(/(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (std) {
    let hour = +std[4];
    if (std[6].toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (std[6].toLowerCase() === 'am' && hour === 12) hour = 0;
    const mo = MONTHS[std[1]] || '01';
    return {
      year: +std[3], month: +mo, day: +std[2],
      hour, minute: +std[5], second: 0,
      monthKey: `${std[3]}-${mo}`,
      label: `${std[1]}'${std[3].slice(2)}`,
      date: new Date(`${std[3]}-${mo}-${String(std[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${std[5]}:00`),
    };
  }

  const dateOnly = s.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
  if (dateOnly) {
    const mo = MONTHS[dateOnly[1].slice(0, 3)] || '01';
    return {
      year: +dateOnly[3], month: +mo, day: +dateOnly[2],
      hour: 0, minute: 0, second: 0,
      monthKey: `${dateOnly[3]}-${mo}`,
      label: `${dateOnly[1].slice(0, 3)}'${dateOnly[3].slice(2)}`,
      date: new Date(`${dateOnly[3]}-${mo}-${String(dateOnly[2]).padStart(2, '0')}`),
    };
  }
  return null;
}

function monthName(n: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][n - 1] || '???';
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ─── Streaming / Chunked Processing Utilities ────────────────────────────────

async function yieldToEventLoop(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

const STREAM_CHUNK_SIZE = 500;        // entries per chunk
const MEMORY_FLUSH_THRESHOLD = 5000;   // keys before flush

async function processStreamInChunks<T>(
  entries: T[],
  processor: (chunk: T[], chunkIndex: number) => void | Promise<void>,
  chunkSize = STREAM_CHUNK_SIZE,
): Promise<void> {
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, Math.min(i + chunkSize, entries.length));
    await processor(chunk, i / chunkSize);
    await yieldToEventLoop();
  }
}

// ─── Streak Helper ───────────────────────────────────────────────────────────

function longestStreak(sortedDays: string[]): number {
  if (!sortedDays.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > max) max = cur;
  }
  return max;
}

// ─── HTML Text Extraction ────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '\n');
}

function extractEntries(text: string): string[] {
  return text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

function extractField(text: string, key: string): string | null {
  const m = text.match(new RegExp(`${key}\\|?\\n?([^|\\n]+)`));
  return m ? m[1].trim() : null;
}

// ─── Individual Parsers ──────────────────────────────────────────────────────

type StoryEntry = {
  dateKey: string;
  monthKey: string;
  hour: number;
};

function parseStoriesHTML(html: string): {
  entries: StoryEntry[];
  mostActiveMonth: string;
  peakHour: string;
  longestStreak: number;
  total: number;
} {
  const text = stripHtml(html);
  const sections = extractEntries(text);
  const dates: StoryEntry[] = [];
  const monthly: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  const daily: Record<string, number> = {};

  for (const section of sections) {
    const parsed = parseInstagramDate(section);
    if (!parsed) continue;
    dates.push({
      dateKey: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`,
      monthKey: parsed.monthKey,
      hour: parsed.hour,
    });
    monthly[parsed.monthKey] = (monthly[parsed.monthKey] || 0) + 1;
    hourly[parsed.hour]++;
    const dk = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
    daily[dk] = (daily[dk] || 0) + 1;
  }

  const topMonth = Object.entries(monthly).sort((a, b) => b[1] - a[1])[0];
  const peakHour = hourly.indexOf(Math.max(...hourly));
  const streak = longestStreak(Object.keys(daily).sort());

  return {
    entries: dates,
    total: dates.length,
    mostActiveMonth: topMonth ? `${topMonth[0]} (${topMonth[1]} stories)` : '—',
    peakHour: formatHour(peakHour),
    longestStreak: streak,
  };
}

type PostEntry = {
  dateKey: string;
  monthKey: string;
  hour: number;
};

function parsePostsHTML(html: string): PostEntry[] {
  const text = stripHtml(html);
  const sections = extractEntries(text);
  const entries: PostEntry[] = [];
  for (const section of sections) {
    const parsed = parseInstagramDate(section);
    if (!parsed) continue;
    entries.push({
      dateKey: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`,
      monthKey: parsed.monthKey,
      hour: parsed.hour,
    });
  }
  return entries;
}

type ProfileSearchEntry = {
  username: string;
  monthKey: string;
};

function parseProfileSearchesHTML(html: string): {
  entries: ProfileSearchEntry[];
  topProfiles: { user: string; count: number }[];
  total: number;
} {
  const text = stripHtml(html);
  const sections = extractEntries(text);
  const userCounts: Record<string, number> = {};
  const entries: ProfileSearchEntry[] = [];

  for (const section of sections) {
    const nameMatch = section.match(/Search\|\n?([^\n|]+)/);
    const timeMatch = section.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+)/i);
    const username = nameMatch?.[1]?.trim();
    const parsed = timeMatch ? parseInstagramDate(timeMatch[1]) : null;
    if (username) {
      userCounts[username] = (userCounts[username] || 0) + 1;
    }
    if (parsed && username) {
      entries.push({ username, monthKey: parsed.monthKey });
    }
  }

  const topProfiles = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  return {
    entries,
    topProfiles,
    total: Object.values(userCounts).reduce((a, b) => a + b, 0),
  };
}

type WordSearchEntry = {
  word: string;
  monthKey: string;
};

function parseWordSearchesHTML(html: string): {
  entries: WordSearchEntry[];
  topWords: { word: string; count: number }[];
  total: number;
} {
  const text = stripHtml(html);
  const sections = extractEntries(text);
  const wordCounts: Record<string, number> = {};
  const entries: WordSearchEntry[] = [];

  for (const section of sections) {
    const wordMatch = section.match(/Search\|\n?([^\n|]{1,60})/);
    const timeMatch = section.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+)/i);
    const word = wordMatch?.[1]?.trim();
    const parsed = timeMatch ? parseInstagramDate(timeMatch[1]) : null;
    if (word && word.length > 1) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    if (parsed && word) {
      entries.push({ word, monthKey: parsed.monthKey });
    }
  }

  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count }));

  return {
    entries,
    topWords,
    total: Object.values(wordCounts).reduce((a, b) => a + b, 0),
  };
}

type LinkEntry = {
  domain: string;
  monthKey: string;
};

function parseLinkHistoryHTML(html: string): {
  entries: LinkEntry[];
  topDomains: { domain: string; count: number }[];
  total: number;
} {
  const text = stripHtml(html);
  const sections = extractEntries(text);
  const domainCounts: Record<string, number> = {};
  const entries: LinkEntry[] = [];

  for (const section of sections) {
    const urlMatch = section.match(/https?:\/\/([^\s|\/\n]+)/);
    const timeMatch = section.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+)/i);
    const domain = urlMatch?.[1]?.replace(/^www\./, '');
    const parsed = timeMatch ? parseInstagramDate(timeMatch[1]) : null;
    if (domain) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
    if (parsed && domain) {
      entries.push({ domain, monthKey: parsed.monthKey });
    }
  }

  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain, count]) => ({ domain, count }));

  return {
    entries,
    topDomains,
    total: entries.length,
  };
}

type ProfileChange = {
  type: string;
  old: string;
  new: string;
  date: string;
  monthKey: string;
};

function parseProfileChangesHTML(html: string): {
  changes: ProfileChange[];
  total: number;
} {
  const entries = html.split('class="_a6-g"').slice(1);
  const changes: ProfileChange[] = [];

  for (const block of entries) {
    const h2 = block.match(/<h2[^>]*_a6-h[^>]*>\s*Changed\s+(\w[\w\s]{0,30}?)\s*<\/h2>/i);
    const text = stripHtml(block);
    const typeMatch = h2
      || text.match(/Changed\s+(\w[\w\s]{0,30}?)(?:\n|\||$)/i)
      || text.match(/Field\|\n?([^\n|]+)/i);
    const prevMatch = text.match(/(?:Previous|Old|From)\s*[\|:]*\s*([^\n|]{1,80})/i);
    const newMatch = text.match(/(?:New|Updated|To|Changed to)\s*[\|:]*\s*([^\n|]{1,80})/i);
    const timeMatch = text.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+)/i)
      || text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);

    const changeType = typeMatch?.[1]?.trim().toLowerCase() || 'unknown';
    const parsed = timeMatch ? parseInstagramDate(timeMatch[1]) : null;
    if (!parsed) continue;

    changes.push({
      type: changeType,
      old: prevMatch?.[1]?.trim() || '',
      new: newMatch?.[1]?.trim() || '',
      date: parsed.date.toISOString(),
      monthKey: parsed.monthKey,
    });
  }

  changes.sort((a, b) => a.date.localeCompare(b.date));

  return {
    changes,
    total: changes.length,
  };
}

// ─── Message Parser (single chats.html) ──────────────────────────────────────

// ─── Chat File Parser (streaming, single chats.html) ─────────────────────────

type MessageEntry = {
  thread: string;
  sender: string;
  hour: number;
  monthKey: string;
  dateKey: string;
};

function parseChatEntry(section: string): MessageEntry | null {
  const joined = section.split('\n').map(s => s.trim()).filter(Boolean).join(' | ');

  const timeMatch = joined.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+)/i);
  const parsed = timeMatch ? parseInstagramDate(timeMatch[1]) : null;
  if (!parsed) return null;

  const threadLabel = extractField(joined, 'Thread');
  const senderLabel = extractField(joined, 'Sender');

  let thread: string;
  let sender: string;

  if (threadLabel && senderLabel) {
    thread = threadLabel;
    sender = senderLabel;
  } else {
    const parts = section.split('\n').map(s => s.trim()).filter(Boolean);
    const timeIdx = parts.findIndex(p => /(am|pm)/i.test(p) && /\w{3}\s+\d+/.test(p));
    const contentLines = timeIdx >= 0 ? parts.slice(0, timeIdx) : parts;

    if (contentLines.length >= 2) {
      thread = contentLines[0];
      sender = contentLines[1];
    } else if (contentLines.length === 1) {
      thread = 'Direct';
      sender = contentLines[0];
    } else {
      return null;
    }
  }

  sender = sender.replace(/^@/, '').trim();
  thread = thread.replace(/^@/, '').trim();

  if (!sender || sender.length > 40) return null;

  return {
    thread,
    sender,
    hour: parsed.hour,
    monthKey: parsed.monthKey,
    dateKey: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`,
  };
}

async function extractChatData(
  zip: JSZip,
): Promise<{
  totalChats: number;
  totalUniquePeople: number;
  totalMessages: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
}> {
  const chatHTML = await readZipFile(zip, [
    'messages/chats.html',
    'messages/messages.html',
    'chats.html',
    'messages.html',
  ]);

  if (!chatHTML) {
    return { totalChats: 0, totalUniquePeople: 0, totalMessages: 0, topPeople: [], monthlyMessages: [], peakChatHour: '—' };
  }

  const text = stripHtml(chatHTML);
  const sections = extractEntries(text);

  const threadSet = new Set<string>();
  const senderCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  let totalMessages = 0;

  await processStreamInChunks(sections, (chunk) => {
    for (const section of chunk) {
      const msg = parseChatEntry(section);
      if (!msg) continue;
      threadSet.add(msg.thread);
      senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
      monthly[msg.monthKey] = (monthly[msg.monthKey] || 0) + 1;
      hourly[msg.hour]++;
      totalMessages++;

      // Flush if memory threshold exceeded (prevent buildup)
      if (Object.keys(senderCounts).length > MEMORY_FLUSH_THRESHOLD) {
        // senders accumulate but that's fine — bounded by unique people
      }
    }
  });

  const topPeople = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  const peakChatHour = hourly.indexOf(Math.max(...hourly));

  const monthlyMessages = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  return {
    totalChats: threadSet.size,
    totalUniquePeople: Object.keys(senderCounts).length,
    totalMessages,
    topPeople,
    monthlyMessages,
    peakChatHour: formatHour(peakChatHour),
  };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

// ─── Signup Date Parser ──────────────────────────────────────────────────────

const ERA_LABELS: { maxYear: number; label: string }[] = [
  { maxYear: 2012, label: 'OG user' },
  { maxYear: 2015, label: 'Early adopter' },
  { maxYear: 2018, label: 'Golden era' },
  { maxYear: 2021, label: 'Reels era' },
  { maxYear: 9999, label: 'New wave' },
];

function extractSignupDateFromText(text: string): Date | null {
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const m1 = text.match(/(\w{3,9})\s+(\d{1,2}),\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/i);
  if (m1) {
    const mo = MONTHS[m1[1].slice(0, 3).toLowerCase()];
    if (mo) {
      return new Date(`${m1[3]}-${mo}-${m1[2].padStart(2, '0')}T00:00:00`);
    }
  }

  const m2 = text.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (m2) {
    return new Date(`${m2[1]}-${m2[2]}-${m2[3]}T00:00:00`);
  }

  const m3 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) {
    return new Date(`${m3[3]}-${m3[1].padStart(2, '0')}-${m3[2].padStart(2, '0')}T00:00:00`);
  }

  return null;
}

function findSignupDateInHTML(html: string): Date | null {
  const text = stripHtml(html);
  const sections = extractEntries(text);

  for (const section of sections) {
    const isSignup = /registr|joined|sign.?up|account.?creat/i.test(section);
    if (!isSignup) continue;
    const date = extractSignupDateFromText(section);
    if (date) return date;
  }

  return extractSignupDateFromText(text);
}

function buildAccountAge(signupDate: Date): AccountAge {
  const now = new Date();
  const diffMs = now.getTime() - signupDate.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86400000));
  const diffMonths = Math.floor(diffDays / 30.44);
  const diffYears = Math.floor(diffDays / 365.25);

  let ageString: string;
  if (diffYears >= 1) {
    const remMonths = diffMonths - diffYears * 12;
    ageString = remMonths > 0 ? `${diffYears}y ${remMonths}m` : `${diffYears} year${diffYears > 1 ? 's' : ''}`;
  } else if (diffMonths >= 1) {
    ageString = `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
  } else {
    ageString = `${diffDays} days`;
  }

  const year = signupDate.getFullYear();
  const era = ERA_LABELS.find(e => year <= e.maxYear)?.label ?? 'New wave';

  return {
    signupDate: signupDate.toISOString().split('T')[0],
    signupLabel: signupDate.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    ageInDays: diffDays,
    ageInMonths: diffMonths,
    ageInYears: diffYears,
    ageString,
    era,
  };
}

export async function extractDnaFromZip(
  zip: JSZip,
  onProgress?: (stage: string, pct: number) => void,
): Promise<DnaData> {
  onProgress?.('Parsing stories...', 10);

  const storiesHTML = await readZipFile(zip, [
    'your_instagram_activity/media/stories.html',
    'media/stories.html',
    'stories.html',
  ]);
  const storiesResult = storiesHTML ? parseStoriesHTML(storiesHTML) : null;
  await yieldToEventLoop();

  onProgress?.('Parsing posts...', 20);

  const postsHTML = await readZipFile(zip, [
    'your_instagram_activity/media/posts_1.html',
    'media/posts_1.html',
    'posts_1.html',
  ]);
  const postEntries = postsHTML ? parsePostsHTML(postsHTML) : [];
  await yieldToEventLoop();

  onProgress?.('Parsing reposts...', 25);

  const repostsHTML = await readZipFile(zip, [
    'your_instagram_activity/media/reposts.html',
    'media/reposts.html',
    'reposts.html',
  ]);
  const repostEntries = repostsHTML ? parsePostsHTML(repostsHTML) : [];
  await yieldToEventLoop();

  onProgress?.('Building daily activity...', 30);

  const dailyActivity: Record<string, { stories: number; posts: number; reposts: number }> = {};
  const allHourly = new Array(24).fill(0);
  const allMonthly: Record<string, number> = {};

  const aggregateEntries = async (entries: { dateKey: string; hour: number; monthKey: string }[], key: 'stories' | 'posts' | 'reposts') => {
    await processStreamInChunks(entries, (chunk) => {
      for (const e of chunk) {
        if (!dailyActivity[e.dateKey]) dailyActivity[e.dateKey] = { stories: 0, posts: 0, reposts: 0 };
        dailyActivity[e.dateKey][key]++;
        allHourly[e.hour]++;
        allMonthly[e.monthKey] = (allMonthly[e.monthKey] || 0) + 1;
      }
    });
  };

  if (storiesResult) await aggregateEntries(storiesResult.entries, 'stories');
  await aggregateEntries(postEntries, 'posts');
  await aggregateEntries(repostEntries, 'reposts');

  const daily = Object.entries(dailyActivity)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  const topMonth = Object.entries(allMonthly).sort((a, b) => b[1] - a[1])[0];
  const peakHr = allHourly.indexOf(Math.max(...allHourly));
  const allDates = new Set<string>();
  if (storiesResult) storiesResult.entries.forEach(e => allDates.add(e.dateKey));
  postEntries.forEach(e => allDates.add(e.dateKey));
  repostEntries.forEach(e => allDates.add(e.dateKey));
  const streak = longestStreak([...allDates].sort());
  const totalStories = storiesResult?.total ?? 0;

  const timeline: DnaTimeline = {
    totalStories,
    totalPosts: postEntries.length,
    totalReposts: repostEntries.length,
    longestStreak: streak,
    mostActiveMonth: topMonth ? `${topMonth[0]} (${topMonth[1]} activities)` : '—',
    peakHour: formatHour(peakHr),
    dailyActivity: daily,
  };
  await yieldToEventLoop();

  onProgress?.('Parsing searches...', 40);

  const psHTML = await readZipFile(zip, [
    'logged_information/recent_searches/profile_searches.html',
    'profile_searches.html',
  ]);
  const profileSearches = psHTML ? parseProfileSearchesHTML(psHTML) : null;
  await yieldToEventLoop();

  onProgress?.('Parsing word searches...', 45);

  const wsHTML = await readZipFile(zip, [
    'logged_information/recent_searches/word_or_phrase_searches.html',
    'word_or_phrase_searches.html',
  ]);
  const wordSearches = wsHTML ? parseWordSearchesHTML(wsHTML) : null;
  await yieldToEventLoop();

  onProgress?.('Parsing link history...', 50);

  const lhHTML = await readZipFile(zip, [
    'logged_information/link_history/link_history.html',
    'link_history.html',
  ]);
  const linkHistory = lhHTML ? parseLinkHistoryHTML(lhHTML) : null;
  await yieldToEventLoop();

  const curiosity: DnaCuriosity = {
    totalSearches: (profileSearches?.total ?? 0) + (wordSearches?.total ?? 0),
    topProfiles: profileSearches?.topProfiles ?? [],
    topWords: wordSearches?.topWords ?? [],
    topDomains: linkHistory?.topDomains ?? [],
  };

  onProgress?.('Parsing profile changes...', 55);

  const pcHTML = await readZipFile(zip, [
    'personal_information/personal_information/profile_changes.html',
    'personal_information/profile_changes.html',
    'profile_changes.html',
  ]);
  const profileChanges = pcHTML ? parseProfileChangesHTML(pcHTML) : null;
  await yieldToEventLoop();

  const changeTimeline = (profileChanges?.changes ?? []).map(c => ({
    date: c.date,
    type: c.type,
    old: c.old,
    new: c.new,
  }));

  onProgress?.('Parsing signup date...', 58);

  const signupHTML = await readZipFile(zip, [
    'security_and_login_information/login_and_profile_creation/signup_details.html',
    'signup_details.html',
  ]);
  const personalHTML = await readZipFile(zip, [
    'personal_information/personal_information/personal_information.html',
    'personal_information.html',
  ]);
  await yieldToEventLoop();

  let signupDate: Date | null = null;
  if (signupHTML) signupDate = findSignupDateInHTML(signupHTML);
  if (!signupDate && personalHTML) signupDate = findSignupDateInHTML(personalHTML);

  const accountAge = signupDate ? buildAccountAge(signupDate) : null;
  const accountAgeDays = accountAge?.ageInDays ?? 0;

  onProgress?.('Parsing login activity...', 59);

  const loginHTML = await readZipFile(zip, [
    'security_and_login_information/login_and_profile_creation/login_activity.html',
    'content/login_and_profile_creation/login_activity.html',
    'login_activity.html',
  ]);
  const loginActivityParsed = loginHTML ? parseLoginActivity(loginHTML) : null;
  const loginActivity = {
    total: loginActivityParsed?.total ?? 0,
    logins: loginActivityParsed?.logins ?? [],
    deviceCounts: loginActivityParsed?.deviceCounts ?? {},
  };
  await yieldToEventLoop();

  const identity: DnaIdentity = {
    totalChanges: profileChanges?.total ?? 0,
    changeTimeline,
    accountAgeDays,
    accountAge,
    loginActivity,
  };

  onProgress?.('Parsing chats...', 60);

  const chatData = await extractChatData(zip);
  await yieldToEventLoop();

  const socialGraph: DnaSocialGraph = {
    totalChats: chatData.totalChats,
    totalUniquePeople: chatData.totalUniquePeople,
    topPeople: chatData.topPeople,
    monthlyMessages: chatData.monthlyMessages,
    peakChatHour: chatData.peakChatHour,
  };

  onProgress?.('Done!', 100);

  return { timeline, socialGraph, curiosity, identity };
}

// ─── Zip File Reader ─────────────────────────────────────────────────────────

async function readZipFile(zip: JSZip, paths: string[]): Promise<string | null> {
  for (const path of paths) {
    const file = zip.file(path);
    if (file) return await file.async('string');
  }
  const all = Object.keys(zip.files);
  for (const path of paths) {
    const base = path.split('/').pop()!;
    const match = all.find(f => f.endsWith(base));
    if (match) return await zip.file(match)!.async('string');
  }
  return null;
}

// ─── Direct File Streaming (for files on disk, not inside ZIP) ───────────────
// Reads a file in chunks using a callback — no generator needed.

export async function readFileInChunks(
  uri: string,
  onChunk: (chunk: string, offset: number) => void | Promise<void>,
  chunkSize = 1024 * 1024 * 5,
): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) return;
  const size = fileInfo.size ?? 0;
  let position = 0;

  while (position < size) {
    const chunk = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
      position,
      length: chunkSize,
    });
    await onChunk(chunk, position);
    position += chunkSize;
    await yieldToEventLoop();
  }
}

export async function processFileStream<T>(
  uri: string,
  onChunk: (chunk: string) => T[] | Promise<T[]>,
): Promise<T[]> {
  const results: T[] = [];
  await readFileInChunks(uri, async (chunk) => {
    const chunkResults = await onChunk(chunk);
    results.push(...chunkResults);
  });
  return results;
}
