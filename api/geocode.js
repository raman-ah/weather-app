// api/geocode.js
// Proxies OpenWeatherMap's Geocoding API for city-search autocomplete.
// Runs on the Edge Runtime for the same reason as weather.js — near-instant
// cold starts matter most here since this fires on every debounced keystroke.

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
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return json({ error: 'Server is missing OPENWEATHER_API_KEY.' }, 500);
  }
  if (!q || q.trim().length < 2) {
    return json([], 200);
  }

  try {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q.trim())}&limit=5&appid=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return json({ error: 'Geocoding lookup failed' }, r.status);
    const data = await r.json();
    return json(data, 200, { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' });
  } catch (err) {
    return json({ error: 'Could not reach the geocoding service' }, 502);
  }
}
