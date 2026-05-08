export type ViewerKind = 'image' | 'video';

export type ViewerItem = {
  uri: string;
  kind: ViewerKind;
};

function extFromUri(uri: string): string {
  const noQuery = uri.split('?')[0];
  const lower = noQuery.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return '';
  return lower.slice(dot + 1);
}

export function inferViewerKind(uri: string): ViewerKind {
  const ext = extFromUri(uri);
  if (ext === 'mp4' || ext === 'm4v' || ext === 'mov' || ext === 'webm') return 'video';
  return 'image';
}

export function buildViewerItems(uris: string[]): ViewerItem[] {
  return uris.map((u) => ({ uri: u, kind: inferViewerKind(u) }));
}

export function flattenMonthBuckets(posts: Record<string, string[]>): string[] {
  const monthSortKey = (k: string) => {
    const [y, m] = k.split('-').map((x) => Number(x));
    return (y || 0) * 100 + (m || 0);
  };

  const keys = Object.keys(posts);
  keys.sort((a, b) => monthSortKey(a) - monthSortKey(b));

  const out: string[] = [];
  for (const k of keys) {
    const arr = posts[k] ?? [];
    out.push(...arr);
  }
  return out;
}

