// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens — title, play, paused and game over — and the synth answers the
// world's event flags with sound.
//
// ?seed=N fixes the random stream. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_OVER, EVENT_PLAYER_HIT, EVENT_WAVE } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  // The one control object the world reads each step, refilled every frame: no per-frame garbage.
  const control = { moveX: 0, moveY: 0, aimX: FIELD.width / 2, aimY: 120, firing: false, dash: false };
  const lastAim = { x: FIELD.width / 2, y: 120 };

  // Screen readers (and anyone watching the page's text) hear the screen changes and the big beats.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    dashQueued = false;
    screen = SCREEN_PLAY;
    announce('Playing. Wave 1 incoming.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Wave ${world.state.wave}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions !== 0) audio.unlock();
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_DASH | ACTION_RESTART)) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_DASH) dashQueued = true;
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_DASH | ACTION_RESTART)) startGame();
    }
  }

  function fillControl() {
    const move = input.moveVector();
    control.moveX = move.x;
    control.moveY = move.y;
    const pointer = input.pointer();
    if (pointer !== null) {
      const at = renderer.toField(pointer.x, pointer.y);
      lastAim.x = at.x;
      lastAim.y = at.y;
    }
    control.aimX = lastAim.x;
    control.aimY = lastAim.y;
    control.firing = input.firing();
    control.dash = dashQueued;
    dashQueued = false;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title's backdrop is the real world idling: sky, drift and an unthreatened ship.
      control.moveX = 0;
      control.moveY = 0;
      control.firing = false;
      control.dash = false;
      control.aimX = world.state.player.x;
      control.aimY = world.state.player.y - 200;
      world.step(STEP, control, true);
      return;
    }
    fillControl();
    const events = world.step(STEP, control, false);
    audio.play(events);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WAVE) announce(`Wave ${world.state.wave}.`);
    else if (events & EVENT_PLAYER_HIT) announce(`Hull hit. ${Math.max(0, Math.round(world.state.player.hp))} percent left.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // The first gesture wakes the synth (browsers keep audio locked until then).
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  // Leaving the tab pauses a running game rather than letting the wave arrive unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('VOIDSTRIKE. Press Enter or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
