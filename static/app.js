const $ = (s) => document.querySelector(s);
let weight = 0,
  tare = 0;
function render() {
  const gross = Math.max(0, weight - tare),
    target = Number($("#target").value) || 25;
  $("#weight").textContent = gross.toFixed(2);
  $("#gross").textContent = `${gross.toFixed(2)} kg`;
  $("#tare").textContent = `${tare.toFixed(2)} kg`;
  $("#scale-fill").style.width = `${Math.min((gross / 50) * 100, 100)}%`;
  $("#bar-fill").style.width = `${Math.min((gross / 50) * 100, 100)}%`;
  $("#target-line").style.left = `${Math.min((target / 50) * 100, 100)}%`;
  $("#target-label").textContent = `Target ${target} kg`;
  $("#accuracy").textContent = gross
    ? "Δ " + Math.abs(gross - target).toFixed(2) + " kg"
    : "Waiting";
}
$("#simulate").onclick = () => {
  weight = +(8 + Math.random() * 34).toFixed(2);
  render();
  $("#message").textContent =
    "Reading received. You can now record this weighing.";
};
$("#tare-btn").onclick = () => {
  tare = weight;
  render();
  $("#message").textContent = "Tare set from the current reading.";
};
$("#record").onclick = () => {
  const name = $("#load").value.trim() || "Unnamed load",
    gross = Math.max(0, weight - tare);
  if (!gross) {
    $("#message").textContent = "Simulate a weight before recording.";
    return;
  }
  $("#load-name").textContent = name;
  const row = document.createElement("div");
  row.className = "history-item";
  row.innerHTML = `<span>${name}</span><strong>${gross.toFixed(2)} kg</strong>`;
  $("#history-list").prepend(row);
  $("#history-empty").classList.add("hidden");
  $("#message").textContent = "Weighing recorded in this session.";
};
$("#target").oninput = render;
$("#reset").onclick = () => {
  weight = 0;
  tare = 0;
  $("#load").value = "";
  $("#load-name").textContent = "No load registered";
  $("#history-list").innerHTML = "";
  $("#history-empty").classList.remove("hidden");
  $("#message").textContent =
    "Enter a description and simulate a reading to begin.";
  render();
};
document.querySelectorAll(".nav").forEach(
  (btn) =>
    (btn.onclick = () => {
      document
        .querySelectorAll(".nav")
        .forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".panel")
        .forEach((x) => x.classList.add("hidden"));
      $("#" + btn.dataset.panel).classList.remove("hidden");
      $("#title").textContent =
        btn.dataset.panel === "weighing"
          ? "Weighing console"
          : btn.dataset.panel[0].toUpperCase() + btn.dataset.panel.slice(1);
    }),
);
render();
const translations = {
  es: {
    webEdition: "EDICIÓN WEB",
    simulatorConnected: "Simulador conectado",
    currentProject: "PROYECTO ACTUAL",
    materialBalance: "Balance de materiales",
    weighing: "Pesaje",
    calibration: "Calibración",
    history: "Historial",
    liveView: "PESAJE / VISTA EN VIVO",
    weighingConsole: "Consola de pesaje",
    resetSession: "Reiniciar sesión",
    liveReading: "LECTURA EN VIVO",
    platformScale: "Báscula de plataforma",
    stable: "ESTABLE",
    grossWeight: "Peso bruto",
    tare: "Tara",
    simulateWeight: "Simular peso",
    setTare: "Establecer tara",
    currentLoad: "CARGA ACTUAL",
    noLoadRegistered: "No hay carga registrada",
    loadDescription: "Descripción de la carga",
    loadPlaceholder: "p. ej., Lote 24-A",
    targetWeight: "Peso objetivo (kg)",
    recordWeighing: "Registrar pesaje",
    startMessage:
      "Introduce una descripción y simula una lectura para comenzar.",
    processWindow: "VENTANA DE PROCESO",
    targetActual: "Objetivo frente a real",
    waiting: "Esperando",
    calibrationWorkspace: "Espacio de calibración",
    calibrationReserved:
      "Reservado para el flujo de calibración de la aplicación antigua.",
    startCalibration: "Iniciar calibración",
    recentActivity: "ACTIVIDAD RECIENTE",
    weighingHistory: "Historial de pesajes",
    noRecords: "Todavía no hay registros en esta sesión.",
  },
  en: {
    webEdition: "WEB EDITION",
    simulatorConnected: "Simulator connected",
    currentProject: "CURRENT PROJECT",
    materialBalance: "Material balance",
    weighing: "Weighing",
    calibration: "Calibration",
    history: "History",
    liveView: "WEIGHING / LIVE VIEW",
    weighingConsole: "Weighing console",
    resetSession: "Reset session",
    liveReading: "LIVE READING",
    platformScale: "Platform scale",
    stable: "STABLE",
    grossWeight: "Gross weight",
    tare: "Tare",
    simulateWeight: "Simulate weight",
    setTare: "Set tare",
    currentLoad: "CURRENT LOAD",
    noLoadRegistered: "No load registered",
    loadDescription: "Load description",
    loadPlaceholder: "e.g. Batch 24-A",
    targetWeight: "Target weight (kg)",
    recordWeighing: "Record weighing",
    startMessage: "Enter a description and simulate a reading to begin.",
    processWindow: "PROCESS WINDOW",
    targetActual: "Target versus actual",
    waiting: "Waiting",
    calibrationWorkspace: "Calibration workspace",
    calibrationReserved: "Reserved for the legacy calibration workflow.",
    startCalibration: "Start calibration",
    recentActivity: "RECENT ACTIVITY",
    weighingHistory: "Weighing history",
    noRecords: "No records in this session yet.",
  },
};
let language = localStorage.getItem("weigh-it-language") || "es";
function applyLanguage() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = translations[language][el.dataset.i18n];
    if (value) el.textContent = value;
  });
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach(
      (el) =>
        (el.placeholder = translations[language][el.dataset.i18nPlaceholder]),
    );
  $("#language-toggle").textContent = language === "es" ? "EN" : "ES";
  $("#title").textContent =
    language === "es" ? "Consola de pesaje" : "Weighing console";
  render();
}
$("#language-toggle").onclick = () => {
  language = language === "es" ? "en" : "es";
  localStorage.setItem("weigh-it-language", language);
  applyLanguage();
};
applyLanguage();
