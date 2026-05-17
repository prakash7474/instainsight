export type LoginEntry = {
  time: string;
  device: 'Android' | 'iOS' | 'Windows' | 'Mac' | 'Web/Other' | 'Unknown';
  ip: string;
  userAgent: string;
};

export type TimelineMonth = {
  month: string;
  label: string;
  postComments: number;
  reelComments: number;
  polls: number;
  questions: number;
  logins: number;
  likedPosts: number;
};

export type UserCount = {
  user: string;
  count: number;
};

export type CombinedUser = {
  user: string;
  total: number;
  likedPosts: number;
  likedComments: number;
  commented: number;
};

export type InstagramData = {
  summary: {
    totalLogins: number;
    totalLogouts: number;
    totalPostComments: number;
    totalReelComments: number;
    totalPolls: number;
    totalQuestions: number;
    totalLikedPosts: number;
    totalLikedComments: number;
  };
  loginHistory: LoginEntry[];
  deviceCounts: Record<string, number>;
  timeline: TimelineMonth[];
  topLikedPostUsers: UserCount[];
  topLikedCmtUsers: UserCount[];
  topCommentedOn: UserCount[];
  topCombined: CombinedUser[];
};
