const fs = require('fs');
const { JSDOM } = require('jsdom');

function readHTML(path) {
  const html = fs.readFileSync(path, 'utf-8');
  return new JSDOM(html).window.document;
}

function getEntries(doc) {
  return Array.from(doc.querySelectorAll('main .pam._3-95._2ph-._a6-g'));
}

function extractField(text, key) {
  const m = text.match(new RegExp(`${key}\\|?\\n?([^|\\n]+)`));
  return m ? m[1].trim() : null;
}

function parseMonthKey(timeStr) {
  const months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  const m = timeStr.match(/(\w{3})\s+\d+,\s+(\d{4})/);
  if (!m) return null;
  return `${m[2]}-${months[m[1]] || '00'}`;
}

function parseDevice(userAgent) {
  if (!userAgent) return 'Unknown';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iOS/i.test(userAgent)) return 'iOS';
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  return 'Web/Other';
}

function parseLoginActivity(path) {
  const doc = readHTML(path);
  const entries = getEntries(doc);
  const logins = [];

  entries.forEach(el => {
    const parts = el.textContent.split('|').map(s => s.trim()).filter(Boolean);
    const text  = parts.join('|');

    const time      = extractField(text, 'Time');
    const userAgent = extractField(text, 'User agent');
    const ip        = extractField(text, 'IP address');

    if (!time) return;

    logins.push({
      time,
      monthKey: parseMonthKey(time),
      device:   parseDevice(userAgent),
      ip:       ip || '',
      userAgent: userAgent || '',
    });
  });

  const deviceCounts = {};
  logins.forEach(l => {
    deviceCounts[l.device] = (deviceCounts[l.device] || 0) + 1;
  });

  const monthly = {};
  logins.forEach(l => {
    if (l.monthKey) monthly[l.monthKey] = (monthly[l.monthKey] || 0) + 1;
  });

  return { total: logins.length, logins, deviceCounts, monthly };
}

function parseLogoutActivity(path) {
  const doc     = readHTML(path);
  const entries = getEntries(doc);
  const logouts = [];

  entries.forEach(el => {
    const text = el.textContent.split('|').map(s => s.trim()).filter(Boolean).join('|');
    const time      = extractField(text, 'Time');
    const userAgent = extractField(text, 'User agent');
    const ip        = extractField(text, 'IP address');
    if (!time) return;
    logouts.push({ time, device: parseDevice(userAgent), ip: ip || '' });
  });

  return { total: logouts.length, logouts };
}

function parsePostComments(path) {
  const doc     = readHTML(path);
  const entries = getEntries(doc);
  const comments = [];
  const targetCounts = {};
  const monthly = {};

  entries.forEach(el => {
    const text = el.textContent.split('|').map(s => s.trim()).filter(Boolean).join('|');
    const comment = extractField(text, 'Comment');
    const owner   = extractField(text, 'Media Owner');
    const time    = extractField(text, 'Time');
    if (!time) return;

    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    if (owner) targetCounts[owner] = (targetCounts[owner] || 0) + 1;

    comments.push({ comment: comment || '', owner: owner || '', time, monthKey: mk });
  });

  const topTargets = Object.entries(targetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([user, count]) => ({ user, count }));

  return { total: comments.length, comments, topTargets, monthly };
}

function parseReelsComments(path) {
  const doc     = readHTML(path);
  const entries = getEntries(doc);
  const comments = [];
  const monthly = {};

  entries.forEach(el => {
    const text  = el.textContent.split('|').map(s => s.trim()).filter(Boolean).join('|');
    const comment = extractField(text, 'Comment');
    const owner   = extractField(text, 'Media Owner');
    const time    = extractField(text, 'Time');
    if (!time) return;
    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    comments.push({ comment: comment || '', owner: owner || '', time, monthKey: mk });
  });

  return { total: comments.length, comments, monthly };
}

function parsePolls(path) {
  const doc     = readHTML(path);
  const entries = getEntries(doc);
  const polls = [];
  const monthly = {};

  entries.forEach(el => {
    const text = el.textContent;
    const m = text.match(/(\w{3}\s+\d+,\s+\d{4}\s+\d+:\d+\s+[apm]+)/i);
    if (!m) return;
    const time = m[1];
    const mk   = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    polls.push({ time, monthKey: mk });
  });

  return { total: polls.length, polls, monthly };
}

function parseQuestions(path) {
  const doc     = readHTML(path);
  const entries = getEntries(doc);
  const questions = [];
  const monthly = {};
  const seen = new Set();

  entries.forEach(el => {
    const text = el.textContent.split('|').map(s => s.trim()).filter(Boolean).join('|');
    const time   = extractField(text, 'Update time');
    const answer = extractField(text, 'Answer');

    const uMatch = text.match(/Username([^\n|]+?)(?:Name|URL|Caption|Owner|Hashtags|$)/);
    const toUser = uMatch ? uMatch[1].trim() : '';

    if (!time || seen.has(time + answer)) return;
    seen.add(time + answer);

    const mk = parseMonthKey(time);
    if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    questions.push({ time, answer: answer || '', to: toUser, monthKey: mk });
  });

  return { total: questions.length, questions, monthly };
}

function parseLikedPosts(path) {
  const html = fs.readFileSync(path, 'utf-8');
  const doc  = new JSDOM(html).window.document;
  const main = doc.querySelector('main');
  if (!main) return { total: 0, topUsers: [], userCounts: {}, monthly: {} };

  const postDivs = Array.from(main.children);
  const userCounts = {};
  const monthly = {};
  const FIELD_LABELS = new Set(['Name','URL','Caption','Owner','Username','Hashtags']);

  postDivs.forEach(div => {
    const ownerH2 = Array.from(div.querySelectorAll('h2'))
      .find(h => h.textContent.trim() === 'Owner');
    if (!ownerH2) return;

    const rawText = ownerH2.parentElement.textContent;
    const uMatch  = rawText.match(/Username([^\n]+?)(?:Name|URL|Caption|Owner|Hashtags|$)/);
    if (!uMatch) return;

    const username = uMatch[1].trim();
    if (!username || FIELD_LABELS.has(username)) return;

    userCounts[username] = (userCounts[username] || 0) + 1;

    const timeDiv = Array.from(div.querySelectorAll('div'))
      .find(d => /\w{3}\s+\d+,\s+\d{4}/.test(d.textContent.trim())
             && d.children.length === 0);
    if (timeDiv) {
      const mk = parseMonthKey(timeDiv.textContent.trim());
      if (mk) monthly[mk] = (monthly[mk] || 0) + 1;
    }
  });

  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  return { total: postDivs.length, topUsers, userCounts, monthly };
}

function parseLikedComments(path) {
  const doc      = readHTML(path);
  const headings = doc.querySelectorAll('h2._3-95._2pim._a6-h._a6-i');
  const userCounts = {};
  const FIELD_LABELS = new Set(['Name','URL','Caption','Owner','Username','Hashtags']);

  headings.forEach(h => {
    const username = h.textContent.trim();
    if (username && !FIELD_LABELS.has(username))
      userCounts[username] = (userCounts[username] || 0) + 1;
  });

  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([user, count]) => ({ user, count }));

  return { total: headings.length, topUsers, userCounts };
}

function buildMonthlyTimeline(sources) {
  const allMonths = new Set();
  Object.values(sources).forEach(s => {
    if (s.monthly) Object.keys(s.monthly).forEach(m => allMonths.add(m));
  });

  const sorted = Array.from(allMonths).sort();

  return sorted.map(month => ({
    month,
    label: formatMonthLabel(month),
    postComments:  sources.postComments?.monthly?.[month]  || 0,
    reelComments:  sources.reelComments?.monthly?.[month]  || 0,
    polls:         sources.polls?.monthly?.[month]         || 0,
    questions:     sources.questions?.monthly?.[month]     || 0,
    logins:        sources.logins?.monthly?.[month]        || 0,
    likedPosts:    sources.likedPosts?.monthly?.[month]    || 0,
  }));
}

function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[+m - 1]}'${y.slice(2)}`;
}

function buildCombinedTopUsers(likedPostUsers, likedCommentUsers, commentedOnUsers) {
  const map = {};

  likedPostUsers.forEach(({ user, count }) => {
    if (!map[user]) map[user] = { likedPosts: 0, likedComments: 0, commented: 0 };
    map[user].likedPosts += count;
  });
  likedCommentUsers.forEach(({ user, count }) => {
    if (!map[user]) map[user] = { likedPosts: 0, likedComments: 0, commented: 0 };
    map[user].likedComments += count;
  });
  commentedOnUsers.forEach(({ user, count }) => {
    if (!map[user]) map[user] = { likedPosts: 0, likedComments: 0, commented: 0 };
    map[user].commented += count;
  });

  return Object.entries(map)
    .map(([user, v]) => ({
      user,
      likedPosts:    v.likedPosts,
      likedComments: v.likedComments,
      commented:     v.commented,
      total:         v.likedPosts + v.likedComments + v.commented,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
}

const args = process.argv.slice(2);

const loginData    = parseLoginActivity(args[0] || './instagram-export/security_and_login_information/login_and_profile_creation/login_activity.html');
const logoutData   = parseLogoutActivity(args[1] || './instagram-export/security_and_login_information/login_and_profile_creation/logout_activity.html');
const postCmts     = parsePostComments(args[2] || './instagram-export/your_instagram_activity/comments/post_comments_1.html');
const reelCmts     = parseReelsComments(args[3] || './instagram-export/your_instagram_activity/comments/reels_comments.html');
const pollData     = parsePolls(args[4] || './instagram-export/your_instagram_activity/story_interactions/polls.html');
const questionData = parseQuestions(args[5] || './instagram-export/your_instagram_activity/story_interactions/questions.html');
const likedPosts   = parseLikedPosts(args[6] || './instagram-export/your_instagram_activity/likes/liked_posts.html');
const likedCmts    = parseLikedComments(args[7] || './instagram-export/your_instagram_activity/likes/liked_comments.html');

const timeline = buildMonthlyTimeline({
  postComments: postCmts,
  reelComments: reelCmts,
  polls:        pollData,
  questions:    questionData,
  logins:       loginData,
  likedPosts:   likedPosts,
});

const topCombined = buildCombinedTopUsers(
  likedPosts.topUsers,
  likedCmts.topUsers,
  postCmts.topTargets,
);

const output = {
  summary: {
    totalLogins:           loginData.total,
    totalLogouts:          logoutData.total,
    totalPostComments:     postCmts.total,
    totalReelComments:     reelCmts.total,
    totalPolls:            pollData.total,
    totalQuestions:        questionData.total,
    totalLikedPosts:       likedPosts.total,
    totalLikedComments:    likedCmts.total,
  },
  loginHistory:      loginData.logins,
  deviceCounts:      loginData.deviceCounts,
  timeline,
  topLikedPostUsers: likedPosts.topUsers,
  topLikedCmtUsers:  likedCmts.topUsers,
  topCommentedOn:    postCmts.topTargets,
  topCombined,
};

fs.writeFileSync('./instagram-data.json', JSON.stringify(output, null, 2));
console.log('Done!');
console.log('Summary:', output.summary);
