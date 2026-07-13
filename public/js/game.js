/* js/game.js
   "Storm Dodge" — a small arcade game that uses the *actual* current
   weather (condition + wind speed) to decide what falls and how fast.
   Drop rendering mirrors Sky's rain/snow look so the in-game obstacles
   feel like the same weather as the ambient background. */

const Game = (() => {
  const overlay = document.getElementById('game-overlay');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('game-score');
  const bestEl = document.getElementById('game-best');
  const startScreen = document.getElementById('game-start');
  const overScreen = document.getElementById('game-over');
  const finalScoreEl = document.getElementById('final-score');
  const subEl = document.getElementById('game-sub');

  const BEST_KEY = 'skyline-storm-best';
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let state = 'idle'; // idle | playing | over
  let player, drops, coins, score, best, spawnTimer, spawnEvery, elapsed, rafId;
  let dropKind = 'rain'; // rain | snow
  let dropSpeedMul = 1;
  let pointerActive = false;

  best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = best;

  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(rect.width * dpr);
    H = canvas.height = Math.floor(rect.height * dpr);
  }

  function resetState() {
    fitCanvas();
    player = { x: W / 2, y: H - 50 * dpr, r: 16 * dpr, speed: 6.2 * dpr };
    drops = [];
    coins = [];
    score = 0;
    elapsed = 0;
    spawnTimer = 0;
    spawnEvery = 46;
    scoreEl.textContent = '0';
  }

  // Called by app.js once real weather data is in, so the game reflects
  // what's actually happening outside right now. Always playable —
  // calm weather just means a lighter, default shower rather than nothing.
  function setConditions(themeKey, windSpeedMs = 3) {
    dropKind = themeKey === 'snow' ? 'snow' : 'rain';
    dropSpeedMul = Math.min(2.1, 0.85 + windSpeedMs / 9);

    const isLive = themeKey === 'rain' || themeKey === 'thunderstorm' || themeKey === 'snow';
    if (isLive) {
      const label = themeKey === 'snow' ? 'snowflakes' : themeKey === 'thunderstorm' ? 'lightning rain' : 'raindrops';
      subEl.textContent = `Live wind: ${windSpeedMs.toFixed(1)} m/s — dodge the ${label} actually falling on you.`;
    } else {
      subEl.textContent = `Clear outside right now, so here's a practice shower — wind's at ${windSpeedMs.toFixed(1)} m/s.`;
    }
    return isLive;
  }

  function spawnDrop() {
    const x = Math.random() * W;
    if (dropKind === 'snow') {
      drops.push({ kind: 'snow', x, y: -10 * dpr, r: (3 + Math.random() * 3) * dpr,
        vy: (1.6 + Math.random() * 1.4) * dpr * dropSpeedMul, sway: Math.random() * Math.PI * 2 });
    } else {
      drops.push({ kind: 'rain', x, y: -20 * dpr, len: (16 + Math.random() * 14) * dpr,
        vy: (7 + Math.random() * 5) * dpr * dropSpeedMul, drift: (Math.random() - 0.3) * 2 * dpr });
    }
    if (Math.random() < 0.06) {
      coins.push({ x: Math.random() * W, y: -10 * dpr, r: 8 * dpr, vy: 3.4 * dpr });
    }
  }

  function update() {
    elapsed++;
    score += 1;
    if (elapsed % 6 === 0) scoreEl.textContent = Math.floor(score / 6);

    spawnEvery = Math.max(14, 46 - Math.floor(elapsed / 90));
    spawnTimer++;
    if (spawnTimer >= spawnEvery) { spawnTimer = 0; spawnDrop(); }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.vy;
      if (d.kind === 'snow') { d.sway += 0.03; d.x += Math.sin(d.sway) * 0.5; }
      else { d.x += d.drift; }

      const dx = d.x - player.x, dy = d.y - player.y;
      const hitR = (d.kind === 'snow' ? d.r : 5 * dpr) + player.r * 0.7;
      if (dx * dx + dy * dy < hitR * hitR) { return gameOver(); }

      if (d.y - 20 * dpr > H) drops.splice(i, 1);
    }

    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.y += c.vy;
      const dx = c.x - player.x, dy = c.y - player.y;
      if (dx * dx + dy * dy < (c.r + player.r) * (c.r + player.r)) {
        score += 60;
        coins.splice(i, 1);
        continue;
      }
      if (c.y - 20 * dpr > H) coins.splice(i, 1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // faint instrument grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 30 * dpr) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }

    ctx.lineCap = 'round';
    if (dropKind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      drops.forEach(d => { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); });
    } else {
      ctx.strokeStyle = 'rgba(160,200,255,0.85)';
      ctx.lineWidth = 2 * dpr;
      drops.forEach(d => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.drift * 2, d.y + d.len); ctx.stroke(); });
    }

    ctx.fillStyle = '#ffd27a';
    coins.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // player — small shield glyph
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0f02';
    ctx.beginPath();
    ctx.arc(player.x, player.y - player.r * 0.15, player.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function loop() {
    if (state !== 'playing') return;
    update();
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function gameOver() {
    state = 'over';
    cancelAnimationFrame(rafId);
    const finalScore = Math.floor(score / 6);
    finalScoreEl.textContent = finalScore;
    if (finalScore > best) {
      best = finalScore;
      localStorage.setItem(BEST_KEY, String(best));
    }
    bestEl.textContent = best;
    overScreen.hidden = false;
  }

  function play() {
    state = 'playing';
    startScreen.hidden = true;
    overScreen.hidden = true;
    resetState();
    rafId = requestAnimationFrame(loop);
  }

  // ---- Controls ----

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (state !== 'playing') return;
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  setInterval(() => {
    if (state !== 'playing' || !player) return;
    if (keys.has('arrowleft') || keys.has('a')) player.x -= player.speed;
    if (keys.has('arrowright') || keys.has('d')) player.x += player.speed;
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));
  }, 16);

  function pointerToX(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) * dpr;
  }

  canvas.addEventListener('pointerdown', e => { pointerActive = true; if (player) player.x = pointerToX(e); });
  canvas.addEventListener('pointermove', e => { if (pointerActive && player) player.x = Math.max(player.r, Math.min(W - player.r, pointerToX(e))); });
  window.addEventListener('pointerup', () => { pointerActive = false; });

  window.addEventListener('resize', () => { if (state === 'playing') fitCanvas(); });

  document.getElementById('game-start-btn').addEventListener('click', play);
  document.getElementById('game-retry-btn').addEventListener('click', play);
  document.getElementById('game-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  function open() {
    overlay.hidden = false;
    state = 'idle';
    startScreen.hidden = false;
    overScreen.hidden = true;
    fitCanvas();
  }

  function close() {
    overlay.hidden = true;
    state = 'idle';
    cancelAnimationFrame(rafId);
  }

  return { open, close, setConditions };
})();
