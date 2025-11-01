(function () {
  if (window.__wanderingEndermanLoaded || window.top !== window.self) {
    return;
  }
  window.__wanderingEndermanLoaded = true;

  const extensionRuntime =
    typeof browser !== "undefined" && browser?.runtime
      ? browser.runtime
      : typeof chrome !== "undefined" && chrome?.runtime
        ? chrome.runtime
        : null;

  if (!extensionRuntime || !extensionRuntime.getURL) {
    return;
  }

  const SPRITE_SCALE = 3;
  const BASE_FRAME_INTERVAL = 110;
  const SPEED = { calm: 1.3, angry: 2.5 };
  const HUNT_SPEED_MULTIPLIER = 1.1;
  const ACTION_DELAY = { calm: [24000, 42000], angry: [12000, 22000] };
  const HUNT_DURATION = { calm: [3800, 6400], angry: [3100, 5200] };
  const MOOD_DURATION = { calm: [48000, 72000], angry: [5000, 9000] };
  const ANGRY_TRIGGER_CHANCE = 0.2;
  const DROP_DELAY = { calm: [3600, 6400], angry: [2200, 4200] };
  const GRAB_APPROACH_DISTANCE = 36;

  const HAND_POSITIONS = {
    right: { x: 0.64, y: 0.62 },
    left: { x: 0.36, y: 0.62 }
  };
  const HAND_VERTICAL_OFFSET = -12;

  const ANIMATION_INTERVALS = {
    idle: 220,
    walk: BASE_FRAME_INTERVAL,
    grab: 120,
    hunt: 100,
    spawn: 90
  };
  const SPAWN_EXTRA_DELAY = 120;
  const TELEPORT_MIN_DISTANCE = 160;
  const TELEPORT_CURSOR_DISTANCE = 220;

  const APPEARANCE_INTERVAL = 60 * 60 * 1000;
  const APPEARANCE_DURATION = { min: 60_000, max: 180_000 };
  const INITIAL_APPEARANCE_DELAY = 6000;

  const GRAB_SIZE_LIMITS = {
    minWidth: 32,
    minHeight: 20,
    maxWidth: 260,
    maxHeight: 200,
    maxArea: 46000
  };

  const BODY_TAGS_TO_SKIP = new Set([
    "HTML",
    "BODY",
    "HEAD",
    "SCRIPT",
    "STYLE",
    "META",
    "LINK",
    "NOSCRIPT",
    "TITLE",
    "TEMPLATE",
    "IFRAME",
    "VIDEO",
    "AUDIO",
    "CANVAS",
    "SVG"
  ]);

  const spawnFrames = ["spawn1.png", "spawn2.png"];
  const SPRITE_FILES = {
    calm: {
      walk: ["walk1.png", "walk2-idle.png", "walk3.png"],
      idle: ["walk2-idle.png"],
      grab: ["walk-grab1.png", "walk-grab2-idle.png", "walk-grab3.png"],
      hunt: ["walk-hunt1.png", "walkhunt2-idle.png", "walkhunt3.png"],
      spawn: spawnFrames
    },
    angry: {
      walk: ["walk-angry1.png", "walk-angry2-idle.png", "walk-angry3.png"],
      idle: ["walk-angry2-idle.png"],
      grab: [
        "walk-angry-grab.png",
        "walk-angry2-grab-idle.png",
        "walk-angry3-grab.png"
      ],
      hunt: [
        "walk-angry-hunt1.png",
        "walk-angry-hunt2-idle.png",
        "walk-angry-hunt3.png"
      ],
      spawn: spawnFrames
    }
  };

  const SPRITES = mapSpriteFiles(SPRITE_FILES);

  const state = {
    root: null,
    sprite: null,
    position: { x: 20, y: 120 },
    size: { width: 96, height: 160 },
    spriteBaseSize: { width: 32, height: 50 },
    target: null,
    mood: "calm",
    activity: "wander",
    facing: -1,
    animation: {
      mode: "idle",
      frames: SPRITES.calm.idle,
      index: 0,
      lastAdvance: 0,
      frameInterval: ANIMATION_INTERVALS.idle
    },
    actionTimer: null,
    moodTimer: null,
    huntEndTimer: null,
    spawnTimer: null,
    appearanceTimer: null,
    appearanceCycleTimer: null,
    carrying: null,
    pendingGrab: null,
    isSpawning: false,
    isTeleporting: false,
    hidden: true,
    active: false,
    lastMouse: {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    }
  };

  function mapSpriteFiles(definitions) {
    const mapped = {};
    for (const [mood, modes] of Object.entries(definitions)) {
      mapped[mood] = {};
      for (const [mode, frames] of Object.entries(modes)) {
        mapped[mood][mode] = frames.map((file) => extensionRuntime.getURL(`frames/${file}`));
      }
    }
    return mapped;
  }

  const randomBetween = (min, max) => Math.random() * (max - min) + min;

  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }

    createSprite();
    preloadBaseSprite();

    state.position = pickStartPosition();
    state.target = state.position;
    updateEndermanPosition();
    updateFacing();
    updateRootClasses();
    applyCurrentFrame(true);

    startAnimationLoop();
    scheduleMoodShift();
    scheduleAppearanceCycle(INITIAL_APPEARANCE_DELAY);

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function createSprite() {
    const root = document.createElement("div");
    root.className = "enderman-extension-root";

    const sprite = document.createElement("div");
    sprite.className = "enderman-sprite";
    root.appendChild(sprite);

    document.body.appendChild(root);
    state.root = root;
    state.sprite = sprite;
    setRootHidden(true);
  }

  function preloadBaseSprite() {
    const baseFrame = SPRITES.calm.walk[0];
    const img = new Image();
    img.decoding = "async";
    img.src = baseFrame;
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        return;
      }
      setSpriteDimensions(img.naturalWidth, img.naturalHeight);
    };
  }

  function setSpriteDimensions(baseWidth, baseHeight) {
    state.spriteBaseSize = { width: baseWidth, height: baseHeight };
    state.size = {
      width: Math.round(baseWidth * SPRITE_SCALE),
      height: Math.round(baseHeight * SPRITE_SCALE)
    };

    if (state.root) {
      state.root.style.width = `${state.size.width}px`;
      state.root.style.height = `${state.size.height}px`;
    }
    if (state.sprite) {
      state.sprite.style.width = `${state.size.width}px`;
      state.sprite.style.height = `${state.size.height}px`;
    }
    state.position = clampPosition(state.position);
    updateEndermanPosition();
  }

  function startAnimationLoop() {
    const step = (now) => {
      updateTargetForActivity();
      moveTowardsTarget();
      maybeCompletePendingGrab();
      followCarriedElement();
      updateAnimation(now);
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function updateTargetForActivity() {
    if (!state.active && !state.isSpawning && !state.isTeleporting) {
      state.target = state.position;
      return;
    }

    if (state.pendingGrab) {
      const { element } = state.pendingGrab;
      if (!element || !element.isConnected || !element.getBoundingClientRect) {
        cancelPendingGrab();
      } else {
        const rect = element.getBoundingClientRect();
        if (
          !rect ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom < 0 ||
          rect.right < 0 ||
          rect.top > window.innerHeight ||
          rect.left > window.innerWidth
        ) {
          cancelPendingGrab();
        } else {
          const target = computeGrabTarget(rect);
          state.pendingGrab.currentRect = rect;
          state.pendingGrab.target = target;
          state.target = target;
          return;
        }
      }
    }

    if (state.activity === "hunt") {
      state.target = computeHuntTarget();
      return;
    }

    if (!state.target) {
      state.target = pickNewTarget();
    }
  }

  function moveTowardsTarget() {
    if (
      !state.active ||
      !state.target ||
      !state.root ||
      state.isSpawning ||
      state.isTeleporting
    ) {
      return;
    }

    const dx = state.target.x - state.position.x;
    const dy = state.target.y - state.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 2) {
      if (state.activity === "hunt") {
        teleportAfterHunt();
        return;
      }
      if (state.pendingGrab) {
        return;
      }
      state.target = pickNewTarget();
      return;
    }

    if (Math.abs(dx) > 1.2) {
      const newFacing = dx >= 0 ? 1 : -1;
      if (newFacing !== state.facing) {
        state.facing = newFacing;
        updateFacing();
      }
    }

    const speedMultiplier = state.activity === "hunt" ? HUNT_SPEED_MULTIPLIER : 1;
    const moveBy = Math.min(getCurrentSpeed() * speedMultiplier, distance);
    const nx = state.position.x + (dx / distance) * moveBy;
    const ny = state.position.y + (dy / distance) * moveBy;

    state.position = clampPosition({ x: nx, y: ny });
    updateEndermanPosition();
  }

  function updateFacing() {
    if (state.sprite) {
      state.sprite.style.transform = state.facing === 1 ? "scaleX(-1)" : "scaleX(1)";
    }
  }

  function getCurrentSpeed() {
    return SPEED[state.mood] || SPEED.calm;
  }

  function updateEndermanPosition() {
    if (!state.root) {
      return;
    }
    state.root.style.transform = `translate3d(${state.position.x}px, ${state.position.y}px, 0)`;
  }

  function updateAnimation(now) {
    const mode = determineAnimationMode();
    if (mode !== state.animation.mode) {
      setAnimationMode(mode);
    }

    const frames = state.animation.frames;
    if (!frames || frames.length === 0) {
      return;
    }

    if (!state.animation.lastAdvance) {
      state.animation.lastAdvance = now;
    }

    if (now - state.animation.lastAdvance >= state.animation.frameInterval) {
      state.animation.index = (state.animation.index + 1) % frames.length;
      state.animation.lastAdvance = now;
      applyCurrentFrame();
    }
  }

  function determineAnimationMode() {
    if (state.isSpawning || state.isTeleporting) {
      return "spawn";
    }
    if (!state.active) {
      return "idle";
    }
    if (state.carrying) {
      return "grab";
    }
    if (state.activity === "hunt") {
      return "hunt";
    }
    if (!state.target) {
      return "idle";
    }
    const distance = Math.hypot(state.target.x - state.position.x, state.target.y - state.position.y);
    return distance < 4 ? "idle" : "walk";
  }

  function setAnimationMode(mode) {
    state.animation.mode = mode;
    const moodSprites = SPRITES[state.mood] || SPRITES.calm;
    const frames = moodSprites[mode] || moodSprites.walk || [];
    state.animation.frames = frames;
    state.animation.index = 0;
    state.animation.lastAdvance = 0;
    state.animation.frameInterval = ANIMATION_INTERVALS[mode] || BASE_FRAME_INTERVAL;
    applyCurrentFrame(true);
    updateRootClasses();
  }

  function applyCurrentFrame(force) {
    if (!state.sprite || !state.animation.frames.length) {
      return;
    }
    const frameUrl = state.animation.frames[state.animation.index] || state.animation.frames[0];
    if (force || state.sprite.dataset.frame !== frameUrl) {
      state.sprite.style.backgroundImage = `url("${frameUrl}")`;
      state.sprite.dataset.frame = frameUrl;
    }
  }

  function scheduleNextAction(customDelay) {
    clearTimeout(state.actionTimer);
    if (!state.active) {
      return;
    }
    const [min, max] = ACTION_DELAY[state.mood] || ACTION_DELAY.calm;
    const delay = customDelay !== undefined ? customDelay : randomBetween(min, max);
    state.actionTimer = window.setTimeout(() => {
      if (
        !state.active ||
        document.hidden ||
        state.isSpawning ||
        state.isTeleporting ||
        state.carrying ||
        state.pendingGrab
      ) {
        scheduleNextAction(randomBetween(8000, 14000));
        return;
      }
      const huntChance = state.mood === "angry" ? 0.22 : 0.08;
      if (Math.random() < huntChance) {
        startHunt();
      } else if (Math.random() < 0.45) {
        attemptGrab();
      }
      scheduleNextAction();
    }, delay);
  }

  function scheduleMoodShift() {
    clearTimeout(state.moodTimer);
    const [min, max] = MOOD_DURATION[state.mood] || MOOD_DURATION.calm;
    state.moodTimer = window.setTimeout(() => {
      if (state.mood === "calm" && Math.random() > ANGRY_TRIGGER_CHANCE) {
        scheduleMoodShift();
        return;
      }
      setMood(state.mood === "calm" ? "angry" : "calm");
      scheduleMoodShift();
    }, randomBetween(min, max));
  }

  function setMood(mood) {
    if (state.mood === mood) {
      return;
    }
    state.mood = mood;
    setAnimationMode(determineAnimationMode());
    updateRootClasses();
    const burstDelay = mood === "angry" ? randomBetween(9000, 14000) : randomBetween(16000, 22000);
    scheduleNextAction(burstDelay);
  }

  function updateRootClasses() {
    if (!state.root) {
      return;
    }
    state.root.classList.toggle("enderman-angry", state.mood === "angry" && state.active);
    state.root.classList.toggle("enderman-hunting", state.activity === "hunt");
  }

  function startHunt() {
    if (!state.active || state.activity === "hunt" || state.isSpawning || state.isTeleporting) {
      return;
    }
    state.activity = "hunt";
    updateRootClasses();
    setAnimationMode("hunt");
    clearTimeout(state.huntEndTimer);
    const [min, max] = HUNT_DURATION[state.mood] || HUNT_DURATION.calm;
    state.huntEndTimer = window.setTimeout(stopHunt, randomBetween(min, max));
  }

  function stopHunt() {
    if (state.activity !== "hunt") {
      return;
    }
    state.activity = "wander";
    updateRootClasses();
    state.target = pickNewTarget();
    setAnimationMode(determineAnimationMode());
  }

  function attemptGrab() {
    if (
      !state.active ||
      state.carrying ||
      state.pendingGrab ||
      state.isSpawning ||
      state.isTeleporting ||
      document.hidden
    ) {
      return;
    }
    if (Math.random() > 0.55) {
      return;
    }
    const candidate = pickRandomElement();
    if (!candidate) {
      return;
    }
    startGrabApproach(candidate);
  }

  function startGrabApproach(element) {
    if (
      !state.active ||
      !element ||
      !element.getBoundingClientRect ||
      element.dataset.endermanPending === "true"
    ) {
      return;
    }
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    element.dataset.endermanPending = "true";
    state.pendingGrab = {
      element,
      threshold: Math.max(
        GRAB_APPROACH_DISTANCE,
        Math.min(96, Math.max(rect.width, rect.height) * 0.75)
      ),
      currentRect: rect,
      target: computeGrabTarget(rect)
    };
    state.target = state.pendingGrab.target;
  }

  function cancelPendingGrab() {
    if (!state.pendingGrab) {
      return;
    }
    const { element } = state.pendingGrab;
    if (element && element.dataset) {
      delete element.dataset.endermanPending;
    }
    state.pendingGrab = null;
    if (state.active) {
      state.target = pickNewTarget();
    } else {
      state.target = state.position;
    }
  }

  function maybeCompletePendingGrab() {
    if (!state.pendingGrab || state.carrying || state.isSpawning || state.isTeleporting) {
      return;
    }
    const { element } = state.pendingGrab;
    if (!element || !element.isConnected || !element.getBoundingClientRect) {
      cancelPendingGrab();
      return;
    }
    const rect = element.getBoundingClientRect();
    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > window.innerHeight ||
      rect.left > window.innerWidth
    ) {
      cancelPendingGrab();
      return;
    }

    const target = computeGrabTarget(rect);
    state.pendingGrab.currentRect = rect;
    state.pendingGrab.target = target;
    state.target = target;

    const dx = target.x - state.position.x;
    const dy = target.y - state.position.y;
    const distance = Math.hypot(dx, dy);
    const threshold = state.pendingGrab.threshold ?? GRAB_APPROACH_DISTANCE;
    if (distance <= threshold) {
      const pendingElement = element;
      cancelPendingGrab();
      grabElement(pendingElement, rect);
    }
  }

  function pickRandomElement() {
    const elements = Array.from(document.querySelectorAll("*")).filter((el) => {
      if (!el || BODY_TAGS_TO_SKIP.has(el.tagName)) {
        return false;
      }
      if (el === state.root || el.contains(state.root)) {
        return false;
      }
      if (el.dataset?.endermanGrabbed === "true" || el.dataset?.endermanPending === "true") {
        return false;
      }
      if (el.classList?.contains("enderman-placeholder")) {
        return false;
      }
      if (el.closest(".enderman-extension-root") || el.closest(".enderman-placeholder")) {
        return false;
      }
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
        return false;
      }
      if (el.shadowRoot) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) {
        return false;
      }
      if (rect.width < GRAB_SIZE_LIMITS.minWidth || rect.height < GRAB_SIZE_LIMITS.minHeight) {
        return false;
      }
      if (
        rect.width > GRAB_SIZE_LIMITS.maxWidth ||
        rect.height > GRAB_SIZE_LIMITS.maxHeight ||
        rect.width * rect.height > GRAB_SIZE_LIMITS.maxArea
      ) {
        return false;
      }
      if (
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > window.innerHeight ||
        rect.left > window.innerWidth
      ) {
        return false;
      }
      if (el.children?.length > 6 && rect.width > 180) {
        return false;
      }
      return true;
    });

    if (!elements.length) {
      return null;
    }
    return elements[Math.floor(Math.random() * elements.length)];
  }

  function grabElement(element, providedRect) {
    if (!element || !element.isConnected) {
      return;
    }
    const rect = providedRect || element.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      if (element.dataset) {
        delete element.dataset.endermanPending;
      }
      return;
    }
    const originalStyle = element.getAttribute("style");

    const placeholder = document.createElement("div");
    placeholder.className = "enderman-placeholder";
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;

    const computed = window.getComputedStyle(element);
    placeholder.style.display = computed.display === "block" ? "block" : "inline-block";
    placeholder.style.margin = computed.margin;

    if (element.parentNode) {
      element.parentNode.insertBefore(placeholder, element.nextSibling);
    }

    element.classList.add("enderman-grabbed");
    element.dataset.endermanGrabbed = "true";
    delete element.dataset.endermanPending;

    element.style.position = "fixed";
    element.style.left = "0px";
    element.style.top = "0px";
    element.style.margin = "0";
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    element.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    element.style.zIndex = "2147483646";
    element.style.transition = "transform 0.12s linear";

    document.body.appendChild(element);

    const [min, max] = DROP_DELAY[state.mood] || DROP_DELAY.calm;

    state.carrying = {
      element,
      placeholder,
      originalStyle,
      width: rect.width,
      height: rect.height,
      dropTimer: window.setTimeout(dropCarriedElement, randomBetween(min, max))
    };

    followCarriedElement();
    setAnimationMode("grab");
  }

  function followCarriedElement() {
    if (!state.carrying || state.isSpawning || state.isTeleporting) {
      return;
    }
    const { element, width, height } = state.carrying;
    const anchor = state.facing === 1 ? HAND_POSITIONS.right : HAND_POSITIONS.left;
    const baseX = state.position.x + state.size.width * anchor.x;
    const baseY = state.position.y + state.size.height * anchor.y + HAND_VERTICAL_OFFSET;
    const holdX = baseX - width / 2;
    const holdY = baseY - height / 2;
    element.style.transform = `translate3d(${holdX}px, ${holdY}px, 0)`;
  }

  function dropCarriedElement(options) {
    if (!state.carrying) {
      return;
    }
    const opts = options || {};
    const skipReschedule = Boolean(opts.skipReschedule);
    const { element, originalStyle, placeholder, dropTimer } = state.carrying;
    if (dropTimer) {
      clearTimeout(dropTimer);
    }

    element.classList.remove("enderman-grabbed");
    delete element.dataset.endermanGrabbed;
    delete element.dataset.endermanPending;

    if (originalStyle === null) {
      element.removeAttribute("style");
    } else {
      element.setAttribute("style", originalStyle);
    }

    if (placeholder && placeholder.parentNode) {
      placeholder.replaceWith(element);
    } else if (placeholder) {
      placeholder.remove();
      document.body.appendChild(element);
    }

    state.carrying = null;
    setAnimationMode(determineAnimationMode());
    if (!skipReschedule) {
      scheduleNextAction(randomBetween(12000, 18000));
    }
  }

  function computeGrabTarget(rect) {
    const targetX = rect.left + rect.width / 2 - state.size.width / 2;
    const targetY = rect.top + rect.height - state.size.height * 0.9;
    return clampPosition({ x: targetX, y: targetY });
  }

  function computeHuntTarget() {
    const mouseX = state.lastMouse.x - state.size.width / 2;
    const mouseY = state.lastMouse.y - state.size.height * 0.9;
    return clampPosition({ x: mouseX, y: mouseY });
  }

  function pickStartPosition() {
    return randomViewportPosition();
  }

  function pickNewTarget() {
    const padding = 20;
    return clampPosition({
      x: randomBetween(padding, Math.max(padding, window.innerWidth - state.size.width - padding)),
      y: randomBetween(padding, Math.max(padding, window.innerHeight - state.size.height - padding))
    });
  }

  function randomViewportPosition() {
    return clampPosition({
      x: randomBetween(0, Math.max(0, window.innerWidth - state.size.width)),
      y: randomBetween(0, Math.max(0, window.innerHeight - state.size.height))
    });
  }

  function pickTeleportPosition() {
    const current = state.position;
    const cursorTarget = computeHuntTarget();
    let candidate = randomViewportPosition();
    let attempts = 0;
    while (attempts < 12) {
      const distanceFromCurrent = Math.hypot(candidate.x - current.x, candidate.y - current.y);
      const distanceFromCursor = Math.hypot(candidate.x - cursorTarget.x, candidate.y - cursorTarget.y);
      if (distanceFromCurrent > TELEPORT_MIN_DISTANCE && distanceFromCursor > TELEPORT_CURSOR_DISTANCE) {
        break;
      }
      candidate = randomViewportPosition();
      attempts += 1;
    }
    return candidate;
  }

  function clampPosition(position) {
    const maxX = Math.max(0, window.innerWidth - state.size.width);
    const maxY = Math.max(0, window.innerHeight - state.size.height);
    return {
      x: clamp(position.x, 0, maxX),
      y: clamp(position.y, 0, maxY)
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function handleResize() {
    state.position = clampPosition(state.position);
    state.target = clampPosition(state.target || state.position);
    followCarriedElement();
    updateEndermanPosition();
  }

  function handleMouseMove(event) {
    state.lastMouse = { x: event.clientX, y: event.clientY };
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      cancelPendingGrab();
      if (state.activity === "hunt") {
        stopHunt();
      }
    } else if (state.active) {
      scheduleNextAction(randomBetween(9000, 15000));
    }
  }

  function setRootHidden(hidden) {
    if (!state.root) {
      return;
    }
    state.hidden = hidden;
    state.root.classList.toggle("enderman-hidden", hidden);
  }

  function playSpawnAnimation(options = {}) {
    const { onComplete, keepSpawningState = false, beforeStart } = options;
    state.isSpawning = true;
    if (typeof beforeStart === "function") {
      beforeStart();
    }
    clearTimeout(state.spawnTimer);
    const frames = state.animation.frames && state.animation.frames.length ? state.animation.frames.length : 1;
    const interval = state.animation.frameInterval || ANIMATION_INTERVALS.spawn;
    const duration = frames * interval + SPAWN_EXTRA_DELAY;
    state.spawnTimer = window.setTimeout(() => {
      if (!keepSpawningState) {
        state.isSpawning = false;
      }
      if (typeof onComplete === "function") {
        onComplete();
      }
    }, duration);
  }

  function scheduleAppearanceCycle(delay) {
    clearTimeout(state.appearanceCycleTimer);
    const wait = delay !== undefined ? delay : APPEARANCE_INTERVAL;
    state.appearanceCycleTimer = window.setTimeout(beginAppearance, wait);
  }

  function beginAppearance() {
    if (state.active || state.isSpawning || state.isTeleporting) {
      return;
    }
    clearTimeout(state.appearanceTimer);
    clearTimeout(state.actionTimer);
    state.active = true;
    state.activity = "spawn";
    state.isTeleporting = false;
    updateRootClasses();
    setRootHidden(false);
    setAnimationMode("spawn");
    playSpawnAnimation({
      onComplete: () => {
        state.isSpawning = false;
        state.activity = "wander";
        updateRootClasses();
        state.target = pickNewTarget();
        setAnimationMode(determineAnimationMode());
        scheduleNextAction(randomBetween(8000, 14000));
      }
    });
    const stayDuration = randomBetween(APPEARANCE_DURATION.min, APPEARANCE_DURATION.max);
    state.appearanceTimer = window.setTimeout(endAppearance, stayDuration);
  }

  function endAppearance() {
    if (!state.active && !state.isSpawning && !state.isTeleporting) {
      scheduleAppearanceCycle(APPEARANCE_INTERVAL);
      return;
    }
    clearTimeout(state.appearanceTimer);
    clearTimeout(state.actionTimer);
    if (state.huntEndTimer) {
      clearTimeout(state.huntEndTimer);
      state.huntEndTimer = null;
    }
    cancelPendingGrab();
    if (state.carrying) {
      dropCarriedElement({ skipReschedule: true });
    }
    state.active = false;
    state.activity = "spawn";
    setAnimationMode("spawn");
    playSpawnAnimation({
      onComplete: () => {
        state.isSpawning = false;
        setRootHidden(true);
        state.target = null;
        state.activity = "idle";
        updateRootClasses();
        setAnimationMode("idle");
      }
    });
    scheduleAppearanceCycle(APPEARANCE_INTERVAL);
  }

  function teleportAfterHunt() {
    if (!state.active || state.isTeleporting || state.isSpawning) {
      return;
    }
    state.isTeleporting = true;
    if (state.huntEndTimer) {
      clearTimeout(state.huntEndTimer);
      state.huntEndTimer = null;
    }
    cancelPendingGrab();
    if (state.carrying) {
      dropCarriedElement({ skipReschedule: true });
    }
    state.activity = "spawn";
    updateRootClasses();
    setAnimationMode("spawn");
    playSpawnAnimation({
      keepSpawningState: true,
      onComplete: () => {
        setRootHidden(true);
        const newPosition = pickTeleportPosition();
        state.position = newPosition;
        updateEndermanPosition();
        state.target = pickNewTarget();
        setAnimationMode("spawn");
        playSpawnAnimation({
          beforeStart: () => setRootHidden(false),
          onComplete: () => {
            state.isSpawning = false;
            state.isTeleporting = false;
            state.activity = "wander";
            updateRootClasses();
            state.target = pickNewTarget();
            setAnimationMode(determineAnimationMode());
            scheduleNextAction(randomBetween(8000, 14000));
          }
        });
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    clearTimeout(state.actionTimer);
    clearTimeout(state.moodTimer);
    clearTimeout(state.huntEndTimer);
    clearTimeout(state.spawnTimer);
    clearTimeout(state.appearanceTimer);
    clearTimeout(state.appearanceCycleTimer);
    if (state.carrying && state.carrying.dropTimer) {
      clearTimeout(state.carrying.dropTimer);
    }
  });

  init();
})();
