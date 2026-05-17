import type { TimelineMonth, UserCount } from '../types/instagram';

export function getRecentTimeline(timeline: TimelineMonth[], months = 12) {
  return timeline.slice(-months);
}

export function sumTimelineRange(timeline: TimelineMonth[], from: string, to: string) {
  return timeline
    .filter(m => m.month >= from && m.month <= to)
    .reduce((acc, m) => ({
      postComments:  acc.postComments  + m.postComments,
      reelComments:  acc.reelComments  + m.reelComments,
      polls:         acc.polls         + m.polls,
      questions:     acc.questions     + m.questions,
      logins:        acc.logins        + m.logins,
    }), { postComments:0, reelComments:0, polls:0, questions:0, logins:0 });
}

export function topN(users: UserCount[], n = 10) {
  return [...users].sort((a, b) => b.count - a.count).slice(0, n);
}

export const DEVICE_ICONS: Record<string, string> = {
  Android:    'phone-android',
  iOS:        'phone-iphone',
  Windows:    'computer',
  Mac:        'laptop-mac',
  'Web/Other':'language',
  Unknown:    'devices',
};

export const DEVICE_COLORS: Record<string, string> = {
  Android:    '#5DCAA5',
  iOS:        '#7F77DD',
  Windows:    '#85B7EB',
  Mac:        '#EF9F27',
  'Web/Other':'#B4B2A9',
  Unknown:    '#D3D1C7',
};
