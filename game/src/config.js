// VOIDSTRIKE tuning: every number and colour the game runs on, in one place. The arena is a
// fixed 1280x720 logical field; the renderer scales it to the window, so no rule below depends
// on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  maxHp: 100,
  accel: 2500,
  maxSpeed: 335,
  /** Exponential velocity damping per second: high enough to feel tight, low enough to drift. */
  damping: 5.2,
  fireInterval: 0.135,
  rapidInterval: 0.062,
  rapidSeconds: 8,
  bulletSpeed: 920,
  bulletLife: 0.85,
  /** Dash: a short burst of speed with invulnerability, then a cooldown. */
  dashSeconds: 0.16,
  dashSpeed: 1180,
  dashCooldown: 1.5,
  /** Grace period after any hit, so one bad second cannot melt the whole hull. */
  hitInvulnerable: 0.9,
};

export const COMBO = {
  /** Seconds a kill chain survives without another kill before the multiplier resets. */
  window: 2.6,
  /** Kills per multiplier step: the multiplier is 1 + floor(chain / perStep), capped. */
  perStep: 5,
  maxMultiplier: 8,
};

export const ENEMY = {
  chaser: { hp: 3, radius: 16, speed: 158, accel: 760, score: 100, damage: 12 },
  orbiter: { hp: 4, radius: 15, speed: 205, accel: 900, score: 150, damage: 12, orbitRadius: 252, strafe: 168 },
  splitter: { hp: 9, radius: 25, speed: 92, accel: 420, score: 200, damage: 16 },
  mini: { hp: 1, radius: 10, speed: 272, accel: 1150, score: 50, damage: 8 },
  boss: { hp: 240, radius: 47, speed: 54, accel: 260, score: 2500, damage: 24, burstEvery: 2.35, burstBullets: 14, bulletSpeed: 238, bulletLife: 3.6 },
};

/** Enemy counts grow linearly with the wave; the mix widens as new kinds unlock. */
export const WAVE = {
  intermission: 2.4,
  spawnInterval: 0.72,
  spawnIntervalMin: 0.3,
  chasers: (wave) => 4 + wave * 2,
  orbiters: (wave) => (wave >= 2 ? 1 + wave : 0),
  splitters: (wave) => (wave >= 3 ? Math.floor(wave / 2) : 0),
  /** Every fifth wave is a boss wave: one boss plus a small escort, nothing else. */
  bossEvery: 5,
  bossHpPerExtra: 90,
};

export const PICKUP = {
  radius: 13,
  life: 11,
  repairAmount: 30,
  repairChance: 0.055,
  rapidChance: 0.075,
  magnetRadius: 118,
  magnetAccel: 1500,
  collectPad: 17,
};

/** Pool sizes: every entity array is allocated once at boot and reused, so play never allocates. */
export const POOL = { bullets: 288, enemyBullets: 288, enemies: 96, particles: 560, floaters: 40, pickups: 20 };

export const PALETTE = {
  backdrop: '#04050c',
  nebulaA: '#2a1052',
  nebulaB: '#07304a',
  nebulaC: '#3d0a2e',
  ship: '#67e8f9',
  shipCore: '#ecfeff',
  bullet: '#a5f3fc',
  rapidBullet: '#fde68a',
  enemyBullet: '#fb7185',
  chaser: '#f472b6',
  orbiter: '#38bdf8',
  splitter: '#4ade80',
  mini: '#fb923c',
  boss: '#c084fc',
  repair: '#34d399',
  rapid: '#fbbf24',
  hull: '#4ade80',
  hullLow: '#f87171',
  text: '#e2e8f0',
  muted: '#7d8aa0',
  accent: '#22d3ee',
  danger: '#ef4444',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidstrike.best';
