import * as FileSystem from 'expo-file-system';
import { InteractionManager } from 'react-native';
import { MediaItem, MediaType, MediaFolder } from '../store/useMediaStore';

const BATCH_SIZE = 50;

export async function waitIdle() {
    return new Promise((resolve) => {
        InteractionManager.runAfterInteractions(() => {
            setTimeout(resolve, 0); // extra non-blocking tick
        });
    });
}

function getMediaType(filename: string): MediaType | null {
    const ext = (filename.substring(filename.lastIndexOf('.')).toLowerCase() || '');
    if (['.heic', '.json', '.txt', '.html'].includes(ext)) return null;
    if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return 'image';
    return null;
}

// Scans a flat directory and yields batches of MediaItem
export async function* scanDirectoryBatches(
    dirUri: string,
    month?: string
): AsyncGenerator<MediaItem[]> {
    try {
        const dirInfo = await FileSystem.getInfoAsync(dirUri);
        if (!dirInfo.exists || !dirInfo.isDirectory) {
            return;
        }

        const files = await FileSystem.readDirectoryAsync(dirUri);
        // Sort descending by filename
        files.sort((a, b) => b.localeCompare(a));

        let batch: MediaItem[] = [];

        for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            const type = getMediaType(filename);

            if (type) {
                batch.push({
                    id: `${dirUri}/${filename}`,
                    uri: `${dirUri}/${filename}`,
                    type,
                    month,
                    filename,
                });
            }

            if (batch.length >= BATCH_SIZE) {
                yield batch;
                batch = [];
                await waitIdle(); // Yield to JS thread
            }
        }

        if (batch.length > 0) {
            yield batch;
        }
    } catch (error) {
        console.warn(`Error scanning directory ${dirUri}:`, error);
    }
}

// Helper to check if directory exists
export async function isDirectory(dirUri: string): Promise<boolean> {
    try {
        const info = await FileSystem.getInfoAsync(dirUri);
        return info.exists && !!info.isDirectory;
    } catch {
        return false;
    }
}
