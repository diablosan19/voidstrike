// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 field is
// scaled to fit the window and centred; the margin keeps the backdrop colour. Everything is
// drawn in code — neon strokes and additive glows over a parallax starfield and nebula wash.
// Screen shake is a pure function of the world's clock, so a staged frame shakes identically
// every time it is drawn.
import { COMBO, FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND_BOSS, KIND_MINI, KIND_ORBITER, KIND_SPLITTER, PICKUP_RAPID } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

/** 28750 -> "28,750", spelled the same on every machine (no locale in screenshots). */
function format(n) {
  const digits = String(Math.floor(n));
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return out;
}

function cachedLabel(build) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = build(next);
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel((n) => format(n));
  const waveLabel = cachedLabel((n) => `WAVE ${n}`);
  const comboLabel = cachedLabel((n) => `x${n} COMBO`);
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** A pointer position in client (CSS) pixels, in field coordinates. */
  function toField(clientX, clientY) {
    return {
      x: (clientX * view.ratio - view.x) / view.scale,
      y: (clientY * view.ratio - view.y) / view.scale,
    };
  }

  function text(value, x, y, size, color, align, weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawBackdrop(state) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Nebula: five wide radial washes, laid down additively so overlaps bloom.
    context.globalCompositeOperation = 'lighter';
    for (const nebula of state.nebulas) {
      const gradient = context.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.radius);
      gradient.addColorStop(0, nebula.color + '55');
      gradient.addColorStop(1, nebula.color + '00');
      context.fillStyle = gradient;
      context.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2);
    }
    context.globalCompositeOperation = 'source-over';
    // Stars drift against the ship's offset from centre: the nearer the layer, the more it moves.
    const px = (state.player.x - FIELD.width / 2) / FIELD.width;
    const py = (state.player.y - FIELD.height / 2) / FIELD.height;
    for (const star of state.stars) {
      const depthShift = (star.depth + 1) * 7;
      const twinkle = 0.55 + 0.45 * Math.sin(state.time * (1.4 + star.depth * 0.5) + star.phase);
      context.globalAlpha = twinkle * (0.35 + star.depth * 0.3);
      context.fillStyle = '#dbeafe';
      const x = star.x - px * depthShift;
      const y = star.y - py * depthShift;
      context.fillRect(x, y, star.size, star.size);
    }
    context.globalAlpha = 1;
  }

  function drawShip(state) {
    const player = state.player;
    if (player.dead) return;
    // Blink through post-hit invulnerability; a dashing ship stays solid behind its shield ring.
    const dashing = player.dashTimer > 0;
    if (!dashing && player.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0) return;
    context.save();
    context.translate(player.x, player.y);
    context.rotate(player.angle);
    // Engine flame: longer under way, always flickering.
    const pace = Math.hypot(player.vx, player.vy);
    const flame = 7 + Math.min(13, pace * 0.035) + Math.sin(state.time * 43) * 2.4;
    context.fillStyle = '#f59e0b';
    context.beginPath();
    context.moveTo(-11, 4.5);
    context.lineTo(-11 - flame, 0);
    context.lineTo(-11, -4.5);
    context.closePath();
    context.fill();
    // The hull: a swept dart, bright edge over a dark fill.
    context.beginPath();
    context.moveTo(19, 0);
    context.lineTo(-12, 11.5);
    context.lineTo(-7, 0);
    context.lineTo(-12, -11.5);
    context.closePath();
    context.fillStyle = '#0b2231';
    context.fill();
    context.strokeStyle = PALETTE.ship;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = PALETTE.shipCore;
    context.beginPath();
    context.arc(3, 0, 3.2, 0, TAU);
    context.fill();
    context.restore();
    if (dashing) {
      context.strokeStyle = 'rgba(103,232,249,0.75)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 7 + Math.sin(state.time * 40) * 1.5, 0, TAU);
      context.stroke();
    }
    if (player.muzzle > 0) {
      const nx = player.x + Math.cos(player.angle) * (player.radius + 12);
      const ny = player.y + Math.sin(player.angle) * (player.radius + 12);
      context.globalCompositeOperation = 'lighter';
      context.fillStyle = 'rgba(253,224,71,0.8)';
      context.beginPath();
      context.arc(nx, ny, 6.5, 0, TAU);
      context.fill();
      context.globalCompositeOperation = 'source-over';
    }
  }

  function enemyPath(enemy) {
    const r = enemy.radius;
    context.beginPath();
    if (enemy.kind === KIND_ORBITER) {
      context.arc(0, 0, r * 0.62, 0, TAU);
    } else if (enemy.kind === KIND_SPLITTER) {
      for (let index = 0; index < 6; index += 1) {
        const a = (index / 6) * TAU;
        if (index === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      context.closePath();
    } else if (enemy.kind === KIND_BOSS) {
      for (let index = 0; index < 8; index += 1) {
        const a = (index / 8) * TAU;
        if (index === 0) context.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else context.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      context.closePath();
    } else {
      // Chasers and minis: the same dart silhouette as the ship, flown by the other side.
      context.moveTo(r * 1.15, 0);
      context.lineTo(-r * 0.85, r * 0.78);
      context.lineTo(-r * 0.4, 0);
      context.lineTo(-r * 0.85, -r * 0.78);
      context.closePath();
    }
  }

  function drawEnemy(state, enemy) {
    const color = enemy.kind === KIND_ORBITER ? PALETTE.orbiter
      : enemy.kind === KIND_SPLITTER ? PALETTE.splitter
        : enemy.kind === KIND_MINI ? PALETTE.mini
          : enemy.kind === KIND_BOSS ? PALETTE.boss
            : PALETTE.chaser;
    context.save();
    context.translate(enemy.x, enemy.y);
    if (enemy.spawnIn > 0) {
      // Materialising: a contracting warning ring, the shape itself still translucent.
      const progress = 1 - enemy.spawnIn / 0.5;
      context.globalAlpha = 0.25 + progress * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(0, 0, enemy.radius + 16 * (1 - progress), 0, TAU);
      context.stroke();
    }
    const spin = enemy.kind === KIND_SPLITTER ? enemy.age * 0.9 + enemy.phase
      : enemy.kind === KIND_BOSS ? enemy.age * 0.3
        : enemy.kind === KIND_ORBITER ? 0
          : enemy.angle;
    context.rotate(spin);
    enemyPath(enemy);
    context.fillStyle = enemy.flash > 0 ? '#ffffff' : '#160a1c';
    context.fill();
    context.strokeStyle = enemy.flash > 0 ? '#ffffff' : color;
    context.lineWidth = enemy.kind === KIND_BOSS ? 3.5 : 2;
    context.stroke();
    if (enemy.kind === KIND_ORBITER) {
      // A satellite riding the orbit ring makes the strafing read at a glance.
      const a = state.time * 3.4 + enemy.phase;
      context.fillStyle = color;
      context.beginPath();
      context.arc(Math.cos(a) * enemy.radius, Math.sin(a) * enemy.radius, 3.6, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.shipCore;
      context.beginPath();
      context.arc(0, 0, 4, 0, TAU);
      context.fill();
    } else if (enemy.kind === KIND_BOSS) {
      const pulse = 8 + Math.sin(state.time * 4.2) * 2.2;
      context.fillStyle = color;
      context.beginPath();
      context.arc(0, 0, pulse, 0, TAU);
      context.fill();
    } else if (enemy.kind === KIND_SPLITTER && enemy.hp <= enemy.maxHp / 2) {
      // Cracked shell: the split is coming, and the drawing says so.
      context.strokeStyle = 'rgba(220,252,231,0.8)';
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(-enemy.radius * 0.7, -enemy.radius * 0.4);
      context.lineTo(0, 0);
      context.lineTo(enemy.radius * 0.6, -enemy.radius * 0.7);
      context.moveTo(0, 0);
      context.lineTo(enemy.radius * 0.2, enemy.radius * 0.75);
      context.stroke();
    } else if (enemy.kind !== KIND_ORBITER) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(0, 0, 3.4, 0, TAU);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawPickup(state, pickup) {
    const bob = Math.sin(state.time * 3.2 + pickup.phase) * 4;
    const blink = pickup.life < 2.5 && Math.floor(state.time * 6) % 2 === 0;
    context.save();
    context.translate(pickup.x, pickup.y + bob);
    context.globalAlpha = blink ? 0.3 : 1;
    const repair = pickup.kind !== PICKUP_RAPID;
    const color = repair ? PALETTE.repair : PALETTE.rapid;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 13 + Math.sin(state.time * 5 + pickup.phase) * 1.6, 0, TAU);
    context.stroke();
    context.fillStyle = color;
    if (repair) {
      context.fillRect(-2.5, -8, 5, 16);
      context.fillRect(-8, -2.5, 16, 5);
    } else {
      context.beginPath();
      context.moveTo(2.5, -9);
      context.lineTo(-4.5, 1.5);
      context.lineTo(0.5, 1.5);
      context.lineTo(-2.5, 9);
      context.lineTo(4.5, -1.5);
      context.lineTo(-0.5, -1.5);
      context.closePath();
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawEntities(state) {
    for (const pickup of state.pickups) if (pickup.active) drawPickup(state, pickup);
    for (const enemy of state.enemies) if (enemy.active) drawEnemy(state, enemy);

    context.globalCompositeOperation = 'lighter';
    for (const bullet of state.enemyBullets) {
      if (!bullet.active) continue;
      context.fillStyle = 'rgba(251,113,133,0.3)';
      context.beginPath();
      context.arc(bullet.x, bullet.y, 9.5, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.enemyBullet;
      context.beginPath();
      context.arc(bullet.x, bullet.y, 4.6, 0, TAU);
      context.fill();
    }
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.strokeStyle = state.player.rapidTimer > 0 ? PALETTE.rapidBullet : PALETTE.bullet;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.016, bullet.y - bullet.vy * 0.016);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    context.globalCompositeOperation = 'source-over';

    drawShip(state);

    context.globalCompositeOperation = 'lighter';
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      const half = particle.size / 2;
      context.fillRect(particle.x - half, particle.y - half, particle.size, particle.size);
    }
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;

    context.textBaseline = 'middle';
    for (const floater of state.floaters) {
      if (!floater.active) continue;
      context.globalAlpha = Math.max(0, floater.life / floater.maxLife);
      text(floater.text, floater.x, floater.y, floater.size, floater.color, 'center', 'bold');
    }
    context.globalAlpha = 1;
  }

  function bar(x, y, width, height, fraction, color) {
    context.fillStyle = 'rgba(10,14,24,0.8)';
    context.fillRect(x, y, width, height);
    context.fillStyle = color;
    context.fillRect(x + 2, y + 2, Math.max(0, (width - 4) * Math.min(1, fraction)), height - 4);
    context.strokeStyle = 'rgba(226,232,240,0.35)';
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
  }

  function drawHud(state) {
    const player = state.player;
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 30, PALETTE.text, 'left', 'bold');
    if (state.comboChain >= 2) {
      text(comboLabel(state.multiplier), 24, 54, 19, '#fbbf24', 'left', 'bold');
      bar(24, 80, 118, 6, state.comboTimer / COMBO.window, '#fbbf24');
    }
    text(waveLabel(Math.max(1, state.wave)), FIELD.width / 2, 18, 24, PALETTE.text, 'center', 'bold');

    // Hull and dash, bottom-left: the two numbers a pilot checks mid-fight.
    context.textBaseline = 'alphabetic';
    text('HULL', 24, FIELD.height - 52, 14, PALETTE.muted, 'left', 'bold');
    bar(66, FIELD.height - 66, 216, 15, player.hp / PLAYER.maxHp, player.hp <= 32 ? PALETTE.hullLow : PALETTE.hull);
    text('DASH', 24, FIELD.height - 22, 14, PALETTE.muted, 'left', 'bold');
    const dashReady = player.dashCooldown <= 0;
    bar(66, FIELD.height - 36, 130, 11, dashReady ? 1 : 1 - player.dashCooldown / PLAYER.dashCooldown, PALETTE.accent);
    if (player.rapidTimer > 0) {
      text(`RAPID ${player.rapidTimer.toFixed(1)}`, 320, FIELD.height - 52, 17, PALETTE.rapid, 'left', 'bold');
    }

    if (state.boss !== null && state.boss.active) {
      const boss = state.boss;
      text('DREADNOUGHT', FIELD.width / 2, 52, 15, PALETTE.boss, 'center', 'bold');
      bar(FIELD.width / 2 - 280, 60, 560, 13, boss.hp / boss.maxHp, PALETTE.boss);
    }
  }

  function drawBanner(state) {
    if (state.bannerTimer <= 0) return;
    const alpha = Math.min(1, state.bannerTimer / 0.55);
    context.globalAlpha = alpha;
    context.textBaseline = 'middle';
    text(state.bannerText, FIELD.width / 2, 150, 46, PALETTE.text, 'center', 'bold');
    context.globalAlpha = 1;
  }

  function drawVignette(state) {
    if (state.hurtTimer > 0) {
      context.globalAlpha = Math.min(0.5, state.hurtTimer * 1.3);
      const gradient = context.createRadialGradient(640, 360, 260, 640, 360, 720);
      gradient.addColorStop(0, 'rgba(239,68,68,0)');
      gradient.addColorStop(1, 'rgba(239,68,68,0.85)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }
    if (!state.player.dead && state.player.hp <= 32 && state.player.hp > 0) {
      context.globalAlpha = 0.16 + 0.12 * Math.sin(state.time * 5);
      const gradient = context.createRadialGradient(640, 360, 300, 640, 360, 720);
      gradient.addColorStop(0, 'rgba(239,68,68,0)');
      gradient.addColorStop(1, 'rgba(239,68,68,0.9)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }
  }

  function panel(width, height) {
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(5,8,18,0.72)';
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = 'rgba(34,211,238,0.4)';
    context.lineWidth = 1.5;
    context.stroke();
    return { x, y };
  }

  function drawTitle(state, best) {
    context.fillStyle = 'rgba(3,4,10,0.42)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'middle';
    const glow = 16 + Math.sin(state.time * 2.2) * 6;
    context.save();
    context.shadowColor = PALETTE.accent;
    context.shadowBlur = glow;
    text('VOIDSTRIKE', FIELD.width / 2, 168, 96, '#ecfeff', 'center', 'bold');
    context.restore();
    text('N E O N   A R E N A   S U R V I V A L', FIELD.width / 2, 232, 21, PALETTE.accent, 'center', 'bold');
    const lines = [
      'WASD / Arrows to fly — mouse to aim — hold click to fire',
      'Shift / Space to dash: a burst of speed, untouchable mid-dash',
      'Chain kills to raise your combo multiplier',
      'Salvage +HULL and RAPID cores from the wreckage',
      'Every 5th wave, the Dreadnought comes for you',
    ];
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, 316 + index * 33, 20, PALETTE.muted, 'center');
    }
    if (best > 0) text(`BEST ${scoreLabel(best)}`, FIELD.width / 2, 520, 21, '#fbbf24', 'center', 'bold');
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    context.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, 586, 25, PALETTE.text, 'center', 'bold');
    context.globalAlpha = 1;
  }

  function drawOver(state, best) {
    const box = panel(620, 392);
    context.textBaseline = 'middle';
    text('SHIP DESTROYED', FIELD.width / 2, box.y + 66, 50, '#f87171', 'center', 'bold');
    text(`SCORE  ${scoreLabel(state.score)}`, FIELD.width / 2, box.y + 140, 36, PALETTE.text, 'center', 'bold');
    text(`WAVE ${Math.max(1, state.wave)} REACHED — ${state.kills} KILLS`, FIELD.width / 2, box.y + 196, 22, PALETTE.muted, 'center');
    text(`BEST  ${scoreLabel(Math.max(best, state.score))}`, FIELD.width / 2, box.y + 240, 22, '#fbbf24', 'center', 'bold');
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.4);
    context.globalAlpha = pulse;
    text('PRESS R OR CLICK TO FLY AGAIN', FIELD.width / 2, box.y + 322, 23, PALETTE.text, 'center', 'bold');
    context.globalAlpha = 1;
  }

  function drawPaused() {
    context.fillStyle = 'rgba(3,4,10,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.textBaseline = 'middle';
    text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 24, 52, PALETTE.text, 'center', 'bold');
    text('P or Esc to resume', FIELD.width / 2, FIELD.height / 2 + 34, 21, PALETTE.muted, 'center');
  }

  /** Paint one frame: the arena, the HUD, then whatever the current screen lays over it. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Shake is a pure function of the world clock: same time, same offset, every draw.
    const shakeX = state.shake * Math.sin(state.time * 131.7) * 0.6;
    const shakeY = state.shake * Math.cos(state.time * 149.3) * 0.6;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackdrop(state);
    drawEntities(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    drawBanner(state);
    drawVignette(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
