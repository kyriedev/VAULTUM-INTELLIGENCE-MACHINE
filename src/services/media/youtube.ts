import { buildApiUrl } from '@/services/api-base';

export interface YoutubeLiveResponse {
  videoId: string | null;
  isLive?: boolean;
  channelExists?: boolean;
  channelName?: string | null;
  title?: string | null;
  error?: string;
}

export async function fetchYoutubeLiveChannel(channel: string): Promise<YoutubeLiveResponse | null> {
  try {
    const url = new URL(buildApiUrl('youtube/live'), window.location.origin);
    url.searchParams.set('channel', channel);
    const response = await fetch(url.toString(), { headers: { 'Cache-Control': 'no-store' } });
    if (!response.ok) return null;
    return await response.json() as YoutubeLiveResponse;
  } catch {
    return null;
  }
}

export function buildYoutubeEmbedUrl(videoId: string): string {
  const url = new URL(buildApiUrl('youtube/embed'), window.location.origin);
  url.searchParams.set('videoId', videoId);
  url.searchParams.set('autoplay', '0');
  url.searchParams.set('mute', '0');
  return url.toString();
}
