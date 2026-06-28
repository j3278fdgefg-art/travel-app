const ALLOWED_HOSTS = ['maps.app.goo.gl', 'goo.gl/maps', 'naver.me', 'kko.to'];

export default async function handler(req: any, res: any) {
  const url = typeof req.query?.url === 'string' ? req.query.url : '';
  if (!url) return res.status(400).json({ error: 'missing url' });
  if (!ALLOWED_HOSTS.some((h) => url.includes(h))) {
    return res.status(403).json({ error: 'not allowed' });
  }
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; travel-app/1.0)' },
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ url: response.url });
  } catch {
    res.status(500).json({ error: 'failed to resolve' });
  }
}
