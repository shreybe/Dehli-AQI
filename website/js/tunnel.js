/**
 * Gray smoke tunnel — canvas particles + CSS ring vortex
 */
(function () {
  const canvas = document.getElementById("tunnel-canvas");
  const ringsEl = document.getElementById("tunnel-rings");
  if (!canvas || !ringsEl) return;

  const RING_COUNT = 14;

  for (let i = 0; i < RING_COUNT; i++) {
    const ring = document.createElement("div");
    ring.className = "tunnel-ring";
    const size = 120 + i * 90;
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.animationDelay = `${-i * 0.3}s`;
    ring.style.transform = `translateZ(${-i * 60}px)`;
    ringsEl.appendChild(ring);
  }

  const ctx = canvas.getContext("2d");
  let particles = [];
  let animId = null;
  let running = false;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawn(n) {
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.5 + 0.1;
      particles.push({
        x: 0.5 + Math.cos(angle) * dist * 0.35,
        y: 0.5 + Math.sin(angle) * dist * 0.35,
        z: Math.random(),
        r: 2 + Math.random() * 14,
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
        vz: 0.008 + Math.random() * 0.02,
        gray: 80 + Math.random() * 120,
        life: 1,
      });
    }
  }

  function draw() {
    if (!running) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "rgba(8, 8, 12, 0.25)";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.z += p.vz;
      p.x += p.vx;
      p.y += p.vy;

      if (p.z > 1.2) {
        particles.splice(i, 1);
        continue;
      }

      const scale = 0.3 + p.z * 2.2;
      const px = cx + (p.x - 0.5) * w * scale;
      const py = cy + (p.y - 0.5) * h * scale;
      const alpha = Math.min(0.7, p.z * 0.8) * p.life;
      const g = p.gray;

      const grad = ctx.createRadialGradient(px, py, 0, px, py, p.r * scale);
      grad.addColorStop(0, `rgba(${g},${g},${g + 10},${alpha})`);
      grad.addColorStop(1, `rgba(${g - 30},${g - 30},${g - 20},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, p.r * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    if (particles.length < 180) spawn(8);
    animId = requestAnimationFrame(draw);
  }

  window.SmokeTunnel = {
    start() {
      resize();
      particles = [];
      spawn(120);
      running = true;
      draw();
    },
    stop() {
      running = false;
      if (animId) cancelAnimationFrame(animId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };

  window.addEventListener("resize", () => {
    if (running) resize();
  });
})();
