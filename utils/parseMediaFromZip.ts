import JSZip from 'jszip';
import { Platform } from 'react-native';
import { MediaStore } from './mediaTypes';


const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

function normPath(p: string) {
  return (p || '').replace(/\\/g, '/');
}

function toExt(path: string) {
  const n = normPath(path).toLowerCase();
  const idx = n.lastIndexOf('.');
  return idx >= 0 ? n.slice(idx) : '';
}

function isSupportedImageExt(path: string) {
  return IMAGE_EXT.has(toExt(path));
}

function isSupportedVideoExt(path: string) {
  return VIDEO_EXT.has(toExt(path));
}

function isSupportedMedia(path: string) {
  return isSupportedImageExt(path) || isSupportedVideoExt(path);
}

function extractYearMonth(path: string): string | null {
  // required: match /(\d{6})/
  const m = normPath(path).match(/\/(\d{6})\//);
  if (!m) return null;
  const ym = m[1]; // YYYYMM
  const year = ym.slice(0, 4);
  const month = ym.slice(4, 6);
  const monthNum = Number(month);
  if (!year || monthNum < 1 || monthNum > 12) return null;
  // UI expects "YYYY-MM"
  return `${year}-${month}`;
}

function mimeFromPath(path: string) {
  const ext = toExt(path).replace('.', '');
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return 'application/octet-stream';
}

async function getFileUri(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) return null;

  // required: web via blob + URL.createObjectURL
  if (Platform.OS === 'web') {
    const blob = await file.async('blob');
    return URL.createObjectURL(blob);
  }

  // required: native via base64 data URI
  const base64 = await file.async('base64');
  const mime = mimeFromPath(path);
  return `data:${mime};base64,${base64}`;
}

export async function extractMediaFromZip(zip: JSZip): Promise<MediaStore> {
  const allFiles = Object.keys(zip.files);

  console.log('[InstaInsight][MediaExtraction] 📁 TOTAL FILES:', allFiles.length);
  console.log(
    '[InstaInsight][MediaExtraction] 📁 ZIP FILE SAMPLE (first 50):',
    allFiles.slice(0, 50)
  );

  // Gallery posts: keep URI-based extraction for now.
  const postPaths = allFiles.filter(
    (f) =>
      normPath(f).includes('media/archived_posts/') &&
      isSupportedImageExt(f) &&
      !zip.files[f]?.dir
  );

  let postsGrouped: MediaStore['posts'] = {};
  let postsUrisCount = 0;

  const dedupePosts = new Set<string>();
  const CONCURRENCY = 6;

  type PostExtracted = { ym: string; uri: string; key: string };

  async function extractPostsIntoBatches(paths: string[]) {
    for (let i = 0; i < paths.length; i += CONCURRENCY) {
      const batch = paths.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        batch.map(async (p): Promise<PostExtracted | null> => {
          const ym = extractYearMonth(p);
          if (!ym) return null;

          const uri = await getFileUri(zip, p);
          if (!uri) return null;

          const key = `posts:${ym}:${p}`;
          if (dedupePosts.has(key)) return null;
          dedupePosts.add(key);

          return { ym, uri, key };
        })
      );

      for (const r of results) {
        if (!r) continue;
        postsGrouped[r.ym] = postsGrouped[r.ym] || [];
        postsGrouped[r.ym].push(r.uri);
        postsUrisCount++;
      }
    }
  }

  await extractPostsIntoBatches(postPaths);

  // Stories: metadata-only (no blob/object URLs, no data URIs).
  // store: monthKey -> [zipPath], and zipPath -> type.
  const storyMetaPathsByMonth: Record<string, string[]> = {};
  const storyTypesByPath: Record<string, 'image' | 'video'> = {};

  const storyCandidatePaths = allFiles.filter((f) => {
    const filePath = normPath(f);
    if (!filePath.toLowerCase().includes('media/stories/')) return false;
    if (zip.files[f]?.dir) return false;
    return isSupportedMedia(f);
  });

  console.log(
    '[InstaInsight][MediaExtraction] 📂 STORY FILE CANDIDATE COUNT:',
    storyCandidatePaths.length
  );

  const dedupeStories = new Set<string>();

  for (const p of storyCandidatePaths) {
    const ym = extractYearMonth(p);
    if (!ym) continue;

    const type: 'image' | 'video' = isSupportedVideoExt(p) ? 'video' : 'image';
    const key = `stories:${ym}:${p}`;
    if (dedupeStories.has(key)) continue;
    dedupeStories.add(key);

    storyMetaPathsByMonth[ym] = storyMetaPathsByMonth[ym] || [];
    storyMetaPathsByMonth[ym].push(p);
    storyTypesByPath[p] = type;
  }

  const storyCount = Object.values(storyMetaPathsByMonth).reduce((a, b) => a + (b?.length ?? 0), 0);

  console.log(
    '[InstaInsight][MediaExtraction] ✅ Stories grouped months:',
    Object.keys(storyMetaPathsByMonth)
  );
  console.log(
    '[InstaInsight][MediaExtraction] ✅ Stories total paths:',
    storyCount
  );
  console.log('[InstaInsight][MediaExtraction] Post files:', postPaths.length);
  console.log('[InstaInsight][MediaExtraction] Post grouped months:', Object.keys(postsGrouped));
  console.log('[InstaInsight][MediaExtraction] Post URIs:', postsUrisCount);

  // Persist legacy `stories` shape (month -> [string]) but keep it metadata-only.
  const storiesLegacy: MediaStore['stories'] = storyMetaPathsByMonth as unknown as MediaStore['stories'];

  return {
    posts: postsGrouped,
    stories: storiesLegacy,
    processedAt: Date.now(),
    meta: {
      postsCount: postsUrisCount,
      storiesPathsCount: storyCount,
      storiesPathsByMonth: storyMetaPathsByMonth,
      storiesTypesByPath: storyTypesByPath,
    } as any,
  };
}




