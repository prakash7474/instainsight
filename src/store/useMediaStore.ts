import { create } from 'zustand';

export type MediaType = 'image' | 'video';

export interface MediaItem {
  id: string;
  uri: string;
  type: MediaType;
  month?: string; // e.g. '202506'
  filename: string;
}

export interface MediaFolder {
  month: string;
  count: number;
}

interface MediaStore {
  basePath: string | null;
  setBasePath: (path: string) => void;

  posts: MediaItem[];
  archivedPosts: MediaItem[];
  storiesMap: Record<string, MediaItem[]>; // Key is YYYYMM
  storyMonths: MediaFolder[];

  isScanning: boolean;
  scanProgress: { message: string; submessage?: string };
  setScanning: (isScanning: boolean) => void;
  updateProgress: (message: string, submessage?: string) => void;

  setPosts: (posts: MediaItem[]) => void;
  setArchivedPosts: (posts: MediaItem[]) => void;
  addStories: (month: string, stories: MediaItem[]) => void;
  setStoryMonths: (months: MediaFolder[]) => void;

  reset: () => void;
}

export const useMediaStore = create<MediaStore>((set) => ({
  basePath: null,
  setBasePath: (path) => set({ basePath: path }),

  posts: [],
  archivedPosts: [],
  storiesMap: {},
  storyMonths: [],

  isScanning: false,
  scanProgress: { message: '' },
  setScanning: (isScanning) => set({ isScanning }),
  updateProgress: (message, submessage) =>
    set({ scanProgress: { message, submessage } }),

  setPosts: (posts) => set({ posts }),
  setArchivedPosts: (archivedPosts) => set({ archivedPosts }),
  addStories: (month, stories) =>
    set((state) => ({
      storiesMap: { ...state.storiesMap, [month]: stories },
    })),
  setStoryMonths: (storyMonths) => set({ storyMonths }),

  reset: () =>
    set({
      posts: [],
      archivedPosts: [],
      storiesMap: {},
      storyMonths: [],
      isScanning: false,
      scanProgress: { message: '' },
    }),
}));
