export const config = { runtime: 'edge' };

function getRelayBaseUrl() {
  const relayUrl = process.env.WS_RELAY_URL;
  if (!relayUrl) return null;
  return relayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
}

function getRelayHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const relaySecret = process.env.RELAY_SHARED_SECRET || '';
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  const videoIdParam = url.searchParams.get('videoId');

  const params = new URLSearchParams();
  if (channel) params.set('channel', channel);
  if (videoIdParam) params.set('videoId', videoIdParam);

  if (![channel, videoIdParam].some(Boolean)) {
    return new Response(JSON.stringify({ error: 'Missing channel or videoId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const relayBase = getRelayBaseUrl();
  if (relayBase) {
    try {
      const relayResponse = await fetch(`${relayBase}/youtube-live?${params.toString()}`, {
        headers: getRelayHeaders({ 'User-Agent': 'Vaultum-YouTube/1.0' }),
      });
      if (relayResponse.ok) {
        const data = await relayResponse.json();
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
          },
        });
      }
    } catch { /* relay unavailable */ }
  }

  if (videoIdParam && /^[A-Za-z0-9_-]{11}$/.test(videoIdParam)) {
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoIdParam}&format=json`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        return new Response(JSON.stringify({ channelName: data.author_name || null, title: data.title || null, videoId: videoIdParam }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800, s-maxage=1800' },
        });
      }
    } catch { /* ignore */ }
    return new Response(JSON.stringify({ channelName: null, title: null, videoId: videoIdParam }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!channel) {
    return new Response(JSON.stringify({ error: 'Missing channel parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const channelHandle = channel.startsWith('@') ? channel : `@${channel}`;
    const response = await fetch(`https://www.youtube.com/${channelHandle}/live`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ videoId: null, isLive: false, channelExists: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    const channelExists = html.includes('"channelId"') || html.includes('og:url');
    const ownerMatch = html.match(/"ownerChannelName"\s*:\s*"([^"]+)"/) || html.match(/"author"\s*:\s*"([^"]+)"/);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let videoId = null;

    const detailsIdx = html.indexOf('"videoDetails"');
    if (detailsIdx !== -1) {
      const block = html.substring(detailsIdx, detailsIdx + 5000);
      const vidMatch = block.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      const liveMatch = block.match(/"isLive"\s*:\s*true/);
      if (vidMatch && liveMatch) videoId = vidMatch[1];
    }

    return new Response(JSON.stringify({
      videoId,
      isLive: Boolean(videoId),
      channelExists,
      channelName: ownerMatch?.[1] ?? null,
      title: titleMatch?.[1]?.replace(/\s*-\s*YouTube\s*$/i, '') ?? null,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch {
    return new Response(JSON.stringify({ videoId: null, isLive: false, error: 'Failed to fetch channel data' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
