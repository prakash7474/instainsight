import JSZip from 'jszip';
import { Platform } from 'react-native';

export type StoryEntry = {
  path: string;
  type: 'image' | 'video';
  month: string;
};

let activeZip: JSZip | null = null;
let activeZipBase64: string | null = null;

export function setActiveZip(zip: JSZip | null, base64?: string | null) {
  activeZip = zip;
  if (base64 !== undefined) activeZipBase64 = base64;
}

export function getActiveZip(): JSZip | null {
  return activeZip;
}

export function getActiveZipBase64(): string | null {
  return activeZipBase64;
}

export function clearActiveZip() {
  activeZip = null;
  activeZipBase64 = null;
}

export function extractStories(zip: JSZip): StoryEntry[] {
  const allFiles = Object.keys(zip.files);

  console.log("TOTAL FILES:", allFiles.length);

  const stories: StoryEntry[] = [];
  const seen = new Set<string>();

  for (const filePath of allFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    if (!normalized.toLowerCase().includes('media/stories/')) continue;
    if (zip.files[filePath]?.dir) continue;

    const match = normalized.match(/stories\/(\d{6})\/(.+\.(mp4|mov|webm|jpg|jpeg|png|webp))/i);
    if (!match) continue;

    const ym = match[1];
    const monthKey = `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
    const ext = match[2].split('.').pop()?.toLowerCase() || '';
    const isVideo = ['mp4', 'mov', 'webm'].includes(ext);

    const dedupeKey = `${monthKey}:${filePath}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    stories.push({
      path: filePath,
      type: isVideo ? 'video' : 'image',
      month: monthKey,
    });
  }

  console.log("MATCHED STORIES:", stories.length);
  return stories;
}

function getMime(path: string, type: 'image' | 'video'): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (type === 'video') {
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function generateStoryUri(
  zip: JSZip,
  path: string,
  type: 'image' | 'video'
): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;

  if (Platform.OS === 'web') {
    const blob = await file.async('blob');
    return URL.createObjectURL(blob);
  }

  const base64 = await file.async('base64');
  return `data:${getMime(path, type)};base64,${base64}`;
}

export type GroupedStories = {
  monthKey: string;
  monthLabel: string;
  items: StoryEntry[];
};
