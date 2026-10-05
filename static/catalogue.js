const intakeView = document.getElementById("intake-view");
const uploadCard = intakeView.querySelector(".upload-card");
const catalogue = document.createElement("div");
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
        `<button class="food-result" data-index="${index}" style="display:block;width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #e6ebef;padding:12px 2px;cursor:pointer"><strong>${item.name}</strong><br><small>${item.kcal == null ? "kcal no disponible" : item.kcal + " kcal"} · ${item.source}</small></button>`,
    )
    .join("");
  results.querySelectorAll(".food-result").forEach(
    (button, index) =>
      (button.onclick = () => {
        const item = items[index];
        const kcal = Number(item.kcal);
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
