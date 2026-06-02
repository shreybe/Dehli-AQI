/**
 * Delhi AQI Dashboard — radial calendar, drill-down, draw-to-predict
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

  /* ─── Load data ─── */
  async function loadData() {
    const fill = $("#loader-fill");
    fill.style.width = "30%";
    const res = await fetch("data/delhi_aqi.json");
    DATA = await res.json();
    fill.style.width = "100%";
    await new Promise((r) => setTimeout(r, 400));
    $("#loader").classList.add("hidden");
    $("#app").classList.remove("hidden");
    init();
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
    state.revealed = false;
    state.drawPoints = [];

    const rec = monthData(year, month);
    const mName = MONTHS[month - 1];

    viewHome.classList.remove("view-active");
    viewDetail.classList.add("view-active");

    $("#detail-title").textContent = `${mName} ${year}`;
    $("#detail-badge").textContent = `Delhi · ${year}`;
    $("#detail-sub").textContent = `Mean AQI ${rec.aqi} (${labelForBin(rec.bin)}) · ${rec.readings.toLocaleString()} hourly readings`;
    $("#predict-month-label").textContent = `${mName} 2023`;
    $("#reveal-panel").classList.add("hidden");
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
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#5eb8ff").attr("stop-opacity", 0.45);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#5eb8ff").attr("stop-opacity", 0);

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
      lg.append("text").attr("x", 20).attr("y", 8).attr("fill", "#7a8699").attr("font-size", 10).text(s.label);
    });
  }

  function renderHourlyChart(selector, hourly) {
    const el = d3.select(selector);
    el.selectAll("*").remove();
    if (!hourly.length) {
      el.append("p").attr("fill", "#7a8699").text("No hourly data for this month.");
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

  /* ─── Predict / draw ─── */
  function setupPredictChart(viewYear, viewMonth) {
    const wrap = $("#predict-wrap");
    const canvas = $("#predict-canvas");
    const svg = d3.select("#predict-grid");
    svg.selectAll("*").remove();

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const margin = { top: 24, right: 20, bottom: 40, left: 48 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    canvas.width = W;
    canvas.height = H;

    const viewDaily = dailySeries(viewYear, viewMonth);
    const actual2023 = dailySeries(2023, viewMonth);
    const maxDay = Math.max(
      28,
      d3.max(viewDaily, (d) => d.day) || 30,
      d3.max(actual2023, (d) => d.day) || 0
    );

    const yMax = Math.max(
      500,
      d3.max(viewDaily, (d) => d.aqi) || 0,
      d3.max(actual2023, (d) => d.aqi) || 0,
      300
    );

    const x = d3.scaleLinear().domain([1, maxDay]).range([margin.left, margin.left + w]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([margin.top + h, margin.top]);

    state.predictScales = { x, y, maxDay, margin, W, H, viewYear, viewMonth };

    const g = svg
      .attr("width", W)
      .attr("height", H)
      .append("g");

    g.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(
        d3
          .axisLeft(y)
          .tickSize(-w)
          .tickFormat("")
          .ticks(5)
      )
      .call((g) => g.select(".domain").remove());

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${margin.top + h})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `Day ${d}`));

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

    g.append("text")
      .attr("x", margin.left)
      .attr("y", 14)
      .attr("fill", "#5eb8ff")
      .attr("font-size", 10)
      .text("AQI (draw your 2023 forecast)");

    // Ghost: 2020/view year as reference
    if (viewDaily.length) {
      const line = d3
        .line()
        .x((d) => x(d.day))
        .y((d) => y(d.aqi))
        .curve(d3.curveMonotoneX);
      g.append("path")
        .datum(viewDaily)
        .attr("fill", "none")
        .attr("stroke", "rgba(94,184,255,0.25)")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4,4")
        .attr("d", line);
    }

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    function canvasPoint(evt) {
      const rect = canvas.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * W;
      const py = ((evt.clientY - rect.top) / rect.height) * H;
      const day = x.invert(px);
      const aqi = y.invert(py);
      return {
        px,
        py,
        day: Math.max(1, Math.min(maxDay, day)),
        aqi: Math.max(0, Math.min(yMax, aqi)),
      };
    }

    function redrawUserLine() {
      ctx.clearRect(0, 0, W, H);
      const pts = state.drawPoints;
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = "#ffffff";
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

    canvas.onmousedown = (e) => {
      if (state.revealed) return;
      state.isDrawing = true;
      state.drawPoints = [canvasPoint(e)];
      redrawUserLine();
    };
    canvas.onmousemove = (e) => {
      if (!state.isDrawing || state.revealed) return;
      state.drawPoints.push(canvasPoint(e));
      redrawUserLine();
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

    $("#btn-finish").onclick = () => reveal2023(viewMonth, actual2023, x, y, margin, w, h);
  }

  function reveal2023(month, actual2023, x, y, margin, w, h) {
    state.revealed = true;
    $("#btn-finish").disabled = true;
    const panel = $("#reveal-panel");
    panel.classList.remove("hidden");

    const mName = MONTHS[month - 1];
    let note = "";
    let series = actual2023;
    let title = `Actual ${mName} 2023`;

    if (!actual2023.length) {
      const fallback = dailySeries(2022, month) || dailySeries(2021, month);
      series = fallback || [];
      title = `Actual ${mName} — best available record`;
      note =
        series.length > 0
          ? `No sensor data for ${mName} 2023 in this dataset (only Jan 2023 is recorded). Showing ${series === dailySeries(2022, month) ? "2022" : "2021"} instead.`
          : "No 2023 data available for this month in the dataset.";
    }

    $("#reveal-title").textContent = title;
    $("#reveal-note").textContent = note;

    const el = d3.select("#chart-reveal");
    el.selectAll("*").remove();
    if (!series.length) return;

    const W = el.node().clientWidth || 800;
    const H = 220;
    const svg = el.append("svg").attr("width", W).attr("height", H);
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

    const g = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    g.append("g")
      .attr("class", "grid")
      .call(d3.axisLeft(y2).tickSize(-iw).tickFormat("").ticks(5))
      .call((g) => g.select(".domain").remove());

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

  /* ─── Year slider / play ─── */
  function bindControls() {
    const slider = $("#year-slider");
    slider.min = DATA.years[0];
    slider.max = DATA.years[DATA.years.length - 1];
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
      const years = DATA.years;
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

  loadData().catch((err) => {
    console.error(err);
    $("#loader").innerHTML = "<p style='color:#d45d52;padding:2rem'>Failed to load data. Run a local server from delhi-dashboard/</p>";
  });
})();
