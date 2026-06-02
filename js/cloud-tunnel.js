/**
 * Grey cloud tunnel — scroll or drag to zoom through haze into the dashboard.
 */
(function () {
  const INTRO = document.getElementById("cloud-intro");
  if (!INTRO) return;

  const viewport = INTRO.querySelector(".cloud-viewport");
  const layers = [...INTRO.querySelectorAll(".cloud-layer")];
  const fill = document.getElementById("cloud-progress-fill");
  const hint = INTRO.querySelector(".cloud-hint-sub");

  let progress = 0;
  let emerged = false;
  let dataReady = false;
  const emergeCallbacks = [];

  function setProgress(p) {
    progress = Math.max(0, Math.min(1, p));
    const eased = 1 - Math.pow(1 - progress, 1.4);

    layers.forEach((layer) => {
      const depth = parseFloat(layer.dataset.depth || "1");
      const z = -120 + depth * 55 - eased * (180 + depth * 90);
      const scale = 1.1 + depth * 0.22 + eased * (2.4 + depth * 0.35);
      const opacity = Math.min(1, 0.35 + depth * 0.12) * (1 - eased * 0.92);
      layer.style.transform = `translate3d(0, ${eased * 8}%, ${z}px) scale(${scale})`;
      layer.style.opacity = String(opacity);
    });

    viewport.style.transform = `scale(${1 + eased * 0.08})`;
    INTRO.style.setProperty("--tunnel-vignette", String(0.55 - eased * 0.5));

    if (fill) fill.style.width = `${progress * 100}%`;
    if (hint) {
      hint.textContent =
        progress >= 0.98
          ? dataReady
            ? "Emerging…"
            : "Almost clear — loading data…"
          : "Scroll or swipe to move through the haze";
    }

    if (progress >= 1 && dataReady && !emerged) emerge();
  }

  function emerge() {
    emerged = true;
    INTRO.classList.add("is-emerging");
    document.body.classList.remove("tunnel-locked");

    window.setTimeout(() => {
      INTRO.classList.add("hidden");
      emergeCallbacks.forEach((fn) => fn());
      emergeCallbacks.length = 0;
    }, 900);
  }

  function onWheel(e) {
    if (emerged) return;
    e.preventDefault();
    setProgress(progress + e.deltaY * 0.0012);
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
    setProgress(progress + dy * 0.0025);
  }

  INTRO.addEventListener("wheel", onWheel, { passive: false });
  INTRO.addEventListener("touchstart", onTouchStart, { passive: true });
  INTRO.addEventListener("touchmove", onTouchMove, { passive: false });

  window.CloudTunnel = {
    signalDataReady() {
      dataReady = true;
      if (progress >= 1 && !emerged) emerge();
    },
    onEmerge(fn) {
      if (emerged) fn();
      else emergeCallbacks.push(fn);
    },
  };

  document.body.classList.add("tunnel-locked");
  setProgress(0);
})();
