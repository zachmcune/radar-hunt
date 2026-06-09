(function () {
  "use strict";

  /* --- DOM --- */

  const appEl = document.getElementById("app");
  const subtitle = document.getElementById("subtitle");
  const blipsContainer = document.getElementById("blips");
  const statusText = document.getElementById("status-text");
  const statusDot = document.getElementById("status-dot");
  const radar = document.getElementById("radar");
  const sweepEl = document.getElementById("radar-sweep");
  const arenaBoundary = document.getElementById("arena-boundary");
  const playerDot = document.getElementById("player-dot");
  const arenaWarning = document.getElementById("arena-warning");
  const arenaPanel = document.getElementById("arena-panel");
  const modeHostBtn = document.getElementById("mode-host");
  const modeJoinBtn = document.getElementById("mode-join");
  const hostSetup = document.getElementById("host-setup");
  const joinSetup = document.getElementById("join-setup");
  const arenaRadiusInput = document.getElementById("arena-radius");
  const arenaRadiusValue = document.getElementById("arena-radius-value");
  const arenaCreateBtn = document.getElementById("arena-create");
  const hostShare = document.getElementById("host-share");
  const lobbyCodeEl = document.getElementById("lobby-code");
  const arenaCopyCodeBtn = document.getElementById("arena-copy-code");
  const lobbyCodeInput = document.getElementById("lobby-code-input");
  const arenaJoinBtn = document.getElementById("arena-join");
  const geoPanel = document.getElementById("geo-panel");
  const geoEnable = document.getElementById("geo-enable");
  const geoData = document.getElementById("geo-data");
  const geoLat = document.getElementById("geo-lat");
  const geoLng = document.getElementById("geo-lng");
  const geoAccuracy = document.getElementById("geo-accuracy");
  const geoMessage = document.getElementById("geo-message");
  const rowDistance = document.getElementById("row-distance");
  const rowRadius = document.getElementById("row-radius");
  const arenaDistanceEl = document.getElementById("arena-distance");
  const arenaRadiusDisplay = document.getElementById("arena-radius-display");
  const roundControls = document.getElementById("round-controls");
  const endRoundBtn = document.getElementById("end-round");

  /* --- Constants --- */

  const BLIP_COUNT = 5;
  const SWEEP_DURATION_MS = 4000;
  const SWEEP_WIDTH_DEG = 14;
  const DECAY_PER_SEC = 1.1;
  const APPROACH_FRACTION = 0.15;
  const MIN_APPROACH_M = 10;
  const GEO_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- State --- */

  let blips = [];
  let startTime = performance.now();
  let lastTime = startTime;
  let watchId = null;
  let pendingArenaCreate = false;
  let uiMode = "host";
  let currentLobbyCode = "";

  const arena = {
    active: false,
    role: null,
    centerLat: null,
    centerLng: null,
    radiusM: 100,
    distanceM: null,
    zone: "safe",
  };

  /* --- Geo math --- */

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function localOffsetMeters(centerLat, centerLng, lat, lng) {
    const mLat = 111320;
    const mLng = 111320 * Math.cos(centerLat * Math.PI / 180);
    return {
      x: (lng - centerLng) * mLng,
      y: (lat - centerLat) * mLat,
    };
  }

  function formatCoord(value) {
    return value.toFixed(6) + "°";
  }

  function formatAccuracy(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters >= 1000) return "±" + (meters / 1000).toFixed(1) + " km";
    return "±" + Math.round(meters) + " m";
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters >= 1000) return (meters / 1000).toFixed(2) + " km";
    return Math.round(meters) + " m";
  }

  /* --- Radar blips --- */

  function randomBlipAngle() {
    return Math.random() * 360;
  }

  function randomBlipRadius() {
    return 0.2 + Math.random() * 0.65;
  }

  function angleFromPosition(angleDeg, radius) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: 50 + Math.cos(rad) * radius * 50,
      y: 50 + Math.sin(rad) * radius * 50,
    };
  }

  function angleDiff(a, b) {
    return Math.abs((((a - b + 540) % 360) - 180));
  }

  function createBlip() {
    const angle = randomBlipAngle();
    const radius = randomBlipRadius();
    const { x, y } = angleFromPosition(angle, radius);
    const el = document.createElement("div");
    el.className = "blip";
    el.style.left = x + "%";
    el.style.top = y + "%";
    blipsContainer.appendChild(el);
    return { el, angle, radius, intensity: 0 };
  }

  function initBlips() {
    blips = Array.from({ length: BLIP_COUNT }, () => createBlip());
  }

  function repositionBlip(blip) {
    blip.angle = randomBlipAngle();
    blip.radius = randomBlipRadius();
    blip.intensity = 0;
    const { x, y } = angleFromPosition(blip.angle, blip.radius);
    blip.el.style.left = x + "%";
    blip.el.style.top = y + "%";
    blip.el.style.opacity = "0";
    blip.el.style.transform = "translate(-50%, -50%) scale(0.6)";
  }

  function scatterBlips() {
    if (arena.active) return;
    blips.forEach(repositionBlip);
    statusText.textContent = "Active scan";
  }

  function updateBlipStatus() {
    if (arena.active) return;
    const visible = blips.filter((b) => b.intensity > 0.08).length;
    if (visible === 0) {
      statusText.textContent = "Active scan";
      return;
    }
    statusText.textContent =
      visible === 1 ? "1 signal detected" : visible + " signals detected";
  }

  function tick(now) {
    if (prefersReducedMotion) {
      requestAnimationFrame(tick);
      return;
    }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const elapsed = now - startTime;
    const sweepAngle = ((elapsed % SWEEP_DURATION_MS) / SWEEP_DURATION_MS) * 360;
    sweepEl.style.transform = "rotate(" + sweepAngle + "deg)";

    if (!arena.active) {
      blips.forEach((blip) => {
        const diff = angleDiff(sweepAngle, blip.angle);
        if (diff < SWEEP_WIDTH_DEG) {
          const hit = 1 - diff / SWEEP_WIDTH_DEG;
          blip.intensity = Math.max(blip.intensity, hit);
        }
        blip.intensity = Math.max(0, blip.intensity - DECAY_PER_SEC * dt);
        const opacity = blip.intensity;
        const scale = 0.6 + opacity * 0.4;
        blip.el.style.opacity = opacity.toFixed(3);
        blip.el.style.transform = "translate(-50%, -50%) scale(" + scale.toFixed(3) + ")";
      });
      updateBlipStatus();
    }

    requestAnimationFrame(tick);
  }

  /* --- Lobby code --- */

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach(function (b) {
      binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(str) {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function normalizeLobbyCode(input) {
    return String(input).replace(/[\s-]/g, "").toUpperCase();
  }

  function formatLobbyCode(raw) {
    return raw.match(/.{1,4}/g).join("-");
  }

  function encodeLobbyCode(lat, lng, radiusM) {
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    view.setInt32(0, Math.round(lat * 1e6));
    view.setInt32(4, Math.round(lng * 1e6));
    view.setUint16(8, Math.round(radiusM));
    return bytesToBase64Url(new Uint8Array(buf));
  }

  function decodeLobbyCode(input) {
    const raw = normalizeLobbyCode(input);
    if (!raw) return null;

    try {
      const bytes = base64UrlToBytes(raw);
      if (bytes.length !== 10) return null;

      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const lat = view.getInt32(0) / 1e6;
      const lng = view.getInt32(4) / 1e6;
      const radiusM = view.getUint16(8);

      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      if (radiusM < 25 || radiusM > 500) return null;

      return { lat, lng, radiusM };
    } catch (err) {
      return null;
    }
  }

  function applyLobbyCode(input) {
    const decoded = decodeLobbyCode(input);
    if (!decoded) return false;

    arena.centerLat = decoded.lat;
    arena.centerLng = decoded.lng;
    arena.radiusM = decoded.radiusM;
    return true;
  }

  function buildCodeUrl(code) {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("code", formatLobbyCode(code));
    return url.toString();
  }

  function copyText(text, button, defaultLabel) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied!";
        setTimeout(function () {
          button.textContent = defaultLabel;
        }, 2000);
      });
    } else {
      button.textContent = "Copied!";
      setTimeout(function () {
        button.textContent = defaultLabel;
      }, 2000);
    }
  }

  /* --- Arena --- */

  function parseArenaFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      if (!applyLobbyCode(code)) return false;
      if (lobbyCodeInput) {
        lobbyCodeInput.value = formatLobbyCode(normalizeLobbyCode(code));
      }
      return true;
    }

    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const r = parseFloat(params.get("r"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r) || r <= 0) {
      return false;
    }

    arena.centerLat = lat;
    arena.centerLng = lng;
    arena.radiusM = r;
    return true;
  }

  function approachThreshold() {
    return Math.max(MIN_APPROACH_M, arena.radiusM * APPROACH_FRACTION);
  }

  function computeZone(distanceM) {
    if (distanceM > arena.radiusM) return "outside";
    if (distanceM > arena.radiusM - approachThreshold()) return "approach";
    return "safe";
  }

  function setUiMode(mode) {
    uiMode = mode;
    const isHost = mode === "host";
    modeHostBtn.classList.toggle("is-active", isHost);
    modeJoinBtn.classList.toggle("is-active", !isHost);
    modeHostBtn.setAttribute("aria-selected", isHost ? "true" : "false");
    modeJoinBtn.setAttribute("aria-selected", !isHost ? "true" : "false");
    hostSetup.hidden = !isHost;
    joinSetup.hidden = isHost;
  }

  function showArenaRows() {
    rowDistance.hidden = false;
    rowRadius.hidden = false;
    arenaRadiusDisplay.textContent = formatDistance(arena.radiusM);
  }

  function updatePlayerOnRadar(lat, lng) {
    const offset = localOffsetMeters(arena.centerLat, arena.centerLng, lat, lng);
    const distance = Math.hypot(offset.x, offset.y);
    const cssAngle = (Math.atan2(offset.x, offset.y) * 180 / Math.PI + 360) % 360;
    const radial = Math.min(distance / arena.radiusM, 1) * 0.92;
    const { x, y } = angleFromPosition(cssAngle, radial);

    playerDot.style.left = x + "%";
    playerDot.style.top = y + "%";
    playerDot.hidden = false;
    playerDot.classList.remove("is-approach", "is-outside");

    if (arena.zone === "approach") playerDot.classList.add("is-approach");
    if (arena.zone === "outside") playerDot.classList.add("is-outside");
  }

  function stopTracking() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function resetGeoUi() {
    geoPanel.classList.remove("is-tracking");
    geoEnable.hidden = false;
    geoEnable.disabled = false;
    geoEnable.textContent = "Enable GPS";
    geoData.hidden = true;
    geoLat.textContent = "—";
    geoLng.textContent = "—";
    geoAccuracy.textContent = "—";
    clearGeoError();
  }

  function clearArenaUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", url.pathname + url.hash);
  }

  function resetArenaState() {
    arena.active = false;
    arena.role = null;
    arena.centerLat = null;
    arena.centerLng = null;
    arena.distanceM = null;
    arena.zone = "safe";
    pendingArenaCreate = false;
  }

  function resetToStartScreen(options) {
    const endedMessage = options && options.endedMessage;

    resetArenaState();
    stopTracking();
    resetGeoUi();
    clearArenaUrl();

    appEl.classList.remove("arena-approach", "arena-outside");
    radar.classList.remove("arena-active");
    arenaBoundary.hidden = true;
    playerDot.hidden = true;
    playerDot.classList.remove("is-approach", "is-outside");
    arenaPanel.classList.remove("is-live");
    roundControls.hidden = true;

    arenaWarning.hidden = true;
    arenaWarning.classList.remove("is-approach", "is-outside");
    arenaWarning.textContent = "";

    rowDistance.hidden = true;
    rowRadius.hidden = true;
    arenaDistanceEl.textContent = "—";

    hostShare.hidden = true;
    lobbyCodeEl.textContent = "----";
    currentLobbyCode = "";
    lobbyCodeInput.value = "";
    arenaCreateBtn.disabled = false;
    arenaCreateBtn.textContent = "Create arena at my location";

    setUiMode(uiMode);

    subtitle.textContent = endedMessage || "Scanning the area…";
    statusText.textContent = "Active scan";
    scatterBlips();
  }

  function endRound() {
    const message =
      arena.role === "host"
        ? "End this round for everyone? Players will need a new lobby code to join again."
        : "Leave this round and return to the start screen?";

    if (!window.confirm(message)) return;

    uiMode = "host";
    resetToStartScreen({ endedMessage: "Round ended" });
  }

  function updateArenaUi() {
    appEl.classList.remove("arena-approach", "arena-outside");
    arenaWarning.hidden = true;
    arenaWarning.classList.remove("is-approach", "is-outside");
    arenaWarning.textContent = "";

    if (!arena.active) return;

    radar.classList.add("arena-active");
    arenaBoundary.hidden = false;
    arenaPanel.classList.add("is-live");
    roundControls.hidden = false;
    showArenaRows();

    if (arena.zone === "approach") {
      appEl.classList.add("arena-approach");
      arenaWarning.hidden = false;
      arenaWarning.classList.add("is-approach");
      arenaWarning.textContent = "Approaching boundary — turn back";
      subtitle.textContent = "Near arena edge";
      statusText.textContent = "Boundary warning";
    } else if (arena.zone === "outside") {
      appEl.classList.add("arena-outside");
      arenaWarning.hidden = false;
      arenaWarning.classList.add("is-outside");
      arenaWarning.textContent = "Outside arena — return now";
      subtitle.textContent = "Outside arena";
      statusText.textContent = "Out of bounds";
    } else {
      subtitle.textContent = arena.role === "host" ? "Hosting arena" : "Inside arena";
      statusText.textContent = "Inside arena";
    }
  }

  function activateArena(role) {
    arena.active = true;
    arena.role = role;
    scatterBlips();
    updateArenaUi();
  }

  function createArenaAt(lat, lng) {
    arena.centerLat = lat;
    arena.centerLng = lng;
    arena.radiusM = parseInt(arenaRadiusInput.value, 10);
    activateArena("host");

    currentLobbyCode = encodeLobbyCode(lat, lng, arena.radiusM);
    lobbyCodeEl.textContent = formatLobbyCode(currentLobbyCode);
    hostShare.hidden = false;
    arenaCreateBtn.textContent = "Arena created at your location";

    window.history.replaceState(null, "", buildCodeUrl(currentLobbyCode));
  }

  function joinArena() {
    const inputCode = lobbyCodeInput.value.trim();
    const urlCode = new URLSearchParams(window.location.search).get("code");
    const code = inputCode || urlCode;

    if (!code) {
      showGeoError("Enter the lobby code from your host.");
      return false;
    }

    if (!applyLobbyCode(code)) {
      showGeoError("Invalid lobby code. Check it and try again.");
      return false;
    }

    lobbyCodeInput.value = formatLobbyCode(normalizeLobbyCode(code));
    arenaRadiusInput.value = String(Math.round(arena.radiusM));
    arenaRadiusValue.textContent = formatDistance(arena.radiusM);
    activateArena("player");
    setUiMode("join");

    currentLobbyCode = encodeLobbyCode(arena.centerLat, arena.centerLng, arena.radiusM);
    window.history.replaceState(null, "", buildCodeUrl(currentLobbyCode));
    return true;
  }

  function updateArenaPosition(lat, lng) {
    if (!arena.active) return;

    const distance = haversineMeters(arena.centerLat, arena.centerLng, lat, lng);
    arena.distanceM = distance;
    arena.zone = computeZone(distance);

    arenaDistanceEl.textContent = formatDistance(distance);
    updatePlayerOnRadar(lat, lng);
    updateArenaUi();
  }

  /* --- Geolocation --- */

  function showGeoError(message) {
    geoMessage.textContent = message;
    geoMessage.hidden = false;
  }

  function clearGeoError() {
    geoMessage.textContent = "";
    geoMessage.hidden = true;
  }

  function updateGeoDisplay(position) {
    const { latitude, longitude, accuracy } = position.coords;

    geoLat.textContent = formatCoord(latitude);
    geoLng.textContent = formatCoord(longitude);
    geoAccuracy.textContent = formatAccuracy(accuracy);

    geoPanel.classList.add("is-tracking");
    geoEnable.hidden = true;
    geoData.hidden = false;
    clearGeoError();

    if (pendingArenaCreate) {
      pendingArenaCreate = false;
      createArenaAt(latitude, longitude);
    }

    updateArenaPosition(latitude, longitude);
  }

  function handleGeoError(error) {
    const messages = {
      1: "Location permission denied. Enable GPS in your browser settings.",
      2: "Location unavailable. Check that GPS is turned on.",
      3: "Location request timed out. Try again outdoors.",
    };

    pendingArenaCreate = false;
    showGeoError(messages[error.code] || "Unable to get your location.");
    geoEnable.hidden = false;
    geoEnable.textContent = "Retry GPS";
    arenaCreateBtn.disabled = false;
    arenaCreateBtn.textContent = "Create arena at my location";
  }

  function startTracking() {
    if (!navigator.geolocation) {
      showGeoError("Geolocation is not supported on this device.");
      geoEnable.hidden = true;
      return;
    }

    clearGeoError();
    geoEnable.textContent = "Requesting GPS…";
    geoEnable.disabled = true;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      function (position) {
        geoEnable.disabled = false;
        updateGeoDisplay(position);
      },
      function (error) {
        geoEnable.disabled = false;
        handleGeoError(error);
      },
      GEO_OPTIONS
    );
  }

  /* --- Events --- */

  modeHostBtn.addEventListener("click", function () {
    if (!arena.active) setUiMode("host");
  });

  modeJoinBtn.addEventListener("click", function () {
    if (!arena.active) setUiMode("join");
  });

  arenaRadiusInput.addEventListener("input", function () {
    arenaRadiusValue.textContent = formatDistance(parseInt(arenaRadiusInput.value, 10));
  });

  arenaCreateBtn.addEventListener("click", function () {
    pendingArenaCreate = true;
    arenaCreateBtn.disabled = true;
    arenaCreateBtn.textContent = "Getting your location…";
    startTracking();
  });

  arenaJoinBtn.addEventListener("click", function () {
    if (!joinArena()) return;
    startTracking();
  });

  lobbyCodeInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      arenaJoinBtn.click();
    }
  });

  endRoundBtn.addEventListener("click", endRound);

  arenaCopyCodeBtn.addEventListener("click", function () {
    if (!currentLobbyCode) return;
    copyText(formatLobbyCode(currentLobbyCode), arenaCopyCodeBtn, "Copy lobby code");
  });

  geoEnable.addEventListener("click", startTracking);

  radar.addEventListener("click", function () {
    if (arena.active) return;
    statusText.textContent = "Manual rescan…";
    const now = performance.now();
    startTime = now;
    lastTime = now;
    scatterBlips();
  });

  window.addEventListener("beforeunload", stopTracking);

  /* --- Init --- */

  initBlips();
  scatterBlips();
  requestAnimationFrame(tick);

  const hasArenaInvite = parseArenaFromUrl();

  if (hasArenaInvite) {
    setUiMode("join");
    subtitle.textContent = "Lobby code detected";
  }

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "geolocation" })
      .then(function (result) {
        if (result.state === "granted") {
          if (hasArenaInvite) {
            joinArena();
          }
          startTracking();
        }

        result.addEventListener("change", function () {
          if (result.state === "granted") {
            startTracking();
          }
        });
      })
      .catch(function () {
        /* Permissions API unavailable */
      });
  }
})();
