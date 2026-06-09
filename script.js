(function () {
  "use strict";

  const blipsContainer = document.getElementById("blips");
  const statusText = document.getElementById("status-text");
  const radar = document.getElementById("radar");
  const sweepEl = document.getElementById("radar-sweep");

  const BLIP_COUNT = 5;
  const SWEEP_DURATION_MS = 4000;
  const SWEEP_WIDTH_DEG = 14;
  const DECAY_PER_SEC = 1.1;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let blips = [];
  let startTime = performance.now();
  let lastTime = startTime;

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
    blips.forEach(repositionBlip);
    statusText.textContent = "Active scan";
  }

  function updateStatus() {
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

    updateStatus();
    requestAnimationFrame(tick);
  }

  initBlips();
  scatterBlips();
  requestAnimationFrame(tick);

  radar.addEventListener("click", function () {
    statusText.textContent = "Manual rescan…";
    const now = performance.now();
    startTime = now;
    lastTime = now;
    scatterBlips();
  });
})();

(function () {
  "use strict";

  const geoPanel = document.getElementById("geo-panel");
  const geoEnable = document.getElementById("geo-enable");
  const geoData = document.getElementById("geo-data");
  const geoLat = document.getElementById("geo-lat");
  const geoLng = document.getElementById("geo-lng");
  const geoAccuracy = document.getElementById("geo-accuracy");
  const geoMessage = document.getElementById("geo-message");

  const GEO_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  };

  let watchId = null;

  function formatCoord(value) {
    return value.toFixed(6) + "°";
  }

  function formatAccuracy(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters >= 1000) {
      return "±" + (meters / 1000).toFixed(1) + " km";
    }
    return "±" + Math.round(meters) + " m";
  }

  function showError(message) {
    geoMessage.textContent = message;
    geoMessage.hidden = false;
  }

  function clearError() {
    geoMessage.textContent = "";
    geoMessage.hidden = true;
  }

  function updatePosition(position) {
    const { latitude, longitude, accuracy } = position.coords;

    geoLat.textContent = formatCoord(latitude);
    geoLng.textContent = formatCoord(longitude);
    geoAccuracy.textContent = formatAccuracy(accuracy);

    geoPanel.classList.add("is-tracking");
    geoEnable.hidden = true;
    geoData.hidden = false;
    clearError();
  }

  function handleError(error) {
    const messages = {
      1: "Location permission denied. Enable GPS in your browser settings.",
      2: "Location unavailable. Check that GPS is turned on.",
      3: "Location request timed out. Try again outdoors.",
    };

    showError(messages[error.code] || "Unable to get your location.");
    geoEnable.hidden = false;
    geoEnable.textContent = "Retry GPS";
  }

  function startTracking() {
    if (!navigator.geolocation) {
      showError("Geolocation is not supported on this device.");
      geoEnable.hidden = true;
      return;
    }

    clearError();
    geoEnable.textContent = "Requesting GPS…";
    geoEnable.disabled = true;

    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      function (position) {
        geoEnable.disabled = false;
        updatePosition(position);
      },
      function (error) {
        geoEnable.disabled = false;
        handleError(error);
      },
      GEO_OPTIONS
    );
  }

  geoEnable.addEventListener("click", startTracking);

  window.addEventListener("beforeunload", function () {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
    }
  });

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions
      .query({ name: "geolocation" })
      .then(function (result) {
        if (result.state === "granted") {
          startTracking();
        }

        result.addEventListener("change", function () {
          if (result.state === "granted") {
            startTracking();
          }
        });
      })
      .catch(function () {
        /* Permissions API unavailable; user taps Enable GPS */
      });
  }
})();
