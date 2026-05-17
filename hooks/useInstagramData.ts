import data from '../instagram-data.json';
import type { InstagramData } from '../types/instagram';

export function useInstagramData(): InstagramData {
  return data as InstagramData;
}
