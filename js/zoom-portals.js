/**
 * Scroll zoom portals — CSS scroll-driven where supported, smoothed RAF fallback.
 */
(function () {
  const portals = [...document.querySelectorAll(".portal-scroll")];
  if (!portals.length) return;

  const supportsScrollTimeline =
    typeof CSS !== "undefined" &&
    CSS.supports("(animation-timeline: view()) and (animation-range: 0% 100%)");

  document.documentElement.classList.add(
    supportsScrollTimeline ? "portals-css" : "portals-js"
  );

  /* Precompute letter O origins once (avoid layout reads every frame) */
  const origins = new Map();

  function cacheOrigins() {
    origins.clear();
    portals.forEach((portal) => {
      const stage = portal.querySelector(".portal-stage");
      const hole = portal.querySelector(".portal-hole");
      if (!stage || !hole) return;
      const sr = stage.getBoundingClientRect();
      const hr = hole.getBoundingClientRect();
      const cx = ((hr.left + hr.width / 2 - sr.left) / sr.width) * 100;
      const cy = ((hr.top + hr.height / 2 - sr.top) / sr.height) * 100;
      stage.style.setProperty("--origin-x", `${cx}%`);
      stage.style.setProperty("--origin-y", `${cy}%`);
    });
  }

  cacheOrigins();
  window.addEventListener("resize", cacheOrigins, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(cacheOrigins);

  if (supportsScrollTimeline) return;

  /* ─── Fallback: lerp progress for buttery motion ─── */
  const state = portals.map((el) => ({
    el,
    current: 0,
    target: 0,
    stage: el.querySelector(".portal-stage"),
    tunnel: el.querySelector(".portal-tunnel"),
    type: el.querySelector(".portal-stage")?.dataset.portalType || "letter",
  }));

  function readProgress(el) {
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return Math.max(0, Math.min(1, -rect.top / scrollable));
  }

  function applyProgress(s, p) {
    const eased = p * p * (3 - 2 * p); /* smoothstep — loose, no snap */
    s.el.style.setProperty("--portal-p", eased);
    if (s.stage) s.stage.style.setProperty("--portal-p", eased);
    if (s.tunnel) s.tunnel.style.setProperty("--portal-p", eased);
    s.el.classList.toggle("portal-complete", p >= 0.995);
  }

  function onScroll() {
    state.forEach((s) => {
      s.target = readProgress(s.el);
    });
  }

  function frame() {
    let moving = false;
    state.forEach((s) => {
      const diff = s.target - s.current;
      if (Math.abs(diff) > 0.0004) {
        s.current += diff * 0.14; /* loose lag */
        moving = true;
      } else {
        s.current = s.target;
      }
      applyProgress(s, s.current);
    });
    if (moving) requestAnimationFrame(frame);
  }

  let rafScheduled = false;
  function scheduleFrame() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      frame();
      if (state.some((s) => Math.abs(s.target - s.current) > 0.0004)) {
        scheduleFrame();
      }
    });
  }

  window.addEventListener("scroll", () => {
    onScroll();
    scheduleFrame();
  }, { passive: true });

  onScroll();
  state.forEach((s) => {
    s.current = s.target;
    applyProgress(s, s.current);
  });
})();
