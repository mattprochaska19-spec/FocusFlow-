// 25 = News & Politics, 26 = Howto & Style, 27 = Education
// 28 = Science & Technology, 29 = Nonprofits & Activism
export const EDUCATIONAL_CATEGORIES = new Set(['25', '26', '27', '28', '29']);

export const CATEGORY_NAMES: Record<string, string> = {
  '1':  'Film & Animation',
  '2':  'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
};

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] ?? `Category ${id}`;
}

export const DEFAULT_EDU_KEYWORDS = [
  'tutorial', 'how to', 'howto', 'explained', 'explanation', 'learn',
  'course', 'lecture', 'documentary', 'history', 'science', 'math',
  'mathematics', 'programming', 'coding', 'physics', 'chemistry',
  'biology', 'geography', 'economics', 'philosophy', 'psychology',
  'engineering', 'research', 'academic', 'university', 'professor',
  'lesson', 'training', 'guide', 'analysis', 'what is', 'why does',
  'how does', 'understanding', 'introduction to', 'deep dive',
  'breakdown', 'fundamentals', 'basics of', 'complete guide',
];

export const DEFAULT_ENT_KEYWORDS = [
  'vlog', 'prank', 'challenge', 'reaction', 'funny moments', 'meme',
  'gaming', 'gameplay', "let's play", 'lets play', 'stream highlights',
  'compilation', 'fails', 'roast', 'drama', 'storytime', 'mukbang',
  'asmr', 'unboxing', 'haul', 'try on', 'clickbait',
];

export type VideoData = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  channelId: string;
  channelTitle: string;
  tags: string[];
};

export type Classification = {
  isEducational: boolean;
  reason: 'whitelisted_channel' | 'category' | 'keywords' | 'entertainment';
  confidence: 'user' | 'high' | 'low';
  categoryId?: string;
  channelId?: string;
  eduHits?: number;
  entHits?: number;
};

export type FilterSettings = {
  apiKey: string;
  educationalChannels?: { channelId: string }[];
  educationalKeywords?: string[];
  entertainmentKeywords?: string[];
};

export type FilterResult =
  | { ok: true; video: VideoData; classification: Classification }
  | { ok: false; reason: 'missing_api_key' | 'not_found' | 'fetch_failed'; error?: string };

export async function fetchVideoData(videoId: string, apiKey: string): Promise<VideoData | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`YouTube API error: ${resp.status}`);
  const data = (await resp.json()) as { items?: { snippet: Record<string, unknown> }[] };
  if (!data.items?.length) return null;
  const s = data.items[0].snippet as {
    title?: string;
    description?: string;
    categoryId?: string;
    channelId?: string;
    channelTitle?: string;
    tags?: string[];
  };
  return {
    id: videoId,
    title: s.title ?? '',
    description: (s.description ?? '').slice(0, 1000),
    categoryId: s.categoryId ?? '',
    channelId: s.channelId ?? '',
    channelTitle: s.channelTitle ?? '',
    tags: Array.isArray(s.tags) ? s.tags : [],
  };
}

export function classifyVideo(video: VideoData, settings: FilterSettings): Classification {
  const { categoryId, channelId, title, description, tags } = video;
  const eduChannels = settings.educationalChannels ?? [];

  if (eduChannels.some((c) => c.channelId === channelId)) {
    return { isEducational: true, reason: 'whitelisted_channel', channelId, confidence: 'user' };
  }

  if (EDUCATIONAL_CATEGORIES.has(categoryId)) {
    return { isEducational: true, reason: 'category', categoryId, confidence: 'high' };
  }

  // Keyword fallback only fires when YouTube returns no category — low-confidence signal,
  // requires both more edu hits than ent hits AND at least 2 edu hits, to avoid false positives
  // on short/generic titles.
  if (!categoryId) {
    const text = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
    const eduKws = settings.educationalKeywords ?? DEFAULT_EDU_KEYWORDS;
    const entKws = settings.entertainmentKeywords ?? DEFAULT_ENT_KEYWORDS;
    const eduHits = eduKws.filter((kw) => text.includes(kw.toLowerCase())).length;
    const entHits = entKws.filter((kw) => text.includes(kw.toLowerCase())).length;
    if (eduHits > entHits && eduHits >= 2) {
      return { isEducational: true, reason: 'keywords', eduHits, entHits, confidence: 'low' };
    }
  }

  return { isEducational: false, reason: 'entertainment', categoryId, confidence: 'high' };
}

export type ChannelSearchResult = {
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
};

// Search YouTube channels by name. Costs 100 units of the API quota per call,
// so callers should debounce. Free tier has 10,000 units/day → 100 searches.
export async function searchChannels(query: string, apiKey: string): Promise<ChannelSearchResult[]> {
  if (!query.trim() || !apiKey) return [];
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=8&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`YouTube search failed: ${resp.status}`);
  const data = (await resp.json()) as { items?: { id: { channelId: string }; snippet: Record<string, unknown> }[] };
  return (data.items ?? []).map((item) => {
    const s = item.snippet as { title?: string; description?: string; thumbnails?: { default?: { url?: string } } };
    return {
      channelId: item.id.channelId,
      title: s.title ?? '',
      description: s.description,
      thumbnailUrl: s.thumbnails?.default?.url,
    };
  });
}

// Accepts a bare 11-char video ID or any common YouTube URL form (watch?v=, youtu.be/, shorts/, embed/).
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/v\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

export async function checkVideo(videoId: string, settings: FilterSettings): Promise<FilterResult> {
  if (!settings.apiKey) return { ok: false, reason: 'missing_api_key' };
  let video: VideoData | null;
  try {
    video = await fetchVideoData(videoId, settings.apiKey);
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', error: err instanceof Error ? err.message : String(err) };
  }
  if (!video) return { ok: false, reason: 'not_found' };
  return { ok: true, video, classification: classifyVideo(video, settings) };
}
