// Keyboard + mouse on desktop; virtual joystick + swipe-to-look on phones.
export function createInput(canvas) {
  const state = {
    moveX: 0,        // -1 left … 1 right
    moveY: 0,        // -1 back … 1 forward
    run: false,
    jump: false,     // consumed by the player each time it is read
    fire: false,     // held: aim and fire
    punch: false,    // consumed each time it is read
    crouch: false,   // toggles crouching; consumed each time it is read
    throw: false,    // throws a grenade; consumed each time it is read
    drive: false,    // interact (free a captive, DSS handover, get in or out); consumed each time it is read
    aim: false,      // aim toggle (gun)
    reload: false,   // consumed each time it is read
    weapon: 'gun',   // 'gun', 'cutlass' or 'unarmed'
    kick: false,     // consumed each time it is read
    pause: false,    // consumed each time it is read
    tap: null,       // { x, y } screen point of a quick tap on the view (picks an aim target)
    lookDX: 0,       // accumulated look deltas in pixels, reset each frame
    lookDY: 0,
  };
  const keys = new Set();
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') state.jump = true;
    if (e.code === 'KeyE' && !e.repeat) state.punch = true;
    if (e.code === 'KeyC' && !e.repeat) state.crouch = true;
    if (e.code === 'KeyG' && !e.repeat) state.throw = true;
    if (e.code === 'KeyV' && !e.repeat) state.drive = true;
    if (e.code === 'KeyR' && !e.repeat) state.reload = true;
    if (e.code === 'KeyQ' && !e.repeat) { if (state.weapon === 'unarmed') state.kick = true; else if (state.weapon === 'gun') state.aim = !state.aim; }
    if (e.code === 'KeyK' && !e.repeat) state.kick = true;
    if (e.code === 'Digit1') setWeapon('gun');
    if (e.code === 'Digit2') setWeapon('cutlass');
    if (e.code === 'Digit3') setWeapon('unarmed');
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) state.pause = true;
    // Unarmed and cutlass: the attack key punches or slashes.
    if ((e.code === 'KeyF') && !e.repeat && state.weapon !== 'gun') state.punch = true;
  });
  const listeners = [];
  function setWeapon(w) {
    state.weapon = w;
    if (w !== 'gun') state.aim = false;
    for (const f of listeners) f(w);
  }
  addEventListener('keyup', (e) => keys.delete(e.code));
  // Desktop fire: hold F or the right mouse button.
  let mouseFire = false;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    if (state.weapon !== 'gun') state.punch = true; else mouseFire = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) mouseFire = false; });
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
        lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() });
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
        lookTouches.set(t.identifier, { ...prev, x: t.clientX, y: t.clientY });
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
      // A quick tap without dragging: pick what is under the finger.
      const lt = lookTouches.get(t.identifier);
      if (lt && Math.hypot(t.clientX - lt.x0, t.clientY - lt.y0) < 12 && performance.now() - lt.t0 < 350) state.tap = { x: t.clientX, y: t.clientY };
      lookTouches.delete(t.identifier);
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  jumpBtn.addEventListener('touchstart', (e) => { state.jump = true; e.preventDefault(); }, { passive: false });
  jumpBtn.addEventListener('click', () => { state.jump = true; });

  const fireBtn = document.getElementById('fire-btn');
  let touchFire = false;
  // Drag-to-aim: sliding the thumb from the Fire button steers the aim while firing.
  let fireDrag = null;
  fireBtn.addEventListener('touchstart', (e) => {
    if (state.weapon !== 'gun') state.punch = true; else touchFire = true;
    const t = e.changedTouches[0];
    fireDrag = { id: t.identifier, x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  fireBtn.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (!fireDrag || t.identifier !== fireDrag.id) continue;
      state.lookDX += (t.clientX - fireDrag.x) * 1.4;
      state.lookDY += (t.clientY - fireDrag.y) * 1.4;
      fireDrag.x = t.clientX; fireDrag.y = t.clientY;
      state.aimDrag = true;
    }
    e.preventDefault();
  }, { passive: false });
  const fireUp = () => { touchFire = false; fireDrag = null; };
  fireBtn.addEventListener('touchend', fireUp);
  fireBtn.addEventListener('touchcancel', fireUp);
  // Desktop: a left click without dragging picks a target too.
  let down0 = null;
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) down0 = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0 && down0 && Math.hypot(e.clientX - down0.x, e.clientY - down0.y) < 6 && performance.now() - down0.t < 350 && document.pointerLockElement !== canvas) state.tap = { x: e.clientX, y: e.clientY };
    down0 = null;
  });

  const punchBtn = document.getElementById('punch-btn');
  punchBtn.addEventListener('touchstart', (e) => { state.punch = true; e.preventDefault(); }, { passive: false });
  punchBtn.addEventListener('click', () => { state.punch = true; });
  const throwBtn = document.getElementById('throw-btn');
  throwBtn.addEventListener('touchstart', (e) => { state.throw = true; e.preventDefault(); }, { passive: false });
  throwBtn.addEventListener('click', () => { state.throw = true; });
  const tap = (id, f) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('touchstart', (e) => { f(); e.preventDefault(); }, { passive: false });
    b.addEventListener('click', f);
  };
  // Aim with the gun; Kick when unarmed (hidden with the cutlass).
  tap('aim-btn', () => { if (state.weapon === 'unarmed') state.kick = true; else state.aim = !state.aim; });
  tap('reload-btn', () => { state.reload = true; });
  tap('pause-btn', () => { state.pause = true; });
  tap('weapon-gun', () => setWeapon('gun'));
  tap('weapon-cutlass', () => setWeapon('cutlass'));
  tap('weapon-unarmed', () => setWeapon('unarmed'));
  const crouchBtn = document.getElementById('crouch-btn');
  crouchBtn.addEventListener('touchstart', (e) => { state.crouch = true; e.preventDefault(); }, { passive: false });
  crouchBtn.addEventListener('click', () => { state.crouch = true; });

  return {
    isTouch,
    state,
    update() {
      state.fire = state.weapon === 'gun' && (touchFire || mouseFire || keys.has('KeyF'));
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
    setWeapon,
    onWeapon(f) { listeners.push(f); },
    consumeKick() { const k = state.kick; state.kick = false; return k; },
    consumeTap() { const t = state.tap; state.tap = null; return t; },
    consumeReload() { const r = state.reload; state.reload = false; return r; },
    consumePause() { const p = state.pause; state.pause = false; return p; },
    consumeDrive() {
      const d = state.drive;
      state.drive = false;
      return d;
    },
    consumeThrow() {
      const t = state.throw;
      state.throw = false;
      return t;
    },
    consumeCrouch() {
      const c = state.crouch;
      state.crouch = false;
      return c;
    },
    consumePunch() {
      const p = state.punch;
      state.punch = false;
      return p;
    },
    consumeJump() {
      const j = state.jump;
      state.jump = false;
      return j;
    },
  };
}
