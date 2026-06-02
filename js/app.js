/**
 * Delhi AQI Dashboard — radial calendar, drill-down, draw to predict 2026
 */
(function () {
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const BURN_MONTHS = [10, 11];

  let DATA = null;
  let state = {
    year: 2020,
    selectedMonth: null,
    playTimer: null,
    drawPoints: [],
    isDrawing: false,
    revealed: false,
    predictScales: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const viewHome = $("#view-home");
  const viewDetail = $("#view-detail");

  function dataJsonUrl() {
    return new URL("data/delhi_aqi.json", window.location.href).href;
  }

  function setLoadStatus(message, isError) {
    const el = $("#cloud-load-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
  }

  /* ─── Load data ─── */
  async function loadData() {
    const fill = $("#loader-fill");
    const loader = $("#loader");
    if (fill) fill.style.width = "20%";
    setLoadStatus("Loading sensor data…", false);

    try {
      const res = await fetch(dataJsonUrl(), { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Could not load data (${res.status}). Use a local server from delhi-dashboard/.`);
      }
      DATA = await res.json();
      if (!DATA?.monthly || !DATA?.years?.length) {
        throw new Error("Data file is empty or invalid.");
      }
      if (fill) fill.style.width = "100%";
      if (loader) loader.classList.add("hidden");
      setLoadStatus("Data loaded.", false);

      const startApp = () => {
        $("#app").classList.remove("hidden");
        init();
      };

      if (window.CloudTunnel) {
        window.CloudTunnel.signalDataReady();
        window.CloudTunnel.onEmerge(startApp);
      } else {
        $("#cloud-intro")?.classList.add("hidden");
        document.body.classList.remove("tunnel-locked");
        startApp();
      }
    } catch (err) {
      console.error(err);
      if (loader) {
        loader.classList.remove("hidden");
        loader.innerHTML =
          "<p style='color:#8b3a2a;padding:2rem;max-width:420px;text-align:center'>" +
          "Failed to load data. Run: <code>cd delhi-dashboard && python3 -m http.server 8080</code> " +
          "then open http://localhost:8080</p>";
      }
      setLoadStatus(err.message || "Failed to load data.", true);
      document.body.classList.remove("tunnel-locked");
      if (window.CloudTunnel?.signalDataError) {
        window.CloudTunnel.signalDataError("Data failed to load — see message below.");
      }
    }
  }

  function monthData(year, month) {
    return DATA?.monthly?.[String(year)]?.[String(month)] ?? null;
  }

  function dailySeries(year, month) {
    return DATA?.daily?.[String(year)]?.[String(month)] ?? [];
  }

  function hourlySeries(year, month) {
    return DATA?.hourly?.[String(year)]?.[String(month)] ?? [];
  }

  function actual2026Meta(month) {
    return DATA?.actual2026Meta?.[String(month)] ?? null;
  }

  /* ─── Legend ─── */
  function buildLegend() {
    const ul = $("#legend-bins");
    ul.innerHTML = AQI_BINS.map(
      (b) =>
        `<li><span class="legend-swatch" style="background:${b.color}"></span>${b.label} · ${b.range}</li>`
    ).join("");
  }

  /* ─── Radial chart ─── */
  function renderRadial() {
    const svg = d3.select("#radial-chart");
    svg.selectAll("*").remove();

    const width = 520;
    const height = 520;
    const cx = width / 2;
    const cy = height / 2;
    const innerR = 72;
    const outerR = 220;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const year = state.year;
    $("#radial-center").textContent = year;
    $("#year-display").textContent = year;

    const pie = d3
      .pie()
      .value(1)
      .sort(null)
      .padAngle(0.015);

    const arc = d3.arc().innerRadius(innerR).outerRadius(outerR);

    const arcs = g
      .selectAll(".month-arc")
      .data(pie(d3.range(12)))
      .join("path")
      .attr("class", (d) => {
        const m = d.data + 1;
        const rec = monthData(year, m);
        return `month-arc ${rec ? "has-data" : "no-data"}`;
      })
      .attr("d", arc)
      .attr("fill", (d) => {
        const m = d.data + 1;
        const rec = monthData(year, m);
        if (!rec) return "#1a2235";
        return colorForBin(rec.bin);
      })
      .attr("stroke", "#070b14")
      .attr("stroke-width", 2)
      .on("click", (_, d) => {
        const m = d.data + 1;
        if (monthData(year, m)) openDetail(year, m);
      });

    arcs.append("title").text((d) => {
      const m = d.data + 1;
      const rec = monthData(year, m);
      if (!rec) return `${MONTHS[d.data]} ${year}: no data`;
      return `${MONTHS[d.data]} ${year}\nAQI ${rec.aqi} · ${labelForBin(rec.bin)}`;
    });

    // Month labels
    const labelR = outerR + 22;
    g.selectAll(".month-label")
      .data(pie(d3.range(12)))
      .join("text")
      .attr("class", (d) => {
        const m = d.data + 1;
        return `month-label ${BURN_MONTHS.includes(m) ? "burn" : ""}`;
      })
      .attr("transform", (d) => {
        const a = (d.startAngle + d.endAngle) / 2;
        const x = Math.sin(a) * labelR;
        const y = -Math.cos(a) * labelR;
        return `translate(${x},${y})`;
      })
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text((d) => MONTHS[d.data]);

    updateYearStats();
  }

  function updateYearStats() {
    const year = state.year;
    const recs = [];
    for (let m = 1; m <= 12; m++) {
      const r = monthData(year, m);
      if (r) recs.push(r);
    }
    if (!recs.length) {
      $("#stat-peak").textContent = "—";
      $("#stat-mean").textContent = "—";
      $("#stat-months").textContent = "0";
      return;
    }
    const peak = recs.reduce((a, b) => (a.aqi > b.aqi ? a : b));
    let peakMonth = 1;
    for (let m = 1; m <= 12; m++) {
      const r = monthData(year, m);
      if (r && r.aqi === peak.aqi) {
        peakMonth = m;
        break;
      }
    }
    const mean = recs.reduce((s, r) => s + r.aqi, 0) / recs.length;
    $("#stat-peak").textContent = `${peak.aqi} (${MONTHS[peakMonth - 1]})`;
    $("#stat-mean").textContent = String(Math.round(mean));
    $("#stat-months").textContent = String(recs.length);
  }

  /* ─── Detail view ─── */
  function openDetail(year, month) {
    state.selectedMonth = { year, month };

    const rec = monthData(year, month);
    const mName = MONTHS[month - 1];
    const fcYear = DATA?.forecastYear ?? 2026;

    viewHome.classList.remove("view-active");
    viewDetail.classList.add("view-active");

    $("#detail-title").textContent = `${mName} ${year}`;
    $("#detail-badge").textContent = `Delhi · ${year}`;
    $("#detail-sub").textContent = `Mean AQI ${rec.aqi} (${labelForBin(rec.bin)}) · ${rec.readings.toLocaleString()} hourly readings`;
    $("#predict-month-label").textContent = `${mName} ${fcYear}`;

    state.drawPoints = [];
    state.revealed = false;
    state.isDrawing = false;
    $("#reveal-panel")?.classList.add("hidden");
    $("#btn-finish").disabled = false;

    renderDetailCharts(year, month);
    setupPredictChart(year, month);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDetail() {
    viewDetail.classList.remove("view-active");
    viewHome.classList.add("view-active");
    state.selectedMonth = null;
  }

  function chartMargins() {
    return { top: 28, right: 24, bottom: 36, left: 48 };
  }

  function renderDetailCharts(year, month) {
    const daily = dailySeries(year, month);
    if (!daily.length) return;

    renderAqiChart("#chart-aqi", daily, `${MONTHS[month - 1]} ${year}`);
    renderPollutantChart("#chart-pollutants", daily);
    renderHourlyChart("#chart-hourly", hourlySeries(year, month));
  }

  function renderAqiChart(selector, daily, title) {
    const el = d3.select(selector);
    el.selectAll("*").remove();
    const margin = chartMargins();
    const W = el.node().clientWidth || 800;
    const H = 240;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const svg = el
      .append("svg")
      .attr("width", W)
      .attr("height", H);

    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", "area-gradient-aqi")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 1);
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#c5c9cf").attr("stop-opacity", 0.4);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#c5c9cf").attr("stop-opacity", 0);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([1, d3.max(daily, (d) => d.day)]).range([0, w]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(daily, (d) => d.aqi) * 1.1])
      .nice()
      .range([h, 0]);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-w).tickFormat("").ticks(5))
      .call((g) => g.select(".domain").remove());

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `Day ${d}`));

    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

    const line = d3
      .line()
      .x((d) => x(d.day))
      .y((d) => y(d.aqi))
      .curve(d3.curveMonotoneX);

    g.append("path").datum(daily).attr("class", "area-aqi").attr("d", line);
    g.append("path").datum(daily).attr("class", "line-aqi").attr("d", line);

    g.selectAll(".dot-aqi")
      .data(daily)
      .join("circle")
      .attr("class", "dot-aqi")
      .attr("cx", (d) => x(d.day))
      .attr("cy", (d) => y(d.aqi))
      .attr("r", 3);
  }

  function renderPollutantChart(selector, daily) {
    const el = d3.select(selector);
    el.selectAll("*").remove();
    const margin = chartMargins();
    const W = el.node().clientWidth || 800;
    const H = 280;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const svg = el.append("svg").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([1, d3.max(daily, (d) => d.day)]).range([0, w]);

    const series = [
      { key: "pm25", label: "PM2.5", cls: "line-pm25" },
      { key: "no2", label: "NO₂", cls: "line-no2" },
      { key: "o3", label: "O₃", cls: "line-o3" },
      { key: "so2", label: "SO₂", cls: "line-so2" },
    ];

    const allVals = daily.flatMap((d) => series.map((s) => d[s.key]));
    const y = d3.scaleLinear().domain([0, d3.max(allVals) * 1.1]).nice().range([h, 0]);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y).tickSize(-w).tickFormat("").ticks(5))
      .call((g) => g.select(".domain").remove());

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `Day ${d}`));

    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

    const line = d3
      .line()
      .x((d) => x(d.day))
      .curve(d3.curveMonotoneX);

    series.forEach((s) => {
      g.append("path")
        .datum(daily)
        .attr("class", `line-pollutant ${s.cls}`)
        .attr("d", line.y((d) => y(d[s.key])));
    });

    const legend = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 8)`);
    series.forEach((s, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 72}, 0)`);
      lg.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 4).attr("y2", 4).attr("class", s.cls);
      lg.append("text").attr("x", 20).attr("y", 8).attr("fill", "#a8adb4").attr("font-size", 10).text(s.label);
    });
  }

  function renderHourlyChart(selector, hourly) {
    const el = d3.select(selector);
    el.selectAll("*").remove();
    if (!hourly.length) {
      el.append("p").attr("fill", "#a8adb4").text("No hourly data for this month.");
      return;
    }

    const margin = chartMargins();
    const W = el.node().clientWidth || 800;
    const H = 200;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const svg = el.append("svg").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, hourly.length - 1])
      .range([0, w]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(hourly, (d) => d.aqi) * 1.05])
      .nice()
      .range([h, 0]);

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${h})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(6)
          .tickFormat((i) => {
            const t = hourly[Math.round(i)]?.t ?? "";
            return t.slice(8, 10) || "";
          })
      );

    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(4));

    const line = d3
      .line()
      .x((_, i) => x(i))
      .y((d) => y(d.aqi))
      .curve(d3.curveMonotoneX);

    g.append("path").datum(hourly).attr("class", "line-aqi").attr("d", line);
  }

  function addRefLineLabel(g, x, y, viewYear, viewMonth, viewDaily, margin, w) {
    const anchor = viewDaily.reduce((best, d) => (d.aqi > best.aqi ? d : best), viewDaily[0]);
    const ax = x(anchor.day);
    const ay = y(anchor.aqi);
    const mName = MONTHS[viewMonth - 1];
    const labelG = g.append("g").attr("class", "ref-line-label");
    const boxW = 128;
    const boxH = 34;
    let lx = ax - boxW / 2;
    let ly = ay - boxH - 10;
    lx = Math.max(margin.left, Math.min(margin.left + w - boxW, lx));
    ly = Math.max(margin.top + 4, ly);

    labelG
      .append("line")
      .attr("x1", ax)
      .attr("y1", ay)
      .attr("x2", lx + boxW / 2)
      .attr("y2", ly + boxH)
      .attr("stroke", "rgba(160,168,178,0.5)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3");

    labelG
      .append("rect")
      .attr("x", lx)
      .attr("y", ly)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("rx", 5)
      .attr("fill", "rgba(42,40,38,0.92)")
      .attr("stroke", "rgba(180,188,198,0.45)");

    labelG
      .append("text")
      .attr("x", lx + boxW / 2)
      .attr("y", ly + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "#b8c0c8")
      .attr("font-size", 11)
      .attr("font-weight", "600")
      .text(`${mName} ${viewYear}`);

    labelG
      .append("text")
      .attr("x", lx + boxW / 2)
      .attr("y", ly + 27)
      .attr("text-anchor", "middle")
      .attr("fill", "rgba(138,160,190,0.9)")
      .attr("font-size", 9)
      .text("reference · not your 2026 draw");
  }

  function redrawUserDraw(ctx, x, y) {
    const pts = state.drawPoints;
    if (!ctx || pts.length < 2) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = "#f0f2f5";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    pts.forEach((p, i) => {
      const sx = x(p.day);
      const sy = y(p.aqi);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }

  function reveal2026(month, series) {
    state.revealed = true;
    $("#btn-finish").disabled = true;
    const panel = $("#reveal-panel");
    panel.classList.remove("hidden");

    const mName = MONTHS[month - 1];
    const fcYear = DATA?.forecastYear ?? 2026;
    const meta = actual2026Meta(month);
    let title = `Actual ${mName} ${fcYear}`;
    let note = "";

    if (!series.length) {
      title = `${mName} ${fcYear} — no data`;
      note = "No 2026 curve available for this month.";
    } else if (meta?.source === "estimated") {
      title = `Estimated ${mName} ${fcYear}`;
      note = meta.note || "This month is estimated from 2025–2026 trends (sensors only through May 2026).";
    } else if (meta?.source === "observed") {
      note = `Recorded in the Delhi sensor dataset through May ${fcYear}.`;
    }

    $("#reveal-title").textContent = title;
    $("#reveal-note").textContent = note;

    const el = d3.select("#chart-reveal");
    el.selectAll("*").remove();

    const W = el.node().clientWidth || 800;
    const H = 220;
    const mg = chartMargins();
    const iw = W - mg.left - mg.right;
    const ih = H - mg.top - mg.bottom;

    const x2 = d3
      .scaleLinear()
      .domain([1, d3.max(series, (d) => d.day)])
      .range([0, iw]);
    const y2 = d3
      .scaleLinear()
      .domain([0, d3.max(series, (d) => d.aqi) * 1.1])
      .nice()
      .range([ih, 0]);

    const svg = el.append("svg").attr("width", W).attr("height", H);
    const g = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y2).tickSize(-iw).tickFormat("").ticks(5))
      .call((sel) => sel.select(".domain").remove());

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x2).ticks(8).tickFormat((d) => `Day ${d}`));

    g.append("g").attr("class", "axis").call(d3.axisLeft(y2).ticks(5));

    const line = d3
      .line()
      .x((d) => x2(d.day))
      .y((d) => y2(d.aqi))
      .curve(d3.curveMonotoneX);

    g.append("path").datum(series).attr("class", "line-actual").attr("d", line);

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ─── Draw 2026 prediction (2023-style) ─── */
  function setupPredictChart(viewYear, viewMonth) {
    const wrap = $("#predict-wrap");
    const canvas = $("#predict-canvas");
    const svg = d3.select("#predict-grid");
    svg.selectAll("*").remove();

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    canvas.width = W;
    canvas.height = H;
    const margin = { top: 28, right: 24, bottom: 40, left: 48 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const viewDaily = dailySeries(viewYear, viewMonth);
    const actual2026 = dailySeries(DATA?.forecastYear ?? 2026, viewMonth);

    const maxDay = Math.max(
      28,
      d3.max(viewDaily, (d) => d.day) || 30,
      d3.max(actual2026, (d) => d.day) || 0
    );

    const yMax = Math.max(
      500,
      d3.max(viewDaily, (d) => d.aqi) || 0,
      d3.max(actual2026, (d) => d.aqi) || 0,
      300
    );

    const x = d3.scaleLinear().domain([1, maxDay]).range([margin.left, margin.left + w]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([margin.top + h, margin.top]);

    state.predictScales = { x, y, maxDay, yMax, margin, W, H, viewYear, viewMonth };

    const g = svg.attr("width", W).attr("height", H).append("g");

    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(-w).tickFormat("").ticks(5))
      .call((sel) => sel.select(".domain").remove());

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${margin.top + h})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `Day ${d}`));

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    const line = d3
      .line()
      .x((d) => x(d.day))
      .y((d) => y(d.aqi))
      .curve(d3.curveMonotoneX);

    if (viewDaily.length) {
      g.append("path")
        .datum(viewDaily)
        .attr("fill", "none")
        .attr("class", "line-ref")
        .attr("stroke", "rgba(180,188,198,0.5)")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,4")
        .attr("d", line);
      addRefLineLabel(g, x, y, viewYear, viewMonth, viewDaily, margin, w);
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (state.drawPoints.length >= 2) redrawUserDraw(ctx, x, y);

    function canvasPoint(evt) {
      const rect = canvas.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * W;
      const py = ((evt.clientY - rect.top) / rect.height) * H;
      const day = x.invert(px);
      const aqi = y.invert(py);
      return {
        day: Math.max(1, Math.min(maxDay, day)),
        aqi: Math.max(0, Math.min(yMax, aqi)),
      };
    }

    canvas.onmousedown = (e) => {
      if (state.revealed) return;
      state.isDrawing = true;
      state.drawPoints = [canvasPoint(e)];
      redrawUserDraw(ctx, x, y);
    };
    canvas.onmousemove = (e) => {
      if (!state.isDrawing || state.revealed) return;
      state.drawPoints.push(canvasPoint(e));
      redrawUserDraw(ctx, x, y);
    };
    canvas.onmouseup = () => { state.isDrawing = false; };
    canvas.onmouseleave = () => { state.isDrawing = false; };

    canvas.ontouchstart = (e) => {
      e.preventDefault();
      canvas.onmousedown(e.touches[0]);
    };
    canvas.ontouchmove = (e) => {
      e.preventDefault();
      canvas.onmousemove(e.touches[0]);
    };
    canvas.ontouchend = () => canvas.onmouseup();

    $("#btn-clear-draw").onclick = () => {
      if (state.revealed) return;
      state.drawPoints = [];
      ctx.clearRect(0, 0, W, H);
    };

    $("#btn-finish").onclick = () => {
      const series = dailySeries(DATA?.forecastYear ?? 2026, viewMonth);
      reveal2026(viewMonth, series);
    };
  }

  /* ─── Year slider / play ─── */
  function bindControls() {
    const slider = $("#year-slider");
    const calendarYears = DATA.years.filter((y) => y <= 2023);
    slider.min = calendarYears[0];
    slider.max = calendarYears[calendarYears.length - 1];
    slider.value = 2020;
    state.year = 2020;

    slider.addEventListener("input", () => {
      state.year = +slider.value;
      renderRadial();
    });

    $("#year-play").addEventListener("click", () => {
      if (state.playTimer) {
        clearInterval(state.playTimer);
        state.playTimer = null;
        $("#year-play").textContent = "▶";
        return;
      }
      $("#year-play").textContent = "❚❚";
      const years = DATA.years.filter((y) => y <= 2023);
      let i = years.indexOf(state.year);
      state.playTimer = setInterval(() => {
        i = (i + 1) % years.length;
        state.year = years[i];
        slider.value = state.year;
        renderRadial();
      }, 1200);
    });

    $("#btn-back").addEventListener("click", closeDetail);
  }

  function init() {
    buildLegend();
    bindControls();
    renderRadial();
    window.addEventListener("resize", () => {
      if (state.selectedMonth) {
        const { year, month } = state.selectedMonth;
        renderDetailCharts(year, month);
        if (!state.revealed) setupPredictChart(year, month);
      }
    });
  }

  loadData();
})();

