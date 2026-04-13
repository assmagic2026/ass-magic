(() => {
  "use strict";

  // 調整しやすい定数はここに集約しています。
  const CONFIG = {
    input: {
      startX: 0.08,
      goalX: 0.92,
      anchorY: 0.5,
      topMargin: 0.1,
      bottomMargin: 0.9,
      anchorRadius: 0.10,
      resumeRadius: 0.08,
      goalThreshold: 0.022,
      goalSnapRadius: 0.08,
      minPointSpacing: 0.005,
      sampleCount: 120,
      sidePathSmoothPasses: 2,
      sideCurveRefinePasses: 1,
      guideLookAhead: 30,
      guideSnapY: 0.09,
      smoothing: {
        side: { passes: 4, radius: 4 },
        top: { passes: 4, radius: 4 }
      },
      axisDivisionsX: 6,
      axisDivisionsY: 4
    },
    track: {
      length: 380,
      halfWidth: 52,
      baseHeight: 5,
      rideBaseHeight: 19,
      sideDraftAspectRatio: 1.28,
      topDraftAspectRatio: 1.28,
      verticalProfileBlendUp: 0.88,
      verticalProfileBlendDown: 0.88,
      railHalfGap: 1.7,
      railOuterWidth: 0.42,
      spineHalfWidth: 1.05,
      spineDrop: 1.5,
      sleeperHalfWidth: 3.9,
      sleeperHalfDepth: 0.9,
      sleeperDrop: 0.58,
      supportFootWidth: 7.2,
      supportTopDrop: 1.15,
      supportSpacing: 7,
      supportSpacingDistance: 40,
      tieSpacingDistance: 4,
      sleeperSpacing: 5,
      bankStrength: 1.9,
      bankLimit: Math.PI / 2,
      bankDeadZone: 0.01,
      bankWindowDistance: 40,
      bankTriggerAngle: Math.PI / 3,
      bankMinimumAngle: Math.PI / 18,
      bankMinimumLateralRange: 24,
      bankMinHorizontalProjection: 0.18,
      bankResponseExponent: 0.82,
      bankSmoothingPasses: 2,
      bankSmoothingRadius: 3,
      minimumIntentLateralRange: 14,
      tangentSampleDistance: 6,
      pathSmoothPasses: 2,
      pathSampleCount: 560,
      sideProfileSmoothPasses: 3,
      sideProfileShapePreserve: 0.42,
      maxDepthStep: 4.2,
      maxLateralStep: 4.5,
      depthSmoothPasses: 4,
      depthSmoothRadius: 8,
      lateralSmoothPasses: 6,
      lateralSmoothRadius: 8,
      maxHeightStep: 4.6,
      verticalSmoothPasses: 5,
      verticalSmoothRadius: 8,
      transitionSmoothPasses: 4,
      transitionSmoothRadius: 7,
      cornerEaseWindow: 14,
      cornerEaseStrength: 0.9,
      cornerThresholdMin: 0.42,
      cornerThresholdMultiplier: 2.4,
      deltaClampPasses: 4,
      foldbackStabilizeWindow: 12,
      foldbackStabilizeStrength: 0.85,
      foldbackNoiseRange: 18,
      foldbackBridgeBlend: 0.94,
      topFoldbackStabilizeWindow: 14,
      topFoldbackStabilizeStrength: 0.92,
      finalFoldbackStabilizeWindow: 22,
      finalFoldbackStabilizeStrength: 0.96
    },
    ride: {
      startSpeed: 100 / 3.6,
      minSpeed: 100 / 3.6,
      maxSpeed: 76,
      gravity: 32,
      rollingResistance: 0.05,
      airDrag: 0.00032,
      curveResistance: 0.08,
      lookAhead: 7,
      farDistance: 180,
      sampleStep: 3.2,
      nearClip: 0.35,
      fov: 1.18,
      rollStrength: 1.9,
      rollDeadZone: 0.0009,
      shakeStrength: 8,
      cameraLift: 1.2,
      horizonPitchScale: 180,
      finishDelayMs: 900
    },
    fear: {
      thresholds: [0.18, 0.38, 0.6, 0.8],
      labels: ["平常", "緊張", "怖い", "絶叫", "崩壊"]
    },
    visual: {
      environment: {
        skyTop: "#59d2ff",
        skyBottom: "#eff9ff",
        groundTop: "#8ad790",
        groundBottom: "#1e5846",
        horizonGlow: "rgba(255, 255, 255, 0.36)",
        mountainFar: "#92b8d4",
        mountainNear: "#5b80a7",
        mountainDeep: "#405f7e",
        treeLine: "rgba(48, 86, 78, 0.62)",
        ridgeLine: "rgba(115, 151, 172, 0.58)",
        sunGlow: "rgba(255, 245, 205, 0.5)",
        sunCore: "rgba(255, 253, 242, 0.9)",
        cloud: "rgba(255, 255, 255, 0.68)",
        cloudShadow: "rgba(103, 170, 210, 0.14)",
        skylineFar: "rgba(96, 119, 142, 0.62)",
        skylineNear: "rgba(70, 89, 108, 0.76)",
        building: "#7a97aa",
        buildingShadow: "#566d80",
        attractionWarm: "#ff8d67",
        attractionCool: "#66d1ff",
        attractionGold: "#ffd36f",
        attractionDark: "#4f6779",
        person: "#314744",
        window: "rgba(238, 245, 255, 0.42)"
      },
      track: {
        leftWeb: "rgba(99, 122, 161, 0.34)",
        rightWeb: "rgba(67, 84, 118, 0.3)",
        spineFill: "rgba(48, 63, 96, 0.56)",
        spineStroke: "rgba(194, 217, 241, 0.24)",
        spineShadow: "rgba(29, 42, 68, 0.26)",
        spineHighlight: "rgba(236, 246, 255, 0.7)",
        railShadow: "rgba(27, 40, 63, 0.42)",
        railMetal: "#9db0c1",
        railEdge: "#647ea5",
        railHighlight: "rgba(255, 255, 255, 0.98)",
        support: "rgba(68, 87, 112, 0.76)",
        supportShadow: "rgba(28, 39, 58, 0.32)",
        supportHighlight: "rgba(219, 232, 247, 0.38)",
        supportBase: "rgba(33, 52, 60, 0.22)",
        sleeperFill: "rgba(73, 91, 124, 0.58)",
        sleeperStroke: "rgba(255, 255, 255, 0.18)"
      }
    }
  };

  const INPUT_STAGES = {
    side: {
      badge: "STEP 1",
      title: "横から見た高さを描く",
      instructions:
        "左がSTART、右がGOALです。上下に揺らしながら描いてください。途中で左に戻ってもOKです。",
      nextLabel: "次へ",
      incompleteLabel: "まだGOALに届いていません。"
    },
    top: {
      badge: "STEP 2",
      title: "上から見た曲がりを描く",
      instructions:
        "下がSTART、上がGOALです。左右に振りながら、下から上へ1本でつなげてください。ループ分もこの1本に含まれます。",
      nextLabel: "完成して走る",
      incompleteLabel: "上のGOALまで届くと完成できます。"
    }
  };

  const els = {
    screens: {
      title: document.getElementById("screen-title"),
      input: document.getElementById("screen-input"),
      ride: document.getElementById("screen-ride"),
      result: document.getElementById("screen-result")
    },
    startButton: document.getElementById("start-button"),
    inputStepBadge: document.getElementById("input-step-badge"),
    inputTitle: document.getElementById("input-title"),
    inputInstructions: document.getElementById("input-instructions"),
    inputCanvas: document.getElementById("input-canvas"),
    startMarker: document.querySelector(".canvas-marker.start"),
    goalMarker: document.querySelector(".canvas-marker.goal"),
    inputStatus: document.getElementById("input-status"),
    inputResetButton: document.getElementById("input-reset-button"),
    inputNextButton: document.getElementById("input-next-button"),
    previewBlock: document.getElementById("preview-block"),
    previewCanvas: document.getElementById("preview-canvas"),
    previewStatus: document.getElementById("preview-status"),
    rideCanvas: document.getElementById("ride-canvas"),
    norikoCanvas: document.getElementById("noriko-canvas"),
    speedReadout: document.getElementById("speed-readout"),
    fearReadout: document.getElementById("fear-readout"),
    screamScore: document.getElementById("scream-score"),
    rerideButton: document.getElementById("reride-button"),
    restartButton: document.getElementById("restart-button")
  };

  const state = {
    screen: "input",
    inputStage: "side",
    inputs: {
      side: createEmptyInputState(),
      top: createEmptyInputState()
    },
    pointer: {
      active: false,
      pointerId: null
    },
    trackData: null,
    lastResult: null,
    ride: null,
    rideFrame: 0,
    scenery: null,
    skyTexture: null,
    groundPlane: null
  };

  const inputCtx = els.inputCanvas.getContext("2d");
  const previewCtx = els.previewCanvas.getContext("2d");
  const rideCtx = els.rideCanvas.getContext("2d");
  const norikoCtx = els.norikoCanvas.getContext("2d");

  function createEmptyInputState() {
    return {
      raw: [],
      sampled: [],
      valid: false
    };
  }

  function init() {
    bindEvents();
    startNewCourse();
  }

  function bindEvents() {
    els.startButton.addEventListener("click", startNewCourse);
    els.inputResetButton.addEventListener("click", resetCurrentInput);
    els.inputNextButton.addEventListener("click", handleInputAdvance);
    els.rerideButton.addEventListener("click", rerideTrack);
    els.restartButton.addEventListener("click", startNewCourse);

    els.inputCanvas.addEventListener("pointerdown", handleInputPointerDown);
    els.inputCanvas.addEventListener("pointermove", handleInputPointerMove);
    els.inputCanvas.addEventListener("pointerup", handleInputPointerUp);
    els.inputCanvas.addEventListener("pointercancel", handleInputPointerUp);

    window.addEventListener("resize", handleResize);
  }

  function startNewCourse() {
    cancelRideLoop();
    state.pointer.active = false;
    state.pointer.pointerId = null;
    state.inputs.side = createEmptyInputState();
    state.inputs.top = createEmptyInputState();
    state.trackData = null;
    state.lastResult = null;
    state.scenery = null;
    state.groundPlane = null;
    applyInputStage("side");
    setScreen("input");
    setInputStatus("STARTからGOALまで1本でつなげてください。途中で戻ってもOKです。", false);
    drawInputScene();
    drawPreviewScene();
  }

  function rerideTrack() {
    if (!state.trackData) {
      return;
    }
    startRide(state.trackData);
  }

  function applyInputStage(stageName) {
    state.inputStage = stageName;
    const stage = INPUT_STAGES[stageName];
    els.inputStepBadge.textContent = stage.badge;
    els.inputTitle.textContent = stage.title;
    els.inputInstructions.textContent = getStageInstructions(stageName);
    els.inputNextButton.textContent = stage.nextLabel;
    updateCanvasMarkers(stageName);
    syncInputControls();
  }

  function handleInputAdvance() {
    const current = getCurrentInput();
    if (!current.valid) {
      setInputStatus(getIncompleteInputLabel(state.inputStage), true);
      return;
    }

    if (state.inputStage === "side") {
      applyInputStage("top");
      setScreen("input");
      setInputStatus(
        hasSideBacktrack()
          ? "中央の矢印どおりに進みながら、戻り区間ぶんの左右ルートも描いてください。"
          : "下から上へ1本でつなげてください。ループ区間ぶんの左右ルートもここで描きます。",
        false
      );
      drawInputScene();
      drawPreviewScene();
      return;
    }

    const trackData = buildTrackData(state.inputs.side.sampled, state.inputs.top.sampled);
    state.trackData = trackData;
    startRide(trackData);
  }

  function resetCurrentInput() {
    state.inputs[state.inputStage] = createEmptyInputState();
    syncInputControls();
    setInputStatus("描き直しました。STARTから描いてください。", false);
    drawInputScene();
    drawPreviewScene();
  }

  function setScreen(name) {
    state.screen = name;
    Object.entries(els.screens).forEach(([key, screen]) => {
      screen.classList.toggle("active", key === name);
    });
    handleResize();
  }

  function handleResize() {
    resizeCanvas(els.inputCanvas, inputCtx);
    resizeCanvas(els.previewCanvas, previewCtx);
    resizeCanvas(els.rideCanvas, rideCtx);
    resizeCanvas(els.norikoCanvas, norikoCtx);

    if (state.screen === "input") {
      drawInputScene();
      drawPreviewScene();
    } else if (state.screen === "ride" && state.ride) {
      renderRide(state.ride.now || performance.now());
    } else if (state.screen === "title") {
      drawNorikoFace(0, 1, 0, 0);
    }
  }

  function resizeCanvas(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getCurrentInput() {
    return state.inputs[state.inputStage];
  }

  function getStageInstructions(stageName) {
    if (stageName !== "top") {
      return INPUT_STAGES[stageName].instructions;
    }

    return hasSideBacktrack()
      ? "下がSTART、上がGOALです。中央の矢印どおりに上や下へ進みながら、左右の曲がりを1本で描いてください。"
      : INPUT_STAGES.top.instructions;
  }

  function getIncompleteInputLabel(stageName) {
    if (stageName === "top" && hasSideBacktrack()) {
      return "中央の矢印どおりに進みながら、GOALまでつなげてください。";
    }
    return INPUT_STAGES[stageName].incompleteLabel;
  }

  function getNormalizedPointer(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function handleInputPointerDown(event) {
    if (state.screen !== "input") {
      return;
    }

    const point = getNormalizedPointer(event, els.inputCanvas);
    const current = getCurrentInput();
    const anchors = getInputAnchors();
    const lastPoint = current.raw[current.raw.length - 1];

    let canStart = false;
    let shouldReset = false;

    if (
      current.raw.length > 1 &&
      !current.valid &&
      lastPoint &&
      distance2D(point, lastPoint) <= CONFIG.input.resumeRadius
    ) {
      canStart = true;
    } else if (distance2D(point, anchors.start) <= CONFIG.input.anchorRadius) {
      canStart = true;
      shouldReset = true;
    }

    if (!canStart) {
      setInputStatus("STARTから描き始めるか、途中の終点から続けてください。", true);
      return;
    }

    if (shouldReset) {
      state.inputs[state.inputStage] = createEmptyInputState();
      state.inputs[state.inputStage].raw.push({ ...anchors.start });
    }

    state.pointer.active = true;
    state.pointer.pointerId = event.pointerId;
    els.inputCanvas.setPointerCapture(event.pointerId);
    appendInputPoint(point);
    finalizeInputIfNeeded(false);
    drawInputScene();
    drawPreviewScene();
  }

  function handleInputPointerMove(event) {
    if (!state.pointer.active || event.pointerId !== state.pointer.pointerId) {
      return;
    }

    const point = getNormalizedPointer(event, els.inputCanvas);
    appendInputPoint(point);
    if (finalizeInputIfNeeded(true)) {
      state.pointer.active = false;
      state.pointer.pointerId = null;
      els.inputCanvas.releasePointerCapture(event.pointerId);
    }
    drawInputScene();
    drawPreviewScene();
  }

  function handleInputPointerUp(event) {
    if (!state.pointer.active || event.pointerId !== state.pointer.pointerId) {
      return;
    }

    finalizeInputIfNeeded(false);
    state.pointer.active = false;
    state.pointer.pointerId = null;
    if (els.inputCanvas.hasPointerCapture(event.pointerId)) {
      els.inputCanvas.releasePointerCapture(event.pointerId);
    }
    drawInputScene();
    drawPreviewScene();
  }

  function appendInputPoint(point) {
    const current = getCurrentInput();
    if (state.inputStage === "top") {
      appendTopInputPoint(point, current);
      return;
    }

    const anchors = getInputAnchors();

    if (!current.raw.length) {
      current.raw.push({ ...anchors.start });
    }

    const prev = current.raw[current.raw.length - 1];
    const next = {
      x: clamp(point.x, CONFIG.input.startX, CONFIG.input.goalX),
      y: clamp(point.y, CONFIG.input.topMargin, CONFIG.input.bottomMargin)
    };

    if (distance2D(prev, next) < CONFIG.input.minPointSpacing) {
      return;
    }

    current.raw.push(next);
  }

  function appendTopInputPoint(point, current) {
    const guide = getTopGuideCurve();
    if (!guide || !guide.length) {
      return;
    }

    if (!current.raw.length) {
      current.raw.push({ x: 0.5, y: guide[0].y, guideIndex: 0 });
    }

    const prev = current.raw[current.raw.length - 1];
    const prevIndex = getTopGuideIndex(prev, guide);
    const nextX = clamp(point.x, CONFIG.input.startX, CONFIG.input.goalX);
    const targetIndex = findTopGuideAdvanceIndex(point.y, guide, prevIndex);

    if (targetIndex <= prevIndex) {
      if (
        prevIndex > 0 &&
        prevIndex < guide.length - 1 &&
        Math.abs(prev.x - nextX) >= CONFIG.input.minPointSpacing
      ) {
        current.raw[current.raw.length - 1] = { ...prev, x: nextX };
      }
      return;
    }

    for (let index = prevIndex + 1; index <= targetIndex; index += 1) {
      current.raw.push({
        x: index === guide.length - 1 ? 0.5 : nextX,
        y: guide[index].y,
        guideIndex: index
      });
    }
  }

  function finalizeInputIfNeeded(autoStop) {
    const current = getCurrentInput();
    if (current.raw.length < 2) {
      syncInputControls();
      return false;
    }

    const anchors = getInputAnchors();
    const last = current.raw[current.raw.length - 1];
    const topGuide = state.inputStage === "top" ? getTopGuideCurve() : null;
    const reachedGoal =
      state.inputStage === "side"
        ? distance2D(last, anchors.goal) <= CONFIG.input.goalSnapRadius
        : Boolean(topGuide) &&
          getTopGuideIndex(last, topGuide) >= topGuide.length - 1;

    if (reachedGoal) {
      current.raw[current.raw.length - 1] =
        state.inputStage === "top"
          ? { ...anchors.goal, guideIndex: topGuide.length - 1 }
          : { ...anchors.goal };
      current.valid = true;
      current.sampled = sampleInputCurve(current.raw, state.inputStage);
      syncInputControls();
      setInputStatus("つながりました。次へ進めます。", false);
      return autoStop;
    }

    current.valid = false;
    current.sampled = [];
    syncInputControls();
    setInputStatus(getIncompleteInputLabel(state.inputStage), true);
    return false;
  }

  function syncInputControls() {
    const current = getCurrentInput();
    els.inputNextButton.disabled = !current.valid;
    const showPreview = false;
    els.previewBlock.classList.toggle("hidden", !showPreview);
  }

  function setInputStatus(message, warning) {
    els.inputStatus.textContent = message;
    els.inputStatus.style.color = warning ? "#b44937" : "";
  }

  function getInputAnchors() {
    if (state.inputStage === "top") {
      return {
        start: { x: 0.5, y: CONFIG.input.bottomMargin },
        goal: { x: 0.5, y: CONFIG.input.topMargin }
      };
    }
    return {
      start: { x: CONFIG.input.startX, y: CONFIG.input.anchorY },
      goal: { x: CONFIG.input.goalX, y: CONFIG.input.anchorY }
    };
  }

  function hasSideBacktrack() {
    const sideCurve = state.inputs.side.sampled;
    for (let i = 1; i < sideCurve.length; i += 1) {
      if (sideCurve[i].x < sideCurve[i - 1].x - 0.0025) {
        return true;
      }
    }
    return false;
  }

  function getTopGuideCurve(sideCurve = state.inputs.side.sampled) {
    if (!sideCurve || sideCurve.length < 2) {
      return null;
    }

    return sideCurve.map((point, index) => ({
      x: 0.5,
      y: mapSideDepthToTopY(point.x),
      guideIndex: index
    }));
  }

  function mapSideDepthToTopY(sideX) {
    const depthT = invLerp(CONFIG.input.startX, CONFIG.input.goalX, sideX);
    return lerp(CONFIG.input.bottomMargin, CONFIG.input.topMargin, depthT);
  }

  function getTopGuideIndex(point, guide) {
    if (typeof point.guideIndex === "number") {
      return clamp(Math.round(point.guideIndex), 0, guide.length - 1);
    }

    let bestIndex = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < guide.length; i += 1) {
      const delta = Math.abs(point.y - guide[i].y);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function findTopGuideAdvanceIndex(pointerY, guide, currentIndex) {
    const maxIndex = Math.min(guide.length - 1, currentIndex + CONFIG.input.guideLookAhead);
    let nearestIndex = currentIndex;
    let nearestDelta = Infinity;

    for (let index = currentIndex + 1; index <= maxIndex; index += 1) {
      const delta = Math.abs(pointerY - guide[index].y);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestIndex = index;
      }
    }

    return nearestDelta <= CONFIG.input.guideSnapY * 2.0 ? nearestIndex : currentIndex;
  }

  function updateCanvasMarkers(stageName) {
    if (!els.startMarker || !els.goalMarker) {
      return;
    }

    if (stageName === "top") {
      Object.assign(els.startMarker.style, {
        left: "calc(50% + 28px)",
        right: "auto",
        top: "auto",
        bottom: "14px",
        transform: "none"
      });
      Object.assign(els.goalMarker.style, {
        left: "calc(50% + 28px)",
        right: "auto",
        top: "14px",
        bottom: "auto",
        transform: "none"
      });
      return;
    }

    Object.assign(els.startMarker.style, {
      left: "14px",
      right: "auto",
      top: "14px",
      bottom: "auto",
      transform: "none"
    });
    Object.assign(els.goalMarker.style, {
      left: "auto",
      right: "14px",
      top: "14px",
      bottom: "auto",
      transform: "none"
    });
  }

  function sampleInputCurve(rawPoints, profileName = "side") {
    // 側面はX方向、上面はY方向の進行でリサンプリングします。
    if (profileName === "side") {
      const anchors = {
        start: { x: CONFIG.input.startX, y: CONFIG.input.anchorY },
        goal: { x: CONFIG.input.goalX, y: CONFIG.input.anchorY }
      };
      const points = rawPoints.slice().map((point) => ({ ...point }));
      const pathSmoothed = smoothPath2D(points, CONFIG.input.sidePathSmoothPasses);
      const sampled = resamplePathByDistance(pathSmoothed, CONFIG.input.sampleCount);
      const refined = resamplePathByDistance(
        smoothPath2D(sampled, CONFIG.input.sideCurveRefinePasses),
        CONFIG.input.sampleCount
      );

      return refined.map((point, index) => ({
        x:
          index === 0
            ? anchors.start.x
            : index === refined.length - 1
              ? anchors.goal.x
              : clamp(point.x, CONFIG.input.startX, CONFIG.input.goalX),
        y:
          index === 0 || index === refined.length - 1
            ? anchors.start.y
            : clamp(point.y, CONFIG.input.topMargin, CONFIG.input.bottomMargin)
      }));
    }

    const guide = getTopGuideCurve();
    if (!guide || !guide.length) {
      return [];
    }

    const sampled = buildTopSampledCurve(rawPoints, guide);

    const profile = CONFIG.input.smoothing.top;
    const foldbackIndices = getFoldbackIndices(guide.map((point) => point.y));
    const stabilized = stabilizeAxisAroundIndices(
      sampled.map((point) => point.x),
      foldbackIndices,
      CONFIG.track.topFoldbackStabilizeWindow,
      CONFIG.track.topFoldbackStabilizeStrength
    );
    const smoothed = smoothValues(
      stabilized,
      profile.passes,
      profile.radius
    );
    const restored = preserveSeriesRange(smoothed, sampled.map((point) => point.x));
    return sampled.map((point, index) => ({
      x:
        index === 0 || index === sampled.length - 1
          ? 0.5
          : clamp(restored[index], CONFIG.input.startX, CONFIG.input.goalX),
      y: point.y
    }));
  }

  function buildTopSampledCurve(rawPoints, guide) {
    const keyed = [{ guideIndex: 0, x: 0.5 }];

    rawPoints.forEach((point) => {
      const guideIndex = clamp(getTopGuideIndex(point, guide), 0, guide.length - 1);
      const x =
        guideIndex === 0 || guideIndex === guide.length - 1
          ? 0.5
          : clamp(point.x, CONFIG.input.startX, CONFIG.input.goalX);
      const last = keyed[keyed.length - 1];
      if (guideIndex === last.guideIndex) {
        keyed[keyed.length - 1] = { guideIndex, x };
      } else if (guideIndex > last.guideIndex) {
        keyed.push({ guideIndex, x });
      }
    });

    if (keyed[keyed.length - 1].guideIndex < guide.length - 1) {
      keyed.push({ guideIndex: guide.length - 1, x: 0.5 });
    }

    const sampledX = new Array(guide.length).fill(0.5);
    for (let segmentIndex = 0; segmentIndex < keyed.length - 1; segmentIndex += 1) {
      const a = keyed[segmentIndex];
      const b = keyed[segmentIndex + 1];
      const span = Math.max(1, b.guideIndex - a.guideIndex);
      for (let index = a.guideIndex; index <= b.guideIndex; index += 1) {
        const t = clamp((index - a.guideIndex) / span, 0, 1);
        sampledX[index] = lerp(a.x, b.x, smoothStep01(t));
      }
    }

    return guide.map((point, index) => ({
      x: sampledX[index] ?? 0.5,
      y: point.y
    }));
  }

  function smoothPath2D(points, passes) {
    let result = points.slice();
    for (let pass = 0; pass < passes; pass += 1) {
      result = chaikinSmooth2D(result);
    }
    if (result.length) {
      result[0] = { ...points[0] };
      result[result.length - 1] = { ...points[points.length - 1] };
    }
    return result;
  }

  function smoothValues(values, passes, radius) {
    let result = values.slice();
    for (let pass = 0; pass < passes; pass += 1) {
      const next = result.slice();
      for (let i = 1; i < result.length - 1; i += 1) {
        let total = 0;
        let weightTotal = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const index = clamp(i + offset, 0, result.length - 1);
          const weight = radius + 1 - Math.abs(offset);
          total += result[index] * weight;
          weightTotal += weight;
        }
        next[i] = total / weightTotal;
      }
      result = next;
    }
    result[0] = values[0];
    result[result.length - 1] = values[values.length - 1];
    return result;
  }

  function prepareTrackAxis(values, smoothPasses, smoothRadius, maxDelta) {
    const base = smoothValues(values, smoothPasses, smoothRadius);
    const transitioned = smoothSeriesByVelocity(
      base,
      CONFIG.track.transitionSmoothPasses,
      CONFIG.track.transitionSmoothRadius
    );
    const eased = easeSharpCorners(
      transitioned,
      CONFIG.track.cornerEaseWindow,
      CONFIG.track.cornerEaseStrength
    );
    const restored = preserveSeriesRange(eased, values);
    return limitDeltas(restored, maxDelta, CONFIG.track.deltaClampPasses);
  }

  function smoothSeriesByVelocity(values, passes, radius) {
    if (values.length < 3) {
      return values.slice();
    }

    let deltas = values.map((value, index) =>
      index === 0 ? 0 : value - values[index - 1]
    );
    deltas = smoothValues(deltas, passes, radius);

    const result = [values[0]];
    for (let i = 1; i < values.length; i += 1) {
      result[i] = result[i - 1] + deltas[i];
    }

    const endOffset = values[values.length - 1] - result[result.length - 1];
    for (let i = 1; i < result.length - 1; i += 1) {
      result[i] += endOffset * (i / (result.length - 1));
    }
    result[0] = values[0];
    result[result.length - 1] = values[values.length - 1];
    return result;
  }

  function easeSharpCorners(values, window, strength) {
    if (values.length < 5 || window < 2 || strength <= 0) {
      return values.slice();
    }

    const result = values.slice();
    const threshold = getCornerThreshold(values);

    for (let i = 1; i < values.length - 1; i += 1) {
      const prevDelta = values[i] - values[i - 1];
      const nextDelta = values[i + 1] - values[i];
      const bend = Math.abs(nextDelta - prevDelta);
      if (bend <= threshold) {
        continue;
      }

      const influence = clamp((bend - threshold) / Math.max(0.0001, threshold), 0, 1);
      const start = Math.max(0, i - window);
      const end = Math.min(values.length - 1, i + window);
      const span = Math.max(1, end - start);

      for (let j = start + 1; j < end; j += 1) {
        const t = (j - start) / span;
        const localWeight = 1 - Math.abs(j - i) / Math.max(1, window);
        const target = lerp(values[start], values[end], smoothStep01(t));
        result[j] = lerp(result[j], target, strength * influence * Math.max(0, localWeight));
      }
    }

    result[0] = values[0];
    result[result.length - 1] = values[values.length - 1];
    return result;
  }

  function getCornerThreshold(values) {
    if (values.length < 3) {
      return CONFIG.track.cornerThresholdMin;
    }

    let totalBend = 0;
    let count = 0;
    for (let i = 1; i < values.length - 1; i += 1) {
      const prevDelta = values[i] - values[i - 1];
      const nextDelta = values[i + 1] - values[i];
      totalBend += Math.abs(nextDelta - prevDelta);
      count += 1;
    }

    return (
      CONFIG.track.cornerThresholdMin +
      (totalBend / Math.max(1, count)) * CONFIG.track.cornerThresholdMultiplier
    );
  }

  function preserveSeriesRange(values, reference) {
    if (!values.length || values.length !== reference.length) {
      return values.slice();
    }

    let valueMin = Infinity;
    let valueMax = -Infinity;
    let referenceMin = Infinity;
    let referenceMax = -Infinity;

    for (let i = 1; i < values.length - 1; i += 1) {
      valueMin = Math.min(valueMin, values[i]);
      valueMax = Math.max(valueMax, values[i]);
      referenceMin = Math.min(referenceMin, reference[i]);
      referenceMax = Math.max(referenceMax, reference[i]);
    }

    if (
      !Number.isFinite(valueMin) ||
      !Number.isFinite(referenceMin) ||
      Math.abs(valueMax - valueMin) < 0.0001 ||
      Math.abs(referenceMax - referenceMin) < 0.0001
    ) {
      return values.slice();
    }

    return values.map((value, index) => {
      if (index === 0 || index === values.length - 1) {
        return value;
      }
      const t = (value - valueMin) / (valueMax - valueMin);
      return lerp(referenceMin, referenceMax, t);
    });
  }

  function blendVerticalProfile(values, reference, centerValue, upBlend, downBlend) {
    if (!values.length || values.length !== reference.length) {
      return values.slice();
    }

    return values.map((value, index) => {
      if (index === 0 || index === values.length - 1) {
        return value;
      }
      const blend = reference[index] >= centerValue ? upBlend : downBlend;
      return lerp(value, reference[index], blend);
    });
  }

  function getSideProfileMetrics() {
    const width = els.inputCanvas?.clientWidth || 0;
    const height = els.inputCanvas?.clientHeight || 0;
    const aspectRatio =
      width > 0 && height > 0 ? width / height : CONFIG.track.sideDraftAspectRatio;
    const widthSpan = CONFIG.input.goalX - CONFIG.input.startX;
    const worldPerNormalizedX = CONFIG.track.length / Math.max(0.001, widthSpan);
    const heightPerNormalizedY = worldPerNormalizedX / Math.max(0.001, aspectRatio);
    const startHeight =
      CONFIG.track.baseHeight +
      (CONFIG.input.bottomMargin - CONFIG.input.anchorY) * heightPerNormalizedY;

    return {
      aspectRatio,
      heightPerNormalizedY,
      startHeight
    };
  }

  function getTopProfileMetrics() {
    const width = els.inputCanvas?.clientWidth || 0;
    const height = els.inputCanvas?.clientHeight || 0;
    const aspectRatio =
      width > 0 && height > 0 ? width / height : CONFIG.track.topDraftAspectRatio;
    const heightSpan = CONFIG.input.bottomMargin - CONFIG.input.topMargin;
    const worldPerNormalizedY = CONFIG.track.length / Math.max(0.001, heightSpan);
    const widthPerNormalizedX = worldPerNormalizedY / Math.max(0.001, aspectRatio);

    return {
      aspectRatio,
      widthPerNormalizedX
    };
  }

  function resamplePathByDistance(points, sampleCount) {
    if (!points.length) {
      return [];
    }
    if (points.length === 1) {
      return Array.from({ length: sampleCount }, () => ({ ...points[0] }));
    }

    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + distance2D(points[i], points[i - 1]);
    }

    const totalLength = cumulative[cumulative.length - 1];
    if (totalLength < 0.0001) {
      return Array.from({ length: sampleCount }, () => ({ ...points[0] }));
    }

    const sampled = [];
    let segmentIndex = 0;

    for (let i = 0; i < sampleCount; i += 1) {
      const distance = (totalLength * i) / (sampleCount - 1);
      while (
        segmentIndex < cumulative.length - 2 &&
        distance > cumulative[segmentIndex + 1]
      ) {
        segmentIndex += 1;
      }

      const a = points[segmentIndex];
      const b = points[segmentIndex + 1];
      const startDistance = cumulative[segmentIndex];
      const endDistance = cumulative[segmentIndex + 1];
      const span = Math.max(0.0001, endDistance - startDistance);
      const t = clamp((distance - startDistance) / span, 0, 1);

      sampled.push({
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t)
      });
    }

    return sampled;
  }

  function drawInputScene() {
    const width = els.inputCanvas.clientWidth;
    const height = els.inputCanvas.clientHeight;
    if (!width || !height) {
      return;
    }

    inputCtx.clearRect(0, 0, width, height);
    drawCanvasBackdrop(inputCtx, width, height, state.inputStage);

    const anchors = getInputAnchors();
    const stage = state.inputStage;
    const current = getCurrentInput();

    drawGuideGrid(inputCtx, width, height, stage);
    drawInputLabels(stage, width, height);
    if (stage === "top") {
      drawTopDirectionGuide(inputCtx, width, height);
    }
    drawTrackGhost(inputCtx, width, height, stage);

    if (current.valid && current.sampled.length > 1) {
      if (current.raw.length > 1) {
        drawNormalizedPath(inputCtx, current.raw, width, height, {
          strokeStyle: stage === "side" ? "rgba(255, 107, 74, 0.28)" : "rgba(29, 155, 240, 0.28)",
          lineWidth: 3
        });
      }
      drawNormalizedPath(inputCtx, current.sampled, width, height, {
        strokeStyle: stage === "side" ? "#ff6b4a" : "#1d9bf0",
        lineWidth: 5
      });
    } else if (current.raw.length > 1) {
      drawNormalizedPath(inputCtx, current.raw, width, height, {
        strokeStyle: stage === "side" ? "#ff6b4a" : "#1d9bf0",
        lineWidth: 5
      });
    }

    drawAnchor(inputCtx, width, height, anchors.start, "START");
    drawAnchor(inputCtx, width, height, anchors.goal, "GOAL");
  }

  function drawCanvasBackdrop(ctx, width, height, stage) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (stage === "side") {
      gradient.addColorStop(0, "rgba(135, 215, 255, 0.55)");
      gradient.addColorStop(1, "rgba(255, 249, 218, 0.85)");
    } else {
      gradient.addColorStop(0, "rgba(126, 231, 196, 0.4)");
      gradient.addColorStop(1, "rgba(244, 251, 255, 0.86)");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawGuideGrid(ctx, width, height, stage) {
    ctx.save();
    ctx.strokeStyle = "rgba(31, 38, 64, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < CONFIG.input.axisDivisionsX; i += 1) {
      const x = (width / CONFIG.input.axisDivisionsX) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 1; i < CONFIG.input.axisDivisionsY; i += 1) {
      const y = (height / CONFIG.input.axisDivisionsY) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(31, 38, 64, 0.16)";
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    if (stage === "top") {
      ctx.moveTo(width * 0.5, 0);
      ctx.lineTo(width * 0.5, height);
    } else {
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawInputLabels(stage, width, height) {
    inputCtx.save();
    inputCtx.fillStyle = "rgba(31, 38, 64, 0.58)";
    inputCtx.font = '700 13px "Avenir Next", "Hiragino Sans", sans-serif';
    if (stage === "side") {
      inputCtx.fillText("高い", 12, 24);
      inputCtx.fillText("低い", 12, height - 14);
    } else {
      inputCtx.fillText("左へ", 12, height * 0.52);
      inputCtx.textAlign = "right";
      inputCtx.fillText("右へ", width - 12, height * 0.52);
    }
    inputCtx.restore();
  }

  function drawTrackGhost(ctx, width, height, stage) {
    const current = getCurrentInput();
    const points = current.valid
      ? current.sampled
      : current.raw.length > 1
        ? current.raw
        : [];
    if (!points.length) {
      return;
    }
    drawNormalizedPath(ctx, points, width, height, {
      strokeStyle: stage === "side" ? "rgba(255, 107, 74, 0.18)" : "rgba(29, 155, 240, 0.18)",
      lineWidth: 10
    });
  }

  function drawTopDirectionGuide(ctx, width, height) {
    const guide = getTopGuideCurve();
    if (!guide || !guide.length) {
      return;
    }

    drawNormalizedPath(ctx, guide, width, height, {
      strokeStyle: "rgba(31, 38, 64, 0.14)",
      lineWidth: 6
    });
    drawNormalizedPath(ctx, guide, width, height, {
      strokeStyle: hasSideBacktrack() ? "rgba(31, 38, 64, 0.28)" : "rgba(31, 38, 64, 0.18)",
      lineWidth: 2.2
    });

    if (!hasSideBacktrack()) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(31, 38, 64, 0.42)";
    ctx.fillStyle = "rgba(31, 38, 64, 0.42)";
    ctx.lineWidth = 2;
    for (let i = 8; i < guide.length - 8; i += 10) {
      const prev = guide[i - 2];
      const next = guide[i + 2];
      const direction = next.y >= prev.y ? 1 : -1;
      const px = width * 0.5 + ((Math.floor(i / 10) % 2 === 0 ? -1 : 1) * 15);
      const py = guide[i].y * height;
      const tipY = py + direction * 10;
      const wing = 4.5;

      ctx.beginPath();
      ctx.moveTo(px, py - direction * 8);
      ctx.lineTo(px, tipY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px, tipY);
      ctx.lineTo(px - wing, tipY - direction * wing);
      ctx.lineTo(px + wing, tipY - direction * wing);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawNormalizedPath(ctx, points, width, height, style) {
    ctx.save();
    ctx.strokeStyle = style.strokeStyle;
    ctx.lineWidth = style.lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      const px = point.x * width;
      const py = point.y * height;
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawAnchor(ctx, width, height, point, label) {
    const px = point.x * width;
    const py = point.y * height;
    ctx.save();
    ctx.fillStyle = "white";
    ctx.strokeStyle = "rgba(31, 38, 64, 0.16)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1f2640";
    ctx.font = '900 10px "Avenir Next", "Hiragino Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(label === "START" ? "S" : "G", px, py + 3.5);
    ctx.restore();
  }

  function buildTrackData(sideCurve, topCurve) {
    // 側面図は Y と Z、上面図は X を担当します。ループ時は Z も折り返します。
    const topProfileMetrics = getTopProfileMetrics();
    let lateral = topCurve.map(
      (point) => (point.x - 0.5) * topProfileMetrics.widthPerNormalizedX
    );
    lateral = collapseMinorLateralIntent(
      lateral,
      CONFIG.track.minimumIntentLateralRange
    );
    const sideProfileMetrics = getSideProfileMetrics();
    const centerHeight = sideProfileMetrics.startHeight;
    const sideProfile = buildSideWorldProfile(
      sideCurve,
      centerHeight,
      sideProfileMetrics.heightPerNormalizedY
    );
    const smoothSideProfile = smoothWorldProfileCurve(sideProfile);
    const depth = smoothSideProfile.map((point) => point.x);
    const smoothY = smoothSideProfile.map((point) => Math.max(2.5, point.y));

    const smoothX = prepareTrackAxis(
      lateral,
      CONFIG.track.lateralSmoothPasses,
      CONFIG.track.lateralSmoothRadius,
      CONFIG.track.maxLateralStep
    );
    const foldbackIndices = getFoldbackIndices(depth);
    const stabilizedX = stabilizeAxisAroundIndices(
      smoothX,
      foldbackIndices,
      CONFIG.track.foldbackStabilizeWindow,
      CONFIG.track.foldbackStabilizeStrength
    );
    const bridgedX = smoothFoldbackLateralBridges(
      stabilizedX,
      foldbackIndices,
      CONFIG.track.finalFoldbackStabilizeWindow,
      CONFIG.track.foldbackNoiseRange,
      CONFIG.track.foldbackBridgeBlend
    );

    const rawPoints = bridgedX.map((x, index) => ({
      x,
      y: Math.max(2.5, smoothY[index]),
      z: depth[index]
    }));
    const points = stabilizeTrackFoldbackTwist(finalizeTrackPoints(rawPoints));

    const cumulative = [0];
    const tangents = [];
    const rights = [];
    const ups = [];
    const curvatures = [];
    const turns = [];

    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + distance3D(points[i], points[i - 1]);
    }

    for (let i = 0; i < points.length; i += 1) {
      const prev = points[Math.max(0, i - 2)];
      const next = points[Math.min(points.length - 1, i + 2)];
      tangents[i] = normalize3(sub3(next, prev));
    }

    // turns を先に計算して buildTrackFrames にバンク情報を渡す
    for (let i = 0; i < points.length; i += 1) {
      const prevTangent = tangents[Math.max(0, i - 1)];
      const tangent = tangents[i];
      const nextTangent = tangents[Math.min(points.length - 1, i + 1)];
      turns[i] = computePlanarTurn(
        points[Math.max(0, i - 1)],
        points[i],
        points[Math.min(points.length - 1, i + 1)]
      );
      curvatures[i] =
        Math.abs(angleBetween3(prevTangent, nextTangent)) /
        Math.max(1, getSegmentSpan(cumulative, i));
      if (!Number.isFinite(curvatures[i])) {
        curvatures[i] = 0;
      }
      if (!Number.isFinite(turns[i])) {
        turns[i] = 0;
      }
      if (!Number.isFinite(curvatures[i])) {
        curvatures[i] = 0;
      }
    }

    // バンク角の急変を平滑化
    const smoothedTurns = easeSharpCorners(
      smoothSeriesByVelocity(
        smoothValues(turns, 3, 4),
        1,
        3
      ),
      5,
      0.5
    );
    for (let i = 0; i < turns.length; i += 1) {
      turns[i] = smoothedTurns[i];
    }

    const twistAngles = computeTwistAngles(cumulative, points);
    const frames = buildTrackFrames(tangents, twistAngles);
    for (let i = 0; i < tangents.length; i += 1) {
      rights[i] = frames.rights[i];
      ups[i] = frames.ups[i];
    }

    const analysis = analyzeTrack(points, curvatures, turns, cumulative);
    const bounds = getTrackBounds(points);
    return {
      points,
      cumulative,
      tangents,
      rights,
      ups,
      curvatures,
      turns,
      bankTurns: [],
      zeroRights: frames.zeroRights,
      zeroUps: frames.zeroUps,
      bankAngles: twistAngles,
      twistAngles,
      totalLength: cumulative[cumulative.length - 1],
      analysis,
      bounds
    };
  }

  function analyzeTrack(points, curvatures, turns, cumulative) {
    let maxY = -Infinity;
    let minY = Infinity;
    let verticalTravel = 0;
    let totalTurn = 0;
    let curvatureJumps = 0;

    for (let i = 0; i < points.length; i += 1) {
      maxY = Math.max(maxY, points[i].y);
      minY = Math.min(minY, points[i].y);
      if (i > 0) {
        verticalTravel += Math.abs(points[i].y - points[i - 1].y);
        totalTurn += Math.abs(turns[i]);
        curvatureJumps += Math.abs(curvatures[i] - curvatures[i - 1]);
      }
    }

    const averageCurvatureJump = curvatureJumps / Math.max(1, points.length - 1);
    const drop = maxY - minY;
    const length = cumulative[cumulative.length - 1];
    const roughness = averageCurvatureJump * 260 + verticalTravel / Math.max(1, length) * 1.8;

    return {
      drop,
      verticalTravel,
      totalTurn,
      roughness
    };
  }

  function getTrackBounds(points) {
    return points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
        minZ: Math.min(acc.minZ, point.z),
        maxZ: Math.max(acc.maxZ, point.z)
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
      }
    );
  }

  function buildSideWorldProfile(sideCurve, centerHeight, heightPerNormalizedY) {
    return sideCurve.map((point) => ({
      x: invLerp(CONFIG.input.startX, CONFIG.input.goalX, point.x) * CONFIG.track.length,
      y: centerHeight + (CONFIG.input.anchorY - point.y) * heightPerNormalizedY
    }));
  }

  function smoothWorldProfileCurve(points) {
    if (points.length < 3) {
      return points.slice();
    }

    const coarse = resamplePathByDistance(
      smoothPath2D(points, CONFIG.track.sideProfileSmoothPasses),
      points.length
    );
    const blended = coarse.map((point, index) => ({
      x: lerp(point.x, points[index].x, CONFIG.track.sideProfileShapePreserve),
      y: lerp(point.y, points[index].y, CONFIG.track.sideProfileShapePreserve)
    }));
    const refined = resamplePathByDistance(smoothPath2D(blended, 1), points.length);
    refined[0] = { ...points[0] };
    refined[refined.length - 1] = { ...points[points.length - 1] };
    return refined;
  }

  function buildGroundPlane(trackData) {
    const bounds = trackData.bounds || getTrackBounds(trackData.points);
    const margin = 20;
    const spanX = bounds.maxX - bounds.minX + margin * 2;
    const spanZ = bounds.maxZ - bounds.minZ + margin * 2;
    const size = Math.ceil(Math.max(spanX, spanZ) / 20) * 20;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    const half = size * 0.5;
    return {
      minX: centerX - half,
      maxX: centerX + half,
      minZ: centerZ - half,
      maxZ: centerZ + half,
      gridStep: 20
    };
  }

  function finalizeTrackPoints(points) {
    let result = points.slice();
    for (let pass = 0; pass < CONFIG.track.pathSmoothPasses; pass += 1) {
      result = chaikinSmooth3D(result);
    }
    result = resamplePath3DByDistance(result, CONFIG.track.pathSampleCount);
    const smoothedX = smoothTrackCoordinateSeries(
      result.map((point) => point.x),
      CONFIG.track.lateralSmoothPasses,
      CONFIG.track.lateralSmoothRadius,
      CONFIG.track.cornerEaseWindow,
      CONFIG.track.cornerEaseStrength,
      0.24
    );
    const smoothedY = smoothTrackCoordinateSeries(
      result.map((point) => point.y),
      CONFIG.track.verticalSmoothPasses,
      CONFIG.track.verticalSmoothRadius,
      CONFIG.track.cornerEaseWindow + 2,
      CONFIG.track.cornerEaseStrength,
      0.22
    );
    const smoothedZ = smoothTrackCoordinateSeries(
      result.map((point) => point.z),
      CONFIG.track.depthSmoothPasses + 1,
      CONFIG.track.depthSmoothRadius,
      CONFIG.track.cornerEaseWindow + 2,
      CONFIG.track.cornerEaseStrength * 0.82,
      0.26
    );
    result = result.map((point, index) => ({
      x: smoothedX[index],
      y: smoothedY[index],
      z: smoothedZ[index]
    }));
    result[0] = { ...points[0] };
    result[result.length - 1] = { ...points[points.length - 1] };
    return result.map((point) => ({
      x: point.x,
      y: Math.max(2.5, point.y),
      z: point.z
    }));
  }

  function stabilizeTrackFoldbackTwist(points) {
    if (!points.length) {
      return [];
    }

    const foldbackIndices = getFoldbackIndices(points.map((point) => point.z));
    if (!foldbackIndices.length) {
      return points.slice();
    }

    const stabilizedX = stabilizeAxisAroundIndices(
      points.map((point) => point.x),
      foldbackIndices,
      CONFIG.track.finalFoldbackStabilizeWindow,
      CONFIG.track.finalFoldbackStabilizeStrength
    );
    const bridgedX = smoothFoldbackLateralBridges(
      stabilizedX,
      foldbackIndices,
      CONFIG.track.finalFoldbackStabilizeWindow,
      CONFIG.track.foldbackNoiseRange,
      CONFIG.track.foldbackBridgeBlend
    );

    return points.map((point, index) => ({
      x: bridgedX[index],
      y: point.y,
      z: point.z
    }));
  }

  function collapseMinorLateralIntent(values, minimumRange) {
    const range = getInteriorValueRange(values);
    if (range < 0.0001) {
      return values.map(() => 0);
    }
    if (range >= minimumRange) {
      return values.slice();
    }

    const strength = smoothStep01(range / Math.max(0.0001, minimumRange));
    return values.map((value, index) =>
      index === 0 || index === values.length - 1 ? 0 : value * strength
    );
  }

  function smoothTrackCoordinateSeries(values, passes, radius, window, strength, preserveBlend) {
    const base = smoothValues(values, passes, radius);
    const transitioned = smoothSeriesByVelocity(
      base,
      Math.max(1, passes - 2),
      Math.max(2, radius - 2)
    );
    const eased = easeSharpCorners(transitioned, window, strength);
    return blendSeriesTowardReference(eased, values, preserveBlend);
  }

  function getFoldbackIndices(depthValues) {
    const indices = [];
    for (let i = 2; i < depthValues.length - 2; i += 1) {
      const prevDelta = depthValues[i] - depthValues[i - 1];
      const nextDelta = depthValues[i + 1] - depthValues[i];
      if (Math.abs(prevDelta) < 0.001 || Math.abs(nextDelta) < 0.001) {
        continue;
      }
      if (Math.sign(prevDelta) !== Math.sign(nextDelta)) {
        indices.push(i);
      }
    }
    return indices;
  }

  function stabilizeAxisAroundIndices(values, indices, window, strength) {
    if (!indices.length || !values.length) {
      return values.slice();
    }

    const result = values.slice();
    const source = values.slice();
    for (const centerIndex of indices) {
      const anchor = values[centerIndex];
      const start = Math.max(0, centerIndex - window);
      const end = Math.min(values.length - 1, centerIndex + window);
      const startValue = source[start];
      const endValue = source[end];
      const baseCenter = lerp(startValue, endValue, 0.5);
      const crest = anchor - baseCenter;
      for (let i = start; i <= end; i += 1) {
        const distance = Math.abs(i - centerIndex);
        const localStrength = Math.max(0, 1 - distance / Math.max(1, window));
        const t = clamp((i - start) / Math.max(1, end - start), 0, 1);
        const bridge = lerp(startValue, endValue, smoothStep01(t));
        const crestWeight = Math.sin(t * Math.PI);
        const target = bridge + crest * crestWeight;
        result[i] = lerp(result[i], target, strength * localStrength);
      }
    }
    result[0] = values[0];
    result[result.length - 1] = values[values.length - 1];
    return result;
  }

  function smoothFoldbackLateralBridges(values, indices, window, noiseRange, blend) {
    if (!indices.length || !values.length) {
      return values.slice();
    }

    const result = values.slice();
    for (const centerIndex of indices) {
      const start = Math.max(0, centerIndex - window);
      const end = Math.min(values.length - 1, centerIndex + window);
      if (end - start < 2) {
        continue;
      }
      const localRange = getValueRangeInRange(result, start, end);
      if (localRange > noiseRange) {
        continue;
      }
      const startValue = result[start];
      const endValue = result[end];
      for (let i = start + 1; i < end; i += 1) {
        const t = clamp((i - start) / Math.max(1, end - start), 0, 1);
        const target = lerp(startValue, endValue, smoothStep01(t));
        const influence = Math.sin(t * Math.PI) * blend;
        result[i] = lerp(result[i], target, influence);
      }
    }

    result[0] = values[0];
    result[result.length - 1] = values[values.length - 1];
    return result;
  }

  function prepareDepthAxis(values) {
    const base = smoothValues(
      values,
      CONFIG.track.depthSmoothPasses,
      CONFIG.track.depthSmoothRadius
    );
    const transitioned = smoothSeriesByVelocity(
      base,
      Math.max(1, CONFIG.track.transitionSmoothPasses - 1),
      Math.max(2, CONFIG.track.transitionSmoothRadius - 1)
    );
    const eased = easeSharpCorners(
      transitioned,
      Math.max(6, CONFIG.track.cornerEaseWindow + 2),
      CONFIG.track.cornerEaseStrength * 0.28
    );
    return blendSeriesTowardReference(eased, values, 0.62);
  }

  function blendSeriesTowardReference(values, reference, blend) {
    if (!values.length || values.length !== reference.length) {
      return values.slice();
    }

    return values.map((value, index) =>
      index === 0 || index === values.length - 1
        ? reference[index]
        : lerp(value, reference[index], blend)
    );
  }

  function computeBankTurns(points, tangents) {
    const bankTurns = [];
    for (let i = 0; i < points.length; i += 1) {
      const prevIndex = Math.max(0, i - 1);
      const currentIndex = i;
      const nextIndex = Math.min(points.length - 1, i + 1);
      bankTurns[i] = computeHorizontalBankTurn(
        tangents[prevIndex],
        tangents[currentIndex],
        tangents[nextIndex]
      );
      if (!Number.isFinite(bankTurns[i])) {
        bankTurns[i] = 0;
      }
    }

    return easeSharpCorners(
      smoothSeriesByVelocity(
        smoothValues(bankTurns, 3, 5),
        1,
        3
      ),
      5,
      0.45
    );
  }

  function computeHorizontalBankTurn(prevTangent, tangent, nextTangent) {
    const prevHorizontal = Math.hypot(prevTangent.x, prevTangent.z);
    const currentHorizontal = Math.hypot(tangent.x, tangent.z);
    const nextHorizontal = Math.hypot(nextTangent.x, nextTangent.z);
    const minHorizontal = Math.min(prevHorizontal, currentHorizontal, nextHorizontal);
    if (minHorizontal < 0.0001) {
      return 0;
    }

    const prevHeading = { x: prevTangent.x / prevHorizontal, z: prevTangent.z / prevHorizontal };
    const nextHeading = { x: nextTangent.x / nextHorizontal, z: nextTangent.z / nextHorizontal };
    const horizontalStrength = smoothStep01(
      invLerp(CONFIG.track.bankMinHorizontalProjection, 0.95, minHorizontal)
    );
    if (horizontalStrength < 0.0001) {
      return 0;
    }

    return Math.sin(signedAngleXZ(prevHeading, nextHeading)) * horizontalStrength;
  }

  function computeProgressTurn(prevS, prevX, currentS, currentX, nextS, nextX) {
    const v1 = { x: currentX - prevX, z: currentS - prevS };
    const v2 = { x: nextX - currentX, z: nextS - currentS };
    const len1 = Math.hypot(v1.x, v1.z);
    const len2 = Math.hypot(v2.x, v2.z);
    if (len1 < 0.001 || len2 < 0.001) {
      return 0;
    }
    const dot = clamp((v1.x * v2.x + v1.z * v2.z) / (len1 * len2), -1, 1);
    const cross = v1.x * v2.z - v1.z * v2.x;
    return Math.atan2(cross, dot);
  }

  function chaikinSmooth3D(points) {
    if (points.length < 3) {
      return points.slice();
    }

    const result = [{ ...points[0] }];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      result.push(lerp3(a, b, 0.25));
      result.push(lerp3(a, b, 0.75));
    }
    result.push({ ...points[points.length - 1] });
    return result;
  }

  function chaikinSmooth2D(points) {
    if (points.length < 3) {
      return points.slice();
    }

    const result = [{ ...points[0] }];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      result.push({
        x: lerp(a.x, b.x, 0.25),
        y: lerp(a.y, b.y, 0.25)
      });
      result.push({
        x: lerp(a.x, b.x, 0.75),
        y: lerp(a.y, b.y, 0.75)
      });
    }
    result.push({ ...points[points.length - 1] });
    return result;
  }

  function resamplePath3DByDistance(points, sampleCount) {
    if (!points.length) {
      return [];
    }
    if (points.length === 1) {
      return Array.from({ length: sampleCount }, () => ({ ...points[0] }));
    }

    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative[i] = cumulative[i - 1] + distance3D(points[i], points[i - 1]);
    }

    const totalLength = cumulative[cumulative.length - 1];
    if (totalLength < 0.0001) {
      return Array.from({ length: sampleCount }, () => ({ ...points[0] }));
    }

    const sampled = [];
    let segmentIndex = 0;
    for (let i = 0; i < sampleCount; i += 1) {
      const distance = (totalLength * i) / (sampleCount - 1);
      while (
        segmentIndex < cumulative.length - 2 &&
        distance > cumulative[segmentIndex + 1]
      ) {
        segmentIndex += 1;
      }
      const a = points[segmentIndex];
      const b = points[segmentIndex + 1];
      const startDistance = cumulative[segmentIndex];
      const endDistance = cumulative[segmentIndex + 1];
      const span = Math.max(0.0001, endDistance - startDistance);
      const t = clamp((distance - startDistance) / span, 0, 1);
      sampled.push(lerp3(a, b, t));
    }
    return sampled;
  }

  function drawPreviewScene() {
    const width = els.previewCanvas.clientWidth;
    const height = els.previewCanvas.clientHeight;
    if (!width || !height || state.inputStage !== "top" || !state.inputs.side.valid) {
      return;
    }

    previewCtx.clearRect(0, 0, width, height);

    const gradient = previewCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(150, 226, 255, 0.92)");
    gradient.addColorStop(0.62, "rgba(243, 249, 255, 0.98)");
    gradient.addColorStop(1, "rgba(255, 244, 216, 0.96)");
    previewCtx.fillStyle = gradient;
    previewCtx.fillRect(0, 0, width, height);

    const previewTrack = buildPreviewTrackData();
    if (!previewTrack) {
      els.previewStatus.textContent = "描いた高さを確認できます";
      return;
    }

    drawSidePreview(previewCtx, width, height, previewTrack);

    els.previewStatus.textContent = state.inputs.top.valid
      ? "完成コースの横から見た形です"
      : "この高さで走ります";
  }

  function drawSidePreview(ctx, width, height, previewTrack) {
    const bounds = previewTrack.bounds || getTrackBounds(previewTrack.points);
    const paddingX = 22;
    const paddingTop = 18;
    const paddingBottom = 28;
    const spanZ = Math.max(1, bounds.maxZ - bounds.minZ);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const scaleX = (width - paddingX * 2) / spanZ;
    const scaleY = (height - paddingTop - paddingBottom) / spanY;
    const scale = Math.min(scaleX, scaleY * 1.12);
    const offsetX =
      paddingX + (width - paddingX * 2 - spanZ * scale) * 0.5;
    const offsetY =
      paddingTop + (height - paddingTop - paddingBottom - spanY * scale) * 0.5;
    const project = (point) => ({
      x: offsetX + (point.z - bounds.minZ) * scale,
      y: offsetY + (bounds.maxY - point.y) * scale
    });

    ctx.save();
    ctx.strokeStyle = "rgba(31, 38, 64, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i += 1) {
      const y = paddingTop + ((height - paddingTop - paddingBottom) * i) / 5;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(width - 14, y);
      ctx.stroke();
    }
    for (let i = 1; i <= 5; i += 1) {
      const x = paddingX + ((width - paddingX * 2) * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, paddingTop);
      ctx.lineTo(x, height - paddingBottom + 6);
      ctx.stroke();
    }

    const groundY = height - paddingBottom + 2;
    ctx.strokeStyle = "rgba(31, 38, 64, 0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, groundY);
    ctx.lineTo(width - 12, groundY);
    ctx.stroke();

    const sidePoints = previewTrack.points.map(project);
    drawRailStroke(ctx, sidePoints, 9, "rgba(26, 42, 68, 0.18)");
    drawRailStroke(ctx, sidePoints, 6.4, CONFIG.visual.track.railMetal);
    drawRailStroke(ctx, sidePoints, 2.2, CONFIG.visual.track.railHighlight);

    const startPoint = sidePoints[0];
    const goalPoint = sidePoints[sidePoints.length - 1];
    ctx.fillStyle = "#ff6b4a";
    ctx.beginPath();
    ctx.arc(startPoint.x, startPoint.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1d9bf0";
    ctx.beginPath();
    ctx.arc(goalPoint.x, goalPoint.y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(31, 38, 64, 0.52)";
    ctx.font = '700 12px "Avenir Next", "Hiragino Sans", sans-serif';
    ctx.fillText("高い", 12, 22);
    ctx.fillText("低い", 12, height - 10);
    ctx.textAlign = "left";
    ctx.fillText("START", Math.min(width - 58, startPoint.x + 10), Math.max(18, startPoint.y - 10));
    ctx.textAlign = "right";
    ctx.fillText("GOAL", Math.min(width - 10, goalPoint.x + 28), Math.max(18, goalPoint.y - 10));
    ctx.restore();
  }

  function buildPreviewTrackData() {
    const sideCurve = state.inputs.side.sampled;
    if (!sideCurve.length) {
      return null;
    }

    let topCurve = null;
    if (state.inputs.top.valid) {
      topCurve = state.inputs.top.sampled;
    } else if (state.inputs.top.raw.length > 1) {
      topCurve = sampleInputCurve(state.inputs.top.raw, "top");
    } else {
      topCurve = getTopGuideCurve(sideCurve).map((point) => ({
        x: 0.5,
        y: point.y
      }));
    }

    const trackData = buildTrackData(sideCurve, topCurve);
    const bounds = trackData.points.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
        minZ: Math.min(acc.minZ, point.z),
        maxZ: Math.max(acc.maxZ, point.z)
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
      }
    );
    trackData.bounds = bounds;
    return trackData;
  }

  function drawPreviewGround(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = "rgba(30, 88, 70, 0.09)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const y = height * 0.62 + i * 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function buildPreviewTrackSections(previewTrack, previewProjection) {
    return previewTrack.points.map((point, index) => {
      const tangent = previewTrack.tangents[index];
      const frame = {
        right: previewTrack.rights[index],
        up: previewTrack.ups[index]
      };
      const beamCenter = sub3(point, scale3(frame.up, CONFIG.track.spineDrop * 0.92));
      const sleeperCenter = sub3(point, scale3(frame.up, CONFIG.track.sleeperDrop));
      const leftRailWorld = sub3(point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(point, scale3(frame.right, CONFIG.track.railHalfGap));
      const leftSupportTop = {
        x: leftRailWorld.x,
        y: leftRailWorld.y,
        z: leftRailWorld.z
      };
      const rightSupportTop = {
        x: rightRailWorld.x,
        y: rightRailWorld.y,
        z: rightRailWorld.z
      };
      const leftSupportFoot = {
        x: leftRailWorld.x,
        y: 0,
        z: leftRailWorld.z
      };
      const rightSupportFoot = {
        x: rightRailWorld.x,
        y: 0,
        z: rightRailWorld.z
      };

      return {
        center: projectPreviewPoint(point, previewProjection),
        leftRail: projectPreviewPoint(
          leftRailWorld,
          previewProjection
        ),
        rightRail: projectPreviewPoint(
          rightRailWorld,
          previewProjection
        ),
        leftRailInner: projectPreviewPoint(
          sub3(point, scale3(frame.right, CONFIG.track.railHalfGap * 0.55)),
          previewProjection
        ),
        rightRailInner: projectPreviewPoint(
          add3(point, scale3(frame.right, CONFIG.track.railHalfGap * 0.55)),
          previewProjection
        ),
        beamCenter: projectPreviewPoint(beamCenter, previewProjection),
        beamLeft: projectPreviewPoint(
          sub3(beamCenter, scale3(frame.right, CONFIG.track.spineHalfWidth)),
          previewProjection
        ),
        beamRight: projectPreviewPoint(
          add3(beamCenter, scale3(frame.right, CONFIG.track.spineHalfWidth)),
          previewProjection
        ),
        supportLeftTop: projectPreviewPoint(
          leftSupportTop,
          previewProjection
        ),
        supportRightTop: projectPreviewPoint(
          rightSupportTop,
          previewProjection
        ),
        supportLeftFoot: projectPreviewPoint(
          leftSupportFoot,
          previewProjection
        ),
        supportRightFoot: projectPreviewPoint(
          rightSupportFoot,
          previewProjection
        ),
        sleeperFrontLeft: projectPreviewPoint(
          sub3(
            add3(sleeperCenter, scale3(tangent, CONFIG.track.sleeperHalfDepth * 0.75)),
            scale3(frame.right, CONFIG.track.sleeperHalfWidth)
          ),
          previewProjection
        ),
        sleeperFrontRight: projectPreviewPoint(
          add3(
            add3(sleeperCenter, scale3(tangent, CONFIG.track.sleeperHalfDepth * 0.75)),
            scale3(frame.right, CONFIG.track.sleeperHalfWidth)
          ),
          previewProjection
        ),
        sleeperBackLeft: projectPreviewPoint(
          sub3(
            sub3(sleeperCenter, scale3(tangent, CONFIG.track.sleeperHalfDepth * 0.75)),
            scale3(frame.right, CONFIG.track.sleeperHalfWidth)
          ),
          previewProjection
        ),
        sleeperBackRight: projectPreviewPoint(
          add3(
            sub3(sleeperCenter, scale3(tangent, CONFIG.track.sleeperHalfDepth * 0.75)),
            scale3(frame.right, CONFIG.track.sleeperHalfWidth)
          ),
          previewProjection
        )
      };
    });
  }

  function drawPreviewSupports(ctx, sections) {
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i];
      if (
        !section.supportLeftTop ||
        !section.supportRightTop ||
        !section.supportLeftFoot ||
        !section.supportRightFoot
      ) {
        continue;
      }
      drawSupportLeg(ctx, section.supportLeftTop, section.supportLeftFoot, 4.4, 2.9, 0.26);
      drawSupportLeg(ctx, section.supportRightTop, section.supportRightFoot, 4.4, 2.9, 0.26);
    }
  }

  function buildPreviewSupportSections(previewTrack, previewProjection) {
    const sections = [];
    for (
      let distance = 0;
      distance <= previewTrack.totalLength;
      distance += CONFIG.track.supportSpacingDistance
    ) {
      const sample = sampleTrackAtDistance(previewTrack, distance);
      const frame = { right: sample.right, up: sample.up };
      const leftRailWorld = sub3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const leftSupportTop = { x: leftRailWorld.x, y: leftRailWorld.y, z: leftRailWorld.z };
      const rightSupportTop = { x: rightRailWorld.x, y: rightRailWorld.y, z: rightRailWorld.z };
      const leftSupportFoot = { x: leftRailWorld.x, y: 0, z: leftRailWorld.z };
      const rightSupportFoot = { x: rightRailWorld.x, y: 0, z: rightRailWorld.z };
      sections.push({
        supportLeftTop: projectPreviewPoint(leftSupportTop, previewProjection),
        supportRightTop: projectPreviewPoint(rightSupportTop, previewProjection),
        supportLeftFoot: projectPreviewPoint(leftSupportFoot, previewProjection),
        supportRightFoot: projectPreviewPoint(rightSupportFoot, previewProjection)
      });
    }
    return sections;
  }

  function buildPreviewTieSections(previewTrack, previewProjection) {
    const sections = [];
    for (
      let distance = 0;
      distance <= previewTrack.totalLength;
      distance += CONFIG.track.tieSpacingDistance
    ) {
      const sample = sampleTrackAtDistance(previewTrack, distance);
      const frame = { right: sample.right, up: sample.up };
      const leftRailWorld = sub3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const leftRail = projectPreviewPoint(leftRailWorld, previewProjection);
      const rightRail = projectPreviewPoint(rightRailWorld, previewProjection);
      if (leftRail && rightRail) {
        sections.push({ leftRail, rightRail });
      }
    }
    return sections;
  }

  function drawPreviewTies(ctx, sections) {
    ctx.save();
    ctx.strokeStyle = "rgba(88, 106, 132, 0.62)";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    for (const section of sections) {
      ctx.beginPath();
      ctx.moveTo(section.leftRail.x, section.leftRail.y);
      ctx.lineTo(section.rightRail.x, section.rightRail.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function buildSceneryLayout(trackLength) {
    const extent = Math.max(trackLength + 180, 560);
    const scenery = {
      clouds: [],
      mountains: [],
      skyline: [],
      attractions: [],
      buildings: [],
      people: []
    };

    scenery.mountains.push(
      { x: -260, z: extent - 10, width: 420, height: 122, depthOffset: -28, color: CONFIG.visual.environment.mountainFar, alpha: 0.72 },
      { x: 40, z: extent + 40, width: 360, height: 152, depthOffset: 12, color: CONFIG.visual.environment.mountainNear, alpha: 0.76 },
      { x: 300, z: extent + 110, width: 320, height: 116, depthOffset: 24, color: CONFIG.visual.environment.mountainDeep, alpha: 0.8 }
    );

    for (let i = 0; i < 10; i += 1) {
      scenery.clouds.push({
        x: -210 + (i % 5) * 105 + Math.sin(i * 1.4) * 16,
        y: 72 + (i % 3) * 16,
        z: 100 + i * 66,
        size: 22 + (i % 4) * 6
      });
    }

    for (let i = 0; i < 9; i += 1) {
      scenery.skyline.push({
        x: -260 + i * 64,
        z: extent + 20 + (i % 2) * 34,
        width: 22 + (i % 3) * 10,
        height: 40 + (i % 4) * 16,
        roofHeight: 10 + (i % 2) * 6
      });
    }

    const attractionSeed = [
      { type: "ferris", x: -96, z: 72, size: 34 },
      { type: "tower", x: 110, z: 138, height: 50 },
      { type: "tent", x: -124, z: 214, width: 34, height: 22 },
      { type: "arch", x: 128, z: 286, width: 30, height: 20 },
      { type: "ferris", x: -108, z: 352, size: 28 },
      { type: "tower", x: 94, z: extent - 80, height: 42 }
    ];
    scenery.attractions.push(...attractionSeed);

    for (let z = 42, i = 0; z <= extent - 24; z += 58, i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      scenery.buildings.push({
        x: side * (98 + (i % 3) * 16),
        z: z + 10,
        width: 18 + (i % 4) * 6,
        height: 20 + ((i + 1) % 4) * 8,
        roofHeight: 5 + (i % 2) * 3
      });
      scenery.buildings.push({
        x: -side * (132 + (i % 2) * 18),
        z: z + 28,
        width: 26 + (i % 3) * 5,
        height: 26 + (i % 5) * 7,
        roofHeight: 6 + ((i + 1) % 2) * 4
      });

      const groupX = side * (54 + (i % 2) * 10);
      scenery.people.push(
        { x: groupX, z: z + 4, height: 5.2 },
        { x: groupX + side * 5, z: z + 7, height: 4.8 },
        { x: groupX - side * 4, z: z + 11, height: 5.6 }
      );
    }

    return scenery;
  }

  function drawPreviewSleepers(ctx, sections) {
    for (let i = sections.length - 2; i >= 0; i -= CONFIG.track.sleeperSpacing) {
      const section = sections[i];
      drawProjectedQuad(
        ctx,
        section.sleeperFrontLeft,
        section.sleeperFrontRight,
        section.sleeperBackRight,
        section.sleeperBackLeft,
        CONFIG.visual.track.sleeperFill,
        CONFIG.visual.track.sleeperStroke,
        0.8
      );
    }
  }

  function buildPreviewProjection(previewTrack, width, height) {
    const marginX = 34;
    const marginY = 18;
    const bounds = previewTrack.bounds || getTrackBounds(previewTrack.points);
    const samplePoints = previewTrack.points.concat([
      { x: bounds.minX, y: 0, z: bounds.minZ },
      { x: bounds.maxX, y: 0, z: bounds.minZ },
      { x: bounds.minX, y: 0, z: bounds.maxZ },
      { x: bounds.maxX, y: 0, z: bounds.maxZ }
    ]);

    let minIsoX = Infinity;
    let maxIsoX = -Infinity;
    let minIsoY = Infinity;
    let maxIsoY = -Infinity;

    samplePoints.forEach((point) => {
      const iso = getPreviewIsoPoint(point);
      minIsoX = Math.min(minIsoX, iso.x);
      maxIsoX = Math.max(maxIsoX, iso.x);
      minIsoY = Math.min(minIsoY, iso.y);
      maxIsoY = Math.max(maxIsoY, iso.y);
    });

    const spanIsoX = Math.max(1, maxIsoX - minIsoX);
    const spanIsoY = Math.max(1, maxIsoY - minIsoY);
    const availableWidth = Math.max(1, width - marginX * 2);
    const availableHeight = Math.max(1, height - marginY * 2);
    const scale = Math.min(availableWidth / spanIsoX, availableHeight / spanIsoY);

    return {
      scale,
      offsetX: marginX + (availableWidth - spanIsoX * scale) * 0.5 - minIsoX * scale,
      offsetY: marginY + (availableHeight - spanIsoY * scale) * 0.5 - minIsoY * scale
    };
  }

  function getPreviewIsoPoint(point) {
    return {
      x: point.z * 0.78 + point.x * 0.28,
      y: -point.y * 0.64 + point.x * 0.18 + point.z * 0.08
    };
  }

  function projectPreviewPoint(point, previewProjection) {
    const iso = getPreviewIsoPoint(point);
    return {
      x: previewProjection.offsetX + iso.x * previewProjection.scale,
      y: previewProjection.offsetY + iso.y * previewProjection.scale
    };
  }

  function startRide(trackData) {
    cancelRideLoop();
    const startHeight = trackData.points[0]?.y || 0;
    state.scenery = null;
    state.groundPlane = buildGroundPlane(trackData);
    state.ride = {
      distance: 0,
      speed: CONFIG.ride.startSpeed,
      specificEnergy: specificEnergyFromSpeed(CONFIG.ride.startSpeed, startHeight),
      now: performance.now(),
      previousTime: performance.now(),
      maxSpeed: CONFIG.ride.startSpeed,
      maxFear: 0,
      maxLevel: 1,
      fear: 0,
      smoothedStimulus: 0,
      levelTimes: [0, 0, 0, 0, 0],
      distortionIntegral: 0,
      forceLoad: 0,
      elapsed: 0,
      finished: false,
      resultQueued: false
    };
    els.speedReadout.textContent = `${Math.round(CONFIG.ride.startSpeed * 3.6)} km/h`;
    els.fearReadout.textContent = CONFIG.fear.labels[0];
    setScreen("ride");
    rideLoop(performance.now());
  }

  function rideLoop(now) {
    if (!state.ride || !state.trackData) {
      return;
    }

    const ride = state.ride;
    const dt = Math.min(0.04, (now - ride.previousTime) / 1000 || 0.016);
    ride.previousTime = now;
    ride.now = now;
    updateRide(dt);
    renderRide(now);

    if (ride.finished && !ride.resultQueued) {
      state.rideFrame = 0;
      ride.resultQueued = true;
      window.setTimeout(() => finishRide(), CONFIG.ride.finishDelayMs);
      return;
    }

    state.rideFrame = window.requestAnimationFrame(rideLoop);
  }

  function cancelRideLoop() {
    if (state.rideFrame) {
      window.cancelAnimationFrame(state.rideFrame);
      state.rideFrame = 0;
    }
  }

  function updateRide(dt) {
    const ride = state.ride;
    const trackData = state.trackData;

    ride.elapsed += dt;

    const currentSample = sampleTrackAtDistance(trackData, ride.distance);
    ride.speed = clamp(
      speedFromSpecificEnergy(ride.specificEnergy, currentSample.point.y),
      CONFIG.ride.minSpeed,
      CONFIG.ride.maxSpeed
    );

    const distanceStep = ride.speed * dt;
    const nextDistance = Math.min(trackData.totalLength, ride.distance + distanceStep);
    const nextSample = sampleTrackAtDistance(trackData, nextDistance);
    const averageCurve = (Math.abs(currentSample.curvature) + Math.abs(nextSample.curvature)) * 0.5;
    const lossPerMeter =
      CONFIG.ride.rollingResistance +
      CONFIG.ride.airDrag * ride.speed * ride.speed +
      CONFIG.ride.curveResistance * averageCurve * ride.speed * ride.speed;

    ride.specificEnergy -= lossPerMeter * Math.max(0, nextDistance - ride.distance);
    const minEnergyAtNext = specificEnergyFromSpeed(CONFIG.ride.minSpeed, nextSample.point.y);
    ride.specificEnergy = Math.max(ride.specificEnergy, minEnergyAtNext);
    ride.distance = nextDistance;

    const sample = nextSample;
    const ahead = sampleTrackAtDistance(trackData, ride.distance + CONFIG.ride.lookAhead);
    const slope = sample.tangent.y;
    const curve = Math.abs(sample.curvature);
    const signedTurn = sample.turn;

    ride.speed = clamp(
      speedFromSpecificEnergy(ride.specificEnergy, sample.point.y),
      CONFIG.ride.minSpeed,
      CONFIG.ride.maxSpeed
    );
    ride.specificEnergy = specificEnergyFromSpeed(ride.speed, sample.point.y);
    ride.maxSpeed = Math.max(ride.maxSpeed, ride.speed);

    const speedFactor = invLerp(CONFIG.ride.minSpeed, CONFIG.ride.maxSpeed, ride.speed);
    const dropFactor = clamp((-slope - 0.04) * 2.6, 0, 1);
    const forceLoad = (ride.speed * ride.speed * curve) / Math.max(1, CONFIG.ride.gravity);
    ride.forceLoad = forceLoad;
    const curveFactor = clamp(forceLoad / 2.8, 0, 1);
    const bobFactor = clamp(Math.abs(ahead.tangent.y - sample.tangent.y) * 3.1, 0, 1);
    const rawStimulus = clamp(
      speedFactor * 0.24 +
        dropFactor * 0.3 +
        curveFactor * 0.24 +
        bobFactor * 0.14 +
        clamp(Math.abs(signedTurn) * 1.5, 0, 1) * 0.08,
      0,
      1
    );

    ride.smoothedStimulus = lerp(
      ride.smoothedStimulus,
      rawStimulus,
      1 - Math.exp(-dt * 2.2)
    );
    ride.fear = clamp(rawStimulus * 0.7 + ride.smoothedStimulus * 0.46, 0, 1);

    const level = getFearLevel(ride.fear);
    ride.maxFear = Math.max(ride.maxFear, ride.fear);
    ride.maxLevel = Math.max(ride.maxLevel, level);
    ride.levelTimes[level - 1] += dt;
    ride.distortionIntegral += (ride.fear * ride.fear + Math.max(0, level - 2) * 0.08) * dt;

    els.speedReadout.textContent = `${Math.round(ride.speed * 3.6)} km/h`;
    els.fearReadout.textContent = CONFIG.fear.labels[level - 1];

    if (ride.distance >= trackData.totalLength - 0.5) {
      ride.finished = true;
    }
  }

  function renderRide(now) {
    const width = els.rideCanvas.clientWidth;
    const height = els.rideCanvas.clientHeight;
    if (!width || !height || !state.ride || !state.trackData) {
      return;
    }

    const ride = state.ride;
    const sample = sampleTrackAtDistance(state.trackData, ride.distance);
    const rolledRight = sample.right;
    const rolledUp = sample.up;

    const shake = ride.fear * CONFIG.ride.shakeStrength;
    const wobbleX = Math.sin(now * 0.012 + ride.distance * 0.1) * shake;
    const wobbleY = Math.sin(now * 0.018 + ride.distance * 0.16) * shake * 0.75;

    const camera = {
      position: add3(sample.point, scale3(rolledUp, CONFIG.ride.cameraLift)),
      forward: sample.tangent,
      right: rolledRight,
      up: rolledUp,
      focal: width / (2 * Math.tan(CONFIG.ride.fov / 2)),
      wobbleX,
      wobbleY
    };

    drawRideBackground(rideCtx, width, height, camera, state.groundPlane);
    drawGroundGrid(rideCtx, width, height, camera, state.groundPlane);
    drawTrackAhead(rideCtx, width, height, camera, ride.distance);
    drawNorikoFace(ride.fear, getFearLevel(ride.fear), shake, now);
  }

  function drawRideBackground(ctx, width, height, camera, groundPlane) {
    ctx.clearRect(0, 0, width, height);
    const horizon = getHorizonLine(camera, width, height);
    const groundRegion = getGroundScreenRegion(camera, width, height, horizon);
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, "#43a8ff");
    skyGradient.addColorStop(0.55, "#7fcbff");
    skyGradient.addColorStop(1, "#d9f1ff");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    drawGroundPlaneFill(ctx, width, height, camera, groundPlane);

  }

  function drawWorldScenery(ctx, width, height, camera, scenery) {
    if (!scenery) {
      return;
    }
    drawWorldClouds(ctx, width, height, camera, scenery.clouds);
    drawWorldMountains(ctx, width, height, camera, scenery.mountains);
    drawWorldBuildings(ctx, width, height, camera, scenery.skyline, true);
    drawWorldAttractions(ctx, width, height, camera, scenery.attractions);
    drawWorldBuildings(ctx, width, height, camera, scenery.buildings, false);
    drawWorldPeople(ctx, width, height, camera, scenery.people);
  }

  function drawWorldClouds(ctx, width, height, camera, clouds) {
    const env = CONFIG.visual.environment;
    const ordered = clouds.slice().sort((a, b) => b.z - a.z);
    for (const cloud of ordered) {
      const center = projectWorldPoint(
        { x: cloud.x, y: cloud.y, z: cloud.z },
        camera,
        width,
        height
      );
      if (!center) {
        continue;
      }
      const size = projectWorldSize(cloud.size, center.z, camera);
      if (size < 8) {
        continue;
      }
      drawCloudPuff(
        ctx,
        center.x,
        center.y + size * 0.12,
        size * 1.15,
        size * 0.46,
        env.cloudShadow
      );
      drawCloudPuff(ctx, center.x, center.y, size, size * 0.4, env.cloud);
    }
  }

  function drawWorldMountains(ctx, width, height, camera, mountains) {
    for (const mountain of mountains) {
      const leftBase = projectWorldPoint(
        { x: mountain.x - mountain.width * 0.5, y: 0, z: mountain.z },
        camera,
        width,
        height
      );
      const peak = projectWorldPoint(
        { x: mountain.x, y: mountain.height, z: mountain.z + mountain.depthOffset },
        camera,
        width,
        height
      );
      const rightBase = projectWorldPoint(
        { x: mountain.x + mountain.width * 0.5, y: 0, z: mountain.z },
        camera,
        width,
        height
      );
      if (!leftBase || !peak || !rightBase) {
        continue;
      }
      ctx.save();
      ctx.fillStyle = mountain.color;
      ctx.globalAlpha = mountain.alpha;
      ctx.beginPath();
      ctx.moveTo(leftBase.x, leftBase.y);
      ctx.lineTo(peak.x, peak.y);
      ctx.lineTo(rightBase.x, rightBase.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWorldBuildings(ctx, width, height, camera, buildings, skyline = false) {
    const env = CONFIG.visual.environment;
    const ordered = buildings.slice().sort((a, b) => b.z - a.z);
    for (const building of ordered) {
      const leftBase = projectWorldPoint(
        { x: building.x - building.width * 0.5, y: 0, z: building.z },
        camera,
        width,
        height
      );
      const rightBase = projectWorldPoint(
        { x: building.x + building.width * 0.5, y: 0, z: building.z },
        camera,
        width,
        height
      );
      const leftTop = projectWorldPoint(
        { x: building.x - building.width * 0.5, y: building.height, z: building.z },
        camera,
        width,
        height
      );
      const rightTop = projectWorldPoint(
        { x: building.x + building.width * 0.5, y: building.height, z: building.z },
        camera,
        width,
        height
      );
      if (!leftBase || !rightBase || !leftTop || !rightTop) {
        continue;
      }

      ctx.save();
      ctx.fillStyle = skyline ? env.skylineFar : env.building;
      ctx.beginPath();
      ctx.moveTo(leftBase.x, leftBase.y);
      ctx.lineTo(leftTop.x, leftTop.y);
      ctx.lineTo(rightTop.x, rightTop.y);
      ctx.lineTo(rightBase.x, rightBase.y);
      ctx.closePath();
      ctx.fill();

      const roof = projectWorldPoint(
        { x: building.x, y: building.height + building.roofHeight, z: building.z },
        camera,
        width,
        height
      );
      if (roof) {
        ctx.fillStyle = skyline ? env.skylineNear : env.buildingShadow;
        ctx.beginPath();
        ctx.moveTo(leftTop.x, leftTop.y);
        ctx.lineTo(roof.x, roof.y);
        ctx.lineTo(rightTop.x, rightTop.y);
        ctx.closePath();
        ctx.fill();
      }

      if (!skyline) {
        ctx.strokeStyle = env.window;
        ctx.lineWidth = Math.max(0.6, projectWorldSize(0.5, leftBase.z, camera));
        const rows = Math.max(1, Math.min(4, Math.round(building.height / 8)));
        for (let row = 1; row <= rows; row += 1) {
          const yT = row / (rows + 1);
          const startX = lerp(leftTop.x, leftBase.x, yT);
          const endX = lerp(rightTop.x, rightBase.x, yT);
          const y = lerp(leftTop.y, leftBase.y, yT);
          ctx.beginPath();
          ctx.moveTo(startX + 2, y);
          ctx.lineTo(endX - 2, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawWorldAttractions(ctx, width, height, camera, attractions) {
    const ordered = attractions.slice().sort((a, b) => b.z - a.z);
    for (const attraction of ordered) {
      if (attraction.type === "ferris") {
        drawFerrisWheel(ctx, width, height, camera, attraction);
      } else if (attraction.type === "tower") {
        drawDropTower(ctx, width, height, camera, attraction);
      } else if (attraction.type === "tent") {
        drawTentAttraction(ctx, width, height, camera, attraction);
      } else if (attraction.type === "arch") {
        drawArchAttraction(ctx, width, height, camera, attraction);
      }
    }
  }

  function drawFerrisWheel(ctx, width, height, camera, wheel) {
    const env = CONFIG.visual.environment;
    const center = projectWorldPoint(
      { x: wheel.x, y: wheel.size * 0.62, z: wheel.z },
      camera,
      width,
      height
    );
    const leftFoot = projectWorldPoint(
      { x: wheel.x - wheel.size * 0.28, y: 0, z: wheel.z },
      camera,
      width,
      height
    );
    const rightFoot = projectWorldPoint(
      { x: wheel.x + wheel.size * 0.28, y: 0, z: wheel.z },
      camera,
      width,
      height
    );
    if (!center || !leftFoot || !rightFoot) {
      return;
    }

    const radius = projectWorldSize(wheel.size * 0.42, center.z, camera);
    if (radius < 8) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = env.attractionDark;
    ctx.lineWidth = Math.max(1.5, radius * 0.08);
    ctx.beginPath();
    ctx.moveTo(leftFoot.x, leftFoot.y);
    ctx.lineTo(center.x - radius * 0.45, center.y + radius * 0.58);
    ctx.moveTo(rightFoot.x, rightFoot.y);
    ctx.lineTo(center.x + radius * 0.45, center.y + radius * 0.58);
    ctx.stroke();

    ctx.strokeStyle = env.attractionWarm;
    ctx.lineWidth = Math.max(1.4, radius * 0.14);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = env.attractionCool;
    ctx.lineWidth = Math.max(1, radius * 0.06);
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDropTower(ctx, width, height, camera, tower) {
    const env = CONFIG.visual.environment;
    const base = projectWorldPoint(
      { x: tower.x, y: 0, z: tower.z },
      camera,
      width,
      height
    );
    const top = projectWorldPoint(
      { x: tower.x, y: tower.height, z: tower.z },
      camera,
      width,
      height
    );
    if (!base || !top) {
      return;
    }

    const thickness = Math.max(2, projectWorldSize(1.8, base.z, camera));
    ctx.save();
    ctx.strokeStyle = env.attractionDark;
    ctx.lineWidth = thickness * 1.6;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    ctx.strokeStyle = env.attractionGold;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    const gondolaY = lerp(base.y, top.y, 0.34);
    ctx.fillStyle = env.attractionWarm;
    ctx.fillRect(base.x - thickness * 2.4, gondolaY - thickness, thickness * 4.8, thickness * 2.1);
    ctx.restore();
  }

  function drawTentAttraction(ctx, width, height, camera, tent) {
    const env = CONFIG.visual.environment;
    const leftBase = projectWorldPoint(
      { x: tent.x - tent.width * 0.5, y: 0, z: tent.z },
      camera,
      width,
      height
    );
    const rightBase = projectWorldPoint(
      { x: tent.x + tent.width * 0.5, y: 0, z: tent.z },
      camera,
      width,
      height
    );
    const peak = projectWorldPoint(
      { x: tent.x, y: tent.height, z: tent.z },
      camera,
      width,
      height
    );
    const bodyTop = projectWorldPoint(
      { x: tent.x, y: tent.height * 0.54, z: tent.z },
      camera,
      width,
      height
    );
    if (!leftBase || !rightBase || !peak || !bodyTop) {
      return;
    }

    ctx.save();
    ctx.fillStyle = env.attractionCool;
    ctx.beginPath();
    ctx.moveTo(leftBase.x, leftBase.y);
    ctx.lineTo(peak.x, peak.y);
    ctx.lineTo(rightBase.x, rightBase.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = env.attractionWarm;
    ctx.beginPath();
    ctx.moveTo(leftBase.x, leftBase.y);
    ctx.lineTo(lerp(leftBase.x, peak.x, 0.55), bodyTop.y);
    ctx.lineTo(lerp(rightBase.x, peak.x, 0.55), bodyTop.y);
    ctx.lineTo(rightBase.x, rightBase.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawArchAttraction(ctx, width, height, camera, arch) {
    const env = CONFIG.visual.environment;
    const leftBase = projectWorldPoint(
      { x: arch.x - arch.width * 0.5, y: 0, z: arch.z },
      camera,
      width,
      height
    );
    const rightBase = projectWorldPoint(
      { x: arch.x + arch.width * 0.5, y: 0, z: arch.z },
      camera,
      width,
      height
    );
    const top = projectWorldPoint(
      { x: arch.x, y: arch.height, z: arch.z },
      camera,
      width,
      height
    );
    if (!leftBase || !rightBase || !top) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = env.attractionDark;
    ctx.lineWidth = Math.max(2, projectWorldSize(1.6, top.z, camera));
    ctx.beginPath();
    ctx.moveTo(leftBase.x, leftBase.y);
    ctx.quadraticCurveTo(top.x, top.y, rightBase.x, rightBase.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawWorldPeople(ctx, width, height, camera, people) {
    const env = CONFIG.visual.environment;
    const ordered = people.slice().sort((a, b) => b.z - a.z);
    for (const person of ordered) {
      const base = projectWorldPoint(
        { x: person.x, y: 0, z: person.z },
        camera,
        width,
        height
      );
      const head = projectWorldPoint(
        { x: person.x, y: person.height, z: person.z },
        camera,
        width,
        height
      );
      if (!base || !head) {
        continue;
      }
      const vertical = base.y - head.y;
      const direction = Math.sign(vertical) || 1;
      const body = Math.max(2, Math.abs(vertical));
      if (body < 4) {
        continue;
      }
      const thickness = Math.max(1.2, body * 0.13);
      ctx.save();
      ctx.strokeStyle = env.person;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(head.x, head.y + direction * body * 0.18);
      ctx.moveTo(base.x, base.y - direction * body * 0.28);
      ctx.lineTo(base.x - body * 0.14, base.y);
      ctx.moveTo(base.x, base.y - direction * body * 0.28);
      ctx.lineTo(base.x + body * 0.14, base.y);
      ctx.moveTo(head.x, head.y + direction * body * 0.52);
      ctx.lineTo(head.x - body * 0.12, head.y + direction * body * 0.74);
      ctx.moveTo(head.x, head.y + direction * body * 0.52);
      ctx.lineTo(head.x + body * 0.12, head.y + direction * body * 0.74);
      ctx.stroke();
      ctx.fillStyle = env.person;
      ctx.beginPath();
      ctx.arc(head.x, head.y, thickness * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSkyGlow(ctx, width, height, offset, env) {
    const x = width * 0.78 + Math.sin(offset * 0.004) * width * 0.05;
    const y = height * 0.16 + Math.cos(offset * 0.003) * 10;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, width * 0.24);
    glow.addColorStop(0, env.sunGlow);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = env.sunCore;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, Math.min(width, height) * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCloudLayer(ctx, width, height, offset, env, yRatio, alpha, count) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i += 1) {
      const x =
        ((i + 1) / (count + 1)) * width +
        Math.sin(offset * 0.16 + i * 1.7) * width * 0.08;
      const y = height * yRatio + Math.cos(offset * 0.11 + i * 2.3) * height * 0.03;
      const size = width * (0.08 + ((i % 3) * 0.018));
      drawCloudPuff(ctx, x, y + size * 0.1, size * 1.05, size * 0.42, env.cloudShadow);
      drawCloudPuff(ctx, x, y, size, size * 0.36, env.cloud);
    }
    ctx.restore();
  }

  function drawCloudPuff(ctx, x, y, width, height, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x - width * 0.18, y, width * 0.34, height * 0.72, 0, Math.PI, 0, true);
    ctx.ellipse(x + width * 0.08, y - height * 0.08, width * 0.4, height * 0.86, 0, Math.PI, 0, true);
    ctx.ellipse(x + width * 0.34, y + height * 0.03, width * 0.24, height * 0.58, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMountainBand(
    ctx,
    width,
    height,
    horizon,
    offset,
    color,
    amp,
    alpha,
    baseOffset,
    groundDirection = 1
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    const fillY = groundDirection > 0 ? height + 20 : -20;
    ctx.moveTo(-20, fillY);
    for (let x = 0; x <= width + 16; x += 16) {
      const t = (x - horizon.left.x) / Math.max(1, horizon.right.x - horizon.left.x);
      const baseY = lerp(horizon.left.y, horizon.right.y, t) + baseOffset * groundDirection;
      const y =
        baseY -
        groundDirection *
          (Math.sin((x + offset) * 0.011) * amp * 0.55 +
            Math.sin((x + offset) * 0.026) * amp * 0.28);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width + 20, fillY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHorizonBand(
    ctx,
    width,
    height,
    horizon,
    offset,
    color,
    amp,
    alpha,
    baseOffset,
    groundDirection = 1
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    const fillY = groundDirection > 0 ? height + 20 : -20;
    ctx.moveTo(-20, fillY);
    for (let x = 0; x <= width + 16; x += 10) {
      const t = (x - horizon.left.x) / Math.max(1, horizon.right.x - horizon.left.x);
      const baseY = lerp(horizon.left.y, horizon.right.y, t) + baseOffset * groundDirection;
      const y =
        baseY -
        groundDirection *
          (Math.abs(Math.sin((x + offset) * 0.034)) * amp +
            Math.sin((x + offset) * 0.012) * amp * 0.35);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width + 20, fillY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGroundPlaneFill(ctx, width, height, camera, groundPlane) {
    if (!groundPlane) {
      return;
    }
    const horizon = getHorizonLine(camera, width, height);
    const groundRegion = getGroundScreenRegion(camera, width, height, horizon);
    if (!groundRegion.length) {
      return;
    }

    ctx.save();
    addPolygonPath(ctx, groundRegion);
    ctx.clip();
    for (let z = groundPlane.minZ; z < groundPlane.maxZ; z += groundPlane.gridStep) {
      drawProjectedQuad(
        ctx,
        projectWorldPoint({ x: groundPlane.minX, y: 0, z }, camera, width, height),
        projectWorldPoint({ x: groundPlane.maxX, y: 0, z }, camera, width, height),
        projectWorldPoint(
          { x: groundPlane.maxX, y: 0, z: Math.min(groundPlane.maxZ, z + groundPlane.gridStep) },
          camera,
          width,
          height
        ),
        projectWorldPoint(
          { x: groundPlane.minX, y: 0, z: Math.min(groundPlane.maxZ, z + groundPlane.gridStep) },
          camera,
          width,
          height
        ),
        "#ffffff"
      );
    }
    ctx.restore();
  }

  function drawGroundGrid(ctx, width, height, camera, groundPlane) {
    if (!groundPlane) {
      return;
    }
    const horizon = getHorizonLine(camera, width, height);
    const groundRegion = getGroundScreenRegion(camera, width, height, horizon);
    if (!groundRegion.length) {
      return;
    }
    ctx.save();
    addPolygonPath(ctx, groundRegion);
    ctx.clip();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.34)";
    ctx.lineWidth = 1;

    for (let z = groundPlane.minZ; z <= groundPlane.maxZ; z += groundPlane.gridStep) {
      drawProjectedWorldPolyline(
        ctx,
        sampleGroundLineX(groundPlane.minX, groundPlane.maxX, z, groundPlane.gridStep),
        camera,
        width,
        height
      );
    }

    for (let x = groundPlane.minX; x <= groundPlane.maxX; x += groundPlane.gridStep) {
      drawProjectedWorldPolyline(
        ctx,
        sampleGroundLineZ(x, groundPlane.minZ, groundPlane.maxZ, groundPlane.gridStep),
        camera,
        width,
        height
      );
    }

    ctx.restore();
  }

  function drawProjectedWorldPolyline(ctx, worldPoints, camera, width, height) {
    let drawing = false;
    ctx.beginPath();
    for (const worldPoint of worldPoints) {
      const projected = projectWorldPoint(worldPoint, camera, width, height);
      if (!projected) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(projected.x, projected.y);
        drawing = true;
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    }
    if (drawing) {
      ctx.stroke();
    }
  }

  function sampleGroundLineX(minX, maxX, z, step) {
    const points = [];
    for (let x = minX; x <= maxX; x += step) {
      points.push({ x, y: 0, z });
    }
    return points;
  }

  function sampleGroundLineZ(x, minZ, maxZ, step) {
    const points = [];
    for (let z = minZ; z <= maxZ; z += step) {
      points.push({ x, y: 0, z });
    }
    return points;
  }

  function drawTrackAhead(ctx, width, height, camera, distance) {
    const trackData = state.trackData;
    const sections = [];
    const supports = [];
    const ties = [];
    const drawEnd = trackData.totalLength;

    for (
      let d = distance + 2;
      d <= drawEnd;
      d += CONFIG.ride.sampleStep
    ) {
      const sample = sampleTrackAtDistance(trackData, d);
      const frame = { right: sample.right, up: sample.up };
      const leftRailWorld = sub3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));

      const section = {
        center: projectWorldPoint(sample.point, camera, width, height),
        leftRail: projectWorldPoint(
          leftRailWorld,
          camera,
          width,
          height
        ),
        rightRail: projectWorldPoint(
          rightRailWorld,
          camera,
          width,
          height
        )
      };

      if (section.leftRail && section.rightRail) {
        sections.push(section);
      }
    }

    const firstSupportDistance =
      Math.ceil(distance / CONFIG.track.supportSpacingDistance) *
      CONFIG.track.supportSpacingDistance;

    for (
      let supportDistance = firstSupportDistance;
      supportDistance <= drawEnd;
      supportDistance += CONFIG.track.supportSpacingDistance
    ) {
      const sample = sampleTrackAtDistance(trackData, supportDistance);
      const frame = { right: sample.right, up: sample.up };
      const leftRailWorld = sub3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const leftSupportTop = {
        x: leftRailWorld.x,
        y: leftRailWorld.y,
        z: leftRailWorld.z
      };
      const rightSupportTop = {
        x: rightRailWorld.x,
        y: rightRailWorld.y,
        z: rightRailWorld.z
      };
      const leftSupportFoot = {
        x: leftRailWorld.x,
        y: 0,
        z: leftRailWorld.z
      };
      const rightSupportFoot = {
        x: rightRailWorld.x,
        y: 0,
        z: rightRailWorld.z
      };

      const support = {
        distance: supportDistance,
        center: projectWorldPoint(sample.point, camera, width, height),
        supportLeftTop: projectWorldPoint(leftSupportTop, camera, width, height),
        supportRightTop: projectWorldPoint(rightSupportTop, camera, width, height),
        supportLeftFoot: projectWorldPoint(leftSupportFoot, camera, width, height),
        supportRightFoot: projectWorldPoint(rightSupportFoot, camera, width, height)
      };

      if (
        support.center &&
        support.supportLeftTop &&
        support.supportRightTop &&
        support.supportLeftFoot &&
        support.supportRightFoot
      ) {
        supports.push(support);
      }
    }

    drawRideSupports(ctx, supports);
    const firstTieDistance =
      Math.ceil(distance / CONFIG.track.tieSpacingDistance) *
      CONFIG.track.tieSpacingDistance;

    for (
      let tieDistance = firstTieDistance;
      tieDistance <= drawEnd;
      tieDistance += CONFIG.track.tieSpacingDistance
    ) {
      const sample = sampleTrackAtDistance(trackData, tieDistance);
      const frame = { right: sample.right, up: sample.up };
      const leftRailWorld = sub3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const rightRailWorld = add3(sample.point, scale3(frame.right, CONFIG.track.railHalfGap));
      const leftRail = projectWorldPoint(leftRailWorld, camera, width, height);
      const rightRail = projectWorldPoint(rightRailWorld, camera, width, height);
      if (leftRail && rightRail) {
        ties.push({
          leftRail,
          rightRail,
          depth: Math.min(leftRail.z, rightRail.z)
        });
      }
    }

    drawRideTies(ctx, ties);
    drawRailStroke(ctx, sections.map((section) => section.leftRail), 10.2, CONFIG.visual.track.railShadow);
    drawRailStroke(ctx, sections.map((section) => section.rightRail), 10.2, CONFIG.visual.track.railShadow);
    drawRailStroke(ctx, sections.map((section) => section.leftRail), 6.6, CONFIG.visual.track.railMetal);
    drawRailStroke(ctx, sections.map((section) => section.rightRail), 6.6, CONFIG.visual.track.railMetal);
  }

  function drawGoalFace(ctx, width, height, camera, trackData) {
    if (!trackData || !trackData.points.length) {
      return;
    }

    const goalSample = sampleTrackAtDistance(trackData, trackData.totalLength);
    const faceRight = normalizeHorizontal3(camera.right);
    const faceForwardOffset = normalizeHorizontal3(goalSample.tangent);
    const mouthCenterWorld = add3(goalSample.point, scale3(faceForwardOffset, 7));
    const faceCenterWorld = add3(mouthCenterWorld, { x: 0, y: 18, z: 0 });

    const center = projectWorldPoint(faceCenterWorld, camera, width, height);
    const left = projectWorldPoint(
      add3(faceCenterWorld, scale3(faceRight, -18)),
      camera,
      width,
      height
    );
    const right = projectWorldPoint(
      add3(faceCenterWorld, scale3(faceRight, 18)),
      camera,
      width,
      height
    );
    const top = projectWorldPoint(
      add3(faceCenterWorld, { x: 0, y: 24, z: 0 }),
      camera,
      width,
      height
    );
    const bottom = projectWorldPoint(
      add3(faceCenterWorld, { x: 0, y: -28, z: 0 }),
      camera,
      width,
      height
    );
    const mouthCenter = projectWorldPoint(mouthCenterWorld, camera, width, height);

    if (!center || !left || !right || !top || !bottom || !mouthCenter) {
      return;
    }

    const faceHalfWidth = Math.max(24, distance2D(left, right) * 0.5);
    const faceHalfHeight = Math.max(32, distance2D(top, bottom) * 0.5);
    const tilt = Math.atan2(right.y - left.y, right.x - left.x);
    const mouthOffsetX = mouthCenter.x - center.x;
    const mouthOffsetY = mouthCenter.y - center.y;
    const mouthWidth = faceHalfWidth * 0.42;
    const mouthHeight = faceHalfHeight * 0.24;
    const eyeOffsetX = faceHalfWidth * 0.36;
    const eyeOffsetY = faceHalfHeight * 0.22;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(tilt);

    ctx.fillStyle = "#4b3126";
    ctx.beginPath();
    ctx.ellipse(0, -faceHalfHeight * 0.18, faceHalfWidth * 0.92, faceHalfHeight * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffd6bf";
    ctx.beginPath();
    ctx.ellipse(0, 0, faceHalfWidth, faceHalfHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0b18f";
    ctx.beginPath();
    ctx.ellipse(0, faceHalfHeight * 0.22, faceHalfWidth * 0.24, faceHalfHeight * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    drawGoalFaceEye(ctx, -eyeOffsetX, -eyeOffsetY, faceHalfWidth * 0.16, faceHalfHeight * 0.11);
    drawGoalFaceEye(ctx, eyeOffsetX, -eyeOffsetY, faceHalfWidth * 0.16, faceHalfHeight * 0.11);

    ctx.strokeStyle = "#5a3829";
    ctx.lineWidth = Math.max(3, faceHalfWidth * 0.04);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-eyeOffsetX - faceHalfWidth * 0.08, -eyeOffsetY - faceHalfHeight * 0.12);
    ctx.lineTo(-eyeOffsetX + faceHalfWidth * 0.08, -eyeOffsetY - faceHalfHeight * 0.16);
    ctx.moveTo(eyeOffsetX - faceHalfWidth * 0.08, -eyeOffsetY - faceHalfHeight * 0.16);
    ctx.lineTo(eyeOffsetX + faceHalfWidth * 0.08, -eyeOffsetY - faceHalfHeight * 0.12);
    ctx.stroke();

    ctx.fillStyle = "#120807";
    ctx.beginPath();
    ctx.ellipse(mouthOffsetX, mouthOffsetY, mouthWidth, mouthHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 185, 185, 0.35)";
    ctx.lineWidth = Math.max(2, faceHalfWidth * 0.03);
    ctx.beginPath();
    ctx.ellipse(mouthOffsetX, mouthOffsetY, mouthWidth * 0.78, mouthHeight * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawGoalFaceEye(ctx, x, y, width, height) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e1e1e";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, Math.min(width, height) * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRailStroke(ctx, points, lineWidth, color) {
    if (points.length < 2) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawRideSupports(ctx, sections) {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      if (
        !section.center ||
        !section.supportLeftTop ||
        !section.supportRightTop ||
        !section.supportLeftFoot ||
        !section.supportRightFoot
      ) {
        continue;
      }
      const alpha = clamp(0.72 - section.center.z / 240, 0.16, 0.52);
      const shadowWidth = clamp(36 / Math.max(4, section.center.z), 2.5, 11.5);
      const bodyWidth = shadowWidth * 0.68;
      drawSupportLeg(
        ctx,
        section.supportLeftTop,
        section.supportLeftFoot,
        shadowWidth,
        bodyWidth,
        alpha
      );
      drawSupportLeg(
        ctx,
        section.supportRightTop,
        section.supportRightFoot,
        shadowWidth,
        bodyWidth,
        alpha
      );
    }
  }

  function drawRideTies(ctx, sections) {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      const alpha = clamp(0.72 - section.depth / 240, 0.14, 0.58);
      const width = clamp(14 / Math.max(4, section.depth) + 1.4, 1.1, 3.2);
      ctx.save();
      ctx.strokeStyle = withAlpha("rgba(88, 106, 132, 0.9)", alpha);
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(section.leftRail.x, section.leftRail.y);
      ctx.lineTo(section.rightRail.x, section.rightRail.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSupportLeg(ctx, topPoint, footPoint, shadowWidth, bodyWidth, alpha) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.strokeStyle = withAlpha(CONFIG.visual.track.supportShadow, alpha);
    ctx.lineWidth = shadowWidth;
    ctx.moveTo(topPoint.x, topPoint.y);
    ctx.lineTo(footPoint.x, footPoint.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = withAlpha(CONFIG.visual.track.support, alpha);
    ctx.lineWidth = bodyWidth;
    ctx.moveTo(topPoint.x, topPoint.y);
    ctx.lineTo(footPoint.x, footPoint.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSupportBase(ctx, leftFoot, rightFoot, width, alpha) {
    ctx.save();
    ctx.strokeStyle = withAlpha(CONFIG.visual.track.supportBase, alpha);
    ctx.lineCap = "round";
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(leftFoot.x, leftFoot.y);
    ctx.lineTo(rightFoot.x, rightFoot.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRideSleepers(ctx, sections) {
    for (let i = sections.length - 2; i >= 0; i -= CONFIG.track.sleeperSpacing) {
      const section = sections[i];
      drawProjectedQuad(
        ctx,
        section.sleeperFrontLeft,
        section.sleeperFrontRight,
        section.sleeperBackRight,
        section.sleeperBackLeft,
        CONFIG.visual.track.sleeperFill,
        CONFIG.visual.track.sleeperStroke,
        1
      );
    }
  }

  function drawRibbonBetweenLines(ctx, sections, startKey, endKey, fillStyle, strokeStyle = null, lineWidth = 1) {
    for (let i = sections.length - 2; i >= 0; i -= 1) {
      const near = sections[i];
      const far = sections[i + 1];
      drawProjectedQuad(
        ctx,
        near[startKey],
        near[endKey],
        far[endKey],
        far[startKey],
        fillStyle,
        strokeStyle,
        lineWidth
      );
    }
  }

  function drawProjectedQuad(ctx, a, b, c, d, fillStyle, strokeStyle = null, lineWidth = 1) {
    if (!a || !b || !c || !d) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function buildTrackFrames(tangents, twistAngles) {
    const rights = [];
    const ups = [];
    const zeroRights = [];
    const zeroUps = [];
    if (!tangents.length) {
      return { rights, ups, zeroRights, zeroUps };
    }

    let zeroFrame = null;
    for (let i = 0; i < tangents.length; i += 1) {
      zeroFrame = buildZeroTwistFrame(tangents[i], zeroFrame);
      zeroRights[i] = zeroFrame.right;
      zeroUps[i] = zeroFrame.up;

      const twisted = applyTrackBankAngle(
        zeroFrame.right,
        zeroFrame.up,
        twistAngles?.[i] ?? 0
      );
      rights[i] = twisted.right;
      ups[i] = twisted.up;
    }

    return { rights, ups, zeroRights, zeroUps };
  }

  function buildZeroTwistFrame(tangent, previousFrame = null) {
    const worldUp = { x: 0, y: 1, z: 0 };
    const projectedUp = sub3(worldUp, scale3(tangent, dot3(worldUp, tangent)));

    if (length3(projectedUp) >= 0.0001) {
      let up = normalize3(projectedUp);
      if (previousFrame && dot3(up, previousFrame.up) < 0) {
        up = scale3(up, -1);
      }

      let right = cross3(up, tangent);
      if (length3(right) < 0.0001) {
        right = previousFrame ? previousFrame.right : { x: 1, y: 0, z: 0 };
      }
      right = normalize3(right);
      up = normalize3(cross3(tangent, right));
      return preserveFrameContinuity({ right, up }, previousFrame);
    }

    let rightHint = previousFrame ? previousFrame.right : null;
    if (rightHint) {
      rightHint = sub3(rightHint, scale3(tangent, dot3(rightHint, tangent)));
    }
    if (!rightHint || length3(rightHint) < 0.0001) {
      rightHint = getFallbackRightAxis(tangent);
    }

    let right = normalize3(rightHint);
    let up = normalize3(cross3(tangent, right));
    if (previousFrame && dot3(up, previousFrame.up) < 0) {
      right = scale3(right, -1);
      up = scale3(up, -1);
    }

    return preserveFrameContinuity({ right, up }, previousFrame);
  }

  function getFallbackRightAxis(tangent) {
    const flatLength = Math.hypot(tangent.x, tangent.z);
    if (flatLength > 0.0001) {
      return { x: tangent.z / flatLength, y: 0, z: -tangent.x / flatLength };
    }
    return { x: 1, y: 0, z: 0 };
  }

  function preserveFrameContinuity(frame, previousFrame = null) {
    if (!previousFrame) {
      return frame;
    }

    let { right, up } = frame;
    if (
      dot3(right, previousFrame.right) < 0 ||
      dot3(up, previousFrame.up) < 0
    ) {
      right = scale3(right, -1);
      up = scale3(up, -1);
    }

    return { right, up };
  }

  function orthonormalizeTransportFrame(tangent, rightHint = null, upHint = null) {
    let up = upHint ? sub3(upHint, scale3(tangent, dot3(upHint, tangent))) : null;
    let right = rightHint ? sub3(rightHint, scale3(tangent, dot3(rightHint, tangent))) : null;

    if (!up || length3(up) < 0.0001) {
      if (right && length3(right) >= 0.0001) {
        right = normalize3(right);
        up = cross3(tangent, right);
      }
    } else {
      up = normalize3(up);
      right = cross3(up, tangent);
    }

    if (!right || length3(right) < 0.0001 || !up || length3(up) < 0.0001) {
      up = sub3({ x: 0, y: 1, z: 0 }, scale3(tangent, tangent.y));
      if (length3(up) < 0.0001) {
        up = sub3({ x: 0, y: 0, z: 1 }, scale3(tangent, tangent.z));
      }
      if (length3(up) < 0.0001) {
        up = sub3({ x: 1, y: 0, z: 0 }, scale3(tangent, tangent.x));
      }
      up = normalize3(up);
      right = cross3(up, tangent);
    }

    right = normalize3(right);
    up = normalize3(cross3(tangent, right));
    right = normalize3(cross3(up, tangent));

    if (rightHint && dot3(right, rightHint) < 0) {
      right = scale3(right, -1);
      up = scale3(up, -1);
    } else if (upHint && dot3(up, upHint) < 0) {
      right = scale3(right, -1);
      up = scale3(up, -1);
    }

    return { right, up };
  }

  function applyTrackBankAngle(right, up, bankAngle) {
    const safeAngle = Math.abs(bankAngle) < CONFIG.track.bankDeadZone ? 0 : bankAngle;
    if (!safeAngle) {
      return { right, up };
    }

    const cosB = Math.cos(safeAngle);
    const sinB = Math.sin(safeAngle);
    return {
      right: normalize3(add3(scale3(right, cosB), scale3(up, sinB))),
      up: normalize3(add3(scale3(up, cosB), scale3(right, -sinB)))
    };
  }

  function computeBankAngles(bankTurns, cumulative, lateralValues = []) {
    if (!bankTurns.length) {
      return [];
    }
    return bankTurns.map(() => 0);
  }

  function computeTwistAngles(cumulative, points = []) {
    const totalLength = cumulative[cumulative.length - 1] || 0;
    if (!totalLength) {
      return cumulative.map(() => 0);
    }

    const random = createTrackRandom(points, totalLength);
    const plan = [];
    let distance = 0;
    let angle = 0;

    while (distance < totalLength) {
      const remaining = totalLength - distance;
      const typeRoll = random();
      const twistOccurrence = 0.68 * 0.25;
      const type =
        typeRoll < twistOccurrence * 0.5
          ? "left"
          : typeRoll < twistOccurrence
            ? "right"
            : "straight";
      const segmentLength = Math.min(
        remaining,
        type === "straight"
          ? lerp(36, 82, random())
          : lerp(84, 132, random())
      );
      const nextAngle =
        type === "left"
          ? angle + Math.PI * 2
          : type === "right"
            ? angle - Math.PI * 2
            : angle;

      plan.push({
        type,
        start: distance,
        end: distance + segmentLength,
        angleStart: angle,
        angleEnd: nextAngle
      });

      distance += segmentLength;
      angle = nextAngle;
    }

    return cumulative.map((distanceAlongTrack) =>
      sampleTwistPlan(plan, distanceAlongTrack)
    );
  }

  function sampleTwistPlan(plan, distance) {
    if (!plan.length) {
      return 0;
    }

    const segment =
      plan.find((entry) => distance <= entry.end) || plan[plan.length - 1];
    if (segment.type === "straight") {
      return segment.angleStart;
    }

    const span = Math.max(0.0001, segment.end - segment.start);
    const t = smoothStep01(clamp((distance - segment.start) / span, 0, 1));
    return lerp(segment.angleStart, segment.angleEnd, t);
  }

  function createTrackRandom(points, totalLength) {
    let seed = (Math.round(totalLength * 10) ^ points.length ^ 0x9e3779b9) >>> 0;
    const stride = Math.max(1, Math.floor(points.length / 18));

    for (let i = 0; i < points.length; i += stride) {
      const point = points[i];
      seed = mixSeed(seed, Math.round(point.x * 10));
      seed = mixSeed(seed, Math.round(point.y * 10));
      seed = mixSeed(seed, Math.round(point.z * 10));
    }

    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function mixSeed(seed, value) {
    const mixed = (seed ^ ((value + 0x9e3779b9) >>> 0)) >>> 0;
    return Math.imul(mixed ^ (mixed >>> 16), 2246822519) >>> 0;
  }

  function getTrackFrame(tangent, rightHint = null, upHint = null) {
    let right = rightHint
      ? sub3(rightHint, scale3(tangent, dot3(rightHint, tangent)))
      : cross3({ x: 0, y: 1, z: 0 }, tangent);

    if (length3(right) < 0.001 && upHint) {
      right = cross3(upHint, tangent);
    }
    if (length3(right) < 0.001) {
      right = cross3({ x: 0, y: 1, z: 0 }, tangent);
    }
    if (length3(right) < 0.001) {
      right = cross3({ x: 1, y: 0, z: 0 }, tangent);
    }
    if (length3(right) < 0.001) {
      right = { x: 0, y: 0, z: 1 };
    }

    right = normalize3(right);
    let up = normalize3(cross3(tangent, right));

    if (upHint && dot3(up, upHint) < 0) {
      right = scale3(right, -1);
      up = scale3(up, -1);
    }

    return { right, up };
  }

  function getHorizonLine(camera, width, height) {
    const centerX = width * 0.5 + camera.wobbleX;
    const centerY = height * 0.52 + camera.wobbleY;
    const nx = camera.right.y;
    const ny =
      Math.abs(camera.up.y) < 0.001 ? (camera.up.y < 0 ? -0.001 : 0.001) : camera.up.y;
    const nz = camera.forward.y;
    const leftX = -width * 0.1;
    const rightX = width * 1.1;
    const leftIX = leftX - centerX;
    const rightIX = rightX - centerX;
    const leftY = centerY + (nx * leftIX + nz * camera.focal) / ny;
    const rightY = centerY + (nx * rightIX + nz * camera.focal) / ny;

    return {
      left: { x: leftX, y: leftY },
      right: { x: rightX, y: rightY }
    };
  }

  function getGroundDirection(camera, width, height, horizon = getHorizonLine(camera, width, height)) {
    const reference = findGroundReferenceScreenPoint(camera, width, height);
    if (reference) {
      return signedDistanceToLine(reference, horizon) >= 0 ? 1 : -1;
    }
    return camera.up.y >= 0 ? 1 : -1;
  }

  function getGroundScreenRegion(camera, width, height, horizon = getHorizonLine(camera, width, height)) {
    const direction = getGroundDirection(camera, width, height, horizon);
    const screen = [
      { x: -40, y: -40 },
      { x: width + 40, y: -40 },
      { x: width + 40, y: height + 40 },
      { x: -40, y: height + 40 }
    ];
    return clipPolygonToLineSide(screen, horizon, direction);
  }

  function findGroundReferenceScreenPoint(camera, width, height) {
    const flatForward = getGroundPlaneVector(camera.forward, { x: 0, y: 0, z: 1 });
    const flatRight = { x: flatForward.z, y: 0, z: -flatForward.x };
    const distances = [36, 68, 110, 170, 240];
    const lateralOffsets = [0, -48, 48, -96, 96];

    for (const distance of distances) {
      for (const lateral of lateralOffsets) {
        const worldPoint = {
          x: camera.position.x + flatForward.x * distance + flatRight.x * lateral,
          y: 0,
          z: camera.position.z + flatForward.z * distance + flatRight.z * lateral
        };
        const projected = projectWorldPoint(worldPoint, camera, width, height);
        if (projected) {
          return projected;
        }
      }
    }

    return null;
  }

  function getGroundPlaneVector(vector, fallback) {
    const flattened = { x: vector.x, y: 0, z: vector.z };
    if (Math.hypot(flattened.x, flattened.z) < 0.001) {
      return fallback;
    }
    const length = Math.hypot(flattened.x, flattened.z);
    return { x: flattened.x / length, y: 0, z: flattened.z / length };
  }

  function signedDistanceToLine(point, line) {
    return (
      (line.right.x - line.left.x) * (point.y - line.left.y) -
      (line.right.y - line.left.y) * (point.x - line.left.x)
    );
  }

  function clipPolygonToLineSide(points, line, keepSign) {
    const clipped = [];
    if (!points.length) {
      return clipped;
    }

    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const currentDistance = signedDistanceToLine(current, line) * keepSign;
      const nextDistance = signedDistanceToLine(next, line) * keepSign;
      const currentInside = currentDistance >= 0;
      const nextInside = nextDistance >= 0;

      if (currentInside && nextInside) {
        clipped.push(next);
        continue;
      }

      if (currentInside !== nextInside) {
        const t = currentDistance / (currentDistance - nextDistance);
        clipped.push({
          x: lerp(current.x, next.x, t),
          y: lerp(current.y, next.y, t)
        });
      }

      if (!currentInside && nextInside) {
        clipped.push(next);
      }
    }

    return clipped;
  }

  function addPolygonPath(ctx, points) {
    if (!points.length) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function projectWorldPoint(point, camera, width, height) {
    const relative = sub3(point, camera.position);
    const x = dot3(relative, camera.right);
    const y = dot3(relative, camera.up);
    const z = dot3(relative, camera.forward);
    if (z <= CONFIG.ride.nearClip) {
      return null;
    }
    return {
      x: width * 0.5 + (x * camera.focal) / z + camera.wobbleX,
      y: height * 0.52 - (y * camera.focal) / z + camera.wobbleY,
      z
    };
  }

  function projectWorldSize(size, depth, camera) {
    return (size * camera.focal) / Math.max(depth, CONFIG.ride.nearClip);
  }

  function drawNorikoFace(fear, level, wobble, now) {
    const width = els.norikoCanvas.clientWidth;
    const height = els.norikoCanvas.clientHeight;
    if (!width || !height) {
      return;
    }

    norikoCtx.clearRect(0, 0, width, height);

    const wobblePhase = now * 0.009;
    const squash = 1 + Math.sin(wobblePhase) * 0.02 + fear * 0.08;
    const stretch = 1 + Math.cos(wobblePhase * 1.3) * 0.018 + Math.max(0, level - 3) * 0.08;
    const eyeSpread = 19 + fear * 7 + Math.max(0, level - 3) * 6;
    const eyeY = -8 - fear * 3;
    const mouthOpen = 2 + Math.max(0, level - 1) * 3 + fear * 9;
    const faceTilt = Math.sin(wobblePhase * 0.85) * 0.035 + wobble * 0.0014;
    const offsetChaos = Math.max(0, level - 3) * 8;
    const collapse = Math.max(0, level - 4) * 16;

    norikoCtx.save();
    norikoCtx.translate(width * 0.5, height * 0.53);
    norikoCtx.rotate(faceTilt);
    norikoCtx.scale(squash, stretch);

    norikoCtx.fillStyle = "#ffd8c0";
    norikoCtx.beginPath();
    norikoCtx.ellipse(
      0,
      0,
      34 + fear * 2.4 + collapse * 0.4,
      44 - fear * 2.4 + collapse * 0.5,
      0,
      0,
      Math.PI * 2
    );
    norikoCtx.fill();

    norikoCtx.fillStyle = "#f4b188";
    norikoCtx.beginPath();
    norikoCtx.ellipse(0, 12 + fear * 3, 9 + fear * 1.8, 12 + fear * 2, 0, 0, Math.PI * 2);
    norikoCtx.fill();

    norikoCtx.fillStyle = "#51392c";
    norikoCtx.beginPath();
    norikoCtx.arc(-14, -34, 12, Math.PI, Math.PI * 2);
    norikoCtx.arc(14, -34, 12, Math.PI, Math.PI * 2);
    norikoCtx.fill();

    drawNorikoEye(
      norikoCtx,
      -eyeSpread - offsetChaos * 0.3,
      eyeY - offsetChaos * 0.2,
      1 + fear * 0.28,
      1 + Math.max(0, level - 1) * 0.08,
      fear,
      -1,
      level
    );
    drawNorikoEye(
      norikoCtx,
      eyeSpread - collapse * 0.25,
      eyeY + offsetChaos * 0.15,
      1 + fear * 0.32,
      1 + Math.max(0, level - 1) * 0.08,
      fear,
      1,
      level
    );

    drawNorikoBrow(norikoCtx, -eyeSpread, eyeY - 14 - level * 1.1, -0.12 - fear * 0.26, level);
    drawNorikoBrow(norikoCtx, eyeSpread, eyeY - 14 - level * 1.1, 0.12 + fear * 0.26, level);

    norikoCtx.strokeStyle = "#7c4a2d";
    norikoCtx.lineWidth = 2.4;
    norikoCtx.beginPath();
    norikoCtx.moveTo(0, 0);
    norikoCtx.lineTo(Math.sin(wobblePhase) * 2.2 + collapse * 0.08, 15 + fear * 5);
    norikoCtx.stroke();

    drawNorikoMouth(norikoCtx, 0 + collapse * 0.1, 28 + fear * 4, mouthOpen, level, wobblePhase);

    if (level >= 4) {
      norikoCtx.fillStyle = "rgba(255, 90, 90, 0.14)";
      norikoCtx.beginPath();
      norikoCtx.ellipse(-18, 18, 8, 5, 0.3, 0, Math.PI * 2);
      norikoCtx.ellipse(18, 18, 8, 5, -0.3, 0, Math.PI * 2);
      norikoCtx.fill();
    }

    norikoCtx.restore();
  }

  function drawNorikoEye(ctx, x, y, scaleX, scaleY, fear, direction, level) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9 + fear * 3, 6.6 + fear * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1e1e1e";
    const pupilOffset = direction * (fear * 1.8 + Math.max(0, level - 4) * 5);
    ctx.beginPath();
    ctx.arc(pupilOffset, fear * 1.5 - Math.max(0, level - 3) * 2.4, 3.6 + fear * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawNorikoBrow(ctx, x, y, rotation, level) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = "#4b2f21";
    ctx.lineWidth = 4 + Math.max(0, level - 3);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawNorikoMouth(ctx, x, y, open, level, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#7f1425";
    ctx.beginPath();
    ctx.ellipse(
      Math.sin(phase * 2.1) * Math.max(0, level - 3) * 2,
      0,
      12 + Math.max(0, level - 2) * 4,
      open,
      Math.sin(phase) * Math.max(0, level - 4) * 0.22,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (level >= 3) {
      ctx.fillStyle = "#ff8ba0";
      ctx.beginPath();
      ctx.ellipse(0, open * 0.4, 9, 4 + Math.max(0, level - 4) * 3, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  function finishRide() {
    const result = buildResult(state.trackData.analysis, state.ride);
    state.lastResult = result;
    renderResult(result);
    setScreen("result");
  }

  function buildResult(analysis, ride) {
    const intenseRatio = (ride.levelTimes[3] + ride.levelTimes[4]) / Math.max(1, ride.elapsed);
    const scream = clamp01(
      invLerp(CONFIG.ride.minSpeed, CONFIG.ride.maxSpeed, ride.maxSpeed) * 0.26 +
        invLerp(3, 5, ride.maxLevel) * 0.24 +
        intenseRatio * 0.3 +
        invLerp(0.8, 5.4, ride.distortionIntegral) * 0.2
    );

    return {
      screamScore: Math.round(scream * 100)
    };
  }

  function renderResult(result) {
    if (els.screamScore) {
      els.screamScore.textContent = String(result.screamScore).padStart(3, "0");
    }
  }

  function getFearLevel(fear) {
    if (fear < CONFIG.fear.thresholds[0]) {
      return 1;
    }
    if (fear < CONFIG.fear.thresholds[1]) {
      return 2;
    }
    if (fear < CONFIG.fear.thresholds[2]) {
      return 3;
    }
    if (fear < CONFIG.fear.thresholds[3]) {
      return 4;
    }
    return 5;
  }

  function interpolateTrackPointAtDistance(trackData, distance) {
    const d = clamp(distance, 0, trackData.totalLength);
    const cumulative = trackData.cumulative;
    let low = 0;
    let high = cumulative.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cumulative[mid] < d) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const upperIndex = clamp(low, 1, cumulative.length - 1);
    const lowerIndex = upperIndex - 1;
    const span = Math.max(0.0001, cumulative[upperIndex] - cumulative[lowerIndex]);
    const t = clamp((d - cumulative[lowerIndex]) / span, 0, 1);

    return {
      distance: d,
      lowerIndex,
      upperIndex,
      t,
      point: lerp3(trackData.points[lowerIndex], trackData.points[upperIndex], t)
    };
  }

  function sampleTrackAtDistance(trackData, distance) {
    const sample = interpolateTrackPointAtDistance(trackData, distance);
    const { distance: d, lowerIndex, upperIndex, t, point } = sample;
    const tangentBefore = interpolateTrackPointAtDistance(
      trackData,
      d - CONFIG.track.tangentSampleDistance
    ).point;
    const tangentAfter = interpolateTrackPointAtDistance(
      trackData,
      d + CONFIG.track.tangentSampleDistance
    ).point;
    let tangent = normalize3(sub3(tangentAfter, tangentBefore));
    if (length3(tangent) < 0.0001) {
      tangent = normalize3(
        lerp3(trackData.tangents[lowerIndex], trackData.tangents[upperIndex], t)
      );
    }
    const lowerZeroRight = trackData.zeroRights[lowerIndex];
    const lowerZeroUp = trackData.zeroUps[lowerIndex];
    let upperZeroRight = trackData.zeroRights[upperIndex];
    let upperZeroUp = trackData.zeroUps[upperIndex];
    if (dot3(lowerZeroRight, upperZeroRight) < 0 || dot3(lowerZeroUp, upperZeroUp) < 0) {
      upperZeroRight = scale3(upperZeroRight, -1);
      upperZeroUp = scale3(upperZeroUp, -1);
    }

    const zeroFrame = orthonormalizeTransportFrame(
      tangent,
      normalize3(lerp3(lowerZeroRight, upperZeroRight, t)),
      normalize3(lerp3(lowerZeroUp, upperZeroUp, t))
    );
    const twistAngle = lerp(
      (trackData.twistAngles || trackData.bankAngles)[lowerIndex],
      (trackData.twistAngles || trackData.bankAngles)[upperIndex],
      t
    );
    const frame = applyTrackBankAngle(zeroFrame.right, zeroFrame.up, twistAngle);

    return {
      point,
      tangent,
      right: frame.right,
      up: frame.up,
      bankAngle: twistAngle,
      curvature: lerp(trackData.curvatures[lowerIndex], trackData.curvatures[upperIndex], t),
      turn: lerp(trackData.turns[lowerIndex], trackData.turns[upperIndex], t)
    };
  }
  function specificEnergyFromSpeed(speed, height) {
    return 0.5 * speed * speed + CONFIG.ride.gravity * height;
  }

  function speedFromSpecificEnergy(specificEnergy, height) {
    return Math.sqrt(Math.max(0, 2 * Math.max(0, specificEnergy - CONFIG.ride.gravity * height)));
  }

  function limitDeltas(values, maxDelta, passes = 1) {
    let result = values.slice();
    for (let pass = 0; pass < passes; pass += 1) {
      for (let i = 1; i < result.length; i += 1) {
        const delta = result[i] - result[i - 1];
        if (Math.abs(delta) > maxDelta) {
          result[i] = result[i - 1] + Math.sign(delta) * maxDelta;
        }
      }
      result[result.length - 1] = values[values.length - 1];

      for (let i = result.length - 2; i >= 0; i -= 1) {
        const delta = result[i] - result[i + 1];
        if (Math.abs(delta) > maxDelta) {
          result[i] = result[i + 1] + Math.sign(delta) * maxDelta;
        }
      }
      result[0] = values[0];
    }
    return result;
  }

  function getSegmentSpan(cumulative, index) {
    const a = cumulative[Math.max(0, index - 1)];
    const b = cumulative[Math.min(cumulative.length - 1, index + 1)];
    return b - a;
  }

  function getDistanceWindowIndices(cumulative, centerIndex, windowDistance) {
    const centerDistance = cumulative[centerIndex];
    const startDistance = Math.max(0, centerDistance - windowDistance);
    const endDistance = Math.min(cumulative[cumulative.length - 1], centerDistance + windowDistance);
    return {
      start: findNearestDistanceIndex(cumulative, startDistance),
      end: findNearestDistanceIndex(cumulative, endDistance)
    };
  }

  function findNearestDistanceIndex(cumulative, distance) {
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cumulative[mid] < distance) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const upper = clamp(low, 0, cumulative.length - 1);
    const lower = Math.max(0, upper - 1);
    return Math.abs(cumulative[upper] - distance) < Math.abs(cumulative[lower] - distance)
      ? upper
      : lower;
  }

  function getPeakAbsInRange(values, start, end) {
    let peak = 0;
    for (let i = start; i <= end; i += 1) {
      peak = Math.max(peak, Math.abs(values[i] || 0));
    }
    return peak;
  }

  function getValueRangeInRange(values, start, end) {
    if (!values.length) {
      return 0;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = start; i <= end; i += 1) {
      const value = values[i] || 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min;
  }

  function getInteriorValueRange(values) {
    if (values.length <= 2) {
      return 0;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < values.length - 1; i += 1) {
      min = Math.min(min, values[i]);
      max = Math.max(max, values[i]);
    }
    return max - min;
  }

  function getIntegratedTurnAngleInRange(values, start, end) {
    let total = 0;
    for (let i = start; i <= end; i += 1) {
      total += Math.abs(Math.asin(clamp(values[i] || 0, -1, 1)));
    }
    return total;
  }

  function signedAngleXZ(a, b) {
    const dot = clamp(a.x * b.x + a.z * b.z, -1, 1);
    const cross = a.x * b.z - a.z * b.x;
    return Math.atan2(cross, dot);
  }

  function computePlanarTurn(prevPoint, point, nextPoint) {
    const v1 = {
      x: point.x - prevPoint.x,
      z: point.z - prevPoint.z
    };
    const v2 = {
      x: nextPoint.x - point.x,
      z: nextPoint.z - point.z
    };
    const len1 = Math.hypot(v1.x, v1.z);
    const len2 = Math.hypot(v2.x, v2.z);
    if (len1 < 0.001 || len2 < 0.001) {
      return 0;
    }

    const cross = v1.x * v2.z - v1.z * v2.x;
    return cross / Math.max(0.001, len1 * len2);
  }

  function normalizeXZ(vector) {
    const length = Math.hypot(vector.x, vector.z) || 1;
    return { x: vector.x / length, z: vector.z / length };
  }

  function distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function distance3D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function add3(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function sub3(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale3(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
  }

  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function length3(v) {
    return Math.hypot(v.x, v.y, v.z);
  }

  function normalize3(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function normalizeHorizontal3(v) {
    const len = Math.hypot(v.x, v.z);
    if (len < 0.0001) {
      return { x: 1, y: 0, z: 0 };
    }
    return { x: v.x / len, y: 0, z: v.z / len };
  }

  function lerp3(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t)
    };
  }

  function angleBetween3(a, b) {
    return Math.acos(clamp(dot3(normalize3(a), normalize3(b)), -1, 1));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothStep01(t) {
    const clamped = clamp(t, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  }

  function positiveModulo(value, divisor) {
    if (!divisor) {
      return 0;
    }
    return ((value % divisor) + divisor) % divisor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function withAlpha(color, alpha) {
    const match = color.match(
      /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*[\d.]+\s*\)$/
    );
    if (!match) {
      return color;
    }
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  function invLerp(a, b, value) {
    if (a === b) {
      return 0;
    }
    return clamp01((value - a) / (b - a));
  }

  init();
})();
