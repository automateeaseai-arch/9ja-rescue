// Keyboard + mouse on desktop; virtual joystick + swipe-to-look on phones.
export function createInput(canvas) {
  const state = {
    moveX: 0,        // -1 left … 1 right
    moveY: 0,        // -1 back … 1 forward
    run: false,
    jump: false,     // consumed by the player each time it is read
    lookDX: 0,       // accumulated look deltas in pixels, reset each frame
    lookDY: 0,
  };
  const keys = new Set();
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') state.jump = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // Desktop mouse look: drag, or click to lock the pointer.
  let dragging = false;
  canvas.addEventListener('mousedown', () => {
    dragging = true;
    if (!isTouch) canvas.requestPointerLock?.();
  });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (dragging || document.pointerLockElement === canvas) {
      state.lookDX += e.movementX;
      state.lookDY += e.movementY;
    }
  });

  // Touch: left half spawns a floating joystick, right half swipes the camera.
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  const jumpBtn = document.getElementById('jump-btn');
  const JOY_RADIUS = 50;
  let joyId = null, joyX = 0, joyY = 0;
  const lookTouches = new Map();

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2 && joyId === null) {
        joyId = t.identifier;
        joyX = t.clientX;
        joyY = t.clientY;
        joy.style.left = `${joyX}px`;
        joy.style.top = `${joyY}px`;
        joy.hidden = false;
      } else {
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - joyX;
        let dy = t.clientY - joyY;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        state.moveX = dx / JOY_RADIUS;
        state.moveY = -dy / JOY_RADIUS;
        state.run = len > JOY_RADIUS * 0.9;
      } else if (lookTouches.has(t.identifier)) {
        const prev = lookTouches.get(t.identifier);
        state.lookDX += (t.clientX - prev.x) * 1.6;
        state.lookDY += (t.clientY - prev.y) * 1.6;
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
    e.preventDefault();
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        joyId = null;
        joy.hidden = true;
        knob.style.transform = 'translate(-50%, -50%)';
        state.moveX = state.moveY = 0;
        state.run = false;
      }
      lookTouches.delete(t.identifier);
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  jumpBtn.addEventListener('touchstart', (e) => { state.jump = true; e.preventDefault(); }, { passive: false });
  jumpBtn.addEventListener('click', () => { state.jump = true; });

  return {
    isTouch,
    state,
    update() {
      if (joyId !== null) return; // joystick owns movement while held
      state.moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.moveY = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    consumeLook() {
      const d = { x: state.lookDX, y: state.lookDY };
      state.lookDX = state.lookDY = 0;
      return d;
    },
    consumeJump() {
      const j = state.jump;
      state.jump = false;
      return j;
    },
  };
}
