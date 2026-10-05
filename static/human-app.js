const $ = (id) => document.getElementById(id);
const translations = {
  es: {
    subtitle: "MODELO PERSONAL DE PESO",
    mvp: "MVP · MODELO DE 2 COMPARTIMENTOS",
    eyebrow: "HERRAMIENTA INTERACTIVA",
    title: "Explora tu evolución de peso",
    intro:
      "Ajusta tu ingesta energética y actividad física para visualizar una posible evolución de peso, masa grasa y masa libre de grasa.",
    energyBalance: "balance energético",
    yourData: "TUS DATOS",
    profile: "Perfil inicial",
    sex: "Sexo",
    female: "Mujer",
    male: "Hombre",
    age: "Edad",
    height: "Altura (cm)",
    weight: "Peso inicial (kg)",
    fatPercent: "Grasa inicial (%)",
    scenario: "ESCENARIO",
    intake: "Ingesta actual (kcal/día)",
    pal: "Actividad (PAL)",
    days: "Horizonte (días)",
    interventionIntake: "Ingesta intervención",
    interventionPal: "PAL intervención",
    calculate: "Calcular proyección",
    note: "Estimación educativa, no consejo médico. El modelo usa una aproximación simplificada para este MVP.",
    finalWeight: "Peso final estimado",
    fatMass: "Masa grasa final",
    leanMass: "Masa libre de grasa",
    dailyNeed: "Gasto estimado",
    energyChart: "ENERGÍA Y ACTIVIDAD",
    energyHistory: "Historia de ingesta y actividad",
    intakeLegend: "Ingesta",
    bodyChart: "CUERPO",
    bodyHistory: "Historia de composición corporal",
    weightLegend: "Peso",
    fatLegend: "Grasa",
    leanLegend: "Libre de grasa",
    leftAxisKcal: "Izquierda: kcal/día",
    rightAxisPal: "Derecha: PAL",
    leftAxisKg: "Izquierda: kg",
    timeline: "Línea temporal en días",
    disclaimer:
      "Las proyecciones son orientativas. El peso real depende de muchos factores y debe interpretarse junto con un profesional de la salud.",
  },
  en: {
    subtitle: "PERSONAL WEIGHT MODEL",
    mvp: "MVP · TWO-COMPARTMENT MODEL",
    eyebrow: "INTERACTIVE TOOL",
    title: "Explore your weight journey",
    intro:
      "Adjust energy intake and physical activity to visualize a possible trajectory for body weight, fat mass, and fat-free mass.",
    energyBalance: "energy balance",
    yourData: "YOUR DATA",
    profile: "Starting profile",
    sex: "Sex",
    female: "Female",
    male: "Male",
    age: "Age",
    height: "Height (cm)",
    weight: "Starting weight (kg)",
    fatPercent: "Starting fat (%)",
    scenario: "SCENARIO",
    intake: "Current intake (kcal/day)",
    pal: "Activity (PAL)",
    days: "Time horizon (days)",
    interventionIntake: "Intervention intake",
    interventionPal: "Intervention PAL",
    calculate: "Calculate projection",
    note: "Educational estimate, not medical advice. This MVP uses a simplified approximation.",
    finalWeight: "Estimated final weight",
    fatMass: "Final fat mass",
    leanMass: "Fat-free mass",
    dailyNeed: "Estimated expenditure",
    energyChart: "ENERGY AND ACTIVITY",
    energyHistory: "Intake and activity history",
    intakeLegend: "Intake",
    bodyChart: "BODY",
    bodyHistory: "Body composition history",
    weightLegend: "Weight",
    fatLegend: "Fat",
    leanLegend: "Fat-free",
    leftAxisKcal: "Left: kcal/day",
    rightAxisPal: "Right: PAL",
    leftAxisKg: "Left: kg",
    timeline: "Timeline in days",
    disclaimer:
      "Projections are indicative. Actual weight depends on many factors and should be interpreted with a health professional.",
  },
};
let lang = localStorage.getItem("pesate-language") || "es";
function applyLanguage() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (translations[lang][el.dataset.i18n])
      el.textContent = translations[lang][el.dataset.i18n];
  });
  $("language-toggle").textContent = lang === "es" ? "EN" : "ES";
}
$("language-toggle").onclick = () => {
  lang = lang === "es" ? "en" : "es";
  localStorage.setItem("pesate-language", lang);
  applyLanguage();
};
function readInputs() {
  return {
    sex: $("sex").value,
    age: +$("age").value,
    height: +$("height").value,
    weight: +$("weight").value,
    fat: +$("fat").value,
    intake: +$("intake").value,
    pal: +$("pal").value,
    days: +$("days").value,
    targetIntake: +$("target-intake").value,
    targetPal: +$("target-pal").value,
  };
}
function drawChart(canvas, series, keys, colors, leftLabel, rightLabel) {
  const ctx = canvas.getContext("2d"),
    w = canvas.clientWidth,
    h = canvas.height,
    dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const p = { l: 44, r: 44, t: 16, b: 30 },
    cw = w - p.l - p.r,
    ch = h - p.t - p.b;
  ctx.font = "11px system-ui";
  ctx.strokeStyle = "#e6ebef";
  ctx.fillStyle = "#778594";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = p.t + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillText(
      Math.round(series.min + (series.max - series.min) * (1 - i / 4)),
      5,
      y + 4,
    );
  }
  ctx.fillText(leftLabel, 5, 11);
  ctx.fillText(rightLabel, w - p.r - 25, 11);
  keys.forEach((key, idx) => {
    ctx.strokeStyle = colors[idx];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    series.points.forEach((v, i) => {
      const x = p.l + (cw * i) / (series.points.length - 1),
        y =
          p.t +
          ch * (1 - (v[key] - series.min) / (series.max - series.min || 1));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  ctx.fillStyle = "#778594";
  ctx.fillText("0", p.l, h - 8);
  ctx.fillText(String(series.points.at(-1).day), w - p.r - 18, h - 8);
}
function run() {
  const result = calculateProjection(readInputs()),
    f = result.final;
  $("out-weight").textContent = f.weight.toFixed(1);
  $("out-fat").textContent = f.fat.toFixed(1);
  $("out-lean").textContent = f.lean.toFixed(1);
  $("out-tdee").textContent = Math.round(result.interventionTdee);
  const eMin = Math.min(...result.points.map((x) => x.intake)),
    eMax = Math.max(...result.points.map((x) => x.intake));
  drawChart(
    $("energy-chart"),
    { points: result.points, min: eMin, max: eMax },
    ["intake", "pal"],
    ["#2776db", "#f39a42"],
    lang === "es" ? "kcal/día" : "kcal/day",
    "PAL",
  );
  const bVals = result.points.flatMap((x) => [x.weight, x.fat, x.lean]);
  drawChart(
    $("body-chart"),
    { points: result.points, min: Math.min(...bVals), max: Math.max(...bVals) },
    ["weight", "fat", "lean"],
    ["#16a68a", "#e15b64", "#8c6bd1"],
    "kg",
    "",
  );
}
$("calculate").onclick = run;
window.addEventListener("resize", run);
applyLanguage();
run();
function drawEnergyDual(points) {
  const canvas = $("energy-chart"),
    ctx = canvas.getContext("2d"),
    w = canvas.clientWidth,
    h = canvas.height,
    dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const p = { l: 44, r: 44, t: 16, b: 30 },
    cw = w - p.l - p.r,
    ch = h - p.t - p.b,
    ints = points.map((x) => x.intake),
    pals = points.map((x) => x.pal),
    minI = Math.min(...ints),
    maxI = Math.max(...ints),
    minP = Math.min(...pals),
    maxP = Math.max(...pals);
  ctx.font = "11px system-ui";
  ctx.strokeStyle = "#e6ebef";
  ctx.fillStyle = "#778594";
  for (let i = 0; i < 5; i++) {
    const y = p.t + (ch * i) / 4;
    ctx.beginPath();
    ctx.moveTo(p.l, y);
    ctx.lineTo(w - p.r, y);
    ctx.stroke();
    ctx.fillText(Math.round(maxI - ((maxI - minI) * i) / 4), 5, y + 4);
    ctx.fillText(
      (maxP - ((maxP - minP) * i) / 4).toFixed(2),
      w - p.r + 5,
      y + 4,
    );
  }
  ctx.fillText(lang === "es" ? "kcal/día" : "kcal/day", 5, 11);
  ctx.fillText("PAL", w - p.r - 10, 11);
  [
    ["intake", "#2776db", minI, maxI],
    ["pal", "#f39a42", minP, maxP],
  ].forEach(([key, color, min, max]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = p.l + (cw * i) / (points.length - 1),
        y = p.t + ch * (1 - (v[key] - min) / (max - min || 1));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
  ctx.fillStyle = "#778594";
  ctx.fillText("0", p.l, h - 8);
  ctx.fillText(String(points.at(-1).day), w - p.r - 18, h - 8);
}
const originalRun = run;
run = () => {
  originalRun();
  drawEnergyDual(calculateProjection(readInputs()).points);
};
run();
if (document.getElementById("intake-view")) {
  const intakeView = document.getElementById("intake-view"),
    uploadCard = intakeView.querySelector(".upload-card"),
    catalogue = document.createElement("div");
  catalogue.className = "card catalogue-card";
  catalogue.style.cssText = "margin-top:18px;max-width:820px";
  catalogue.innerHTML =
    '<div class="eyebrow">CATÁLOGO LOCAL</div><h2>Buscar alimento</h2><input id="food-search" type="search" placeholder="p. ej., arroz, manzana, pasta" style="width:100%;padding:10px;border:1px solid #dce3e8;border-radius:5px"><div id="food-results" style="margin-top:14px;color:#728091">Escribe al menos dos letras para buscar.</div><div style="border-top:1px solid #dce3e8;margin-top:18px;padding-top:14px;display:flex;justify-content:space-between"><span>Total añadido hoy</span><strong><span id="intake-total">0</span> kcal</strong></div>';
  uploadCard.parentNode.insertBefore(catalogue, uploadCard.nextSibling);
  const search = document.getElementById("food-search"),
    results = document.getElementById("food-results"),
    total = document.getElementById("intake-total");
  let dailyKcal = 0,
    searchTimer;
  function showResults(items) {
    if (!items.length) {
      results.textContent = "No se encontraron alimentos.";
      return;
    }
    results.innerHTML = items
      .map(
        (item, index) =>
          `<button style="display:block;width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #e6ebef;padding:12px 2px;cursor:pointer"><strong>${item.name}</strong><br><small>${item.kcal == null ? "kcal no disponible" : item.kcal + " kcal"} · ${item.source}</small></button>`,
      )
      .join("");
    results.querySelectorAll("button").forEach(
      (button, index) =>
        (button.onclick = () => {
          const kcal = Number(items[index].kcal);
          if (Number.isFinite(kcal)) {
            dailyKcal += kcal;
            total.textContent = Math.round(dailyKcal);
          }
          button.insertAdjacentHTML("beforeend", " ✓ añadido");
        }),
    );
  }
  search.oninput = () => {
    clearTimeout(searchTimer);
    const query = search.value.trim();
    if (query.length < 2) {
      results.textContent = "Escribe al menos dos letras para buscar.";
      return;
    }
    searchTimer = setTimeout(async () => {
      results.textContent = "Buscando…";
      try {
        const response = await fetch(
          "/api/nutrition/search?q=" + encodeURIComponent(query),
        );
        const payload = await response.json();
        showResults(payload.items || []);
      } catch (error) {
        results.textContent = "No se pudo consultar el catálogo local.";
      }
    }, 250);
  };
}
