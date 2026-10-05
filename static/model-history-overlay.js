(() => {
  const DAY = 86400000;
  const canvas = document.getElementById("energy-chart");
  const calculateButton = document.getElementById("calculate");
  const modelTab = document.getElementById("model-tab");
  if (!canvas || !calculateButton) return;
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  };
  const parseDate = (value) => new Date(`${value}T00:00:00`);
  const dayDiff = (start, end) =>
    Math.round((parseDate(end) - parseDate(start)) / DAY);
  const timeline = () => {
    const saved = read("pesate.timeline.v1");
    return {
      start: document.getElementById("timeline-start")?.value || saved.start,
      end: document.getElementById("timeline-end")?.value || saved.end,
    };
  };
  const groupSum = (rows, key) => {
    const grouped = new Map();
    rows.forEach((row) =>
      grouped.set(
        row.date,
        (grouped.get(row.date) || 0) + Number(row[key] || 0),
      ),
    );
    return grouped;
  };
  function setup() {
    const width = Math.max(canvas.clientWidth, 360),
      height = canvas.height,
      dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const context = canvas.getContext("2d");
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  }
  function extent(values, padding, minFloor) {
    let min = Math.min(...values),
      max = Math.max(...values);
    if (minFloor != null) min = Math.max(minFloor, min);
    let span = max - min;
    if (!span) span = Math.max(Math.abs(max) * 0.1, 0.1);
    return { min: min - span * padding, max: max + span * padding };
  }
  function drawSeries(
    ctx,
    points,
    xFor,
    yFor,
    color,
    dashed = false,
    dots = false,
  ) {
    if (!points.length) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = dots ? 2.5 : 2;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = xFor(point),
        y = yFor(point.value);
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    if (points.length > 1) ctx.stroke();
    ctx.setLineDash([]);
    if (dots || points.length === 1)
      points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(xFor(point), yFor(point.value), 4, 0, Math.PI * 2);
        ctx.fill();
      });
  }
  function draw() {
    if (canvas.clientWidth < 10) return;
    const range = timeline();
    if (!range.start || !range.end) return;
    const days = Math.max(1, dayDiff(range.start, range.end)),
      input = readInputs(),
      projection = calculateProjection(input),
      foods = read("pesate.foods.v1").filter(
        (row) => row.date >= range.start && row.date <= range.end,
      ),
      activities = read("pesate.activities.v1").filter(
        (row) => row.date >= range.start && row.date <= range.end,
      ),
      foodDaily = groupSum(foods, "totalKcal"),
      activityDaily = groupSum(activities, "totalKcal"),
      plannedIntake = projection.points.map((point) => ({
        day: point.day,
        value: point.intake,
      })),
      plannedPal = projection.points.map((point) => ({
        day: point.day,
        value: point.pal,
      })),
      recordedIntake = [...foodDaily]
        .sort()
        .map(([date, value]) => ({ date, value })),
      recordedPal = [...activityDaily].sort().map(([date, value]) => {
        const day = Math.max(0, Math.min(days, dayDiff(range.start, date))),
          planned =
            projection.points[Math.min(day, projection.points.length - 1)]
              ?.pal ?? input.pal;
        return { date, value: planned + value / projection.bmr };
      });
    const leftValues = [
        ...plannedIntake.map((point) => point.value),
        ...recordedIntake.map((point) => point.value),
      ],
      rightValues = [
        ...plannedPal.map((point) => point.value),
        ...recordedPal.map((point) => point.value),
      ],
      left = extent(leftValues, 0.08, 0),
      right = extent(rightValues, 0.12, 0),
      { context: ctx, width, height } = setup(),
      p = { l: 55, r: 55, t: 20, b: 38 },
      cw = width - p.l - p.r,
      ch = height - p.t - p.b,
      xDay = (day) => p.l + (cw * day) / days,
      xDate = (date) =>
        xDay(Math.max(0, Math.min(days, dayDiff(range.start, date)))),
      yLeft = (value) =>
        p.t + ch * (1 - (value - left.min) / (left.max - left.min)),
      yRight = (value) =>
        p.t + ch * (1 - (value - right.min) / (right.max - right.min));
    ctx.font = "11px system-ui";
    ctx.strokeStyle = "#e6ebef";
    ctx.fillStyle = "#728091";
    for (let index = 0; index < 5; index++) {
      const y = p.t + (ch * index) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(width - p.r, y);
      ctx.stroke();
      ctx.fillText(
        Math.round(left.max - ((left.max - left.min) * index) / 4),
        4,
        y + 4,
      );
      ctx.fillText(
        (right.max - ((right.max - right.min) * index) / 4).toFixed(2),
        width - p.r + 7,
        y + 4,
      );
    }
    ctx.fillText("kcal/día", 4, 12);
    ctx.fillText("PAL", width - p.r + 7, 12);
    drawSeries(
      ctx,
      plannedIntake,
      (point) => xDay(point.day),
      yLeft,
      "#2776db",
    );
    drawSeries(ctx, plannedPal, (point) => xDay(point.day), yRight, "#f39a42");
    drawSeries(
      ctx,
      recordedIntake,
      (point) => xDate(point.date),
      yLeft,
      "#0b3d91",
      true,
      true,
    );
    drawSeries(
      ctx,
      recordedPal,
      (point) => xDate(point.date),
      yRight,
      "#d24f45",
      true,
      true,
    );
    ctx.fillStyle = "#728091";
    ctx.fillText(range.start, p.l, height - 9);
    ctx.fillText(range.end, width - p.r - 70, height - 9);
    let legend = canvas.parentElement.querySelector(".model-energy-legend");
    if (!legend) {
      legend = document.createElement("div");
      legend.className = "tracking-legend model-energy-legend";
      canvas.parentElement.insertBefore(legend, canvas);
      const note = document.createElement("p");
      note.className = "hint model-energy-note";
      note.textContent =
        "PAL registrado estimado = PAL planificado + kcal de actividad ÷ metabolismo basal.";
      canvas.insertAdjacentElement("afterend", note);
    }
    legend.innerHTML =
      '<span><i style="background:#2776db"></i>Ingesta planificada</span><span><i style="background:#0b3d91"></i>Alimentos registrados</span><span><i style="background:#f39a42"></i>PAL planificado</span><span><i style="background:#d24f45"></i>Actividad registrada (PAL estimado)</span>';
  }
  calculateButton.addEventListener("click", () => setTimeout(draw));
  modelTab.addEventListener("click", () => setTimeout(draw));
  document.addEventListener("pesate:food-added", () => setTimeout(draw));
  document.addEventListener("pesate:activity-added", () => setTimeout(draw));
  document
    .getElementById("timeline-start")
    ?.addEventListener("change", () => setTimeout(draw));
  document
    .getElementById("timeline-end")
    ?.addEventListener("change", () => setTimeout(draw));
  window.addEventListener("resize", () => setTimeout(draw));
  ["food-history-list", "activity-history-list"].forEach((id) => {
    const node = document.getElementById(id);
    if (node)
      new MutationObserver(() => setTimeout(draw)).observe(node, {
        childList: true,
        subtree: true,
      });
  });
  setTimeout(draw);
})();
