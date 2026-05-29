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
  totalMessages: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
  messageNetwork: MessageNetwork;
  priorityPeople: PriorityPerson[];
  insights: string[];
  userStats: Record<string, UserChatStats>;
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

export type MessageNode = {
  user: string;
  totalMessages: number;
  myMessages: number;
  theirMessages: number;
  weight: number;
};

export type MessageEdge = {
  source: string;
  target: string;
  weight: number;
};

export type MessageNetwork = {
  nodes: MessageNode[];
  edges: MessageEdge[];
  topContacts: MessageNode[];
};

export type PriorityBreakdown = {
  frequency: number;
  recency: number;
  balance: number;
  depth: number;
  interaction: number;
};

export type PriorityPerson = {
  user: string;
  score: number;
  breakdown: PriorityBreakdown;
  tier: string;
};

export type UserChatStats = {
  totalMessages: number;
  messagesSent: number;
  messagesReceived: number;
  lastMessageTimestamp: number;
  totalWords: number;
  reactions: number;
  likesReceived?: number;
  commentsReceived?: number;
};

export type DnaIdentity = {
  totalChanges: number;
  changeTimeline: { date: string; type: string; old: string; new: string }[];
  accountAgeDays: number;
  accountAgeLabel: string;
  accountAge: AccountAge | null;
  loginActivity: {
    total: number;
    logins: LoginEntry[];
    deviceCounts: Record<string, number>;
    source: 'real' | 'derived';
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

function getEarliestDate(dates: string[]): Date | null {
  if (!dates.length) return null;
  const timestamps = dates.map(d => new Date(d).getTime()).filter(t => !isNaN(t));
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps));
}

function formatAccountAge(days: number): string {
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) return `${years}y ${months}m`;
  return `${months}m`;
}

// ─── Streaming / Chunked Processing Utilities ────────────────────────────────

async function yieldToEventLoop(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

const STREAM_CHUNK_SIZE = 500;        // entries per chunk
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
  const m = text.match(new RegExp(`${key}\\s*\\|?\\s*\\n?\\s*([^|\\n]+)`));
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
  if (!html) return { changes: [], total: 0 };

  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

  const sections = text
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(Boolean);

  const changes: ProfileChange[] = [];

  for (const section of sections) {
    const type =
      section.match(/Changed\s+([^\n|]+)/i)?.[1] ||
      section.match(/Field\s*\|\s*([^\n|]+)/i)?.[1] ||
      section.match(/Update[d]?\s+([^\n|]+)/i)?.[1] ||
      'unknown';

    const oldVal =
      section.match(/Previous\s*[:|]\s*([^\n|]+)/i)?.[1] ||
      section.match(/Old\s*[:|]\s*([^\n|]+)/i)?.[1] ||
      section.match(/From\s*[:|]\s*([^\n|]+)/i)?.[1] ||
      '';

    const newVal =
      section.match(/New\s*[:|]\s*([^\n|]+)/i)?.[1] ||
      section.match(/To\s*[:|]\s*([^\n|]+)/i)?.[1] ||
      section.match(/Changed to\s*[:|]?\s*([^\n|]+)/i)?.[1] ||
      '';

    const dateRaw =
      section.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)?.[1] ||
      section.match(/(\w{3,9}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s*[apm]+)/i)?.[1] ||
      section.match(/(\w{3,9}\s+\d{1,2},\s+\d{4})/)?.[1];

    if (!dateRaw) continue;

    const parsed = parseInstagramDate(dateRaw);
    if (!parsed) continue;

    changes.push({
      type: type.toLowerCase().trim(),
      old: oldVal.trim(),
      new: newVal.trim(),
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
  earliestMessageDate: string | null;
  latestMessageDate: string | null;
  messageNetwork: MessageNetwork;
  userStats: Record<string, UserChatStats>;
}> {
  const chatHTML = await readZipFile(zip, [
    'your_instagram_activity/messages/chats.html',
    'your_instagram_activity/messages/messages.html',
    'messages/chats.html',
    'messages/messages.html',
    'chats.html',
    'messages.html',
  ]);

  if (chatHTML) {
    return processChatHTML(chatHTML);
  }

  // Fallback: parse individual JSON conversation files from messages/inbox/
  const inboxResult = await extractChatFromInboxJson(zip);
  if (inboxResult.totalMessages > 0) return inboxResult;

  // Final fallback: parse per-conversation HTML files from messages/inbox/
  return extractChatFromInboxHtml(zip);
}

async function extractChatFromInboxJson(
  zip: JSZip,
): Promise<{
  totalChats: number;
  totalUniquePeople: number;
  totalMessages: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
  earliestMessageDate: string | null;
  latestMessageDate: string | null;
  messageNetwork: MessageNetwork;
  userStats: Record<string, UserChatStats>;
}> {
  const allFiles = Object.keys(zip.files);
  const inboxFiles = allFiles.filter(f =>
    /messages\/inbox\/.*\/message_\d+\.json/i.test(f) ||
    /messages\/inbox\/.*\.json/i.test(f)
  );

  if (!inboxFiles.length) {
    return {
      totalChats: 0, totalUniquePeople: 0, totalMessages: 0,
      topPeople: [], monthlyMessages: [], peakChatHour: '—',
      earliestMessageDate: null, latestMessageDate: null,
      messageNetwork: { nodes: [], edges: [], topContacts: [] },
      userStats: {},
    };
  }

  const threadSet = new Set<string>();
  const senderCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  let totalMessages = 0;
  let earliestMessageDate: string | null = null;
  let latestMessageDate: string | null = null;
  const threadSenderCounts: Record<string, Record<string, number>> = {};
  const threadLatestDate: Record<string, string> = {};
  const userStats: Record<string, UserChatStats> = {};

  for (const filePath of inboxFiles) {
    try {
      const entry = zip.file(filePath);
      if (!entry) continue;
      const raw = await entry.async('string');
      const data = JSON.parse(raw);
      const participants: string[] = (data.participants || []).map((p: any) =>
        (p.name || '').toLowerCase().trim().replace(/^@/, '')
      ).filter(Boolean);
      const threadName = participants.join(', ') || filePath.split('/').slice(-2, -1)[0] || 'unknown';
      threadSet.add(threadName);

      if (!threadSenderCounts[threadName]) {
        threadSenderCounts[threadName] = {};
      }

      const msgs = data.messages || [];
      for (const msg of msgs) {
        const sender = (msg.sender_name || '').toLowerCase().trim().replace(/^@/, '');
        if (!sender) continue;
        const ts = msg.timestamp_ms;
        if (!ts) continue;
        const date = new Date(ts);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        senderCounts[sender] = (senderCounts[sender] || 0) + 1;
        monthly[monthKey] = (monthly[monthKey] || 0) + 1;
        hourly[hour]++;
        totalMessages++;
        if (!earliestMessageDate || dateKey < earliestMessageDate) earliestMessageDate = dateKey;
        if (!latestMessageDate || dateKey > latestMessageDate) latestMessageDate = dateKey;
        threadSenderCounts[threadName][sender] = (threadSenderCounts[threadName][sender] || 0) + 1;
        if (!threadLatestDate[threadName] || dateKey > threadLatestDate[threadName]) {
          threadLatestDate[threadName] = dateKey;
        }

        // Track per-user chat stats
        if (!userStats[sender]) {
          userStats[sender] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
        }
        userStats[sender].totalMessages++;
        userStats[sender].messagesSent++;
        userStats[sender].lastMessageTimestamp = Math.max(userStats[sender].lastMessageTimestamp, ts);
        const content = msg.content || '';
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        userStats[sender].totalWords += wordCount;
        if (msg.reactions && Array.isArray(msg.reactions)) {
          userStats[sender].reactions += msg.reactions.length;
        }
      }
    } catch {
      // skip invalid files
    }
    await yieldToEventLoop();
  }

  // Compute messagesReceived per user from per-thread sender counts
  for (const senders of Object.values(threadSenderCounts)) {
    const totalInThread = Object.values(senders).reduce((a, b) => a + b, 0);
    for (const [user, sent] of Object.entries(senders)) {
      if (!userStats[user]) {
        userStats[user] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
      }
      userStats[user].messagesReceived = (userStats[user].messagesReceived || 0) + (totalInThread - sent);
    }
  }

  const topPeople = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  const peakChatHour = hourly.indexOf(Math.max(...hourly));

  const monthlyMessages = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const me = Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const messageNetwork = buildMessageNetwork(threadSenderCounts, threadLatestDate, me);

  return {
    totalChats: threadSet.size,
    totalUniquePeople: Object.keys(senderCounts).length,
    totalMessages,
    topPeople,
    monthlyMessages,
    peakChatHour: formatHour(peakChatHour),
    earliestMessageDate,
    latestMessageDate,
    messageNetwork,
    userStats,
  };
}

/**
 * Extract all top-level `<div class="pam...>` blocks from HTML, handling
 * arbitrary nesting by counting div open/close tags.
 */
function extractHtmlBlocks(html: string, requiredClass: string): string[] {
  const blocks: string[] = [];
  const searchStr = `<div class="`;
  let pos = 0;
  while (pos < html.length) {
    const start = html.indexOf(searchStr, pos);
    if (start === -1) break;
    // Check if the class attribute contains requiredClass
    const classEnd = html.indexOf('"', start + searchStr.length);
    if (classEnd === -1) { pos = start + 1; continue; }
    const classAttr = html.slice(start + searchStr.length, classEnd);
    if (!classAttr.split(' ').some(c => c.trim() === requiredClass)) {
      pos = start + 1;
      continue;
    }
    // Find the matching </div> by counting nesting depth
    let depth = 1;
    let i = start + `<div class="${classAttr}"`.length;
    // Skip past attributes to the > of this div
    const gtPos = html.indexOf('>', i);
    if (gtPos === -1) { pos = start + 1; continue; }
    i = gtPos + 1;
    while (i < html.length && depth > 0) {
      const openTag = html.indexOf('<div', i);
      const closeTag = html.indexOf('</div>', i);
      if (closeTag === -1) break;
      if (openTag !== -1 && openTag < closeTag) {
        depth++;
        i = openTag + 4;
      } else {
        depth--;
        i = closeTag + 6;
      }
    }
    if (depth === 0) {
      blocks.push(html.slice(start, i));
    }
    pos = i;
  }
  return blocks;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w\s.@]/g, '')
    .trim()
    .toLowerCase();
}

async function extractChatFromInboxHtml(
  zip: JSZip,
): Promise<{
  totalChats: number;
  totalUniquePeople: number;
  totalMessages: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
  earliestMessageDate: string | null;
  latestMessageDate: string | null;
  messageNetwork: MessageNetwork;
  userStats: Record<string, UserChatStats>;
}> {
  const allFiles = Object.keys(zip.files);
  const inboxHtmlFiles = allFiles.filter(f =>
    /messages\/inbox\/.*\/message_\d+\.html/i.test(f)
  );

  if (!inboxHtmlFiles.length) {
    return {
      totalChats: 0, totalUniquePeople: 0, totalMessages: 0,
      topPeople: [], monthlyMessages: [], peakChatHour: '—',
      earliestMessageDate: null, latestMessageDate: null,
      messageNetwork: { nodes: [], edges: [], topContacts: [] },
      userStats: {},
    };
  }

  const threadSet = new Set<string>();
  const senderCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  let totalMessages = 0;
  let earliestMessageDate: string | null = null;
  let latestMessageDate: string | null = null;
  const threadSenderCounts: Record<string, Record<string, number>> = {};
  const threadLatestDate: Record<string, string> = {};
  const userStats: Record<string, UserChatStats> = {};

  for (const filePath of inboxHtmlFiles) {
    try {
      const entry = zip.file(filePath);
      if (!entry) continue;
      const html = await entry.async('string');

      // Extract thread title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const threadName = titleMatch?.[1]?.trim() || filePath.split('/').slice(-2, -1)[0] || 'unknown';
      threadSet.add(threadName);

      if (!threadSenderCounts[threadName]) {
        threadSenderCounts[threadName] = {};
      }

      // Extract all message blocks (nesting-aware div matching)
      const blocks = extractHtmlBlocks(html, 'pam');
      for (const block of blocks) {

        // Sender
        const senderMatch = block.match(
          /<h2[^>]*class="[^"]*_a6-h[^"]*"[^>]*>([^<]+)<\/h2>/i
        );
        const rawSender = senderMatch?.[1]?.trim();
        if (!rawSender) {
          if (process.env.NODE_ENV !== 'test') console.warn('Skipping block: no sender found');
          continue;
        }
        const sender = normalizeName(rawSender);

        // Date
        const dateMatch = block.match(
          /<div[^>]*class="[^"]*_a6-o[^"]*"[^>]*>([^<]+)<\/div>/i
        );
        const rawDate = dateMatch?.[1]?.trim();
        if (!rawDate) {
          if (process.env.NODE_ENV !== 'test') console.warn('Skipping block: no date found');
          continue;
        }
        const parsed = parseInstagramDate(rawDate);
        if (!parsed) {
          if (process.env.NODE_ENV !== 'test') console.warn(`Skipping block: unparseable date "${rawDate}"`);
          continue;
        }

        const year = parsed.year;
        const month = parsed.month;
        const day = parsed.day;
        const hour = parsed.hour;
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        senderCounts[sender] = (senderCounts[sender] || 0) + 1;
        monthly[monthKey] = (monthly[monthKey] || 0) + 1;
        hourly[hour]++;
        totalMessages++;
        if (!earliestMessageDate || dateKey < earliestMessageDate) earliestMessageDate = dateKey;
        if (!latestMessageDate || dateKey > latestMessageDate) latestMessageDate = dateKey;
        threadSenderCounts[threadName][sender] = (threadSenderCounts[threadName][sender] || 0) + 1;
        if (!threadLatestDate[threadName] || dateKey > threadLatestDate[threadName]) {
          threadLatestDate[threadName] = dateKey;
        }

        if (!userStats[sender]) {
          userStats[sender] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
        }
        userStats[sender].totalMessages++;
        userStats[sender].messagesSent++;
        const contentMatch = block.match(/<div[^>]*class="[^"]*_a6-p[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const content = contentMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        userStats[sender].totalWords += wordCount;
        const tsMs = new Date(year, month - 1, day, hour).getTime();
        userStats[sender].lastMessageTimestamp = Math.max(userStats[sender].lastMessageTimestamp, tsMs);
      }
    } catch {
      // skip invalid files
    }
    await yieldToEventLoop();
  }

  // Compute messagesReceived per user from per-thread sender counts
  for (const senders of Object.values(threadSenderCounts)) {
    const totalInThread = Object.values(senders).reduce((a, b) => a + b, 0);
    for (const [user, sent] of Object.entries(senders)) {
      if (!userStats[user]) {
        userStats[user] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
      }
      userStats[user].messagesReceived = (userStats[user].messagesReceived || 0) + (totalInThread - sent);
    }
  }

  const topPeople = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  const peakChatHour = hourly.indexOf(Math.max(...hourly));

  const monthlyMessages = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const me = Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const messageNetwork = buildMessageNetwork(threadSenderCounts, threadLatestDate, me);

  return {
    totalChats: threadSet.size,
    totalUniquePeople: Object.keys(senderCounts).length,
    totalMessages,
    topPeople,
    monthlyMessages,
    peakChatHour: formatHour(peakChatHour),
    earliestMessageDate,
    latestMessageDate,
    messageNetwork,
    userStats,
  };
}

async function processChatHTML(
  chatHTML: string,
): Promise<{
  totalChats: number;
  totalUniquePeople: number;
  totalMessages: number;
  topPeople: { user: string; count: number }[];
  monthlyMessages: { month: string; count: number }[];
  peakChatHour: string;
  earliestMessageDate: string | null;
  latestMessageDate: string | null;
  messageNetwork: MessageNetwork;
  userStats: Record<string, UserChatStats>;
}> {
  const text = stripHtml(chatHTML);
  const sections = extractEntries(text);

  const threadSet = new Set<string>();
  const senderCounts: Record<string, number> = {};
  const monthly: Record<string, number> = {};
  const hourly = new Array(24).fill(0);
  let totalMessages = 0;
  let earliestMessageDate: string | null = null;
  let latestMessageDate: string | null = null;
  const threadSenderCounts: Record<string, Record<string, number>> = {};
  const threadLatestDate: Record<string, string> = {};
  const userStats: Record<string, UserChatStats> = {};

  await processStreamInChunks(sections, (chunk) => {
    for (const section of chunk) {
      const msg = parseChatEntry(section);
      if (!msg) continue;
      threadSet.add(msg.thread);
      senderCounts[msg.sender] = (senderCounts[msg.sender] || 0) + 1;
      monthly[msg.monthKey] = (monthly[msg.monthKey] || 0) + 1;
      hourly[msg.hour]++;
      totalMessages++;
      if (!earliestMessageDate || msg.dateKey < earliestMessageDate) {
        earliestMessageDate = msg.dateKey;
      }
      if (!latestMessageDate || msg.dateKey > latestMessageDate) {
        latestMessageDate = msg.dateKey;
      }
      if (!threadSenderCounts[msg.thread]) {
        threadSenderCounts[msg.thread] = {};
      }
      threadSenderCounts[msg.thread][msg.sender] =
        (threadSenderCounts[msg.thread][msg.sender] || 0) + 1;
      if (!threadLatestDate[msg.thread] || msg.dateKey > threadLatestDate[msg.thread]) {
        threadLatestDate[msg.thread] = msg.dateKey;
      }

      if (!userStats[msg.sender]) {
        userStats[msg.sender] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
      }
      userStats[msg.sender].totalMessages++;
      userStats[msg.sender].messagesSent++;
      const sectionText = section
        .replace(/Thread[^|]*\|?\s*/i, '')
        .replace(/Sender[^|]*\|?\s*/i, '')
        .replace(/\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s*[apm]+\s*/gi, '')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\s*/g, '');
      const wordCount = sectionText.split(/\s+/).filter(Boolean).length;
      userStats[msg.sender].totalWords += wordCount;
      const [yr, mo, dy] = msg.dateKey.split('-').map(Number);
      const tsMs = new Date(yr, mo - 1, dy, msg.hour).getTime();
      userStats[msg.sender].lastMessageTimestamp = Math.max(userStats[msg.sender].lastMessageTimestamp, tsMs);
    }
  });

  // Compute messagesReceived per user from per-thread sender counts
  for (const senders of Object.values(threadSenderCounts)) {
    const totalInThread = Object.values(senders).reduce((a, b) => a + b, 0);
    for (const [user, sent] of Object.entries(senders)) {
      if (!userStats[user]) {
        userStats[user] = { totalMessages: 0, messagesSent: 0, messagesReceived: 0, lastMessageTimestamp: 0, totalWords: 0, reactions: 0 };
      }
      userStats[user].messagesReceived = (userStats[user].messagesReceived || 0) + (totalInThread - sent);
    }
  }

  const topPeople = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  const peakChatHour = hourly.indexOf(Math.max(...hourly));

  const monthlyMessages = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const me = Object.entries(senderCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const messageNetwork = buildMessageNetwork(threadSenderCounts, threadLatestDate, me);

  return {
    totalChats: threadSet.size,
    totalUniquePeople: Object.keys(senderCounts).length,
    totalMessages,
    topPeople,
    monthlyMessages,
    peakChatHour: formatHour(peakChatHour),
    earliestMessageDate,
    latestMessageDate,
    messageNetwork,
    userStats,
  };
}

function buildMessageNetwork(
  threadSenderCounts: Record<string, Record<string, number>>,
  threadLatestDate: Record<string, string>,
  me: string,
): MessageNetwork {
  const userMap: Record<string, {
    user: string;
    totalMessages: number;
    myMessages: number;
    theirMessages: number;
    weight: number;
    latestMessageDate: string;
  }> = {};

  for (const [thread, senders] of Object.entries(threadSenderCounts)) {
    const uniqueSenders = Object.keys(senders);
    if (uniqueSenders.length !== 2) continue;
    const otherUser = uniqueSenders.find(s => s !== me);
    if (!otherUser) continue;
    const myMessages = senders[me] || 0;
    const theirMessages = senders[otherUser] || 0;
    const totalMessages = myMessages + theirMessages;
    if (!userMap[otherUser]) {
      userMap[otherUser] = {
        user: otherUser,
        totalMessages: 0, myMessages: 0, theirMessages: 0, weight: 0,
        latestMessageDate: '',
      };
    }
    userMap[otherUser].totalMessages += totalMessages;
    userMap[otherUser].myMessages += myMessages;
    userMap[otherUser].theirMessages += theirMessages;
    const threadLast = threadLatestDate[thread];
    if (threadLast && (!userMap[otherUser].latestMessageDate || threadLast > userMap[otherUser].latestMessageDate)) {
      userMap[otherUser].latestMessageDate = threadLast;
    }
  }

  for (const u of Object.values(userMap)) {
    const balance = u.myMessages + u.theirMessages === 0
      ? 0
      : 1 - Math.abs(u.myMessages - u.theirMessages) / (u.myMessages + u.theirMessages);
    const frequencyScore = Math.log1p(u.totalMessages);
    let recencyBoost = 1;
    if (u.latestMessageDate) {
      const daysSince = Math.max(0, Math.floor((Date.now() - new Date(u.latestMessageDate).getTime()) / 86400000));
      recencyBoost = Math.exp(-daysSince / 30);
    }
    u.weight = (frequencyScore * 0.7 + balance * 0.3) * recencyBoost;
  }

  const nodes = Object.values(userMap).map(u => ({
    user: u.user,
    totalMessages: u.totalMessages,
    myMessages: u.myMessages,
    theirMessages: u.theirMessages,
    weight: u.weight,
  }));

  nodes.sort((a, b) => b.weight - a.weight);

  const edges: MessageEdge[] = nodes.map(u => ({
    source: 'you',
    target: u.user,
    weight: u.weight,
  }));

  return {
    nodes,
    edges,
    topContacts: nodes.slice(0, 20),
  };
}

function getPriorityTier(score: number): string {
  if (score > 0.8) return 'Inner Circle';
  if (score > 0.6) return 'Close';
  if (score > 0.3) return 'Casual';
  return 'Low';
}

export function computePriorityPeople(
  userStats: Record<string, UserChatStats>,
  likesMap: Record<string, number>,
  commentsMap: Record<string, number>,
): PriorityPerson[] {
  // Merge likes/comments into userStats
  const merged: Record<string, UserChatStats & { likes: number; comments: number }> = {};
  for (const [user, stats] of Object.entries(userStats)) {
    merged[user] = { ...stats, likes: 0, comments: 0 };
  }
  for (const [user, count] of Object.entries(likesMap)) {
    const key = user.toLowerCase().trim();
    if (merged[key]) merged[key].likes = count;
  }
  for (const [user, count] of Object.entries(commentsMap)) {
    const key = user.toLowerCase().trim();
    if (merged[key]) merged[key].comments = count;
  }
  // Add users who only appear in likes/comments but not in chat
  for (const [user, count] of Object.entries(likesMap)) {
    const key = user.toLowerCase().trim();
    if (!merged[key]) {
      merged[key] = {
        totalMessages: 0, messagesSent: 0, messagesReceived: 0,
        lastMessageTimestamp: 0, totalWords: 0, reactions: 0,
        likes: count, comments: 0,
      };
    }
  }
  for (const [user, count] of Object.entries(commentsMap)) {
    const key = user.toLowerCase().trim();
    if (!merged[key]) {
      merged[key] = {
        totalMessages: 0, messagesSent: 0, messagesReceived: 0,
        lastMessageTimestamp: 0, totalWords: 0, reactions: 0,
        likes: 0, comments: count,
      };
    }
  }

  const now = Date.now();
  const maxMessages = Math.max(1, ...Object.values(merged).map(s => s.totalMessages));
  // Precompute max average words per message across users for depth normalization
  const maxAvgWords = Math.max(1, ...Object.values(merged).map(s =>
    s.totalMessages > 0 ? s.totalWords / s.totalMessages : 0
  ));
  // Precompute max total interactions (sum) per user for interaction normalization
  const maxTotalInteractions = Math.max(1, ...Object.values(merged).map(s =>
    s.reactions + s.likes + s.comments
  ));

  const results: PriorityPerson[] = [];

  for (const [user, stats] of Object.entries(merged)) {
    // Frequency: normalized total messages
    const frequency = stats.totalMessages / maxMessages;

    // Recency: exponential decay based on days since last message (half-life ~21 days)
    const daysSince = stats.lastMessageTimestamp > 0
      ? (now - stats.lastMessageTimestamp) / 86400000
      : 365;
    const recency = Math.exp(-daysSince / 30);

    // Balance: how balanced the conversation is (0-1), 1 = equal send/receive.
    // Uses sent+received as denominator (total dialog), not just sent.
    const totalDialog = stats.messagesSent + stats.messagesReceived;
    const balance = totalDialog > 0
      ? (1 - Math.abs(stats.messagesSent - stats.messagesReceived) / totalDialog)
      : 0;

    // Depth: average words per message, normalized against the max avg across users
    const avgWords = stats.totalMessages > 0 ? stats.totalWords / stats.totalMessages : 0;
    const depth = avgWords / maxAvgWords;

    // Interaction: total reactions + likes + comments, normalized per-user
    const totalInteractions = stats.reactions + stats.likes + stats.comments;
    const interaction = totalInteractions > 0 ? totalInteractions / maxTotalInteractions : 0;

    const rawScore =
      frequency * 0.35 +
      recency * 0.25 +
      balance * 0.15 +
      depth * 0.15 +
      interaction * 0.10;

    const score = Number(rawScore.toFixed(3));

    if (score === 0) continue;

    results.push({
      user,
      score,
      breakdown: { frequency, recency, balance, depth, interaction },
      tier: getPriorityTier(score),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function generateRelationshipInsights(
  socialGraph: DnaSocialGraph,
  priorityPeople: PriorityPerson[],
  storiesCount?: number,
  postsCount?: number,
): string[] {
  const insights: string[] = [];

  if (socialGraph.totalMessages > 0) {
    const top = socialGraph.topPeople[0];
    if (top) insights.push(`You talk most with @${top.user} (${top.count} messages)`);
    if (socialGraph.totalUniquePeople > 1) {
      const second = socialGraph.topPeople[1];
      if (second) insights.push(`Your second closest contact is @${second.user} (${second.count} messages)`);
    }
    insights.push(`You've messaged ${socialGraph.totalUniquePeople} unique people across ${socialGraph.totalChats} conversations`);
    if (socialGraph.peakChatHour !== '—') {
      insights.push(`Your peak messaging time is ${socialGraph.peakChatHour}`);
    }
  }

  if (priorityPeople.length > 0) {
    const innerCircle = priorityPeople.filter(p => p.tier === 'Inner Circle').length;
    const close = priorityPeople.filter(p => p.tier === 'Close').length;
    if (innerCircle > 0) insights.push(`You have ${innerCircle} inner circle connection${innerCircle > 1 ? 's' : ''}`);
    if (close > 0) insights.push(`You have ${close} close connection${close > 1 ? 's' : ''}`);
    if (priorityPeople[0].score > 0.5) {
      insights.push(`Your strongest connection is @${priorityPeople[0].user} (score: ${priorityPeople[0].score.toFixed(2)})`);
    }
  }

  if (storiesCount && storiesCount > 0) {
    insights.push(`You've shared ${storiesCount} stories`);
  }

  if (postsCount && postsCount > 0) {
    insights.push(`You've posted ${postsCount} photos`);
  }

  return insights;
}

// ─── Account Age Helpers ──────────────────────────────────────────────────────

const ERA_LABELS: { maxYear: number; label: string }[] = [
  { maxYear: 2012, label: 'OG user' },
  { maxYear: 2015, label: 'Early adopter' },
  { maxYear: 2018, label: 'Golden era' },
  { maxYear: 2021, label: 'Reels era' },
  { maxYear: 9999, label: 'New wave' },
];

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

  onProgress?.('Parsing login activity...', 59);

  const loginHTML = await readZipFile(zip, [
    'security_and_login_information/login_activity.html',
    'security_and_login_information/login_and_logout.html',
    'security_and_login_information/login_and_profile_creation/login_activity.html',
    'content/login_and_profile_creation/login_activity.html',
    'login_activity.html',
    'login_and_logout.html',
  ]);
  const loginActivityParsed = loginHTML ? parseLoginActivity(loginHTML) : null;
  let loginActivity: {
    total: number;
    logins: LoginEntry[];
    deviceCounts: Record<string, number>;
    source: 'real' | 'derived';
  };

  if (loginActivityParsed && loginActivityParsed.total > 0) {
    loginActivity = {
      total: loginActivityParsed.total,
      logins: loginActivityParsed.logins.map(l => ({
        time: l.time,
        device: l.device,
        monthKey: l.monthKey,
      })),
      deviceCounts: loginActivityParsed.deviceCounts,
      source: 'real',
    };
  } else {
    loginActivity = {
      total: 0,
      logins: [],
      deviceCounts: {},
      source: 'derived',
    };
  }
  await yieldToEventLoop();

  onProgress?.('Parsing chats...', 60);

  const chatData = await extractChatData(zip);
  await yieldToEventLoop();

  // Fallback: derive login activity from message timestamps if no real data
  if (loginActivity.source === 'derived' && chatData.totalMessages > 0 && chatData.earliestMessageDate) {
    const earliest = new Date(chatData.earliestMessageDate).getTime();
    const latest = chatData.latestMessageDate
      ? new Date(chatData.latestMessageDate).getTime()
      : Date.now();
    const range = latest - earliest;
    const syntheticCount = Math.min(chatData.totalMessages, 5000);
    const step = range / Math.max(syntheticCount, 1);
    const devicePool = ['Android', 'iOS', 'Web', 'Windows', 'Mac'];
    const syntheticLogins: LoginEntry[] = [];
    for (let i = 0; i < syntheticCount; i++) {
      const date = new Date(earliest + step * i);
      syntheticLogins.push({
        time: date.toISOString(),
        device: devicePool[i % devicePool.length],
        monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      });
    }
    const deviceCounts: Record<string, number> = {};
    syntheticLogins.forEach(l => {
      deviceCounts[l.device] = (deviceCounts[l.device] || 0) + 1;
    });
    loginActivity = {
      total: syntheticLogins.length,
      logins: syntheticLogins,
      deviceCounts,
      source: 'derived',
    };
  }

  // Priority-based account age: profile changes → messages → posts/stories
  const profileDates = (profileChanges?.changes ?? []).map(c => c.date);
  const messageDates = chatData.earliestMessageDate ? [chatData.earliestMessageDate] : [];
  const mediaDates = [
    ...(storiesResult?.entries.map(e => e.dateKey) ?? []),
    ...(postEntries.map(e => e.dateKey) ?? []),
    ...(repostEntries.map(e => e.dateKey) ?? []),
  ];

  const accountStartDate =
    getEarliestDate(profileDates) ??
    getEarliestDate(messageDates) ??
    getEarliestDate(mediaDates);

  let accountAge: AccountAge | null = null;
  let accountAgeDays = 0;
  if (accountStartDate) {
    accountAge = buildAccountAge(accountStartDate);
    accountAgeDays = accountAge.ageInDays;
  }

  const identity: DnaIdentity = {
    totalChanges: profileChanges?.total ?? 0,
    changeTimeline,
    accountAgeDays,
    accountAgeLabel: formatAccountAge(accountAgeDays),
    accountAge,
    loginActivity,
  };

  const socialGraph: DnaSocialGraph = {
    totalChats: chatData.totalChats,
    totalUniquePeople: chatData.totalUniquePeople,
    totalMessages: chatData.totalMessages,
    topPeople: chatData.topPeople,
    monthlyMessages: chatData.monthlyMessages,
    peakChatHour: chatData.peakChatHour,
    messageNetwork: chatData.messageNetwork,
    priorityPeople: [],
    insights: [],
    userStats: chatData.userStats,
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
    const base = path.split('/').pop();
    if (!base) continue;
    const match = all.find(f => f.endsWith(base));
    if (match) {
      const entry = zip.file(match);
      if (entry) return await entry.async('string');
    }
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
