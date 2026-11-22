// Keyboard + mouse input. WASD/arrows move, Shift sneaks, Space sprints,
// 1/2 spend tools, E interacts (lockpick), click tosses a coin toward the
// click, P/Esc pauses, Enter/Space confirms on menus.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_EMP = 4;
export const ACTION_SMOKE = 8;
export const ACTION_INTERACT = 16;

/** Normalise a key for the held set: single characters lowercased, the rest as-is. */
function keyName(event) {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let click = null;
  let mouse = { x: 0, y: 0 };

  function keyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(keyName(event));
    if (event.key === ' ' || event.key === 'Enter') actions |= ACTION_CONFIRM;
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key === '1') actions |= ACTION_EMP;
    if (event.key === '2') actions |= ACTION_SMOKE;
    if (event.key === 'e' || event.key === 'E') actions |= ACTION_INTERACT;
  }

  function keyUp(event) {
    keys.delete(keyName(event));
  }

  function pointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    click = { ...mouse };
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', pointer);

  function held(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    direction() {
      let x = 0;
      let y = 0;
      if (held('a', 'ArrowLeft')) x -= 1;
      if (held('d', 'ArrowRight')) x += 1;
      if (held('w', 'ArrowUp')) y -= 1;
      if (held('s', 'ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    sneaking() {
      return held('Shift');
    },
    sprinting() {
      return held(' ');
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    mouse() {
      return mouse;
    },
  };
}
