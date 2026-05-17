import { describe, it, expect } from 'vitest'
import { extractUsernamesFromHtml, computeInsights, parseInstagramZip } from '../instagramZipParser'
import {
  normalize,
  uniqueUsers,
  getMutuals,
  getNotFollowingBack,
  getFans,
  buildAnalytics,
  validateAnalytics,
} from '../instagramAnalyticsUtils'
import type { User, AnalyticsSection } from '../instagramAnalyticsUtils'
import JSZip from 'jszip'

// ── extractUsernamesFromHtml ─────────────────────────────────

describe('extractUsernamesFromHtml', () => {
  it('extracts usernames from anchor tags', () => {
    const html = `
      <a href="https://www.instagram.com/alice/">Alice</a>
      <a href="https://www.instagram.com/bob/">Bob</a>
    `
    expect(extractUsernamesFromHtml(html)).toEqual(['alice', 'bob'])
  })

  it('removes trailing slashes', () => {
    const html = '<a href="https://www.instagram.com/testuser/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual(['testuser'])
  })

  it('handles www prefix', () => {
    const html = '<a href="https://www.instagram.com/user1/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual(['user1'])
  })

  it('handles no www prefix', () => {
    const html = '<a href="https://instagram.com/user1/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual(['user1'])
  })

  it('deduplicates preserving order', () => {
    const html = `
      <a href="https://www.instagram.com/alice/">A</a>
      <a href="https://www.instagram.com/bob/">B</a>
      <a href="https://www.instagram.com/alice/">C</a>
    `
    expect(extractUsernamesFromHtml(html)).toEqual(['alice', 'bob'])
  })

  it('lowercases usernames', () => {
    const html = '<a href="https://www.instagram.com/Alice/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual(['alice'])
  })

  it('returns empty for no links', () => {
    expect(extractUsernamesFromHtml('<html></html>')).toEqual([])
  })

  it('skips non-instagram links', () => {
    const html = '<a href="https://example.com/user/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual([])
  })

  it('skips short usernames (< 2 chars)', () => {
    const html = '<a href="https://www.instagram.com/a/">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual([])
  })

  it('handles href with query params', () => {
    const html = '<a href="https://www.instagram.com/user1/?hl=en">text</a>'
    expect(extractUsernamesFromHtml(html)).toEqual(['user1'])
  })

  it('handles empty string input', () => {
    expect(extractUsernamesFromHtml('')).toEqual([])
  })
})

// ── computeInsights ─────────────────────────────────────────

describe('computeInsights', () => {
  it('computes notFollowingBack, youDontFollowBack, mutuals', () => {
    const followers = ['alice', 'bob', 'charlie']
    const following = ['alice', 'bob', 'dave']

    const result = computeInsights(followers, following)

    expect(result.notFollowingBack).toEqual(['dave'])
    expect(result.youDontFollowBack).toEqual(['charlie'])
    expect(result.mutuals).toEqual(['alice', 'bob'])
  })

  it('handles empty arrays', () => {
    const result = computeInsights([], [])
    expect(result.notFollowingBack).toEqual([])
    expect(result.youDontFollowBack).toEqual([])
    expect(result.mutuals).toEqual([])
  })

  it('handles all mutual', () => {
    const followers = ['alice', 'bob']
    const following = ['alice', 'bob']
    const result = computeInsights(followers, following)
    expect(result.notFollowingBack).toEqual([])
    expect(result.youDontFollowBack).toEqual([])
    expect(result.mutuals).toEqual(['alice', 'bob'])
  })
})

// ── normalize ───────────────────────────────────────────────

describe('normalize', () => {
  it('lowercases and trims', () => {
    expect(normalize('  Alice/  ')).toBe('alice/')
  })

  it('removes leading @', () => {
    expect(normalize('@alice')).toBe('alice')
  })

  it('returns empty for empty input', () => {
    expect(normalize('')).toBe('')
  })
})

// ── uniqueUsers ─────────────────────────────────────────────

describe('uniqueUsers', () => {
  it('deduplicates by normalized username', () => {
    const users: User[] = [
      { username: 'Alice' },
      { username: 'alice' },
      { username: 'BOB' },
      { username: 'bob' },
    ]
    const result = uniqueUsers(users)
    expect(result).toHaveLength(2)
    expect(result[0].username).toBe('alice')
    expect(result[1].username).toBe('bob')
  })

  it('preserves first occurrence order', () => {
    const users: User[] = [
      { username: 'charlie' },
      { username: 'alice' },
      { username: 'charlie' },
      { username: 'bob' },
    ]
    const result = uniqueUsers(users)
    expect(result.map((u) => u.username)).toEqual(['charlie', 'alice', 'bob'])
  })

  it('handles empty array', () => {
    expect(uniqueUsers([])).toEqual([])
  })
})

// ── getMutuals / getNotFollowingBack / getFans ──────────────

function toUsers(names: string[]): User[] {
  return names.map((n) => ({ username: n }))
}

describe('getMutuals', () => {
  it('finds users in both lists', () => {
    const followers = toUsers(['alice', 'bob', 'charlie'])
    const following = toUsers(['alice', 'bob', 'dave'])
    const result = getMutuals(followers, following)
    expect(result.count).toBe(2)
    const usernames = result.users.map((u) => u.username).sort()
    expect(usernames).toEqual(['alice', 'bob'])
  })
})

describe('getNotFollowingBack', () => {
  it('finds users you follow who dont follow you', () => {
    const followers = toUsers(['alice', 'bob'])
    const following = toUsers(['alice', 'charlie', 'dave'])
    const result = getNotFollowingBack(followers, following)
    expect(result.count).toBe(2)
    const usernames = result.users.map((u) => u.username)
    expect(usernames).toEqual(['charlie', 'dave'])
  })
})

describe('getFans', () => {
  it('finds users who follow you but you dont follow back', () => {
    const followers = toUsers(['alice', 'bob', 'charlie'])
    const following = toUsers(['alice', 'dave'])
    const result = getFans(followers, following)
    expect(result.count).toBe(2)
    const usernames = result.users.map((u) => u.username)
    expect(usernames).toEqual(['bob', 'charlie'])
  })
})

// ── validateAnalytics ───────────────────────────────────────

describe('validateAnalytics', () => {
  it('returns valid=true when sums match', () => {
    const analytics = {
      followers: { count: 5, users: [] },
      following: { count: 4, users: [] },
      mutuals: { count: 2, users: [] },
      notFollowingBack: { count: 2, users: [] },
      fans: { count: 3, users: [] },
    }
    const result = validateAnalytics(analytics)
    expect(result.valid).toBe(true)
    expect(result.followingValid).toBe(true)
    expect(result.followersValid).toBe(true)
  })

  it('returns valid=false when following sum mismatches', () => {
    const analytics = {
      followers: { count: 5, users: [] },
      following: { count: 4, users: [] },
      mutuals: { count: 2, users: [] },
      notFollowingBack: { count: 1, users: [] },
      fans: { count: 3, users: [] },
    }
    const result = validateAnalytics(analytics)
    expect(result.valid).toBe(false)
    expect(result.followingValid).toBe(false)
  })

  it('returns valid=false when followers sum mismatches', () => {
    const analytics = {
      followers: { count: 5, users: [] },
      following: { count: 4, users: [] },
      mutuals: { count: 2, users: [] },
      notFollowingBack: { count: 2, users: [] },
      fans: { count: 2, users: [] },
    }
    const result = validateAnalytics(analytics)
    expect(result.valid).toBe(false)
    expect(result.followersValid).toBe(false)
  })
})

// ── buildAnalytics (integration) ────────────────────────────

describe('buildAnalytics', () => {
  it('builds full analytics from user arrays', () => {
    const followers = toUsers(['alice', 'bob', 'charlie'])
    const following = toUsers(['alice', 'bob', 'dave'])
    const blocked = toUsers(['spammer'])
    const closeFriends = toUsers(['alice'])

    const result = buildAnalytics({ followers, following, blocked, closeFriends })

    expect(result.followers.count).toBe(3)
    expect(result.following.count).toBe(3)
    expect(result.mutuals.count).toBe(2)
    expect(result.notFollowingBack.count).toBe(1)
    expect(result.fans.count).toBe(1)
    expect(result.blocked.count).toBe(1)
    expect(result.closeFriends.count).toBe(1)

    expect(result.notFollowingBack.users[0].username).toBe('dave')
    expect(result.fans.users[0].username).toBe('charlie')
    expect(result.blocked.users[0].username).toBe('spammer')
  })

  it('handles empty input gracefully', () => {
    const result = buildAnalytics({ followers: [], following: [] })
    expect(result.followers.count).toBe(0)
    expect(result.following.count).toBe(0)
    expect(result.mutuals.count).toBe(0)
    expect(result.notFollowingBack.count).toBe(0)
    expect(result.fans.count).toBe(0)
  })
})

// ── parseInstagramZip (integration with JSZip) ─────────────

describe('parseInstagramZip', () => {
  async function createMockZip(files: Record<string, string>): Promise<JSZip> {
    const zip = new JSZip()
    for (const [path, content] of Object.entries(files)) {
      zip.file(path, content)
    }
    return zip
  }

  it('parses followers_1.html and following.html', async () => {
    const zip = await createMockZip({
      'connections/followers_and_following/followers_1.html':
        '<a href="https://www.instagram.com/alice/">A</a><a href="https://www.instagram.com/bob/">B</a>',
      'connections/followers_and_following/following.html':
        '<a href="https://www.instagram.com/alice/">A</a><a href="https://www.instagram.com/charlie/">C</a>',
    })
    const result = await parseInstagramZip(zip)
    expect(result.followers).toEqual(['alice', 'bob'])
    expect(result.following).toEqual(['alice', 'charlie'])
  })

  it('returns empty arrays for missing files', async () => {
    const zip = await createMockZip({})
    const result = await parseInstagramZip(zip)
    expect(result.followers).toEqual([])
    expect(result.following).toEqual([])
    expect(result.blocked).toEqual([])
    expect(result.closeFriends).toEqual([])
  })

  it('parses close_friends.html', async () => {
    const zip = await createMockZip({
      'connections/followers_and_following/followers_1.html': '<a href="https://www.instagram.com/alice/">A</a>',
      'connections/followers_and_following/following.html': '<a href="https://www.instagram.com/alice/">A</a>',
      'connections/followers_and_following/close_friends.html':
        '<a href="https://www.instagram.com/best_friend/">BF</a>',
    })
    const result = await parseInstagramZip(zip)
    expect(result.closeFriends).toEqual(['best_friend'])
  })

  it('parses all insight files', async () => {
    const zip = await createMockZip({
      'connections/followers_and_following/followers_1.html':
        '<a href="https://www.instagram.com/f1/">f1</a><a href="https://www.instagram.com/f2/">f2</a>',
      'connections/followers_and_following/following.html':
        '<a href="https://www.instagram.com/g1/">g1</a>',
      'connections/followers_and_following/blocked_profiles.html':
        '<a href="https://www.instagram.com/b1/">b1</a>',
      'connections/followers_and_following/restricted_profiles.html':
        '<a href="https://www.instagram.com/r1/">r1</a>',
      'connections/followers_and_following/close_friends.html':
        '<a href="https://www.instagram.com/c1/">c1</a>',
      'connections/followers_and_following/recently_unfollowed_profiles.html':
        '<a href="https://www.instagram.com/u1/">u1</a>',
      'connections/followers_and_following/recent_follow_requests.html':
        '<a href="https://www.instagram.com/req1/">req1</a>',
      'connections/followers_and_following/removed_suggestions.html':
        '<a href="https://www.instagram.com/s1/">s1</a>',
      'connections/followers_and_following/pending_follow_requests.html':
        '<a href="https://www.instagram.com/p1/">p1</a>',
      'connections/followers_and_following/following_hashtags.html':
        '<a href="https://www.instagram.com/explore/tags/travel/">travel</a>',
    })
    const result = await parseInstagramZip(zip)
    expect(result.followers).toEqual(['f1', 'f2'])
    expect(result.following).toEqual(['g1'])
    expect(result.blocked).toEqual(['b1'])
    expect(result.restricted).toEqual(['r1'])
    expect(result.closeFriends).toEqual(['c1'])
    expect(result.recentlyUnfollowed).toEqual(['u1'])
    expect(result.recentRequests).toEqual(['req1'])
    expect(result.removedSuggestions).toEqual(['s1'])
    expect(result.pendingRequests).toEqual(['p1'])
    expect(result.hashtags).toEqual(['travel'])
  })
})
