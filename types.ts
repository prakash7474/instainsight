export type UserCount = {
  user: string;
  count: number;
};

export type CombinedUser = {
  user: string;
  posts: number;
  comments: number;
  total: number;
};

export type InstagramData = {
  totalLikedPosts: number;
  totalLikedComments: number;
  topPostUsers: UserCount[];
  topCommentUsers: UserCount[];
  topCombinedUsers: CombinedUser[];
};
