import AsyncStorage from '@react-native-async-storage/async-storage';

import { checkVideo, type Classification, type FilterResult, type FilterSettings, type VideoData } from './youtube-filter';

const PREFIX = 'yt_cache_';
const TTL_MS = 60 * 60 * 1000; // 1 hour, mirroring the chrome extension

type CacheEntry = { video: VideoData; classification: Classification; timestamp: number };

export async function getCached(videoId: string): Promise<{ video: VideoData; classification: Classification } | null> {
  const raw = await AsyncStorage.getItem(PREFIX + videoId);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > TTL_MS) {
      await AsyncStorage.removeItem(PREFIX + videoId);
      return null;
    }
    return { video: entry.video, classification: entry.classification };
  } catch {
    return null;
  }
}

export async function setCached(videoId: string, video: VideoData, classification: Classification): Promise<void> {
  const entry: CacheEntry = { video, classification, timestamp: Date.now() };
  await AsyncStorage.setItem(PREFIX + videoId, JSON.stringify(entry));
}

export async function clearCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const cacheKeys = keys.filter((k) => k.startsWith(PREFIX));
  if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
}

export async function checkVideoCached(videoId: string, settings: FilterSettings): Promise<FilterResult> {
  const cached = await getCached(videoId);
  if (cached) return { ok: true, video: cached.video, classification: cached.classification };
  const result = await checkVideo(videoId, settings);
  if (result.ok) await setCached(videoId, result.video, result.classification);
  return result;
}
