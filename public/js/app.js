/* js/app.js
   Wires the UI to the /api/weather proxy, renders the instrument panel,
   and hands live conditions off to Sky (background) and Game (Storm Dodge). */

(() => {
  const API_BASE = '/api/weather';
  const LAST_CITY_KEY = 'skyline-last-city';

  const els = {
    searchForm: document.getElementById('search-form'),
    cityInput: document.getElementById('city-input'),
    suggestions: document.getElementById('suggestions'),
    locateBtn: document.getElementById('locate-btn'),
    unitToggle: document.getElementById('unit-toggle'),
    stormBtn: document.getElementById('storm-mode-btn'),
    statusBanner: document.getElementById('status-banner'),
    loading: document.getElementById('panel-loading'),
    content: document.getElementById('panel-content'),
    icon: document.getElementById('weather-icon'),
    temp: document.getElementById('temp'),
    condition: document.getElementById('condition'),
    location: document.getElementById('location'),
    feelsLike: document.getElementById('feels-like'),
    humidity: document.getElementById('humidity'),
    wind: document.getElementById('wind'),
    sunset: document.getElementById('sunset'),
    forecastStrip: document.getElementById('forecast-strip'),
  };

  const ICON_COLOR = {
    'clear-day': '#ff8a3d',
    'clear-night': '#e8ecf1',
    clouds: '#cdd3db',
    rain: '#4fd1e8',
    thunderstorm: '#ffd27a',
    snow: '#e8ecf1',
    mist: '#94a3b8',
  };

  const S = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';
  const ICONS = {
    'clear-day': `${S}<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/></svg>`,
    'clear-night': `${S}<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>`,
    clouds: `${S}<path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1-1 8.5H7Z"/></svg>`,
    rain: `${S}<path d="M7 14.5a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 6a4.2 4.2 0 0 1-1 8.5H7Z"/><path d="M8 17.5 6.7 20M12 17.5l-1.3 2.5M16 17.5l-1.3 2.5"/></svg>`,
    thunderstorm: `${S}<path d="M7 13.5a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 5a4.2 4.2 0 0 1-1 8.5H7Z"/><path d="M13 13.5 10.5 18h3l-2 4"/></svg>`,
    snow: `${S}<path d="M7 14.5a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 6a4.2 4.2 0 0 1-1 8.5H7Z"/><path d="M8 18v3M8 19.5l-1.5 1M8 19.5l1.5 1M12 18v3M12 19.5l-1.5 1M12 19.5l1.5 1M16 18v3M16 19.5l-1.5 1M16 19.5l1.5 1"/></svg>`,
    mist: `${S}<path d="M4 8h16M3 12h18M4 16h16M6 20h12"/></svg>`,
  };

  function flagEmoji(countryCode) {
    if (!countryCode) return '';
    return countryCode.toUpperCase().replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
  }

  let units = 'metric';
  let current = null;
  let forecast = null;
  let lastQuery = null;
  let loadedOnce = false;

  // Short-lived in-memory caches so re-searching the same city/query within
  // a session is instant instead of round-tripping to the API again.
  const weatherCache = new Map();
  const geocodeCache = new Map();
  const WEATHER_TTL = 5 * 60 * 1000;
  const GEOCODE_TTL = 10 * 60 * 1000;

  function weatherCacheKey(params) {
    return params.city
      ? `city:${params.city.trim().toLowerCase()}:${units}`
      : `geo:${Number(params.lat).toFixed(2)},${Number(params.lon).toFixed(2)}:${units}`;
  }

  function iconMarkup(theme) {
    return ICONS[theme] || ICONS['clear-day'];
  }

  function setStatus(msg) {
    if (!msg) { els.statusBanner.hidden = true; els.statusBanner.textContent = ''; return; }
    els.statusBanner.hidden = false;
    els.statusBanner.textContent = msg;
  }

  function formatTemp(t) { return `${Math.round(t)}°`; }

  function formatWind(speed) {
    // metric -> m/s from API, convert to km/h; imperial -> already mph
    if (units === 'metric') return `${Math.round(speed * 3.6)} km/h`;
    return `${Math.round(speed)} mph`;
  }

  function localTimeString(unixSeconds, tzOffsetSeconds) {
    const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
    return d.toISOString().slice(11, 16);
  }

  function intensityFor(cur) {
    let i = 1;
    if (cur.wind && typeof cur.wind.speed === 'number') i += Math.min(0.6, cur.wind.speed / 20);
    if (cur.rain && cur.rain['1h']) i += Math.min(0.6, cur.rain['1h'] / 10);
    if (cur.snow && cur.snow['1h']) i += Math.min(0.6, cur.snow['1h'] / 6);
    return i;
  }

  function render() {
    const w0 = current.weather[0];
    const theme = Sky.mapConditionToTheme(w0.id, w0.icon);

    Sky.setTheme(theme, { intensity: intensityFor(current) });
    const isLiveStorm = Game.setConditions(theme, current.wind ? current.wind.speed : 3);
    els.stormBtn.classList.toggle('is-live', isLiveStorm);

    els.icon.style.color = ICON_COLOR[theme];
    els.icon.innerHTML = iconMarkup(theme);

    els.temp.textContent = formatTemp(current.main.temp);
    els.condition.textContent = w0.description;
    els.location.textContent = `${current.name || 'Unknown'}${current.sys && current.sys.country ? ', ' + current.sys.country : ''}`;

    els.feelsLike.textContent = formatTemp(current.main.feels_like);
    els.humidity.textContent = `${current.main.humidity}%`;
    els.wind.textContent = formatWind(current.wind ? current.wind.speed : 0);
    els.sunset.textContent = current.sys && current.sys.sunset
      ? localTimeString(current.sys.sunset, current.timezone || 0)
      : '--:--';

    renderForecast();

    els.loading.hidden = true;
    els.content.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      els.content.classList.remove('is-updating');
    }));

    if (current.name) localStorage.setItem(LAST_CITY_KEY, current.name);
  }

  function renderForecast() {
    els.forecastStrip.innerHTML = '';
    if (!forecast || !forecast.list || !forecast.city) return;

    const tz = forecast.city.timezone || 0;
    const byDay = new Map();

    forecast.list.forEach(item => {
      const local = new Date((item.dt + tz) * 1000);
      const key = local.toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push({ item, local });
    });

    const todayKey = new Date((forecast.list[0].dt + tz) * 1000).toISOString().slice(0, 10);

    [...byDay.entries()]
      .filter(([key]) => key !== todayKey)
      .slice(0, 5)
      .forEach(([key, entries]) => {
        const mid = entries.find(e => e.local.getUTCHours() === 12) || entries[Math.floor(entries.length / 2)];
        const highs = entries.map(e => e.item.main.temp_max);
        const lows = entries.map(e => e.item.main.temp_min);
        const high = Math.max(...highs);
        const low = Math.min(...lows);
        const theme = Sky.mapConditionToTheme(mid.item.weather[0].id, mid.item.weather[0].icon);
        const dayName = mid.local.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

        const card = document.createElement('div');
        card.className = 'forecast-card';
        card.innerHTML = `
          <div class="f-day">${dayName}</div>
          <div class="f-icon" style="color:${ICON_COLOR[theme]}">${iconMarkup(theme)}</div>
          <div class="f-high">${formatTemp(high)}</div>
          <div class="f-low">${formatTemp(low)}</div>
        `;
        els.forecastStrip.appendChild(card);
      });
  }

  async function fetchWeather(params) {
    setStatus(null);
    const key = weatherCacheKey(params);
    const cached = weatherCache.get(key);

    if (cached && Date.now() - cached.ts < WEATHER_TTL) {
      current = cached.data.current;
      forecast = cached.data.forecast;
      lastQuery = params;
      loadedOnce = true;
      if (els.content.hidden) {
        els.loading.hidden = true;
        els.content.hidden = false;
      } else {
        els.content.classList.add('is-updating');
      }
      render();
      return;
    }

    if (!loadedOnce) {
      els.loading.hidden = false;
      els.content.hidden = true;
    } else {
      els.content.classList.add('is-updating');
    }

    try {
      const qs = new URLSearchParams({ ...params, units }).toString();
      const res = await fetch(`${API_BASE}?${qs}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Could not load that location');

      current = data.current;
      forecast = data.forecast;
      lastQuery = params;
      loadedOnce = true;
      weatherCache.set(key, { data, ts: Date.now() });
      render();
    } catch (err) {
      els.loading.hidden = true;
      els.content.classList.remove('is-updating');
      setStatus(err.message || 'Something went wrong reaching the weather service');
    }
  }

  function geolocate(fallbackCity) {
    if (!navigator.geolocation) {
      fetchWeather({ city: fallbackCity || 'Lagos' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => fetchWeather({ city: fallbackCity || 'Lagos' }),
      { timeout: 6000 }
    );
  }

  // ---- Search suggestions ----

  let suggestDebounce = null;
  let suggestAbort = null;
  let activeSuggestions = [];
  let activeIndex = -1;

  function closeSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = '';
    els.cityInput.setAttribute('aria-expanded', 'false');
    activeSuggestions = [];
    activeIndex = -1;
  }

  function renderSuggestions(list) {
    activeSuggestions = list;
    activeIndex = -1;
    if (!list.length) {
      els.suggestions.innerHTML = '<li class="suggestion-empty">No matching cities</li>';
      els.suggestions.hidden = false;
      els.cityInput.setAttribute('aria-expanded', 'true');
      return;
    }
    els.suggestions.innerHTML = list.map((place, i) => {
      const meta = [place.state, place.country].filter(Boolean).join(', ');
      return `
        <li class="suggestion-item" role="option" data-index="${i}">
          <span class="s-name">${place.name}</span>
          <span class="s-meta">${flagEmoji(place.country)} ${meta}</span>
        </li>`;
    }).join('');
    els.suggestions.hidden = false;
    els.cityInput.setAttribute('aria-expanded', 'true');
  }

  function showSuggestLoading() {
    els.suggestions.innerHTML = '<li class="suggestion-empty">Searching…</li>';
    els.suggestions.hidden = false;
  }

  function pickSuggestion(place) {
    els.cityInput.value = [place.name, place.state, place.country].filter(Boolean).join(', ');
    closeSuggestions();
    fetchWeather({ lat: place.lat, lon: place.lon });
  }

  els.suggestions.addEventListener('click', e => {
    const li = e.target.closest('.suggestion-item');
    if (!li || li.dataset.index === undefined) return;
    pickSuggestion(activeSuggestions[Number(li.dataset.index)]);
  });

  els.cityInput.addEventListener('input', () => {
    const q = els.cityInput.value.trim();
    clearTimeout(suggestDebounce);
    if (q.length < 2) { closeSuggestions(); return; }

    const cacheKey = q.toLowerCase();
    const cached = geocodeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEOCODE_TTL) {
      renderSuggestions(cached.data);
      return;
    }

    suggestDebounce = setTimeout(async () => {
      if (suggestAbort) suggestAbort.abort();
      suggestAbort = new AbortController();
      showSuggestLoading();
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: suggestAbort.signal });
        const data = await res.json();
        if (Array.isArray(data)) {
          geocodeCache.set(cacheKey, { data, ts: Date.now() });
          renderSuggestions(data);
        }
      } catch (err) {
        if (err.name !== 'AbortError') closeSuggestions();
      }
    }, 300);
  });

  els.cityInput.addEventListener('keydown', e => {
    if (els.suggestions.hidden || !activeSuggestions.length) return;
    const items = els.suggestions.querySelectorAll('.suggestion-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pickSuggestion(activeSuggestions[activeIndex]);
      return;
    } else if (e.key === 'Escape') {
      closeSuggestions();
      return;
    } else {
      return;
    }
    items.forEach((it, i) => it.classList.toggle('is-active', i === activeIndex));
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) closeSuggestions();
  });

  els.searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const value = els.cityInput.value.trim();
    closeSuggestions();
    if (value) fetchWeather({ city: value });
  });

  els.locateBtn.addEventListener('click', () => geolocate(localStorage.getItem(LAST_CITY_KEY)));

  els.unitToggle.addEventListener('click', () => {
    units = units === 'metric' ? 'imperial' : 'metric';
    els.unitToggle.textContent = units === 'metric' ? '°C' : '°F';
    if (lastQuery) fetchWeather(lastQuery);
  });

  els.stormBtn.addEventListener('click', () => Game.open());

  // ---- Boot ----
  geolocate(localStorage.getItem(LAST_CITY_KEY));
})();
