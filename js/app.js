/**
 * Intro → smoke tunnel → main site; tunnel between sections
 */
(function () {
  const INTRO_LINES = document.querySelectorAll("#intro-speech .speech-line");
  const introScreen = document.getElementById("intro-screen");
  const mainSite = document.getElementById("main-site");
  const tunnelOverlay = document.getElementById("tunnel-overlay");
  const tunnelLabel = document.getElementById("tunnel-label");
  const guideSpeech = document.getElementById("guide-speech");
  const btnEnter = document.getElementById("btn-enter");

  const SECTION_COPY = {
    home: "This is the story. Every winter, the same gray sky returns.",
    hometown: "These are my neighborhoods. Hover — feel how bad it gets near home.",
    burn: "Out in Punjab, fields burn week by week. Watch the scars spread.",
    aqi: "Year by year, October and November turn purple. That's our breathing.",
    story: "Nobody's the villain. The calendar is.",
  };

  const TUNNEL_LABELS = {
    home: "Entering Delhi...",
    hometown: "Flying over Raj's Delhi...",
    burn: "Through the smoke to Punjab...",
    aqi: "Into the data...",
    story: "The truth behind the haze...",
  };

  const DELHI_ZONES = [
    { id: "cp", name: "Connaught Place", cx: 200, cy: 155, r: 28, aqi: 312, cat: "Very Unhealthy" },
    { id: "dw", name: "Dwarka", cx: 95, cy: 200, r: 32, aqi: 285, cat: "Very Unhealthy" },
    { id: "roh", name: "Rohini", cx: 175, cy: 75, r: 30, aqi: 298, cat: "Very Unhealthy" },
    { id: "anand", name: "Anand Vihar", cx: 310, cy: 140, r: 26, aqi: 356, cat: "Hazardous" },
    { id: "okhla", name: "Okhla", cx: 250, cy: 220, r: 24, aqi: 341, cat: "Hazardous" },
    { id: "lodhi", name: "Lodhi Road", cx: 220, cy: 175, r: 22, aqi: 278, cat: "Very Unhealthy" },
    { id: "punj", name: "Punjabi Bagh", cx: 130, cy: 130, r: 28, aqi: 265, cat: "Very Unhealthy" },
    { id: "ito", name: "ITO", cx: 265, cy: 165, r: 20, aqi: 389, cat: "Hazardous" },
  ];

  let currentSection = "home";
  let tunnelBusy = false;

  function aqiColor(aqi) {
    if (aqi <= 100) return "rgba(107, 158, 143, 0.5)";
    if (aqi <= 200) return "rgba(201, 184, 122, 0.55)";
    if (aqi <= 300) return "rgba(232, 149, 106, 0.6)";
    return "rgba(212, 93, 82, 0.65)";
  }

  function buildDelhiMap() {
    const g = document.getElementById("delhi-zones");
    const detail = document.getElementById("zone-detail");
    if (!g) return;

    DELHI_ZONES.forEach((z) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", z.cx);
      circle.setAttribute("cy", z.cy);
      circle.setAttribute("r", z.r);
      circle.setAttribute("fill", aqiColor(z.aqi));
      circle.setAttribute("class", "zone-poly");
      circle.dataset.id = z.id;

      circle.addEventListener("mouseenter", () => {
        g.querySelectorAll(".zone-poly").forEach((el) => el.classList.remove("active"));
        circle.classList.add("active");
        detail.querySelector(".zone-name").textContent = z.name;
        detail.querySelector(".zone-aqi").textContent = z.aqi;
        detail.querySelector(".zone-aqi").style.color =
          z.aqi > 300 ? "#d45d52" : z.aqi > 200 ? "#e8956a" : "#c9b87a";
        detail.querySelector(".zone-cat").textContent = z.cat;
        if (guideSpeech) {
          guideSpeech.textContent = `${z.name} — AQI ${z.aqi}. ${z.cat}. This is what we live with.`;
        }
      });

      g.appendChild(circle);
    });
  }

  function animateIntroSpeech() {
    INTRO_LINES.forEach((line, i) => {
      setTimeout(() => line.classList.add("visible"), 400 + i * 900);
    });
  }

  function runTunnel(label, onDone) {
    if (tunnelBusy) return;
    tunnelBusy = true;

    tunnelLabel.textContent = label;
    tunnelOverlay.classList.add("active");
    tunnelOverlay.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      tunnelOverlay.classList.add("zooming");
      if (window.SmokeTunnel) window.SmokeTunnel.start();
    });

    setTimeout(() => {
      tunnelOverlay.classList.remove("zooming");
      if (window.SmokeTunnel) window.SmokeTunnel.stop();
      tunnelOverlay.classList.remove("active");
      tunnelOverlay.setAttribute("aria-hidden", "true");
      tunnelBusy = false;
      if (onDone) onDone();
    }, 2400);
  }

  function showSection(id) {
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    document.querySelectorAll(".nav-link").forEach((n) => n.classList.remove("active"));

    const section = document.getElementById(`section-${id}`);
    const nav = document.querySelector(`.nav-link[data-section="${id}"]`);
    if (section) section.classList.add("active");
    if (nav) nav.classList.add("active");

    currentSection = id;
    if (guideSpeech && SECTION_COPY[id]) {
      guideSpeech.textContent = SECTION_COPY[id];
    }
  }

  function navigateTo(id) {
    if (id === currentSection || tunnelBusy) return;

    const label = TUNNEL_LABELS[id] || "Through the smoke...";
    runTunnel(label, () => showSection(id));
  }

  function enterSite() {
    runTunnel("Through the smoke...", () => {
      introScreen.classList.remove("active");
      mainSite.classList.remove("hidden");
      showSection("home");
      if (guideSpeech) guideSpeech.textContent = SECTION_COPY.home;
    });
  }

  btnEnter?.addEventListener("click", enterSite);

  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.section));
  });

  animateIntroSpeech();
  buildDelhiMap();

  // Auto-enter after 8s if user hasn't clicked
  setTimeout(() => {
    if (introScreen.classList.contains("active")) {
      btnEnter?.click();
    }
  }, 8000);
})();
