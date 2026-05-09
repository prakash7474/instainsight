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

  const storyPaths = allFiles.filter(
    (f) =>
      normPath(f).includes('media/stories/') &&
      isSupportedMedia(f) &&
      !zip.files[f]?.dir
  );
  const postPaths = allFiles.filter(
    (f) =>
      normPath(f).includes('media/archived_posts/') &&
      // required: filter gallery posts (images). Keep videos out for gallery to avoid broken Image rendering.
      isSupportedImageExt(f) &&
      !zip.files[f]?.dir
  );

  let storiesGrouped: MediaStore['stories'] = {};
  let postsGrouped: MediaStore['posts'] = {};

  let storyUrisCount = 0;
  let postUrisCount = 0;

  // Deduplicate by path+month
  const dedupe = new Set<string>();

  // Stories: images + videos
  for (const p of storyPaths) {
    const ym = extractYearMonth(p);
    if (!ym) continue;

    const uri = await getFileUri(zip, p);
    if (!uri) continue;

    const key = `stories:${ym}:${p}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    storiesGrouped[ym] = storiesGrouped[ym] || [];
    storiesGrouped[ym].push(uri);
    storyUrisCount++;
  }

  // Posts (gallery): images only (jpg/jpeg/png/webp)
  for (const p of postPaths) {
    const ym = extractYearMonth(p);
    if (!ym) continue;

    const uri = await getFileUri(zip, p);
    if (!uri) continue;

    const key = `posts:${ym}:${p}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);

    postsGrouped[ym] = postsGrouped[ym] || [];
    postsGrouped[ym].push(uri);
    postUrisCount++;
  }

  console.log('[InstaInsight][MediaExtraction] Story files:', storyPaths.length);
  console.log('[InstaInsight][MediaExtraction] Post files:', postPaths.length);
  console.log(
    '[InstaInsight][MediaExtraction] Grouped stories months:',
    Object.keys(storiesGrouped)
  );
  console.log(
    '[InstaInsight][MediaExtraction] Grouped posts months:',
    Object.keys(postsGrouped)
  );
  console.log('[InstaInsight][MediaExtraction] Story URIs:', storyUrisCount);
  console.log('[InstaInsight][MediaExtraction] Post URIs:', postUrisCount);

  return {
    posts: postsGrouped,
    stories: storiesGrouped,
    processedAt: Date.now(),
  };
}

