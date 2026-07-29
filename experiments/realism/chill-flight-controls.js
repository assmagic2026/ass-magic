const SPEED_PIXELS_TO_UNITS = 0.45;
const MAX_SPEED_DELTA_PX = 28;

export function createChillFlightControls({
  canvas,
  flight,
  speedInput,
  stickLimit,
  isActive,
  onSpeedChange,
}) {
  let directionPointerId = null;
  let directionStartX = 0;
  let directionStartY = 0;
  let speedPointerId = null;
  let speedLastY = 0;

  const updateDiagnostics = () => {
    canvas.dataset.chillDirectionPointer = directionPointerId === null ? "idle" : "active";
    canvas.dataset.chillSpeedPointer = speedPointerId === null ? "idle" : "active";
  };

  const clearDirection = () => {
    directionPointerId = null;
    flight.chillDirectionActive = false;
    flight.stickOffset.set(0, 0);
  };

  const clearSpeed = () => {
    speedPointerId = null;
  };

  const clearAll = () => {
    clearDirection();
    clearSpeed();
    flight.directId = null;
    flight.directTurnX = 0;
    flight.directTurnY = 0;
    flight.accelPointers.clear();
    updateDiagnostics();
  };

  const capture = (pointerId) => {
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      // Safari may release a pointer during a viewport change before capture.
    }
  };

  const handlePointerDown = (event) => {
    if (!isActive()) return;
    const lowerHalf = event.clientY >= window.innerHeight * 0.5;
    if (lowerHalf) {
      if (directionPointerId !== null) return;
      directionPointerId = event.pointerId;
      directionStartX = event.clientX;
      directionStartY = event.clientY;
      flight.chillDirectionActive = true;
      flight.stickOffset.set(0, 0);
    } else {
      if (speedPointerId !== null) return;
      speedPointerId = event.pointerId;
      speedLastY = event.clientY;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    capture(event.pointerId);
    updateDiagnostics();
  };

  const handlePointerMove = (event) => {
    if (!isActive()) return;
    if (event.pointerId === directionPointerId) {
      const dx = event.clientX - directionStartX;
      const dy = event.clientY - directionStartY;
      const distance = Math.hypot(dx, dy);
      // Chill has no visible stick, but it must feel exactly like the main
      // flight stick: the initial touch is its center and `stickLimit` is the
      // radius of an invisible circular gate.
      const limit = Math.min(distance, stickLimit);
      const nx = distance > 0 ? dx / distance : 0;
      const ny = distance > 0 ? dy / distance : 0;
      flight.stickOffset.set(nx * limit, ny * limit);
      canvas.dataset.chillDirectionInput = [
        (flight.stickOffset.x / stickLimit).toFixed(3),
        (flight.stickOffset.y / stickLimit).toFixed(3),
      ].join(",");
      canvas.dataset.chillDirectionGate = `${stickLimit}px-circle`;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.pointerId !== speedPointerId) return;
    const deltaY = Math.max(
      -MAX_SPEED_DELTA_PX,
      Math.min(MAX_SPEED_DELTA_PX, speedLastY - event.clientY),
    );
    speedLastY = event.clientY;
    const minimum = Number(speedInput.min) || 12;
    const maximum = Number(speedInput.max) || 120;
    flight.speedSelection = Math.max(
      minimum,
      Math.min(maximum, flight.speedSelection + deltaY * SPEED_PIXELS_TO_UNITS),
    );
    speedInput.value = String(Math.round(flight.speedSelection));
    onSpeedChange();
    canvas.dataset.chillSelectedSpeed = flight.speedSelection.toFixed(2);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const releasePointer = (event) => {
    let changed = false;
    if (event.pointerId === directionPointerId) {
      clearDirection();
      changed = true;
    }
    if (event.pointerId === speedPointerId) {
      clearSpeed();
      changed = true;
    }
    if (changed) updateDiagnostics();
  };

  canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
  window.addEventListener("pointermove", handlePointerMove, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerup", releasePointer);
  window.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);
  window.addEventListener("blur", clearAll);
  window.addEventListener("orientationchange", clearAll);
  updateDiagnostics();

  return {
    clear: clearAll,
    getState: () => ({
      directionActive: directionPointerId !== null,
      speedActive: speedPointerId !== null,
    }),
  };
}
