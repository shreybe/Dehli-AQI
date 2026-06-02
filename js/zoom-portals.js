/**
 * Scroll-driven zoom portals — letter O tunnels + India Gate gateway
 */
(function () {
  const portals = document.querySelectorAll(".portal-scroll");
  if (!portals.length) return;

  function cloudLayersHTML() {
    return `
      <div class="portal-cloud-viewport">
        <div class="portal-cloud-layer" data-depth="1"></div>
        <div class="portal-cloud-layer" data-depth="2"></div>
        <div class="portal-cloud-layer" data-depth="3"></div>
        <div class="portal-cloud-layer" data-depth="4"></div>
        <div class="portal-cloud-layer" data-depth="5"></div>
        <div class="portal-cloud-layer portal-cloud-layer--dense" data-depth="6"></div>
      </div>
      <div class="portal-cloud-vignette"></div>`;
  }

  document.querySelectorAll(".portal-tunnel--cloud").forEach((el) => {
    if (!el.querySelector(".portal-cloud-viewport")) {
      el.innerHTML = cloudLayersHTML();
    }
  });

  function portalProgress(el) {
    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return Math.max(0, Math.min(1, -rect.top / scrollable));
  }

  function updateCloudTunnel(tunnel, p) {
    const eased = 1 - Math.pow(1 - p, 1.45);
    tunnel.style.opacity = String(Math.min(1, Math.max(0, (p - 0.08) / 0.92)));

    tunnel.querySelectorAll(".portal-cloud-layer").forEach((layer) => {
      const depth = parseFloat(layer.dataset.depth || "1");
      const z = -60 + depth * 35 - eased * (280 + depth * 100);
      const scale = 1 + depth * 0.12 + eased * (3.2 + depth * 0.5);
      const drift = (depth - 3.5) * eased * 5;
      layer.style.transform = `translate3d(${drift}%, ${eased * 12}%, ${z}px) scale(${scale})`;
      layer.style.opacity = String(Math.min(1, 0.35 + depth * 0.1) * (0.25 + eased * 0.75));
    });

    const viewport = tunnel.querySelector(".portal-cloud-viewport");
    if (viewport) viewport.style.transform = `scale(${1 + eased * 0.12})`;
    tunnel.style.setProperty("--tunnel-fog", String(0.85 + eased * 0.15));
  }

  function updateLetterPortal(stage, hole, p) {
    const headline = stage.querySelector(".portal-headline");
    const sub = stage.querySelector(".portal-subcopy");
    const eased = 1 - Math.pow(1 - p, 1.35);
    const scale = 1 + eased * 48;

    if (hole) {
      const r = hole.getBoundingClientRect();
      const cx = ((r.left + r.width / 2) / window.innerWidth) * 100;
      const cy = ((r.top + r.height / 2) / window.innerHeight) * 100;
      stage.style.transformOrigin = `${cx}% ${cy}%`;
    } else {
      stage.style.transformOrigin = "50% 50%";
    }

    stage.style.transform = `scale(${scale})`;
    if (headline) headline.style.opacity = String(Math.max(0, 1 - p * 2.2));
    if (sub) sub.style.opacity = String(Math.max(0, 1 - p * 2.8));
  }

  function updateGatewayPortal(stage, p) {
    const copy = stage.querySelector(".portal-delhi-copy");
    const img = stage.querySelector(".portal-gateway img");
    const eased = 1 - Math.pow(1 - p, 1.25);
    const scale = 1 + eased * 14;

    stage.style.transformOrigin = "50% 46%";
    stage.style.transform = `scale(${scale})`;

    if (copy) copy.style.opacity = String(Math.max(0, 1 - p * 2.5));
    if (img) img.style.filter = `brightness(${1 - eased * 0.35}) saturate(${1 - eased * 0.2})`;
  }

  function updatePortal(el) {
    const pin = el.querySelector(".portal-pin");
    const stage = el.querySelector(".portal-stage");
    const hole = el.querySelector(".portal-hole");
    const tunnel = el.querySelector(".portal-tunnel");
    const type = stage?.dataset.portalType || "letter";
    const p = portalProgress(el);

    el.style.setProperty("--portal-p", p);
    if (pin) pin.style.setProperty("--portal-p", p);

    if (type === "gateway") {
      updateGatewayPortal(stage, p);
    } else {
      updateLetterPortal(stage, hole, p);
    }

    if (tunnel) {
      if (tunnel.classList.contains("portal-tunnel--cloud")) {
        updateCloudTunnel(tunnel, p);
      } else {
        tunnel.style.opacity = String(Math.min(1, Math.max(0, (p - 0.2) / 0.8)));
      }
    }

    if (p >= 0.98) el.classList.add("portal-complete");
    else el.classList.remove("portal-complete");
  }

  function tick() {
    portals.forEach(updatePortal);
  }

  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", tick);
  tick();
})();
