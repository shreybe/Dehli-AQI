/**
 * Grey cloud tunnel — scroll or swipe through haze to reach the dashboard.
 */
(function () {
  const INTRO = document.getElementById("cloud-intro");
  if (!INTRO) return;

  const viewport = INTRO.querySelector(".cloud-viewport");
  const layers = [...INTRO.querySelectorAll(".cloud-layer")];
  const fill = document.getElementById("cloud-progress-fill");
  const hint = INTRO.querySelector(".cloud-hint-sub");
  const enterBtn = document.getElementById("cloud-enter");

  let progress = 0;
  let emerged = false;
  let dataReady = false;
  const emergeCallbacks = [];

  function updateHint() {
    if (!hint || emerged) return;
    if (progress >= 0.98 && !dataReady) {
      hint.textContent = "Almost through the clouds — finishing data load…";
    } else if (progress >= 0.98 && dataReady) {
      hint.textContent = "Clearing…";
    } else if (!dataReady) {
      hint.textContent = "Scroll or swipe to move through the grey haze";
    } else {
      hint.textContent = "Keep scrolling to emerge into the dashboard";
    }
  }

  function setProgress(p) {
    progress = Math.max(0, Math.min(1, p));
    const eased = 1 - Math.pow(1 - progress, 1.55);

    layers.forEach((layer) => {
      const depth = parseFloat(layer.dataset.depth || "1");
      const z = -80 + depth * 40 - eased * (320 + depth * 120);
      const scale = 1 + depth * 0.15 + eased * (3.8 + depth * 0.55);
      const drift = (depth - 3.5) * eased * 6;
      const opacity = Math.min(1, 0.4 + depth * 0.1) * (1 - eased * 0.97);
      layer.style.transform = `translate3d(${drift}%, ${eased * 14}%, ${z}px) scale(${scale})`;
      layer.style.opacity = String(opacity);
    });

    viewport.style.transform = `scale(${1 + eased * 0.15})`;
    INTRO.style.setProperty("--tunnel-vignette", String(0.65 - eased * 0.62));
    INTRO.style.setProperty("--tunnel-fog", String(0.92 - eased * 0.92));
    document.body.style.setProperty("--tunnel-reveal", String(Math.max(0, (eased - 0.55) / 0.45)));

    if (fill) fill.style.width = `${progress * 100}%`;

    if (enterBtn) {
      enterBtn.classList.toggle("hidden", !(dataReady && progress >= 0.98));
    }

    updateHint();

    if (progress >= 1 && dataReady && !emerged) emerge();
  }

  function emerge() {
    if (emerged) return;
    emerged = true;
    INTRO.classList.add("is-emerging");
    document.body.classList.remove("tunnel-locked");
    document.body.style.setProperty("--tunnel-reveal", "1");
    if (enterBtn) enterBtn.classList.add("hidden");

    window.setTimeout(() => {
      INTRO.classList.add("hidden");
      emergeCallbacks.forEach((fn) => fn());
      emergeCallbacks.length = 0;
    }, 1000);
  }

  function onWheel(e) {
    if (emerged) return;
    e.preventDefault();
    setProgress(progress + e.deltaY * 0.0028);
  }

  let touchY = null;
  function onTouchStart(e) {
    if (emerged) return;
    touchY = e.touches[0].clientY;
  }
  function onTouchMove(e) {
    if (emerged || touchY == null) return;
    e.preventDefault();
    const dy = touchY - e.touches[0].clientY;
    touchY = e.touches[0].clientY;
    setProgress(progress + dy * 0.0035);
  }

  function onKeyDown(e) {
    if (emerged) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      setProgress(progress + 0.06);
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      setProgress(progress - 0.06);
    }
  }

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  if (enterBtn) {
    enterBtn.addEventListener("click", () => {
      if (dataReady && progress >= 0.98) emerge();
    });
  }

  window.CloudTunnel = {
    signalDataReady() {
      dataReady = true;
      updateHint();
      if (progress >= 1 && !emerged) emerge();
    },
    signalDataError(message) {
      dataReady = false;
      if (enterBtn) enterBtn.classList.add("hidden");
      if (hint) hint.textContent = message;
    },
    onEmerge(fn) {
      if (emerged) fn();
      else emergeCallbacks.push(fn);
    },
  };

  document.body.classList.add("tunnel-locked");
  setProgress(0);
})();
