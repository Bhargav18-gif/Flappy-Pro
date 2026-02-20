// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CVS   = document.getElementById('gameCanvas');
const CTX   = CVS ? CVS.getContext('2d') : null;
const PREV  = document.getElementById('bird-preview');
const PCTX  = PREV ? PREV.getContext('2d') : null;

// Validate game canvas exists
if (!CVS || !CTX || !PREV || !PCTX) {
  console.error('[Game] Missing required game DOM elements. Ensure index.html has gameCanvas and bird-preview.');
  throw new Error('Game initialization failed: missing DOM elements');
}

const GRAVITY   = 0.38;
const JUMP      = -8.0;
const WIN_SCORE = 10;
const PIPE_W    = 64;
let pipeGap     = 200;
const PIPE_INT  = 90;
const BASE_SPD  = 3.2;
const BIRD_COLORS = ['#00f5c4', '#ff3cac', '#ffd166', '#7b61ff', '#ff8c00'];

// ─── STATE ────────────────────────────────────────────────────────────────────
let W, H, state, frame, score, best, lives, pipes, particles, speedMult;
let bird, bgScroll, groundScroll;
let isMuted = false;
let godMode = false;

// ─── AUDIO ───────────────────────────────────────────────────────────────────
let actx;
function getActx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function playTone(freq, type, dur, gainVal = 0.25) {
  if (isMuted) return;
  try {
    const a = getActx();
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, a.currentTime);
    const volScale = (window.innerWidth < 600) ? 0.6 : 1.0;
    g.gain.setValueAtTime(gainVal * volScale, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.start();
    o.stop(a.currentTime + dur);
  } catch (error) {
    // Audio context unavailable, silently fail
  }
}

function playFlap()  { playTone(520, 'triangle', 0.1, 0.18); }
function playScore() { playTone(880, 'sine', 0.12, 0.2); }
function playHit()   { playTone(100, 'sawtooth', 0.3, 0.35); }
// Preload audio
let winAudio = null;
function preloadWinAudio() {
  if (winAudio) return; // Already preloaded
  try {
    winAudio = new Audio('assets/win.mp3');
    winAudio.volume = (window.innerWidth < 600) ? 0.4 : 0.7;
    winAudio.preload = 'auto';
    winAudio.onerror = () => {
      console.warn('[Game] Win audio failed to load, using synth fallback');
      winAudio = null;
    };
  } catch (error) {
    console.warn('[Game] Could not create audio element:', error.message);
  }
}

function playWin() {
  try {
    // Try to play custom audio file if preloaded
    if (winAudio) {
      winAudio.volume = (window.innerWidth < 600) ? 0.4 : 0.7;
      winAudio.currentTime = 0; // Reset to start
      const playPromise = winAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.warn('[Game] Audio play failed, using synth');
          playWinSynth();
        });
      }
    } else {
      playWinSynth();
    }
  } catch (error) {
    console.warn('[Game] Error playing win audio:', error.message);
    playWinSynth();
  }
}


function playWinSynth() {
  try {
    const a = getActx();
    const notes = [523, 659, 784, 1047];
    const volScale = (window.innerWidth < 600) ? 0.6 : 1.0;
    notes.forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, a.currentTime + i * 0.15);
      g.gain.linearRampToValueAtTime(0.2 * volScale, a.currentTime + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.15 + 0.4);
      o.start(a.currentTime + i * 0.15);
      o.stop(a.currentTime + i * 0.15 + 0.5);
    });
  } catch (error) {
    // Audio context unavailable, silently fail
  }
}

// ─── RESIZE ───────────────────────────────────────────────────────────────────
function resize() {
  const wrap = document.getElementById('game-wrap');
  W = CVS.width  = wrap.clientWidth;
  H = CVS.height = wrap.clientHeight;
  // Adjust pipe gap for short landscape screens to prevent impossible pipes
  pipeGap = (H < 550) ? 160 : 200;
}

// ─── BIRD DRAWING ─────────────────────────────────────────────────────────────
function drawBirdShape(ctx, x, y, w, h, angle = 0, color = '#00f5c4') {
  ctx.save();
  ctx.translate(x + w/2, y + h/2);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(-w*0.15, -h*0.15, 1, 0, 0, w/2);
  bg.addColorStop(0, '#fff');
  bg.addColorStop(0.3, color);
  bg.addColorStop(1, shadeColor(color, -40));
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  ctx.rotate(0.3);
  ctx.beginPath();
  ctx.ellipse(-w*0.15, h*0.12, w*0.28, h*0.18, -0.5, 0, Math.PI*2);
  ctx.fillStyle = shadeColor(color, -20);
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(w*0.2, -h*0.1, h*0.18, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 1;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w*0.23, -h*0.1, h*0.1, 0, Math.PI*2);
  ctx.fillStyle = '#111';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w*0.26, -h*0.14, h*0.04, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w*0.45, -h*0.05);
  ctx.lineTo(w*0.7, 0);
  ctx.lineTo(w*0.45, h*0.1);
  ctx.closePath();
  ctx.fillStyle = '#ffd166';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, w/2 + 2, h/2 + 2, 0, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,245,196,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, Math.max(0, (n>>16) + pct));
  const g = Math.min(255, Math.max(0, ((n>>8)&0xFF) + pct));
  const b = Math.min(255, Math.max(0, (n&0xFF) + pct));
  return `rgb(${r},${g},${b})`;
}

// ─── PIPE DRAWING ─────────────────────────────────────────────────────────────
function drawPipe(x, topH, gapY) {
  const botY = gapY + pipeGap;
  const botH = H - botY - 60;

  const drawOnePipe = (px, py, ph, flip) => {
    if (ph <= 0) return;
    const grad = CTX.createLinearGradient(px, py, px + PIPE_W, py);
    grad.addColorStop(0, '#0e5f3c');
    grad.addColorStop(0.3, '#1aff8a33');
    grad.addColorStop(0.5, '#1aff8a22');
    grad.addColorStop(1, '#061f14');
    CTX.fillStyle = grad;
    CTX.beginPath();
    CTX.roundRect(px + 4, py, PIPE_W - 8, ph, flip ? [0,0,6,6] : [6,6,0,0]);
    CTX.fill();

    const capY = flip ? py + ph - 16 : py - 6;
    const capH = 22;
    CTX.fillStyle = '#0e5f3c';
    CTX.beginPath();
    CTX.roundRect(px, flip ? capY - capH : capY, PIPE_W, capH + 6, 6);
    CTX.fill();

    CTX.fillStyle = 'rgba(26,255,138,0.15)';
    CTX.beginPath();
    CTX.roundRect(px + 8, py + (flip ? 0 : 4), 6, ph - 4, 3);
    CTX.fill();

    CTX.strokeStyle = 'rgba(26,255,138,0.3)';
    CTX.lineWidth = 1.5;
    CTX.beginPath();
    CTX.roundRect(px + 4, py, PIPE_W - 8, ph, flip ? [0,0,6,6] : [6,6,0,0]);
    CTX.stroke();
  };

  drawOnePipe(x, 0, topH, true);
  drawOnePipe(x, botY, botH, false);
}

// ─── GROUND ───────────────────────────────────────────────────────────────────
function drawGround() {
  const gh = 60;
  const gy = H - gh;
  const grad = CTX.createLinearGradient(0, gy, 0, H);
  grad.addColorStop(0, '#1a1040');
  grad.addColorStop(0.2, '#0d0d2b');
  grad.addColorStop(1, '#080818');
  CTX.fillStyle = grad;
  CTX.fillRect(0, gy, W, gh);

  CTX.strokeStyle = 'rgba(0,245,196,0.5)';
  CTX.lineWidth = 1.5;
  CTX.beginPath();
  CTX.moveTo(0, gy);
  CTX.lineTo(W, gy);
  CTX.stroke();

  CTX.strokeStyle = 'rgba(0,245,196,0.12)';
  CTX.lineWidth = 1;
  const dw = 30, gap = 20;
  for (let i = -dw; i < W + dw; i += dw + gap) {
    const xi = ((i + groundScroll) % (W + dw + gap)) - dw;
    CTX.beginPath();
    CTX.moveTo(xi, gy + 20);
    CTX.lineTo(xi + dw, gy + 20);
    CTX.stroke();
  }
}

// ─── BACKGROUND ELEMENTS ─────────────────────────────────────────────────────
function drawBackground() {
  const grad = CTX.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0d0d2b');
  grad.addColorStop(0.6, '#1a1040');
  grad.addColorStop(1, '#120d30');
  CTX.fillStyle = grad;
  CTX.fillRect(0, 0, W, H);

  CTX.fillStyle = 'rgba(255,255,255,0.025)';
  const buildings = [
    [0.05, 0.6, 0.08, 0.3],
    [0.12, 0.5, 0.06, 0.4],
    [0.2, 0.55, 0.1, 0.35],
    [0.32, 0.45, 0.07, 0.45],
    [0.42, 0.6, 0.09, 0.3],
    [0.55, 0.5, 0.06, 0.4],
    [0.63, 0.42, 0.08, 0.48],
    [0.73, 0.55, 0.1, 0.35],
    [0.85, 0.48, 0.07, 0.42],
    [0.93, 0.6, 0.06, 0.3],
  ];
  buildings.forEach(([x, y, w, h]) => {
    const bx = ((x * W - bgScroll * 0.3) % W + W) % W;
    CTX.fillRect(bx, y * H, w * W, h * H);
    CTX.fillStyle = 'rgba(0,245,196,0.06)';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        if (Math.random() > 0.4)
          CTX.fillRect(bx + c * (w*W/3.5) + 4, y*H + r * (h*H/4.5) + 6, 4, 5);
      }
    }
    CTX.fillStyle = 'rgba(255,255,255,0.025)';
  });
}

// ─── PARTICLES ───────────────────────────────────────────────────────────────
function spawnParticles(x, y) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: 2 + Math.random() * 4,
      color: Math.random() > 0.5 ? '#00f5c4' : '#ff3cac',
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.035;
    CTX.save();
    CTX.globalAlpha = p.life;
    CTX.fillStyle = p.color;
    CTX.shadowColor = p.color;
    CTX.shadowBlur = 6;
    CTX.beginPath();
    CTX.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    CTX.fill();
    CTX.restore();
  });
}

// ─── SCORE POPUP ─────────────────────────────────────────────────────────────
function spawnScorePopup(x, y) {
  const el = document.createElement('div');
  el.className = 'score-particle';
  el.textContent = '+1';
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  document.getElementById('game-wrap').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init(fromState = 'start') {
  frame = 0; score = 0; lives = 3; pipes = []; particles = [];
  bgScroll = 0; groundScroll = 0;
  speedMult = 1;

  bird = {
    x: W * 0.2,
    y: H * 0.45,
    w: 44, h: 32,
    vy: 0,
    angle: 0,
    trail: [],
    color: BIRD_COLORS[0],
  };

  document.getElementById('score').textContent = '0';
  updateLives();

  if (fromState === 'start') {
    setState('start');
  } else {
    setState('playing');
  }
}

// ─── LIVES UI ─────────────────────────────────────────────────────────────────
function updateLives() {
  ['life-1','life-2','life-3'].forEach((id, i) => {
    const dot = document.getElementById(id);
    dot.classList.toggle('lost', i >= lives);
  });
}

// ─── CONFETTI GENERATOR ───────────────────────────────────────────────────────
function generateConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) {
    console.warn('[Game] Confetti container not found');
    return;
  }
  
  // Clear any existing confetti
  container.innerHTML = '';
  
  const colors = ['#00f5c4', '#ff3cac', '#ffd166'];
  const confettiCount = 35; // Reduced to prevent lag
  
  // Create confetti particles
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = (Math.random() * 0.5) + 's';
    confetti.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    container.appendChild(confetti);
  }
  
  // Remove confetti after animation completes
  setTimeout(() => {
    const children = Array.from(container.querySelectorAll('.confetti'));
    children.forEach(el => el.remove());
  }, 3500);
}

// ─── TYPING EFFECT ───────────────────────────────────────────────────────────
function typeCustomMessage() {
  const msg = document.getElementById('custom-msg');
  if (!msg) return;
  
  // Clear previous content
  msg.innerHTML = '';
  
  // Create elements with styles
  const p1 = document.createElement('p');
  p1.style.cssText = "color:var(--neon2); font-size:1rem; letter-spacing:1px; margin-bottom:8px; text-transform:uppercase; font-weight:700; min-height:1.2em;";
  
  const p2 = document.createElement('p');
  p2.style.cssText = "color:var(--gold); font-size:1.2rem; font-weight:800; letter-spacing:2px; min-height:1.2em;";
  
  msg.appendChild(p1);
  msg.appendChild(p2);

  const text1 = "Erripuka edhi cheyyamani cheppina chesesthava?";
  const text2 = "#PaniMODDAledha?";
  
  let i = 0;
  function type1() {
    if (i < text1.length) {
      p1.textContent += text1.charAt(i);
      i++;
      setTimeout(type1, 40);
    } else {
      i = 0;
      setTimeout(type2, 300);
    }
  }
  function type2() {
    if (i < text2.length) {
      p2.textContent += text2.charAt(i);
      i++;
      setTimeout(type2, 60);
    } else {
      p1.setAttribute('data-text', p1.textContent);
      p2.setAttribute('data-text', p2.textContent);
      p1.classList.add('glitch-text');
      p2.classList.add('glitch-text');
    }
  }
  type1();
}

// ─── STATE MACHINE ───────────────────────────────────────────────────────────
function setState(s) {
  state = s;
  document.getElementById('start-screen').classList.toggle('visible', s === 'start');
  document.getElementById('dead-screen').classList.toggle('visible', s === 'dead');
  document.getElementById('win-screen').classList.toggle('visible', s === 'win');
  document.getElementById('hud').style.opacity = (s === 'playing') ? '1' : '0';
  document.getElementById('lives-wrap').style.opacity = (s === 'playing') ? '1' : '0';
  
  if (s === 'win') {
    generateConfetti();
    typeCustomMessage();
  }
}

// ─── COLLISION ───────────────────────────────────────────────────────────────
function checkCollision(pipe) {
  const bx = bird.x, by = bird.y, bw = bird.w - 8, bh = bird.h - 6;
  const px = pipe.x, pw = PIPE_W;
  if (bx + bw < px || bx > px + pw) return false;
  const topH = pipe.topH, botY = topH + pipeGap;
  return by < topH || by + bh > botY;
}

// ─── SHOW RESULT ─────────────────────────────────────────────────────────────
function showDead() {
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-best').textContent = best;

  const badge = document.getElementById('rank-badge');
  badge.className = 'rank-badge';
  if (score >= 8) { badge.classList.add('rank-legend'); badge.textContent = '🌟 Legend'; }
  else if (score >= 5) { badge.classList.add('rank-gold'); badge.textContent = '🥇 Gold'; }
  else if (score >= 3) { badge.classList.add('rank-silver'); badge.textContent = '🥈 Silver'; }
  else { badge.classList.add('rank-bronze'); badge.textContent = '🥉 Rookie'; }

  setState('dead');
}

// ─── BIRD TRAIL ──────────────────────────────────────────────────────────────
function drawTrail() {
  bird.trail.push({ x: bird.x + bird.w/2, y: bird.y + bird.h/2 });
  if (bird.trail.length > 10) bird.trail.shift();
  bird.trail.forEach((p, i) => {
    const alpha = (i / bird.trail.length) * 0.4;
    const size = (i / bird.trail.length) * 8;
    CTX.save();
    CTX.globalAlpha = alpha;
    CTX.fillStyle = bird.color;
    CTX.shadowColor = bird.color;
    CTX.shadowBlur = 8;
    CTX.beginPath();
    CTX.arc(p.x, p.y, size, 0, Math.PI * 2);
    CTX.fill();
    CTX.restore();
  });
}

// ─── MAIN LOOP ───────────────────────────────────────────────────────────────
let raf;
function loop() {
  raf = requestAnimationFrame(loop);
  CTX.clearRect(0, 0, W, H);

  drawBackground();

  const spd = BASE_SPD * speedMult;

  if (state === 'playing') {
    bgScroll     += spd * 0.4;
    groundScroll -= spd * 1.5;

    bird.vy += GRAVITY;
    bird.y  += bird.vy;
    bird.angle = Math.max(-0.5, Math.min(1.2, bird.vy * 0.08));

    if (bird.y + bird.h >= H - 60) {
      bird.y = H - 60 - bird.h;
      handleHit();
    }
    if (bird.y <= 0) { bird.y = 0; bird.vy = 0; }

    if (frame % PIPE_INT === 0) {
      const margin = (H < 550) ? 50 : 80;
      const maxT = Math.max(margin + 20, H - margin - pipeGap - margin);
      pipes.push({ x: W, topH: margin + Math.random() * (maxT - margin), passed: false });
    }

    pipes.forEach(p => {
      p.x -= spd;
      drawPipe(p.x, p.topH, p.topH);

      if (checkCollision(p)) handleHit();

      if (!p.passed && p.x + PIPE_W < bird.x) {
        p.passed = true;
        score++;
        best = Math.max(best, score);
        document.getElementById('score').textContent = score;
        document.getElementById('best-score').textContent = best;
        document.getElementById('score').classList.remove('pop');
        void document.getElementById('score').offsetWidth;
        document.getElementById('score').classList.add('pop');
        bird.color = BIRD_COLORS[score % BIRD_COLORS.length];
        spawnParticles(bird.x, bird.y);
        spawnScorePopup(bird.x + 20, bird.y - 20);
        playScore();

        if (score >= WIN_SCORE) {
          setState('win');
          playWin();
          return;
        }
      }
    });

    pipes = pipes.filter(p => p.x + PIPE_W > -10);
    frame++;
  } else if (state === 'start') {
    bgScroll += 0.8;
    bird.y = H * 0.45 + Math.sin(Date.now() / 600) * 12;
    bird.angle = Math.sin(Date.now() / 600) * 0.15;
  }

  drawGround();
  drawTrail();
  drawBirdShape(CTX, bird.x, bird.y, bird.w, bird.h, bird.angle, bird.color);
  updateParticles();
}

// ─── HIT HANDLER ──────────────────────────────────────────────────────────────
let hitCooldown = false;
function handleHit() {
  if (godMode) return;
  if (hitCooldown) return;
  hitCooldown = true;
  setTimeout(() => hitCooldown = false, 500);

  playHit();
  spawnParticles(bird.x + bird.w/2, bird.y + bird.h/2);
  document.getElementById('game-wrap').classList.add('shaking');
  setTimeout(() => document.getElementById('game-wrap').classList.remove('shaking'), 400);

  lives--;
  updateLives();

  if (lives <= 0) {
    state = 'gameover_anim';
    bird.vy = -5;
    setTimeout(() => showDead(), 800);
    return;
  }

  bird.y  = H * 0.4;
  bird.vy = 0;
  bird.trail = [];
  pipes = [];
  frame = 0;
}

// ─── INPUT ───────────────────────────────────────────────────────────────────
function onInput(e) {
  // Prevent input if clicking UI elements (buttons, settings)
  if (e && e.target && (e.target.closest('button') || e.target.closest('.settings-panel'))) {
    return;
  }

  if (state === 'start') {
    setState('playing');
    bird.y = H * 0.45;
    bird.vy = 0;
    frame = 0;
    flap();
  } else if (state === 'playing') {
    flap();
  }
}

function flap() {
  bird.vy = JUMP;
  playFlap();
}

// Event listeners attached in bootGame() after DOM is ready

// ─── BIRD PREVIEW ANIMATION ──────────────────────────────────────────────────
let previewRaf;
function animPreview() {
  PCTX.clearRect(0, 0, 64, 48);
  const angle = Math.sin(Date.now() / 400) * 0.2;
  drawBirdShape(PCTX, 0, 0, 64, 48, angle);
  previewRaf = requestAnimationFrame(animPreview);
}

// ─── BOOT FUNCTION (called by route guard after auth check) ─────────────────
let listenersAttached = false;

function stopGame() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = null; }
}
window.stopGame = stopGame;

function bootGame() {
  console.log('[Game] Booting game...');
  stopGame();
  
  // Validate required DOM elements
  if (!CVS || !CTX || !PREV || !PCTX) {
    console.error('[Game] Game canvas missing!');
    throw new Error('Game canvas not found');
  }

  // Safely load best score from localStorage
  let bestScore = 0;
  try {
    bestScore = parseInt(localStorage.getItem('flappy_best') || '0', 10);
  } catch (error) {
    console.warn('[Game] localStorage unavailable');
  }
  best = bestScore;

  const bestScoreEl = document.getElementById('best-score');
  const finalBestEl = document.getElementById('final-best');
  
  if (bestScoreEl) bestScoreEl.textContent = best;
  if (finalBestEl) finalBestEl.textContent = best;

  // Preload win audio
  preloadWinAudio();
  console.log('[Game] Win audio preloaded');

  // Auto-save best score
  const saveInterval = setInterval(() => {
    if (best > 0) {
      try {
        localStorage.setItem('flappy_best', best.toString());
      } catch (error) {
        // localStorage unavailable, continue without saving
      }
    }
  }, 2000);

  // ─── ATTACH EVENT LISTENERS (NOW THAT DOM IS READY) ──────────────────────
  if (!listenersAttached) {
  try {
    // Game input - Attach to wrapper to capture events even if overlays are present
    const wrap = document.getElementById('game-wrap');
    wrap.addEventListener('mousedown', onInput, { passive: true });
    wrap.addEventListener('touchstart', e => {
      // Allow touch on buttons and settings to propagate (generate clicks)
      if (e.target.closest('button') || e.target.closest('.settings-panel')) return;
      e.preventDefault();
      onInput(e);
    }, { passive: false });

    // Spacebar input (global)
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') {
        e.preventDefault();
        onInput();
      }
    }, { passive: false });

    // Button clicks with null checks
    const retryBtn = document.getElementById('retry-btn');
    const menuBtn = document.getElementById('menu-btn');
    const winRetryBtn = document.getElementById('win-retry-btn');

    if (retryBtn) retryBtn.addEventListener('click', () => init('play'));
    else console.warn('[Game] retry-btn not found');

    if (menuBtn) menuBtn.addEventListener('click', () => init('start'));
    else console.warn('[Game] menu-btn not found');

    if (winRetryBtn) winRetryBtn.addEventListener('click', () => init('play'));
    else console.warn('[Game] win-retry-btn not found');

    // Cheat Code: Type 'god' to toggle God Mode
    let cheatCode = ['g', 'o', 'd'];
    let cheatIdx = 0;
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === cheatCode[cheatIdx]) {
        cheatIdx++;
        if (cheatIdx === cheatCode.length) {
          godMode = !godMode;
          cheatIdx = 0;
          console.log(`[Game] God Mode: ${godMode ? 'ON' : 'OFF'}`);
          const scoreEl = document.getElementById('score');
          if (scoreEl) {
            scoreEl.style.color = godMode ? '#ffd166' : '#fff';
            scoreEl.style.textShadow = godMode ? '0 0 20px #ffd166' : '';
          }
          playScore();
        }
      } else {
        cheatIdx = 0;
      }
    });

    // Window resize handler
    window.addEventListener('resize', () => { resize(); });

    // ─── INJECT CUSTOM UI ELEMENTS ──────────────────────────────────────────
    // 1. Mute Button
    const settingsPanel = document.querySelector('.settings-panel');
    if (settingsPanel && !document.getElementById('mute-btn')) {
      const muteBtn = document.createElement('button');
      muteBtn.id = 'mute-btn';
      muteBtn.className = 'settings-toggle';
      muteBtn.innerHTML = '🔊';
      muteBtn.onclick = (e) => {
        e.stopPropagation();
        isMuted = !isMuted;
        muteBtn.innerHTML = isMuted ? '🔇' : '🔊';
        muteBtn.style.borderColor = isMuted ? 'rgba(255,60,172,0.8)' : 'rgba(255,60,172,0.4)';
      };
      settingsPanel.insertBefore(muteBtn, settingsPanel.firstChild);
    }

    // 2. Custom Text on Win Screen
    const winScreen = document.getElementById('win-screen');
    const winCard = winScreen ? winScreen.querySelector('.win-card') : null;
    if (winCard && !document.getElementById('custom-msg')) {
      const msg = document.createElement('div');
      msg.id = 'custom-msg';
      winCard.appendChild(msg);
    }

    // 3. Developer Info in Footer
    const footer = document.getElementById('footer');
    if (footer) {
      footer.innerHTML = 'DEVELOPER: <span style="color:var(--neon)">SK</span> &nbsp;|&nbsp; 8328375448';
    }

    listenersAttached = true;
    console.log('[Game] Event listeners attached successfully');
  } catch (error) {
    console.error('[Game] Error attaching event listeners:', error.message);
  }
  }
  
  // Initialize game
  resize();
  init('start');
  animPreview();
  loop();
  
  console.log('[Game] Boot complete - game is running');
}

// Expose bootGame to window so route-guard can call it
window.bootGame = bootGame;

// Game only boots when route guard calls bootGame()
