// Keyboard and pointer input. Held keys give a movement vector and a held pointer gives fire;
// one-shot presses (confirm, dash, pause, restart) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The pointer's
// position is kept in client coordinates; main converts it to field coordinates through the
// renderer, which owns the view transform.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_RESTART = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const DASH = new Set(['ShiftLeft', 'ShiftRight', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let firing = false;
  let pointerClient = null;
  let pointerSeen = false;

  function directionOf(event) {
    if (UP.has(event.code)) return 'up';
    if (DOWN.has(event.code)) return 'down';
    if (LEFT.has(event.code)) return 'left';
    if (RIGHT.has(event.code)) return 'right';
    return null;
  }

  window.addEventListener('keydown', (event) => {
    const direction = directionOf(event);
    if (direction !== null) held[direction] = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    const direction = directionOf(event);
    if (direction !== null) held[direction] = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    firing = false;
  });

  target.addEventListener('pointermove', (event) => {
    pointerClient = { x: event.clientX, y: event.clientY };
    pointerSeen = true;
  });
  target.addEventListener('pointerdown', (event) => {
    pointerClient = { x: event.clientX, y: event.clientY };
    pointerSeen = true;
    firing = true;
    actions |= ACTION_CONFIRM;
    target.setPointerCapture?.(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    firing = false;
  });
  window.addEventListener('pointercancel', () => {
    firing = false;
  });

  return {
    /** The held movement direction as a unit vector (diagonals normalised). */
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 || y === 0) return { x, y };
      const inv = Math.SQRT1_2;
      return { x: x * inv, y: y * inv };
    },
    /** Whether the fire button is held. */
    firing() {
      return firing;
    },
    /** The pointer's last client position, or null before it is first seen. */
    pointer() {
      return pointerSeen ? pointerClient : null;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
