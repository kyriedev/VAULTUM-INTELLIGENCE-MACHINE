export default async function handler(req, res) {
  const url = String(req.query?.url || '').trim();
  res.setHeader('content-type', 'application/json; charset=utf-8');

  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ proxied: false, error: 'A valid http(s) RSS URL is required.' });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'VAULTUM Terminal RSS Proxy',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      res.status(response.status).json({ proxied: false, error: `Upstream RSS request failed with ${response.status}.`, url });
      return;
    }

    const body = await response.text();
    res.status(200).json({
      proxied: true,
      url,
      fetchedAt: new Date().toISOString(),
      contentType: response.headers.get('content-type') || 'application/xml',
      body,
    });
  } catch (error) {
    res.status(502).json({
      proxied: false,
      url,
      error: error instanceof Error ? error.message : 'RSS proxy request failed.',
    });
  }
}
