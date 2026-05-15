export function calculateFollowStats(followers: string[], following: string[]) {
  const followerSet = new Set(followers);
  const followingSet = new Set(following);

  // Mutual - both follow each other
  const mutual = followers.filter((user) => followingSet.has(user));

  // Not following back - they follow you but you don't follow them
  const notFollowingBack = followers.filter((user) => !followingSet.has(user));

  // Pending request - you follow them but they haven't accepted yet
  const pendingRequest = following.filter((user) => !followerSet.has(user));

  return {
    mutual,
    notFollowingBack,
    pendingRequest,
    counts: {
      mutual: mutual.length,
      notFollowingBack: notFollowingBack.length,
      pendingRequest: pendingRequest.length,
      totalFollowers: followers.length,
      totalFollowing: following.length,
    },
  };
}

