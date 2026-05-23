import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

let ReactNativeZipArchive: any = null;

async function loadNativeZipModule(): Promise<any> {
  if (ReactNativeZipArchive) return ReactNativeZipArchive;
  if (Platform.OS === 'web') return null;
  try {
    ReactNativeZipArchive = require('react-native-zip-archive');
    return ReactNativeZipArchive;
  } catch {
    console.warn('[StreamingZip] react-native-zip-archive not available, falling back to JSZip');
    return null;
  }
}

/**
 * Extract a ZIP file to a temporary directory using native streaming.
 * Returns the target directory path, or null if extraction failed.
 * Only supported on iOS/Android — returns null on web.
 */
export async function extractZipToTemp(
  sourceUri: string,
  targetDir?: string,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  const zipModule = await loadNativeZipModule();
  if (!zipModule) return null;

  const target = targetDir || `${FileSystem.cacheDirectory}insta_extracted_${Date.now()}`;

  try {
    // Ensure target directory exists
    const dirInfo = await FileSystem.getInfoAsync(target);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(target, { intermediates: true });
    }

    // Subscribe to progress events
    let subscription: any = null;
    if (onProgress && zipModule.subscribe) {
      subscription = zipModule.subscribe(({ progress }: { progress: number }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Stream-extract — does NOT load entire ZIP into memory
    await zipModule.unzip(sourceUri, target);

    if (subscription) {
      subscription.remove();
    }

    return target;
  } catch (e) {
    console.warn('[StreamingZip] Extraction failed:', e);
    // Clean up on failure
    try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch {}
    return null;
  }
}

/**
 * Read a file from an extracted ZIP directory.
 * Returns the file content as string, or null if not found / too large.
 */
export async function readExtractedFile(
  extractDir: string,
  relativePath: string,
  maxSize: number = 50 * 1024 * 1024,
): Promise<string | null> {
  const filePath = `${extractDir}/${relativePath}`;

  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      // Try fuzzy match
      const dir = `${extractDir}/${relativePath.split('/').slice(0, -1).join('/')}`;
      const dirItems = await FileSystem.readDirectoryAsync(dir).catch(() => []);
      const baseName = relativePath.split('/').pop()!;
      const match = dirItems.find((f: string) => f === baseName || f.endsWith(`/${baseName}`));
      if (!match) return null;
      const fuzzyPath = `${dir}/${match}`;
      const fuzzyInfo = await FileSystem.getInfoAsync(fuzzyPath);
      if (!fuzzyInfo.exists) return null;
      if (fuzzyInfo.size && fuzzyInfo.size > maxSize) {
        console.warn(`[StreamingZip] Skipping ${match} — ${(fuzzyInfo.size / 1024 / 1024).toFixed(1)}MB exceeds limit`);
        return null;
      }
      return await FileSystem.readAsStringAsync(fuzzyPath, { encoding: FileSystem.EncodingType.UTF8 });
    }

    if (info.size && info.size > maxSize) {
      console.warn(`[StreamingZip] Skipping ${relativePath} — ${(info.size / 1024 / 1024).toFixed(1)}MB exceeds limit`);
      return null;
    }

    return await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) {
    console.warn(`[StreamingZip] Failed to read ${relativePath}:`, e);
    return null;
  }
}

/**
 * List files in an extracted ZIP directory, optionally filtering by extension.
 */
export async function listExtractedFiles(
  extractDir: string,
  subDir: string = '',
): Promise<string[]> {
  try {
    const targetDir = subDir ? `${extractDir}/${subDir}` : extractDir;
    return await FileSystem.readDirectoryAsync(targetDir);
  } catch {
    return [];
  }
}

/**
 * Clean up extracted ZIP directory.
 */
export async function cleanupExtractedDir(extractDir: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(extractDir, { idempotent: true });
  } catch (e) {
    console.warn('[StreamingZip] Cleanup failed:', e);
  }
}

/**
 * Check if native streaming extraction is available.
 */
export function isNativeStreamingAvailable(): boolean {
  return Platform.OS !== 'web';
}
