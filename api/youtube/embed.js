export const config = { runtime: 'edge' };

function parseFlag(value, fallback = '1') {
  return value === '0' || value === '1' ? value : fallback;
}

function sanitizeVideoId(value) {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const videoId = sanitizeVideoId(url.searchParams.get('videoId'));

  if (!videoId) {
    return new Response('Missing or invalid videoId', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const autoplay = parseFlag(url.searchParams.get('autoplay'), '0');
  const mute = parseFlag(url.searchParams.get('mute'), '0');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
    #player{width:100%;height:100%}
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    var tag=document.createElement('script');
    tag.src='https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    function onYouTubeIframeAPIReady(){
      new YT.Player('player',{
        videoId:'${videoId}',
        host:'https://www.youtube.com',
        playerVars:{
          autoplay:${autoplay},
          mute:${mute},
          playsinline:1,
          rel:0,
          controls:1,
          modestbranding:1,
          enablejsapi:1
        }
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=900, stale-while-revalidate=300',
    },
  });
}
