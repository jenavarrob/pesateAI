(() => {
  const DAY = 86400000,
    MAX_DAYS = 180;
  const keys = {
    timeline: "pesate.timeline.v1",
    weights: "pesate.weights.v1",
    foods: "pesate.foods.v1",
    activities: "pesate.activities.v1",
  };
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  };
  const write = (key, value) =>
    localStorage.setItem(key, JSON.stringify(value));
  const localDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const parseDate = (value) => new Date(`${value}T00:00:00`);
  const addDays = (date, days) => new Date(date.getTime() + days * DAY);
  const dayDiff = (start, end) =>
    Math.round((parseDate(end) - parseDate(start)) / DAY);
  const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>'"]/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char],
    );

  let weights = read(keys.weights),
    foods = read(keys.foods),
    activities = read(keys.activities);
  const today = new Date(),
    defaultStart = new Date(today.getFullYear(), today.getMonth(), 1),
    defaultEnd = addDays(defaultStart, 121);
  const savedTimeline = read(keys.timeline);
  let timeline = {
    start: savedTimeline.start || localDate(defaultStart),
    end: savedTimeline.end || localDate(defaultEnd),
  };

  const style = document.createElement("style");
  style.textContent =
    ".tracking-card{margin:0 0 20px}.tracking-fields{display:grid;grid-template-columns:repeat(3,minmax(130px,1fr));gap:12px;align-items:end}.tracking-fields label span{display:block;color:#728091;font-size:11px;margin-bottom:6px}.tracking-fields input{width:100%;padding:10px;border:1px solid #dce3e8;border-radius:5px}.tracking-table-wrap{max-height:220px;overflow-y:auto;margin-top:14px;border:1px solid #e6ebef;border-radius:6px}.tracking-table{width:100%;border-collapse:collapse}.tracking-table th{position:sticky;top:0;background:#edf3f8;text-align:left;padding:8px}.tracking-table td{padding:8px;border-top:1px solid #e6ebef}.delete-entry{border:0;background:transparent;color:#b23b46;cursor:pointer}.history-chart{width:100%;display:block;margin-top:12px}.history-card{margin-top:20px}.tracking-legend{display:flex;gap:14px;flex-wrap:wrap;color:#728091;font-size:11px;margin-bottom:5px}.tracking-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.date-entry{margin:0 0 18px;max-width:240px}.date-entry span{display:block;color:#728091;font-size:11px;margin-bottom:6px}.date-entry input{width:100%;padding:10px;border:1px solid #dce3e8;border-radius:5px}.range-error{color:#b23b46;font-size:12px}.weight-source{background:#e7f0ff;color:#1d64bc;padding:10px 12px;border-radius:6px;margin:12px 0}@media(max-width:650px){.tracking-fields{grid-template-columns:1fr}}";
  document.head.appendChild(style);

  const modelView = document.getElementById("model-view"),
    modelLayout = modelView.querySelector(".layout");
  const tracker = document.createElement("section");
  tracker.className = "card tracking-card";
  tracker.innerHTML =
    '<div class="eyebrow">LÍNEA TEMPORAL · MÁXIMO 180 DÍAS</div><h2>Seguimiento y peso medido</h2><div class="tracking-fields"><label><span>Fecha inicial</span><input id="timeline-start" type="date"></label><label><span>Fecha final</span><input id="timeline-end" type="date"></label><div><p id="timeline-message" class="hint">Se permiten datos dispersos; no es necesario informar todos los días.</p></div></div><hr><h3>Registrar peso medido</h3><div class="tracking-fields"><label><span>Fecha</span><input id="measurement-date" type="date"></label><label><span>Peso medido (kg)</span><input id="measurement-weight" type="number" min="20" max="400" step="0.1"></label><button id="add-measurement" class="primary" type="button">Añadir medición</button></div><div class="tracking-table-wrap"><table class="tracking-table"><thead><tr><th>Fecha</th><th>Peso (kg)</th><th></th></tr></thead><tbody id="measurement-list"></tbody></table></div>';
  modelView.insertBefore(tracker, modelLayout);
  const startInput = document.getElementById("timeline-start"),
    endInput = document.getElementById("timeline-end"),
    timelineMessage = document.getElementById("timeline-message"),
    measurementDate = document.getElementById("measurement-date"),
    measurementWeight = document.getElementById("measurement-weight"),
    measurementList = document.getElementById("measurement-list");
  startInput.value = timeline.start;
  endInput.value = timeline.end;
  measurementWeight.value = document.getElementById("weight").value;

  const intakeTab = document.getElementById("intake-tab"),
    intakeHeading = document.querySelector("#intake-view h1"),
    intakeCard = document.querySelector("#intake-view .intake-card");
  intakeTab.textContent = "Alimentos";
  if (intakeHeading) intakeHeading.textContent = "Alimentos";
  const foodDateBlock = document.createElement("label");
  foodDateBlock.className = "date-entry";
  foodDateBlock.innerHTML =
    '<span>Fecha de la ingesta</span><input id="food-entry-date" type="date">';
  intakeCard.insertBefore(foodDateBlock, intakeCard.firstChild);
  const foodHistory = document.createElement("section");
  foodHistory.className = "history-card";
  foodHistory.innerHTML =
    '<hr><div class="eyebrow">HISTORIAL</div><h2>Energía ingerida por día</h2><canvas id="food-history-chart" class="history-chart" height="230"></canvas><div id="food-history-list" class="tracking-table-wrap"></div>';
  intakeCard.appendChild(foodHistory);

  const activityCard = document.querySelector("#activity-view .intake-card"),
    activityWeight = document.getElementById("activity-weight");
  if (activityWeight?.closest("label"))
    activityWeight.closest("label").remove();
  const activityDateBlock = document.createElement("label");
  activityDateBlock.className = "date-entry";
  activityDateBlock.innerHTML =
    '<span>Fecha de la actividad</span><input id="activity-entry-date" type="date">';
  activityCard.insertBefore(
    activityDateBlock,
    activityCard.querySelector(".form-grid"),
  );
  const source = document.createElement("p");
  source.className = "weight-source";
  source.innerHTML =
    'Peso utilizado desde “Peso inicial”: <strong id="activity-source-weight"></strong> kg';
  activityCard.insertBefore(source, activityCard.querySelector(".form-grid"));
  const activityHistory = document.createElement("section");
  activityHistory.className = "history-card";
  activityHistory.innerHTML =
    '<hr><div class="eyebrow">HISTORIAL</div><h2>Actividad registrada por día</h2><canvas id="activity-history-chart" class="history-chart" height="230"></canvas><div id="activity-history-list" class="tracking-table-wrap"></div>';
  activityCard.appendChild(activityHistory);
  const foodDate = document.getElementById("food-entry-date"),
    activityDate = document.getElementById("activity-entry-date");

  function validDateForRange(value) {
    return value >= timeline.start && value <= timeline.end;
  }

  function preferredEntryDate() {
    const current = localDate(new Date());
    return validDateForRange(current) ? current : timeline.start;
  }

  function applyRange() {
    let days = dayDiff(startInput.value, endInput.value);
    timelineMessage.className = "hint";
    if (!startInput.value || !endInput.value || days < 0) {
      endInput.value = startInput.value;
      days = 0;
    }
    if (days >= MAX_DAYS) {
      endInput.value = localDate(
        addDays(parseDate(startInput.value), MAX_DAYS - 1),
      );
      days = MAX_DAYS - 1;
      timelineMessage.textContent =
        "La fecha final se ajustó para respetar el máximo de 180 días.";
      timelineMessage.className = "range-error";
    } else {
      timelineMessage.textContent =
        "Se permiten datos dispersos; no es necesario informar todos los días.";
    }
    timeline = { start: startInput.value, end: endInput.value };
    write(keys.timeline, timeline);
    endInput.min = timeline.start;
    endInput.max = localDate(addDays(parseDate(timeline.start), MAX_DAYS - 1));
    [measurementDate, foodDate, activityDate].forEach((input) => {
      input.min = timeline.start;
      input.max = timeline.end;
      if (!validDateForRange(input.value)) input.value = preferredEntryDate();
    });
    document.getElementById("days").value = Math.max(1, days);
    document.getElementById("activity-source-weight").textContent = Number(
      document.getElementById("weight").value,
    ).toFixed(2);
    redrawAll();
  }
  startInput.onchange = applyRange;
  endInput.onchange = applyRange;
  measurementDate.value =
    foodDate.value =
    activityDate.value =
      preferredEntryDate();

  function renderWeights() {
    const rows = weights.slice().sort((a, b) => a.date.localeCompare(b.date));
    measurementList.innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              `<tr><td>${esc(row.date)}</td><td>${Number(row.kg).toFixed(2)}</td><td><button class="delete-entry" data-id="${esc(row.id)}">Eliminar</button></td></tr>`,
          )
          .join("")
      : '<tr><td colspan="3" class="hint">Todavía no hay pesos medidos.</td></tr>';
    measurementList.querySelectorAll(".delete-entry").forEach(
      (button) =>
        (button.onclick = () => {
          weights = weights.filter((row) => row.id !== button.dataset.id);
          write(keys.weights, weights);
          renderWeights();
          drawBodyChart();
        }),
    );
  }

  document.getElementById("add-measurement").onclick = () => {
    const date = measurementDate.value,
      kg = Number(measurementWeight.value);
    if (!validDateForRange(date) || !Number.isFinite(kg) || kg <= 0) return;
    const existing = weights.find((row) => row.date === date);
    if (existing) existing.kg = kg;
    else weights.push({ id: id(), date, kg });
    write(keys.weights, weights);
    renderWeights();
    drawBodyChart();
  };

  function setupCanvas(canvas) {
    const width = Math.max(canvas.clientWidth, 320),
      height = canvas.height,
      dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const context = canvas.getContext("2d");
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }

  function drawTimeChart(canvas, points, color, label) {
    const { context: ctx, width, height } = setupCanvas(canvas),
      p = { l: 52, r: 18, t: 22, b: 35 },
      cw = width - p.l - p.r,
      ch = height - p.t - p.b;
    ctx.font = "11px system-ui";
    ctx.fillStyle = "#728091";
    ctx.strokeStyle = "#e6ebef";
    if (!points.length) {
      ctx.fillText("Sin datos registrados en este intervalo", p.l, p.t + 25);
      return;
    }
    const values = points.map((point) => point.value),
      min = Math.min(0, ...values),
      max = Math.max(...values, 1),
      span = max - min || 1;
    for (let i = 0; i < 5; i++) {
      const y = p.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(width - p.r, y);
      ctx.stroke();
      ctx.fillText((max - (span * i) / 4).toFixed(2), 4, y + 4); //.toFixed(max < 1 ? 3 : 0), 4, y + 4);
    }
    ctx.fillText(label, 4, 12);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x =
          p.l +
          (cw * dayDiff(timeline.start, point.date)) /
            Math.max(1, dayDiff(timeline.start, timeline.end)),
        y = p.t + ch * (1 - (point.value - min) / span);
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    points.forEach((point) => {
      const x =
          p.l +
          (cw * dayDiff(timeline.start, point.date)) /
            Math.max(1, dayDiff(timeline.start, timeline.end)),
        y = p.t + ch * (1 - (point.value - min) / span);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#728091";
    ctx.fillText(timeline.start, p.l, height - 8);
    ctx.fillText(timeline.end, width - p.r - 70, height - 8);
  }

  function drawBodyChart() {
    const canvas = document.getElementById("body-chart");
    if (!canvas || canvas.clientWidth < 10) return;
    const projection = calculateProjection(readInputs()),
      measured = weights
        .filter((row) => validDateForRange(row.date))
        .sort((a, b) => a.date.localeCompare(b.date)),
      all = [
        ...projection.points.flatMap((point) => [
          point.weight,
          point.fat,
          point.lean,
        ]),
        ...measured.map((row) => Number(row.kg)),
      ],
      min = Math.min(...all),
      max = Math.max(...all),
      margin = Math.max(1, (max - min) * 0.08),
      lo = min - margin,
      hi = max + margin,
      span = hi - lo;
    const { context: ctx, width, height } = setupCanvas(canvas),
      p = { l: 48, r: 18, t: 22, b: 35 },
      cw = width - p.l - p.r,
      ch = height - p.t - p.b,
      range = Math.max(1, dayDiff(timeline.start, timeline.end));
    ctx.font = "11px system-ui";
    ctx.fillStyle = "#728091";
    ctx.strokeStyle = "#e6ebef";
    for (let i = 0; i < 5; i++) {
      const y = p.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(width - p.r, y);
      ctx.stroke();
      ctx.fillText((hi - (span * i) / 4).toFixed(1), 4, y + 4);
    }
    const series = [
      ["weight", "#16a68a"],
      ["fat", "#e15b64"],
      ["lean", "#8c6bd1"],
    ];
    series.forEach(([key, color]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      projection.points.forEach((point, index) => {
        const x = p.l + (cw * point.day) / range,
          y = p.t + ch * (1 - (point[key] - lo) / span);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    if (measured.length) {
      ctx.strokeStyle = "#172331";
      ctx.fillStyle = "#172331";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      measured.forEach((row, index) => {
        const x = p.l + (cw * dayDiff(timeline.start, row.date)) / range,
          y = p.t + ch * (1 - (Number(row.kg) - lo) / span);
        index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      measured.forEach((row) => {
        const x = p.l + (cw * dayDiff(timeline.start, row.date)) / range,
          y = p.t + ch * (1 - (Number(row.kg) - lo) / span);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = "#728091";
    ctx.fillText(timeline.start, p.l, height - 8);
    ctx.fillText(timeline.end, width - p.r - 70, height - 8);
    let legend = canvas.parentElement.querySelector(".tracking-legend");
    if (!legend) {
      legend = document.createElement("div");
      legend.className = "tracking-legend";
      canvas.parentElement.insertBefore(legend, canvas);
    }
    legend.innerHTML =
      '<span><i style="background:#16a68a"></i>Peso simulado</span><span><i style="background:#e15b64"></i>Grasa</span><span><i style="background:#8c6bd1"></i>Libre de grasa</span><span><i style="background:#172331"></i>Peso medido</span>';
  }

  function renderFood() {
    const selected = foods
      .filter((row) => row.date === foodDate.value)
      .reduce((sum, row) => sum + Number(row.totalKcal), 0);
    document.getElementById("manual-total").textContent = Number.isInteger(
      selected,
    )
      ? selected
      : selected.toFixed(1);
    const daily = new Map();
    foods
      .filter((row) => validDateForRange(row.date))
      .forEach((row) =>
        daily.set(row.date, (daily.get(row.date) || 0) + Number(row.totalKcal)),
      );
    drawTimeChart(
      document.getElementById("food-history-chart"),
      [...daily].sort().map(([date, value]) => ({ date, value })),
      "#2776db",
      "kcal",
    );
    const visible = foods
      .filter((row) => validDateForRange(row.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    document.getElementById("food-history-list").innerHTML = visible.length
      ? `<table class="tracking-table"><thead><tr><th>Fecha</th><th>Alimento</th><th>Cantidad</th><th>kcal</th><th></th></tr></thead><tbody>${visible.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(row.name)}</td><td>${esc(row.quantity != null ? String(row.quantity) + " " + (row.unit || "") : row.cups)}</td><td>${Math.round(row.totalKcal)}</td><td><button class="delete-entry" data-id="${esc(row.id)}">Eliminar</button></td></tr>`).join("")}</tbody></table>`
      : '<p class="hint" style="padding:10px">Sin alimentos registrados.</p>';
    document.querySelectorAll("#food-history-list .delete-entry").forEach(
      (button) =>
        (button.onclick = () => {
          foods = foods.filter((row) => row.id !== button.dataset.id);
          write(keys.foods, foods);
          renderFood();
        }),
    );
  }

  function renderActivity() {
    document.getElementById("activity-source-weight").textContent = Number(
      document.getElementById("weight").value,
    ).toFixed(2);
    const selected = activities
      .filter((row) => row.date === activityDate.value)
      .reduce((sum, row) => sum + Number(row.totalKcal), 0);
    document.getElementById("activity-total").textContent =
      Math.round(selected);
    const grouped = new Map();
    activities
      .filter((row) => validDateForRange(row.date))
      .forEach((row) => {
        const current = grouped.get(row.date) || { weighted: 0, minutes: 0 };
        current.weighted += Number(row.kcalKgMin) * Number(row.minutes);
        current.minutes += Number(row.minutes);
        grouped.set(row.date, current);
      });
    const points = [...grouped].sort().map(([date, data]) => ({
      date,
      value: data.minutes ? data.weighted / data.minutes : 0,
    }));
    drawTimeChart(
      document.getElementById("activity-history-chart"),
      points,
      "#f39a42",
      "kcal/kg/min",
    );
    const visible = activities
      .filter((row) => validDateForRange(row.date))
      .sort((a, b) => b.date.localeCompare(a.date));
    document.getElementById("activity-history-list").innerHTML = visible.length
      ? `<table class="tracking-table"><thead><tr><th>Fecha</th><th>Actividad</th><th>Min</th><th>kcal/kg/min</th><th></th></tr></thead><tbody>${visible.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(row.activity)}</td><td>${row.minutes}</td><td>${Number(row.kcalKgMin).toFixed(2)}</td><td><button class="delete-entry" data-id="${esc(row.id)}">Eliminar</button></td></tr>`).join("")}</tbody></table>`
      : '<p class="hint" style="padding:10px">Sin actividades registradas.</p>';
    document.querySelectorAll("#activity-history-list .delete-entry").forEach(
      (button) =>
        (button.onclick = () => {
          activities = activities.filter((row) => row.id !== button.dataset.id);
          write(keys.activities, activities);
          renderActivity();
        }),
    );
  }

  document.addEventListener("pesate:food-added", (event) => {
    foods.push({ id: id(), ...event.detail });
    write(keys.foods, foods);
    renderFood();
  });

  document.addEventListener("pesate:activity-added", (event) => {
    activities.push({ id: id(), ...event.detail });
    write(keys.activities, activities);
    renderActivity();
  });

  foodDate.onchange = renderFood;
  activityDate.onchange = renderActivity;
  document.getElementById("weight").addEventListener("input", () => {
    measurementWeight.value = document.getElementById("weight").value;
    renderActivity();
  });
  const calculate = document.getElementById("calculate"),
    originalCalculate = calculate.onclick;
  calculate.onclick = () => {
    if (originalCalculate) originalCalculate();
    drawBodyChart();
  };

  function redrawAll() {
    if (typeof run === "function") run();
    renderWeights();
    drawBodyChart();
    renderFood();
    renderActivity();
  }

  document
    .getElementById("model-tab")
    .addEventListener("click", () => setTimeout(drawBodyChart));
  intakeTab.addEventListener("click", () => setTimeout(renderFood));
  document
    .getElementById("activity-tab")
    .addEventListener("click", () => setTimeout(renderActivity));
  window.addEventListener("resize", () =>
    setTimeout(() => {
      drawBodyChart();
      renderFood();
      renderActivity();
    }),
  );
  applyRange();
})();
