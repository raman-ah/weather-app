/* js/sky.js
   The "Sky" engine: turns an OpenWeatherMap condition code into a visual
   theme and animates it on a full-screen canvas. Exposes Sky.setTheme and
   Sky.mapConditionToTheme globally so app.js and game.js can both derive
   the same theme from the same weather data, keeping the ambient
   background and Storm Dodge's falling drops visually consistent. */

const Sky = (() => {
  const canvas = document.getElementById('sky-canvas');
  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;
  let particles = [];
  let theme = 'clear-day';
  let prevTheme = 'clear-day';
  let themeChangedAt = 0;
  const THEME_FADE_MS = 700;
  let intensity = 1; // 0.4 (light) .. 1 (normal) .. 1.6 (heavy), derived from wind/rain volume
  let rafId = null;
  let lastFlash = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function lerpColor(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  const THEMES = {
    'clear-day':    { sky: ['#2f6fb0', '#8cc0e6', '#eaf4fb'], particle: 'sun',    base: 0 },
    'clear-night':  { sky: ['#060a1a', '#131b3a', '#2a2f55'], particle: 'stars',  base: 70 },
    'clouds':       { sky: ['#4a5568', '#8c97a8', '#cdd3db'], particle: 'clouds', base: 5 },
    'rain':         { sky: ['#232c3d', '#3e4d63', '#6b7a8f'], particle: 'rain',   base: 90 },
    'thunderstorm': { sky: ['#0c0e16', '#232336', '#3a3a52'], particle: 'rain',   base: 130, storm: true },
    'snow':         { sky: ['#5b6a7d', '#aab9c8', '#e9eef3'], particle: 'snow',   base: 70 },
    'mist':         { sky: ['#5a5f66', '#8b9097', '#c3c7cb'], particle: 'mist',   base: 0 },
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.floor(window.innerWidth * dpr);
    h = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    seedParticles();
  }

  // ---- Particle factories (also used by game.js via Sky.makeRain / Sky.makeSnow) ----

  function makeRain() {
    return {
      x: Math.random() * w,
      y: Math.random() * -h,
      len: (14 + Math.random() * 16) * dpr,
      speed: (9 + Math.random() * 7) * dpr,
      drift: (1.2 * dpr),
    };
  }

  function makeSnow() {
    return {
      x: Math.random() * w,
      y: Math.random() * -h,
      r: (1.5 + Math.random() * 2.4) * dpr,
      speed: (1 + Math.random() * 1.8) * dpr,
      sway: Math.random() * Math.PI * 2,
    };
  }

  function makeStar() {
    return {
      x: Math.random() * w,
      y: Math.random() * h * 0.7,
      r: Math.random() * 1.4 * dpr + 0.3,
      tw: Math.random() * Math.PI * 2,
    };
  }

  function makeCloud() {
    return {
      x: Math.random() * w,
      y: 30 * dpr + Math.random() * h * 0.35,
      scale: (0.6 + Math.random() * 1.1) * dpr,
      speed: (0.15 + Math.random() * 0.25) * dpr,
    };
  }

  function seedParticles() {
    const cfg = THEMES[theme];
    const count = Math.round(cfg.base * intensity * (w / 1000));
    particles = [];
    for (let i = 0; i < count; i++) {
      if (cfg.particle === 'rain') particles.push(makeRain());
      else if (cfg.particle === 'snow') particles.push(makeSnow());
      else if (cfg.particle === 'stars') particles.push(makeStar());
      else if (cfg.particle === 'clouds') particles.push(makeCloud());
    }
  }

  function drawSky() {
    const cfg = THEMES[theme];
    const elapsed = performance.now() - themeChangedAt;
    const t = reduceMotion ? 1 : Math.min(1, elapsed / THEME_FADE_MS);
    const prevCfg = THEMES[prevTheme];

    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (t < 1 && prevCfg !== cfg) {
      g.addColorStop(0, lerpColor(prevCfg.sky[0], cfg.sky[0], t));
      g.addColorStop(0.55, lerpColor(prevCfg.sky[1], cfg.sky[1], t));
      g.addColorStop(1, lerpColor(prevCfg.sky[2], cfg.sky[2], t));
    } else {
      g.addColorStop(0, cfg.sky[0]);
      g.addColorStop(0.55, cfg.sky[1]);
      g.addColorStop(1, cfg.sky[2]);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (cfg.storm && !reduceMotion) {
      const now = performance.now();
      if (now - lastFlash > (2200 + Math.random() * 4000)) {
        lastFlash = now;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  function drawParticles() {
    const cfg = THEMES[theme];
    ctx.lineCap = 'round';

    if (cfg.particle === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,255,0.5)';
      ctx.lineWidth = 1.4 * dpr;
      particles.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.drift, p.y + p.len);
        ctx.stroke();
        if (!reduceMotion) { p.y += p.speed; p.x += p.drift * 0.3; }
        if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
      });
    } else if (cfg.particle === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (!reduceMotion) {
          p.y += p.speed;
          p.sway += 0.02;
          p.x += Math.sin(p.sway) * 0.6;
        }
        if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
      });
    } else if (cfg.particle === 'stars') {
      particles.forEach(p => {
        const alpha = reduceMotion ? 0.7 : 0.4 + Math.abs(Math.sin(p.tw)) * 0.6;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        if (!reduceMotion) p.tw += 0.015;
      });
    } else if (cfg.particle === 'clouds') {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      particles.forEach(p => {
        drawCloudShape(p.x, p.y, p.scale);
        if (!reduceMotion) p.x += p.speed;
        if (p.x - 80 * p.scale > w) p.x = -80 * p.scale;
      });
    } else if (cfg.particle === 'sun') {
      drawSun();
    }

    if (theme === 'mist') {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(0, (h / 5) * i + (reduceMotion ? 0 : Math.sin(performance.now() / 2000 + i) * 6), w, 2 * dpr);
      }
    }
  }

  function drawCloudShape(x, y, scale) {
    ctx.beginPath();
    ctx.ellipse(x, y, 30 * scale, 16 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * scale, y + 4 * scale, 22 * scale, 13 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 22 * scale, y + 5 * scale, 20 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSun() {
    const cx = w * 0.8, cy = h * 0.18, r = Math.min(w, h) * 0.05;
    const t = reduceMotion ? 0 : performance.now() / 1000;
    ctx.strokeStyle = 'rgba(255,235,180,0.35)';
    ctx.lineWidth = 2 * dpr;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3);
      ctx.lineTo(cx + Math.cos(a) * r * 1.9, cy + Math.sin(a) * r * 1.9);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.1);
    g.addColorStop(0, 'rgba(255,244,214,0.95)');
    g.addColorStop(1, 'rgba(255,244,214,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    drawSky();
    drawParticles();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (rafId) return;
    loop();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ---- Public API ----

  function setTheme(key, opts = {}) {
    if (!THEMES[key]) key = 'clear-day';
    if (key !== theme) {
      prevTheme = theme;
      themeChangedAt = performance.now();
    }
    theme = key;
    intensity = opts.intensity || 1;
    document.body.className = `theme-${key}`;
    seedParticles();
  }

  function mapConditionToTheme(id, icon) {
    const isDay = icon ? icon.endsWith('d') : true;
    if (id >= 200 && id < 300) return 'thunderstorm';
    if (id >= 300 && id < 600) return 'rain';
    if (id >= 600 && id < 700) return 'snow';
    if (id >= 700 && id < 800) return 'mist';
    if (id === 800) return isDay ? 'clear-day' : 'clear-night';
    if (id > 800) return 'clouds';
    return 'clear-day';
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  resize();
  start();

  return {
    setTheme,
    mapConditionToTheme,
    makeRain,
    makeSnow,
    get theme() { return theme; },
  };
})();
