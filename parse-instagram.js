const fs = require('fs');
const { JSDOM } = require('jsdom');

const FIELD_LABELS = new Set(['Name','URL','Caption','Owner','Username','Hashtags']);

function parseLikedPosts(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const dom = new JSDOM(html);
  const main = dom.window.document.querySelector('main');
  if (!main) return { total: 0, userCounts: {} };

  const postDivs = Array.from(main.children);
  const userCounts = {};

  postDivs.forEach(div => {
    const ownerH2 = Array.from(div.querySelectorAll('h2'))
      .find(h => h.textContent.trim() === 'Owner');

    if (!ownerH2) return;

    const ownerSection = ownerH2.parentElement;
    const rawText = ownerSection.textContent;

    const match = rawText.match(/Username([^\n]+?)(?:Name|URL|Caption|Owner|Hashtags|$)/);
    if (!match) return;

    const username = match[1].trim();

    if (!username || FIELD_LABELS.has(username)) return;

    userCounts[username] = (userCounts[username] || 0) + 1;
  });

  return { total: postDivs.length, userCounts };
}

function parseLikedComments(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const dom = new JSDOM(html);
  const headings = dom.window.document.querySelectorAll('h2._3-95._2pim._a6-h._a6-i');
  const userCounts = {};

  headings.forEach(h => {
    const username = h.textContent.trim();
    if (username && !FIELD_LABELS.has(username)) {
      userCounts[username] = (userCounts[username] || 0) + 1;
    }
  });

  return { total: headings.length, userCounts };
}

function topUsers(userCounts, limit = 15) {
  return Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([user, count]) => ({ user, count }));
}

function combinedTopUsers(postCounts, commentCounts, limit = 15) {
  const map = {};
  Object.entries(postCounts).forEach(([u, c]) => {
    map[u] = { posts: c, comments: 0 };
  });
  Object.entries(commentCounts).forEach(([u, c]) => {
    if (!map[u]) map[u] = { posts: 0, comments: 0 };
    map[u].comments += c;
  });
  return Object.entries(map)
    .map(([user, v]) => ({
      user,
      posts: v.posts,
      comments: v.comments,
      total: v.posts + v.comments,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

const args = process.argv.slice(2);
const posts    = parseLikedPosts(args[0] || './liked_posts.html');
const comments = parseLikedComments(args[1] || './liked_comments.html');

const output = {
  summary: {
    totalLogins: 0, totalLogouts: 0, totalPostComments: 0, totalReelComments: 0,
    totalPolls: 0, totalQuestions: 0,
    totalLikedPosts: posts.total, totalLikedComments: comments.total,
  },
  loginHistory: [],
  deviceCounts: {},
  timeline: [],
  topLikedPostUsers: topUsers(posts.userCounts),
  topLikedCmtUsers: topUsers(comments.userCounts),
  topCommentedOn: [],
  topCombined: combinedTopUsers(posts.userCounts, comments.userCounts).map(u => ({
    user: u.user, total: u.total,
    likedPosts: u.posts, likedComments: u.comments, commented: 0,
  })),
};

fs.writeFileSync('./instagram-data.json', JSON.stringify(output, null, 2));
console.log(`Done. ${posts.total} posts, ${comments.total} comments, ${Object.keys(posts.userCounts).length} unique post authors.`);
