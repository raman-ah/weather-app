// api/weather.js
// Vercel Edge Function — proxies OpenWeatherMap so the API key never
// reaches the browser. Edge over a regular Node function mainly for
// the faster cold starts on repeated searches.

export const config = { runtime: 'edge' };

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const units = searchParams.get('units') || 'metric';
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return json({
      error: 'Server is missing OPENWEATHER_API_KEY. Set it in your Vercel project settings.',
    }, 500);
  }

  if (!city && (!lat || !lon)) {
    return json({ error: 'Provide either ?city= or ?lat=&lon=' }, 400);
  }

  const locationQuery = city
    ? `q=${encodeURIComponent(city)}`
    : `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

  const base = 'https://api.openweathermap.org/data/2.5';
  const currentUrl = `${base}/weather?${locationQuery}&units=${units}&appid=${apiKey}`;
  const forecastUrl = `${base}/forecast?${locationQuery}&units=${units}&appid=${apiKey}`;

  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(currentUrl),
      fetch(forecastUrl),
    ]);

    if (!currentRes.ok) {
      const body = await currentRes.json().catch(() => ({}));
      return json({ error: body.message || 'Location not found' }, currentRes.status);
    }

    const current = await currentRes.json();
    const forecast = forecastRes.ok ? await forecastRes.json() : null;

    // Cache for 5 minutes at the edge — weather doesn't change second to
    // second, and this keeps repeated searches well inside the free tier.
    return json({ current, forecast }, 200, {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    });
  } catch (err) {
    return json({ error: 'Could not reach OpenWeatherMap' }, 502);
  }
}
