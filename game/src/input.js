// Keyboard and mouse input for Solmarina. Keys are tracked as a live set plus a
// just-pressed set that the game loop clears once per frame.
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyP', 'KeyT',
  'ShiftLeft', 'ShiftRight', 'Enter', 'Escape',
]);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, rightDown: false };
  let anyGesture = false;

  function markGesture() {
    anyGesture = true;
  }

  window.addEventListener('keydown', (event) => {
    markGesture();
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) {
      down.add(event.code);
      pressed.add(event.code);
    }
  });
  window.addEventListener('keyup', (event) => {
    down.delete(event.code);
  });
  window.addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    markGesture();
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
    if (event.button === 2) mouse.rightDown = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
    if (event.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    down,
    pressed,
    mouse,
    isDown(code) {
      return down.has(code);
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    axis(negative, positive) {
      return (down.has(positive) ? 1 : 0) - (down.has(negative) ? 1 : 0);
    },
    hadGesture() {
      return anyGesture;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
