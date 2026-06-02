/**
 * Delhi AQI Dashboard — radial calendar, drill-down, 2026 forecast
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
  };

  const $ = (sel) => document.querySelector(sel);
  const viewHome = $("#view-home");
  const viewDetail = $("#view-detail");

  /* ─── Load data ─── */
  async function loadData() {
    const fill = $("#loader-fill");
    if (fill) fill.style.width = "30%";
    const res = await fetch("data/delhi_aqi.json");
    DATA = await res.json();
    if (fill) fill.style.width = "100%";

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

  function forecast2026(month) {
    return DATA?.forecast2026?.[String(month)] ?? null;
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

    renderDetailCharts(year, month);
    setupForecastChart(year, month);
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
      .text("historical reference");
  }

  function addForecastLineLabel(g, x, y, viewMonth, fc, margin, w) {
    if (!fc.daily?.length) return;
    const anchor = fc.daily.reduce((best, d) => (d.aqi > best.aqi ? d : best), fc.daily[0]);
    const ax = x(anchor.day);
    const ay = y(anchor.aqi);
    const mName = MONTHS[viewMonth - 1];
    const fcYear = fc.year ?? 2026;
    const labelG = g.append("g").attr("class", "fc-line-label");
    const boxW = 138;
    const boxH = 34;
    let lx = ax - boxW / 2;
    let ly = ay - boxH - 12;
    lx = Math.max(margin.left, Math.min(margin.left + w - boxW, lx));
    ly = Math.max(margin.top + 4, ly);

    labelG
      .append("rect")
      .attr("x", lx)
      .attr("y", ly)
      .attr("width", boxW)
      .attr("height", boxH)
      .attr("rx", 5)
      .attr("fill", "rgba(42,40,38,0.92)")
      .attr("stroke", "rgba(200,205,212,0.45)");

    labelG
      .append("text")
      .attr("x", lx + boxW / 2)
      .attr("y", ly + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "#e8eaed")
      .attr("font-size", 11)
      .attr("font-weight", "600")
      .text(`${mName} ${fcYear} (model)`);

    labelG
      .append("text")
      .attr("x", lx + boxW / 2)
      .attr("y", ly + 27)
      .attr("text-anchor", "middle")
      .attr("fill", "rgba(180,170,210,0.9)")
      .attr("font-size", 9)
      .text("linear trend forecast");
  }

  function renderModelStats(viewMonth, fc) {
    const el = $("#model-stats");
    const mName = MONTHS[viewMonth - 1];
    if (!fc) {
      el.innerHTML = `<p>No model forecast for <strong>${mName}</strong> — not enough historical months in the dataset.</p>`;
      return;
    }
    const years = fc.trainingYears.join(", ");
    const aqis = fc.trainingAqi.join(", ");
    const r2txt = fc.r2 != null ? `R² = ${fc.r2}` : "single-year estimate";
    const shapeNote = fc.shapeFromYear
      ? `Daily shape scaled from <strong>${fc.shapeFromYear}</strong> to match predicted monthly mean.`
      : "";
    el.innerHTML = `
      <p>Predicted mean AQI for <strong>${mName} ${fc.year}</strong>: <strong>${fc.monthlyAqi}</strong> (${labelForBin(fc.bin)})</p>
      <p>Trained on monthly means for years <strong>${years}</strong> → AQI: ${aqis}. ${r2txt}.</p>
      <p class="model-eq">AQI ≈ ${fc.intercept} + ${fc.slope} × year</p>
      <p>${shapeNote}</p>
    `;
  }

  /* ─── 2026 model forecast chart ─── */
  function setupForecastChart(viewYear, viewMonth) {
    const wrap = $("#predict-wrap");
    const svg = d3.select("#predict-grid");
    svg.selectAll("*").remove();

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const margin = { top: 28, right: 24, bottom: 40, left: 48 };
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const viewDaily = dailySeries(viewYear, viewMonth);
    const fc = forecast2026(viewMonth);
    renderModelStats(viewMonth, fc);

    const fcDaily = fc?.daily ?? [];
    const maxDay = Math.max(
      28,
      d3.max(viewDaily, (d) => d.day) || 30,
      d3.max(fcDaily, (d) => d.day) || 30
    );

    const yMax = Math.max(
      500,
      d3.max(viewDaily, (d) => d.aqi) || 0,
      d3.max(fcDaily, (d) => d.aqi) || 0,
      fc?.monthlyAqi || 0,
      300
    );

    const x = d3.scaleLinear().domain([1, maxDay]).range([margin.left, margin.left + w]);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([margin.top + h, margin.top]);

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

    if (fcDaily.length) {
      g.append("path")
        .datum(fcDaily)
        .attr("class", "line-forecast")
        .attr("d", line);
      addForecastLineLabel(g, x, y, viewMonth, fc, margin, w);
    }
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
        setupForecastChart(year, month);
      }
    });
  }

  loadData().catch((err) => {
    console.error(err);
    $("#loader").innerHTML = "<p style='color:#d45d52;padding:2rem'>Failed to load data. Run a local server from delhi-dashboard/</p>";
  });
})();
