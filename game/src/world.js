// VOIDSTRIKE's rules and state, with no drawing and no browser in it: the player's ship, pooled
// bullets, enemies, particles, floating score text and pickups, the wave director, the combo
// chain, screen shake and hit-stop. step() advances one fixed step and reports what happened as
// bit flags, so the caller can add sound and announcements without the world knowing about them.
//
// The world also exposes the small director's toolkit shots.js stages its scenes with —
// spawnEnemy, spawnBullet, burst and addFloater are the same functions the live game uses, so a
// staged frame is built from real parts, never from a parallel fake.
//
// Nothing allocates after createWorld returns: every entity lives in a pool made once at boot.
import { COMBO, ENEMY, FIELD, PICKUP, PLAYER, POOL, WAVE } from './config.js';

export const KIND_CHASER = 'chaser';
export const KIND_ORBITER = 'orbiter';
export const KIND_SPLITTER = 'splitter';
export const KIND_MINI = 'mini';
export const KIND_BOSS = 'boss';

export const PICKUP_REPAIR = 'repair';
export const PICKUP_RAPID = 'rapid';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_BIG_KILL = 8;
export const EVENT_PLAYER_HIT = 16;
export const EVENT_DASH = 32;
export const EVENT_PICKUP = 64;
export const EVENT_WAVE = 128;
export const EVENT_OVER = 256;
export const EVENT_BURST = 512;

const TAU = Math.PI * 2;

function makePool(size, make) {
  const pool = [];
  for (let index = 0; index < size; index += 1) pool.push(make());
  return pool;
}

function freeOf(pool) {
  for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
  return null;
}

function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2 + 90, vx: 0, vy: 0,
    angle: -Math.PI / 2, hp: PLAYER.maxHp, radius: PLAYER.radius,
    fireTimer: 0, muzzle: 0, dashTimer: 0, dashCooldown: 0, dashX: 0, dashY: 0,
    invulnerable: 0, rapidTimer: 0, trailTimer: 0, dead: false,
  };
  const bullets = makePool(POOL.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const enemyBullets = makePool(POOL.enemyBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const enemies = makePool(POOL.enemies, () => ({
    active: false, kind: KIND_CHASER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 10,
    angle: 0, age: 0, phase: 0, flash: 0, spawnIn: 0, fireTimer: 0, orbitDir: 1,
  }));
  const particles = makePool(POOL.particles, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 1,
  }));
  const floaters = makePool(POOL.floaters, () => ({ active: false, x: 0, y: 0, life: 0, maxLife: 1, text: '', color: '#ffffff', size: 20 }));
  const pickups = makePool(POOL.pickups, () => ({ active: false, kind: PICKUP_REPAIR, x: 0, y: 0, vx: 0, vy: 0, life: 0, phase: 0 }));
  // The backdrop: three depths of stars (parallax factors) and a handful of nebula anchors,
  // all drawn from the world's own stream, so a seed fixes the sky as surely as the waves.
  const stars = [];
  for (let index = 0; index < 170; index += 1) {
    const depth = index % 3;
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, depth, size: depth === 2 ? 2.1 : 1.2, phase: random() * TAU });
  }
  const nebulas = [];
  const nebulaColors = ['#2a1052', '#07304a', '#3d0a2e', '#101d4d', '#0a2e2a'];
  for (let index = 0; index < 5; index += 1) {
    nebulas.push({ x: random() * FIELD.width, y: random() * FIELD.height, radius: 260 + random() * 260, color: nebulaColors[index] });
  }

  const state = {
    player, bullets, enemyBullets, enemies, particles, floaters, pickups, stars, nebulas,
    time: 0, score: 0, kills: 0, wave: 0,
    comboChain: 0, comboTimer: 0, multiplier: 1,
    shake: 0, hitstop: 0, hurtTimer: 0,
    bannerText: '', bannerTimer: 0,
    spawnQueue: [], spawnTimer: 0, intermission: 0, ambientTimer: 0,
    boss: null, overTimer: -1, overSent: false,
  };

  function addShake(amount) {
    state.shake = Math.min(19, state.shake + amount);
  }

  /** A burst of sparks: the one particle spawner, used by hits, deaths, dashes and staging. */
  function burst(x, y, color, count, speed, size, life) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeOf(particles);
      if (particle === null) return;
      const angle = random() * TAU;
      const pace = speed * (0.25 + random() * 0.95);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * pace;
      particle.vy = Math.sin(angle) * pace;
      particle.maxLife = life * (0.5 + random() * 0.8);
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.9);
      particle.color = color;
      particle.drag = 2.6;
    }
  }

  /** A line of score text that rises and fades; the same one the HUD's numbers come from. */
  function addFloater(x, y, text, color, size) {
    const floater = freeOf(floaters);
    if (floater === null) return;
    floater.active = true;
    floater.x = x;
    floater.y = y;
    floater.text = text;
    floater.color = color;
    floater.size = size;
    floater.maxLife = 0.95;
    floater.life = floater.maxLife;
  }

  function spawnBullet(x, y, angle, rapid) {
    const bullet = freeOf(bullets);
    if (bullet === null) return;
    bullet.active = true;
    bullet.x = x;
    bullet.y = y;
    bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    bullet.life = PLAYER.bulletLife;
  }

  /** Bring one enemy in at a point, materialising over half a second (visible, not yet solid). */
  function spawnEnemy(kind, x, y) {
    const enemy = freeOf(enemies);
    if (enemy === null) return null;
    const tuning = ENEMY[kind];
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.maxHp = tuning.hp + (kind === KIND_BOSS ? WAVE.bossHpPerExtra * Math.max(0, Math.floor(state.wave / WAVE.bossEvery) - 1) : 0);
    enemy.hp = enemy.maxHp;
    enemy.radius = tuning.radius;
    enemy.angle = random() * TAU;
    enemy.age = 0;
    enemy.phase = random() * TAU;
    enemy.flash = 0;
    enemy.spawnIn = 0.5;
    enemy.fireTimer = tuning.burstEvery ? tuning.burstEvery * (0.6 + random() * 0.5) : 0;
    enemy.orbitDir = random() < 0.5 ? -1 : 1;
    if (kind === KIND_BOSS) state.boss = enemy;
    return enemy;
  }

  /** A point just inside a random edge: where the wave director brings its enemies in. */
  function edgePoint() {
    const side = Math.floor(random() * 4);
    const margin = 44;
    if (side === 0) return { x: margin + random() * (FIELD.width - margin * 2), y: margin };
    if (side === 1) return { x: margin + random() * (FIELD.width - margin * 2), y: FIELD.height - margin };
    if (side === 2) return { x: margin, y: margin + random() * (FIELD.height - margin * 2) };
    return { x: FIELD.width - margin, y: margin + random() * (FIELD.height - margin * 2) };
  }

  function dropPickup(x, y, kind) {
    const pickup = freeOf(pickups);
    if (pickup === null) return;
    pickup.active = true;
    pickup.kind = kind;
    pickup.x = x;
    pickup.y = y;
    const angle = random() * TAU;
    pickup.vx = Math.cos(angle) * 34;
    pickup.vy = Math.sin(angle) * 34;
    pickup.life = PICKUP.life;
    pickup.phase = random() * TAU;
  }

  /** Fill the spawn queue for the next wave and raise its banner. */
  function beginWave(wave) {
    state.wave = wave;
    const queue = [];
    if (wave % WAVE.bossEvery === 0) {
      queue.push(KIND_BOSS);
      for (let index = 0; index < 4; index += 1) queue.push(KIND_CHASER);
      for (let index = 0; index < 2; index += 1) queue.push(KIND_ORBITER);
      state.bannerText = `WAVE ${wave} — DREADNOUGHT`;
    } else {
      for (let index = 0; index < WAVE.chasers(wave); index += 1) queue.push(KIND_CHASER);
      for (let index = 0; index < WAVE.orbiters(wave); index += 1) queue.push(KIND_ORBITER);
      for (let index = 0; index < WAVE.splitters(wave); index += 1) queue.push(KIND_SPLITTER);
      // Shuffle the mix so kinds arrive interleaved, not in blocks.
      for (let index = queue.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        const held = queue[index];
        queue[index] = queue[swap];
        queue[swap] = held;
      }
      state.bannerText = `WAVE ${wave}`;
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.2;
    state.bannerTimer = 1.5;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2 + 90;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.muzzle = 0;
    player.dashTimer = 0;
    player.dashCooldown = 0;
    player.invulnerable = 0;
    player.rapidTimer = 0;
    player.dead = false;
    for (const pool of [bullets, enemyBullets, enemies, particles, floaters, pickups]) {
      for (const entity of pool) entity.active = false;
    }
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.comboChain = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.shake = 0;
    state.hitstop = 0;
    state.hurtTimer = 0;
    state.bannerText = '';
    state.bannerTimer = 0;
    state.spawnQueue = [];
    state.intermission = 1.1;
    state.boss = null;
    state.overTimer = -1;
    state.overSent = false;
  }

  function scoreKill(enemy) {
    state.comboChain += 1;
    state.comboTimer = COMBO.window;
    const next = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.comboChain / COMBO.perStep));
    if (next > state.multiplier) {
      state.multiplier = next;
      addFloater(player.x, player.y - 34, `COMBO x${next}`, '#fbbf24', 24);
    }
    const points = ENEMY[enemy.kind].score * state.multiplier;
    state.score += points;
    state.kills += 1;
    addFloater(enemy.x, enemy.y - enemy.radius - 6, `+${points}`, '#e2e8f0', enemy.kind === KIND_BOSS ? 30 : 18);
  }

  function killEnemy(enemy, events) {
    enemy.active = false;
    if (enemy.kind === KIND_BOSS) state.boss = null;
    scoreKill(enemy);
    const big = enemy.kind === KIND_BOSS || enemy.kind === KIND_SPLITTER;
    burst(enemy.x, enemy.y, enemyColor(enemy.kind), big ? 46 : 20, big ? 330 : 250, big ? 3.4 : 2.6, 0.62);
    burst(enemy.x, enemy.y, '#ffffff', big ? 10 : 5, 180, 2, 0.34);
    addShake(big ? 9 : 3.5);
    if (enemy.kind === KIND_SPLITTER) {
      for (let index = 0; index < 2; index += 1) {
        const mini = spawnEnemy(KIND_MINI, enemy.x + (index === 0 ? -16 : 16), enemy.y + (index === 0 ? -8 : 8));
        if (mini !== null) {
          mini.spawnIn = 0.12;
          mini.vx = (index === 0 ? -1 : 1) * 130;
          mini.vy = -60 + index * 90;
        }
      }
      state.hitstop = Math.max(state.hitstop, 0.03);
    }
    if (enemy.kind === KIND_BOSS) {
      state.hitstop = Math.max(state.hitstop, 0.14);
      dropPickup(enemy.x, enemy.y, PICKUP_REPAIR);
    } else {
      const roll = random();
      if (roll < PICKUP.repairChance) dropPickup(enemy.x, enemy.y, PICKUP_REPAIR);
      else if (roll < PICKUP.repairChance + PICKUP.rapidChance) dropPickup(enemy.x, enemy.y, PICKUP_RAPID);
    }
    return events | EVENT_KILL | (big ? EVENT_BIG_KILL : 0);
  }

  function enemyColor(kind) {
    if (kind === KIND_CHASER) return '#f472b6';
    if (kind === KIND_ORBITER) return '#38bdf8';
    if (kind === KIND_SPLITTER) return '#4ade80';
    if (kind === KIND_MINI) return '#fb923c';
    return '#c084fc';
  }

  function hurtPlayer(damage, events) {
    if (player.invulnerable > 0 || player.dead) return events;
    player.hp -= damage;
    player.invulnerable = PLAYER.hitInvulnerable;
    state.hurtTimer = 0.4;
    addShake(11);
    burst(player.x, player.y, '#f87171', 16, 260, 2.6, 0.45);
    events |= EVENT_PLAYER_HIT;
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      state.overTimer = 1.05;
      state.hitstop = Math.max(state.hitstop, 0.16);
      addShake(18);
      burst(player.x, player.y, '#67e8f9', 60, 380, 3.6, 0.9);
      burst(player.x, player.y, '#fbbf24', 30, 260, 3, 0.7);
    }
    return events;
  }

  function steer(enemy, dt, tx, ty, speed, accel) {
    const dx = tx - enemy.x;
    const dy = ty - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    enemy.vx += (dx / length) * accel * dt;
    enemy.vy += (dy / length) * accel * dt;
    const pace = Math.hypot(enemy.vx, enemy.vy);
    if (pace > speed) {
      enemy.vx = (enemy.vx / pace) * speed;
      enemy.vy = (enemy.vy / pace) * speed;
    }
  }

  function stepEnemy(enemy, dt, harmless) {
    const tuning = ENEMY[enemy.kind];
    enemy.age += dt;
    if (enemy.flash > 0) enemy.flash -= dt;
    if (enemy.spawnIn > 0) {
      enemy.spawnIn -= dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      return;
    }
    if (harmless) {
      // The title screen's drift: cross the arena slowly and wrap, threatening no one.
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.x < -30) enemy.x = FIELD.width + 30;
      if (enemy.x > FIELD.width + 30) enemy.x = -30;
      if (enemy.y < -30) enemy.y = FIELD.height + 30;
      if (enemy.y > FIELD.height + 30) enemy.y = -30;
      enemy.angle += dt * 0.4;
      return;
    }
    if (enemy.kind === KIND_ORBITER) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Radial pull holds the orbit ring; the tangent does the strafing.
      const radial = (dist - tuning.orbitRadius) * 3.2;
      const tx = (dx / dist) * radial + (-dy / dist) * tuning.strafe * enemy.orbitDir;
      const ty = (dy / dist) * radial + (dx / dist) * tuning.strafe * enemy.orbitDir;
      enemy.vx += tx * dt * 2.4;
      enemy.vy += ty * dt * 2.4;
      const pace = Math.hypot(enemy.vx, enemy.vy);
      if (pace > tuning.speed) {
        enemy.vx = (enemy.vx / pace) * tuning.speed;
        enemy.vy = (enemy.vy / pace) * tuning.speed;
      }
      if (random() < dt * 0.25) enemy.orbitDir *= -1;
      enemy.angle = Math.atan2(dy, dx);
    } else {
      // Chasers, minis, splitters and the boss all hunt the ship, each at its own pace; a
      // little sinusoidal wobble keeps their lines from looking railed.
      const wobble = Math.sin(enemy.age * 3.1 + enemy.phase) * 26;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const length = Math.hypot(dx, dy) || 1;
      steer(enemy, dt, enemy.x + dx - (dy / length) * wobble, enemy.y + dy + (dx / length) * wobble, tuning.speed, tuning.accel);
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.x = Math.min(FIELD.width - enemy.radius, Math.max(enemy.radius, enemy.x));
    enemy.y = Math.min(FIELD.height - enemy.radius, Math.max(enemy.radius, enemy.y));
    if (enemy.kind === KIND_BOSS && !player.dead) {
      enemy.fireTimer -= dt;
      if (enemy.fireTimer <= 0) {
        enemy.fireTimer = tuning.burstEvery;
        const count = tuning.burstBullets;
        const offset = random() * TAU;
        for (let index = 0; index < count; index += 1) {
          const bullet = freeOf(enemyBullets);
          if (bullet === null) break;
          const angle = offset + (index / count) * TAU;
          bullet.active = true;
          bullet.x = enemy.x + Math.cos(angle) * enemy.radius;
          bullet.y = enemy.y + Math.sin(angle) * enemy.radius;
          bullet.vx = Math.cos(angle) * tuning.bulletSpeed;
          bullet.vy = Math.sin(angle) * tuning.bulletSpeed;
          bullet.life = tuning.bulletLife;
        }
        return EVENT_BURST;
      }
    }
    return 0;
  }

  /**
   * One fixed step. `control` is { moveX, moveY, aimX, aimY, firing, dash } in field
   * coordinates. With `harmless` set (the title screen) the sky and a few drifting enemies
   * animate, but nothing spawns in anger, nothing fires and nothing can be hurt.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.hitstop > 0) {
      state.hitstop -= dt;
      state.shake = Math.max(0, state.shake - dt * 26);
      return events;
    }
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.hurtTimer > 0) state.hurtTimer -= dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboChain = 0;
        state.multiplier = 1;
      }
    }

    // --- the ship -------------------------------------------------------------
    if (!player.dead) {
      player.angle = Math.atan2(control.aimY - player.y, control.aimX - player.x);
      if (control.dash && player.dashCooldown <= 0 && player.dashTimer <= 0) {
        const mx = control.moveX !== 0 || control.moveY !== 0 ? control.moveX : Math.cos(player.angle);
        const my = control.moveX !== 0 || control.moveY !== 0 ? control.moveY : Math.sin(player.angle);
        const length = Math.hypot(mx, my) || 1;
        player.dashX = (mx / length) * PLAYER.dashSpeed;
        player.dashY = (my / length) * PLAYER.dashSpeed;
        player.dashTimer = PLAYER.dashSeconds;
        player.dashCooldown = PLAYER.dashCooldown;
        player.invulnerable = Math.max(player.invulnerable, PLAYER.dashSeconds + 0.08);
        events |= EVENT_DASH;
        burst(player.x, player.y, '#67e8f9', 10, 130, 2.2, 0.3);
      }
      if (player.dashTimer > 0) {
        player.dashTimer -= dt;
        player.vx = player.dashX;
        player.vy = player.dashY;
        burst(player.x, player.y, '#22d3ee', 2, 40, 3, 0.28);
      } else {
        player.vx += control.moveX * PLAYER.accel * dt;
        player.vy += control.moveY * PLAYER.accel * dt;
        const damp = Math.max(0, 1 - PLAYER.damping * dt);
        player.vx *= damp;
        player.vy *= damp;
        const pace = Math.hypot(player.vx, player.vy);
        if (pace > PLAYER.maxSpeed) {
          player.vx = (player.vx / pace) * PLAYER.maxSpeed;
          player.vy = (player.vy / pace) * PLAYER.maxSpeed;
        }
      }
      player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
      player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));
      if (player.dashCooldown > 0) player.dashCooldown -= dt;
      if (player.invulnerable > 0) player.invulnerable -= dt;
      if (player.rapidTimer > 0) player.rapidTimer -= dt;
      if (player.muzzle > 0) player.muzzle -= dt;

      // Engine trail while under way.
      player.trailTimer -= dt;
      const pace = Math.hypot(player.vx, player.vy);
      if (pace > 60 && player.trailTimer <= 0) {
        player.trailTimer = 0.03;
        const particle = freeOf(particles);
        if (particle !== null) {
          particle.active = true;
          particle.x = player.x - Math.cos(player.angle) * player.radius;
          particle.y = player.y - Math.sin(player.angle) * player.radius;
          particle.vx = -player.vx * 0.24 + (random() - 0.5) * 26;
          particle.vy = -player.vy * 0.24 + (random() - 0.5) * 26;
          particle.maxLife = 0.3;
          particle.life = 0.3;
          particle.size = 2.4;
          particle.color = '#0ea5b7';
          particle.drag = 1;
        }
      }

      // Firing: hold to shoot toward the aim point; the rapid power-up doubles the rate.
      player.fireTimer -= dt;
      if (control.firing && !harmless && player.fireTimer <= 0) {
        player.fireTimer = player.rapidTimer > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
        player.muzzle = 0.045;
        const spread = (random() - 0.5) * 0.035;
        spawnBullet(
          player.x + Math.cos(player.angle) * (player.radius + 7),
          player.y + Math.sin(player.angle) * (player.radius + 7),
          player.angle + spread,
          player.rapidTimer > 0,
        );
        events |= EVENT_SHOOT;
      }
    }

    // --- the wave director ------------------------------------------------------
    if (!harmless && !player.dead) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = Math.max(WAVE.spawnIntervalMin, WAVE.spawnInterval - state.wave * 0.03);
          const kind = state.spawnQueue.shift();
          const at = edgePoint();
          spawnEnemy(kind, at.x, at.y);
        }
      } else if (!enemies.some((enemy) => enemy.active)) {
        state.intermission -= dt;
        if (state.intermission <= 0) {
          beginWave(state.wave + 1);
          state.intermission = WAVE.intermission;
          events |= EVENT_WAVE;
        }
      }
    }
    if (harmless) {
      state.ambientTimer -= dt;
      const drifting = enemies.reduce((count, enemy) => count + (enemy.active ? 1 : 0), 0);
      if (state.ambientTimer <= 0 && drifting < 7) {
        state.ambientTimer = 0.9;
        const kinds = [KIND_CHASER, KIND_ORBITER, KIND_SPLITTER, KIND_MINI];
        const at = edgePoint();
        const enemy = spawnEnemy(kinds[Math.floor(random() * kinds.length)], at.x, at.y);
        if (enemy !== null) {
          enemy.spawnIn = 0;
          const targetX = FIELD.width / 2 + (random() - 0.5) * 500;
          const targetY = FIELD.height / 2 + (random() - 0.5) * 320;
          const length = Math.hypot(targetX - at.x, targetY - at.y) || 1;
          const pace = 26 + random() * 30;
          enemy.vx = ((targetX - at.x) / length) * pace;
          enemy.vy = ((targetY - at.y) / length) * pace;
        }
      }
    }

    // --- entities ----------------------------------------------------------------
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      events |= stepEnemy(enemy, dt, harmless);
    }

    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      if (harmless) continue;
      for (const enemy of enemies) {
        if (!enemy.active || enemy.spawnIn > 0) continue;
        const reach = enemy.radius + 5;
        if (distance2(bullet.x, bullet.y, enemy.x, enemy.y) < reach * reach) {
          bullet.active = false;
          enemy.hp -= 1;
          enemy.flash = 0.09;
          burst(bullet.x, bullet.y, enemyColor(enemy.kind), 4, 170, 2, 0.26);
          events |= EVENT_HIT;
          if (enemy.hp <= 0) events = killEnemy(enemy, events);
          break;
        }
      }
    }

    for (const bullet of enemyBullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      if (!harmless && !player.dead) {
        const reach = player.radius + 5;
        if (distance2(bullet.x, bullet.y, player.x, player.y) < reach * reach) {
          bullet.active = false;
          events = hurtPlayer(ENEMY.boss.damage - 14, events);
        }
      }
    }

    if (!harmless && !player.dead) {
      for (const enemy of enemies) {
        if (!enemy.active || enemy.spawnIn > 0) continue;
        const reach = player.radius + enemy.radius - 3;
        if (distance2(player.x, player.y, enemy.x, enemy.y) < reach * reach) {
          if (enemy.kind !== KIND_BOSS) {
            // A ram kills the attacker too, but scores nothing: it was not shot down.
            enemy.active = false;
            burst(enemy.x, enemy.y, enemyColor(enemy.kind), 18, 240, 2.6, 0.5);
          }
          events = hurtPlayer(ENEMY[enemy.kind].damage, events);
          if (player.dead) break;
        }
      }
      for (const pickup of pickups) {
        if (!pickup.active) continue;
        const reach = player.radius + PICKUP.collectPad + PICKUP.radius;
        if (distance2(player.x, player.y, pickup.x, pickup.y) < reach * reach) {
          pickup.active = false;
          if (pickup.kind === PICKUP_REPAIR) player.hp = Math.min(PLAYER.maxHp, player.hp + PICKUP.repairAmount);
          else player.rapidTimer = PLAYER.rapidSeconds;
          addFloater(player.x, player.y - 30, pickup.kind === PICKUP_REPAIR ? `+${PICKUP.repairAmount} HULL` : 'RAPID FIRE', pickup.kind === PICKUP_REPAIR ? '#34d399' : '#fbbf24', 21);
          burst(player.x, player.y, pickup.kind === PICKUP_REPAIR ? '#34d399' : '#fbbf24', 12, 150, 2.2, 0.35);
          events |= EVENT_PICKUP;
        }
      }
    }

    for (const pickup of pickups) {
      if (!pickup.active) continue;
      pickup.life -= dt;
      if (pickup.life <= 0) {
        pickup.active = false;
        continue;
      }
      if (!player.dead && !harmless) {
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PICKUP.magnetRadius && dist > 1) {
          pickup.vx += (dx / dist) * PICKUP.magnetAccel * dt;
          pickup.vy += (dy / dist) * PICKUP.magnetAccel * dt;
        }
      }
      pickup.vx *= Math.max(0, 1 - 2.2 * dt);
      pickup.vy *= Math.max(0, 1 - 2.2 * dt);
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
    }

    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      const drag = Math.max(0, 1 - particle.drag * dt);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    for (const floater of floaters) {
      if (!floater.active) continue;
      floater.life -= dt;
      floater.y -= 44 * dt;
      if (floater.life <= 0) floater.active = false;
    }

    // --- the end ------------------------------------------------------------------
    if (player.dead && state.overTimer > 0) {
      state.overTimer -= dt;
      if (state.overTimer <= 0 && !state.overSent) {
        state.overSent = true;
        events |= EVENT_OVER;
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, spawnEnemy, spawnBullet, burst, addFloater, beginWave, dropPickup };
}
