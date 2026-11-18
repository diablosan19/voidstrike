// The screenshot scenes behind ?shot=start|play|end. Each one is composed from the game's own
// parts — the wave director, the spawner, the particle and floater systems — and then played
// forward under a simple autopilot for a fixed number of fixed steps, so the frame is a real
// moment of a real game and the same seed always gives the same frame.
import { ENEMY, FIELD, STEP } from './config.js';
import { KIND_CHASER, KIND_LANCER, KIND_MINI, KIND_ORBITER, KIND_SPLITTER, LANCER_TELEGRAPH, PICKUP_REPAIR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 1.5;
const END_SECONDS = 0.4;

/** The control the staging hands the world: filled in fresh for every step by the pilot below. */
const control = { moveX: 0, moveY: 0, aimX: FIELD.width / 2, aimY: 120, firing: false, dash: false };

/** The live enemy nearest a point, or null when the arena is clear. */
function nearestEnemy(state, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active || enemy.spawnIn > 0) continue;
    const distance = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

/**
 * Steer the ship for one staging step: aim at the nearest enemy and fire, keep a fighting
 * distance — close in when the target is far, back off when it crowds, otherwise strafe.
 */
function pilot(state) {
  const player = state.player;
  const target = nearestEnemy(state, player.x, player.y);
  control.firing = target !== null;
  if (target === null) {
    control.moveX = 0;
    control.moveY = 0;
    return;
  }
  control.aimX = target.x;
  control.aimY = target.y;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy) || 1;
  let mx;
  let my;
  if (distance > 330) {
    mx = dx / distance;
    my = dy / distance;
  } else if (distance < 195) {
    mx = -dx / distance;
    my = -dy / distance;
  } else {
    mx = -dy / distance;
    my = dx / distance;
  }
  control.moveX = mx;
  control.moveY = my;
}

function stepSeconds(world, seconds, harmless, steer) {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    if (steer) pilot(world.state);
    world.step(STEP, control, harmless);
  }
}

/** start: the title over its living backdrop — drifting enemies, twinkling sky, idle ship. */
function stageStart(world) {
  world.reset();
  control.firing = false;
  control.moveX = 0;
  control.moveY = 0;
  control.aimX = FIELD.width / 2;
  control.aimY = 120;
  stepSeconds(world, START_SECONDS, true, false);
  return { screen: SCREEN_TITLE, best: 0 };
}

/**
 * play: a composed wave 3 — chasers, orbiters, a splitter and its kind, a lancer stalking,
 * a repair core on the field, a combo already running — played forward under the pilot so
 * the bullets, particles and floaters in frame were all earned by the real rules. A second
 * lancer is then placed fresh, caught mid-telegraph with its aim line locked on the ship,
 * so the frame always shows the new hunter's signature moment.
 */
function stagePlay(world) {
  const state = world.state;
  world.reset();
  world.beginWave(3);
  state.spawnQueue.length = 0; // this wave arrives composed, not queued
  state.intermission = 999; // and no further wave may begin while the scene plays
  state.score = 12400;
  state.comboChain = 7;
  state.comboTimer = 2.2;
  state.multiplier = 2;
  state.player.x = 560;
  state.player.y = 470;
  const cast = [
    [KIND_CHASER, 300, 180], [KIND_CHASER, 985, 150], [KIND_CHASER, 1060, 520],
    [KIND_ORBITER, 255, 545], [KIND_ORBITER, 905, 305],
    [KIND_SPLITTER, 645, 165],
    [KIND_MINI, 470, 250], [KIND_MINI, 830, 480],
    [KIND_LANCER, 240, 330],
  ];
  for (const [kind, x, y] of cast) {
    const enemy = world.spawnEnemy(kind, x, y);
    if (enemy !== null) enemy.spawnIn = 0;
  }
  world.dropPickup(770, 565, PICKUP_REPAIR);
  stepSeconds(world, PLAY_SECONDS, false, true);

  // The composed lancer, placed after the fight so the frame catches it mid-telegraph:
  // locked onto the ship's position, a little past halfway through its 0.7 s wind-up.
  const lancer = world.spawnEnemy(KIND_LANCER, 1005, 155);
  if (lancer !== null) {
    lancer.spawnIn = 0;
    lancer.vx = 0;
    lancer.vy = 0;
    const dx = state.player.x - lancer.x;
    const dy = state.player.y - lancer.y;
    const length = Math.hypot(dx, dy) || 1;
    lancer.dashX = dx / length;
    lancer.dashY = dy / length;
    lancer.angle = Math.atan2(lancer.dashY, lancer.dashX);
    lancer.mode = LANCER_TELEGRAPH;
    lancer.modeTimer = ENEMY.lancer.telegraphSeconds * 0.55;
  }

  // Top the frame up from the same systems if the pilot's fight ran quiet: a fresh burst of
  // sparks off a live enemy, a floater, and late chasers at the edges keep the shot honest
  // about what the game looks like mid-wave.
  let particles = 0;
  let floaters = 0;
  let alive = 0;
  for (const particle of state.particles) if (particle.active) particles += 1;
  for (const floater of state.floaters) if (floater.active) floaters += 1;
  for (const enemy of state.enemies) if (enemy.active) alive += 1;
  const target = nearestEnemy(state, state.player.x, state.player.y);
  if (particles < 14 && target !== null) world.burst(target.x, target.y, '#f472b6', 22, 260, 2.8, 0.6);
  if (floaters === 0) world.addFloater(state.player.x + 60, state.player.y - 52, '+200', '#e2e8f0', 18);
  if (alive < 4) {
    world.spawnEnemy(KIND_CHASER, 90, 120);
    world.spawnEnemy(KIND_CHASER, 1190, 610);
  }
  return { screen: SCREEN_PLAY, best: state.score };
}

/** end: the wreck of a wave-6 run — the ship gone in a burst of its own colours, hunters circling. */
function stageEnd(world) {
  const state = world.state;
  world.reset();
  state.wave = 6;
  state.score = 28750;
  state.kills = 63;
  state.player.x = 640;
  state.player.y = 430;
  state.player.hp = 0;
  state.player.dead = true;
  const witnesses = [
    [KIND_CHASER, 330, 200], [KIND_CHASER, 980, 250],
    [KIND_ORBITER, 900, 540], [KIND_SPLITTER, 300, 520],
  ];
  for (const [kind, x, y] of witnesses) {
    const enemy = world.spawnEnemy(kind, x, y);
    if (enemy !== null) {
      enemy.spawnIn = 0;
      enemy.vx = (640 - x) * 0.05;
      enemy.vy = (430 - y) * 0.05;
    }
  }
  world.burst(640, 430, '#67e8f9', 55, 360, 3.4, 0.9);
  world.burst(640, 430, '#fbbf24', 26, 240, 2.8, 0.7);
  control.firing = false;
  control.moveX = 0;
  control.moveY = 0;
  stepSeconds(world, END_SECONDS, true, false);
  return { screen: SCREEN_OVER, best: state.score };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') return stagePlay(world);
  if (name === 'end') return stageEnd(world);
  return stageStart(world);
}
