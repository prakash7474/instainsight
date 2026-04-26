import * as FileSystem from 'expo-file-system';
import { useMediaStore, MediaItem, MediaFolder } from '../store/useMediaStore';
import { scanDirectoryBatches, isDirectory, waitIdle } from './fileScanner';

export async function processInstagramData(baseUri: string) {
    baseUri = baseUri.endsWith('/') ? baseUri : baseUri + '/';
    const store = useMediaStore.getState();
    store.setScanning(true);
    store.reset(); // clear existing data
    store.setBasePath(baseUri);

    try {
// 1. Scan Posts (media/posts/ or various other locations)
        const potentialPostsPaths = [
            `${baseUri}media/posts/`,
            `${baseUri}your_instagram_activity/media/posts/`,
            `${baseUri}your_instagram_activity/content/posts_1/`,
            `${baseUri}your_instagram_activity/posts/`,
            `${baseUri}your_instagram_activity/content/posts/`,
            `${baseUri}posts/media/your_posts/`,
            `${baseUri}content/posts/`,
            `${baseUri}posts/`
        ];

        let postsPath = '';
        for (const path of potentialPostsPaths) {
            if (await isDirectory(path)) {
                postsPath = path;
                break;
            }
        }

        if (postsPath) {
            store.updateProgress('Scanning Posts', 'Loading recent posts...');
            const posts: MediaItem[] = [];
            for await (const batch of scanDirectoryBatches(postsPath)) {
                posts.push(...batch);
                store.setPosts([...posts]); // Update store in batches
                store.updateProgress('Scanning Posts', `Loaded ${posts.length} items`);
            }
        }

        // 2. Scan Archived Posts
        const potentialArchivedRoots = [
            `${baseUri}media/archived_posts/`,
            `${baseUri}your_instagram_activity/content/archived_posts/`,
            `${baseUri}your_instagram_activity/media/archived_posts/`
        ];

        let archivedRoot = '';
        for (const path of potentialArchivedRoots) {
            if (await isDirectory(path)) {
                archivedRoot = path;
                break;
            }
        }

        if (archivedRoot) {
            store.updateProgress('Scanning Archived Posts');

            const archived: MediaItem[] = [];
            const subDirs = await FileSystem.readDirectoryAsync(archivedRoot);
            for (const subDir of subDirs) {
                const fullDir = `${archivedRoot}${subDir}/`;
                if (await isDirectory(fullDir)) {
                    for await (const batch of scanDirectoryBatches(fullDir, subDir)) {
                        archived.push(...batch);
                        store.setArchivedPosts([...archived]);
                        store.updateProgress('Scanning Archived Posts', `Loaded ${archived.length} items from ${subDir}`);
                    }
                }
            }

            // Sort strictly descending for archived
            archived.sort((a, b) => b.filename.localeCompare(a.filename));
            store.setArchivedPosts(archived);
        }

        // 3. Scan Stories
        const potentialStoriesRoots = [
            `${baseUri}media/stories/`,
            `${baseUri}your_instagram_activity/content/stories/`,
            `${baseUri}your_instagram_activity/media/stories/`
        ];

        let storiesRoot = '';
        for (const path of potentialStoriesRoots) {
            if (await isDirectory(path)) {
                storiesRoot = path;
                break;
            }
        }

        if (storiesRoot) {
            store.updateProgress('Discovering Stories...', 'Finding months');
            const months = await FileSystem.readDirectoryAsync(storiesRoot);
            // Sort descending (latest month first)
            months.sort((a, b) => b.localeCompare(a));

            const storyFolders: MediaFolder[] = [];
            for (const month of months) {
                const fullDir = `${storiesRoot}${month}/`;
                if (await isDirectory(fullDir)) {
                    storyFolders.push({ month, count: 0 }); // we'll lazy load counts or just list them
                }
            }
            store.setStoryMonths(storyFolders);

            // We do NOT preload all stories, they are lazy loaded in the UI
            // but we can load just the first month as a preview, or wait for UI.
        }

        store.updateProgress('Complete', 'All files indexed');
        await waitIdle();

    } catch (error) {
        console.error('Error scanning data:', error);
        store.updateProgress('Error scanning data', String(error));
    } finally {
        store.setScanning(false);
    }
}

// Function to fetch stories for a specific month
export async function loadStoriesForMonth(baseUri: string, month: string) {
    baseUri = baseUri.endsWith('/') ? baseUri : baseUri + '/';
    const store = useMediaStore.getState();

    // If we already loaded this month, skip
    if (store.storiesMap[month]) return;

    const potentialStoriesRoots = [
        `${baseUri}media/stories/`,
        `${baseUri}your_instagram_activity/content/stories/`,
        `${baseUri}your_instagram_activity/media/stories/`
    ];

    for (const root of potentialStoriesRoots) {
        const fullPath = `${root}${month}/`;
        if (await isDirectory(fullPath)) {
            const monthStories: MediaItem[] = [];
            for await (const batch of scanDirectoryBatches(fullPath, month)) {
                monthStories.push(...batch);
            }
            // sort
            monthStories.sort((a, b) => b.filename.localeCompare(a.filename));

            useMediaStore.getState().addStories(month, monthStories);

            // Update count
            const currentMonths = [...store.storyMonths];
            const mItem = currentMonths.find(m => m.month === month);
            if (mItem) {
                mItem.count = monthStories.length;
                store.setStoryMonths(currentMonths);
            }
            break;
        }
    }
}
