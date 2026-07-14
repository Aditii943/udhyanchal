(function () {
  "use strict";

  const PAGE_SIZE = 30;
  let state = {
    query: "",
    series: "",
    section: "",
    page: 1,
  };
  let selected = new Map(); // id -> product

  const els = {
    search: document.getElementById("searchInput"),
    series: document.getElementById("seriesFilter"),
    section: document.getElementById("sectionFilter"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("emptyState"),
    pagination: document.getElementById("pagination"),
    resultCount: document.getElementById("resultCount"),
    clearFilters: document.getElementById("clearFilters"),
    selectionBar: document.getElementById("selectionBar"),
    selCount: document.getElementById("selCount"),
    exportBtn: document.getElementById("exportBtn"),
    copyBtn: document.getElementById("copyBtn"),
    clearSelBtn: document.getElementById("clearSelBtn"),
    viewListBtn: document.getElementById("viewListBtn"),
    modalRoot: document.getElementById("modalRoot"),
  };

  // ---------- populate series dropdown ----------
  const seriesSet = [...new Set(PRODUCTS.map(p => p.series))];
  const SERIES_ORDER = ["Roma Urban","Roma Plus","Roma Classic","Rider","Penta Modular","Ziva","Tiona",
    "Penta","Modular Boxes","Accessories","Obel","Panasonic Video Door Phone","Smart Devices",
    "Panasonic Vision","Panasonic Europa","UNO","UNO Plus","UNO E Series",
    "Panasonic Switchgear & Protection Devices","Other"];
  seriesSet.sort((a,b) => SERIES_ORDER.indexOf(a) - SERIES_ORDER.indexOf(b));
  for (const s of seriesSet) {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    els.series.appendChild(opt);
  }

  function updateSectionOptions() {
    const pool = state.series ? PRODUCTS.filter(p => p.series === state.series) : PRODUCTS;
    const sections = [...new Set(pool.map(p => p.section).filter(Boolean))].sort();
    const prev = state.section;
    els.section.innerHTML = '<option value="">All Categories</option>';
    for (const s of sections) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      els.section.appendChild(opt);
    }
    if (sections.includes(prev)) {
      els.section.value = prev;
    } else {
      state.section = "";
    }
  }
  updateSectionOptions();

  // ---------- filtering ----------
  function normalize(s) { return (s || "").toLowerCase(); }

  function getFiltered() {
    const q = normalize(state.query).trim();
    return PRODUCTS.filter(p => {
      if (state.series && p.series !== state.series) return false;
      if (state.section && p.section !== state.section) return false;
      if (q) {
        const hay = normalize(p.name) + " " + normalize(p.code) + " " + normalize(p.section);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function renderGrid() {
    const filtered = getFiltered();
    els.resultCount.textContent = filtered.length;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const startIdx = (state.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    if (filtered.length === 0) {
      els.grid.innerHTML = "";
      els.empty.style.display = "block";
    } else {
      els.empty.style.display = "none";
      els.grid.innerHTML = pageItems.map(cardHtml).join("");
    }

    renderPagination(totalPages);
    bindCardEvents();
  }

  function cardHtml(p) {
    const isSel = selected.has(p.id);
    const priceHtml = p.price
      ? `<div class="card-price"><span class="p">₹${escapeHtml(p.price)}</span>${p.mrp ? `<span class="mrp">₹${escapeHtml(p.mrp)}</span>` : ""}</div>`
      : `<div class="card-price">&nbsp;</div>`;
    const imgHtml = p.img
      ? `<img src="images/${encodeURIComponent(p.img)}" alt="${escapeHtml(p.code)}" loading="lazy">`
      : `<div class="noimg">${escapeHtml(p.code)}<br>no photo</div>`;
    return `
    <div class="card ${isSel ? "selected" : ""}" data-id="${p.id}">
      <div class="card-photo" data-action="zoom" data-id="${p.id}">
        ${imgHtml}
        <div class="card-check" data-action="toggle" data-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <div class="card-body">
        ${p.section ? `<div class="card-section">${escapeHtml(p.section)}</div>` : ""}
        <div class="card-name">${escapeHtml(p.name)}</div>
        <span class="card-code">${escapeHtml(p.code)}</span>
        ${priceHtml}
        <button class="add-btn ${isSel ? "on" : ""}" data-action="toggle" data-id="${p.id}">
          ${isSel ? "✓ Added to list" : "+ Add to list"}
        </button>
      </div>
    </div>`;
  }

  function bindCardEvents() {
    els.grid.querySelectorAll('[data-action="toggle"]').forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSelect(parseInt(el.dataset.id, 10));
      });
    });
    els.grid.querySelectorAll('[data-action="zoom"]').forEach(el => {
      el.addEventListener("click", () => openZoom(parseInt(el.dataset.id, 10)));
    });
  }

  function toggleSelect(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    if (selected.has(id)) selected.delete(id);
    else selected.set(id, p);
    renderGrid();
    renderSelectionBar();
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) { els.pagination.innerHTML = ""; return; }
    let html = "";
    const p = state.page;
    html += `<button data-page="${p-1}" ${p===1?"disabled":""}>‹</button>`;
    const windowSize = 2;
    const pages = new Set([1, totalPages]);
    for (let i = p - windowSize; i <= p + windowSize; i++) if (i >= 1 && i <= totalPages) pages.add(i);
    const sorted = [...pages].sort((a,b)=>a-b);
    let last = 0;
    for (const pg of sorted) {
      if (pg - last > 1) html += `<span>…</span>`;
      html += `<button data-page="${pg}" class="${pg===p?"active":""}">${pg}</button>`;
      last = pg;
    }
    html += `<button data-page="${p+1}" ${p===totalPages?"disabled":""}>›</button>`;
    els.pagination.innerHTML = html;
    els.pagination.querySelectorAll("button[data-page]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.page = parseInt(btn.dataset.page, 10);
        renderGrid();
        window.scrollTo({top:0, behavior:"smooth"});
      });
    });
  }

  function renderSelectionBar() {
    const n = selected.size;
    els.selCount.textContent = n;
    els.selectionBar.classList.toggle("show", n > 0);
  }

  // ---------- zoom modal ----------
  function openZoom(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const isSel = selected.has(id);
    els.modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-box" style="position:relative">
          <button class="modal-close" id="modalCloseBtn" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.4);color:#fff">&times;</button>
          ${p.img ? `<img src="images/${encodeURIComponent(p.img)}" alt="${escapeHtml(p.code)}">` : `<div style="aspect-ratio:1/1;background:#DCEAF4;display:flex;align-items:center;justify-content:center;font-family:var(--mono);color:#7D97AC">No photo available</div>`}
          <div class="modal-info">
            ${p.section ? `<div class="card-section">${escapeHtml(p.section)}</div>` : ""}
            <div style="font-size:14px;margin:4px 0 8px">${escapeHtml(p.name)}</div>
            <span class="card-code" style="font-size:13px">${escapeHtml(p.code)}</span>
            ${p.price ? `<div class="card-price" style="margin-top:8px"><span class="p">₹${escapeHtml(p.price)}</span>${p.mrp?`<span class="mrp">₹${escapeHtml(p.mrp)}</span>`:""}</div>` : ""}
            <button class="add-btn ${isSel?"on":""}" id="modalToggle" style="width:100%;margin-top:10px">${isSel?"✓ Added to list":"+ Add to list"}</button>
          </div>
        </div>
      </div>`;
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") closeZoom();
    });
    document.getElementById("modalCloseBtn").addEventListener("click", closeZoom);
    document.getElementById("modalToggle").addEventListener("click", () => {
      toggleSelect(id);
      openZoom(id);
    });
  }
  function closeZoom() { els.modalRoot.innerHTML = ""; }

  // ---------- selection list view ----------
  function openListModal() {
    const items = [...selected.values()];
    els.modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-box" style="max-width:440px;max-height:80vh;overflow:auto;position:relative">
          <button class="modal-close" id="modalCloseBtn" style="position:sticky;top:10px;left:100%;background:rgba(0,0,0,.35);color:#fff">&times;</button>
          <div class="modal-info" style="padding-top:0">
            <div style="font-weight:700;margin-bottom:10px;font-size:15px">Selected products (${items.length})</div>
            ${items.map(p => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)">
                <div>
                  <div style="font-size:13px">${escapeHtml(p.name)}</div>
                  <span class="card-code" style="margin-top:4px">${escapeHtml(p.code)}</span>
                </div>
                <button data-remove="${p.id}" style="border:none;background:none;color:#a33;cursor:pointer;font-size:18px">&times;</button>
              </div>`).join("")}
          </div>
        </div>
      </div>`;
    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") closeZoom();
    });
    document.getElementById("modalCloseBtn").addEventListener("click", closeZoom);
    els.modalRoot.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        selected.delete(parseInt(btn.dataset.remove, 10));
        renderGrid(); renderSelectionBar(); openListModal();
      });
    });
  }

  // ---------- export ----------
  function exportExcel() {
    const items = [...selected.values()];
    if (!items.length) return;
    const rows = items.map((p, i) => ({
      "S.No": i + 1,
      "Product Name": p.name,
      "Code": p.code,
      "Price (Rs)": p.price || "",
      "Quantity": "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:6},{wch:55},{wch:14},{wch:12},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order List");
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Udyanchal_Order_${stamp}.xlsx`);
  }

  function copyAsText() {
    const items = [...selected.values()];
    if (!items.length) return;
    const text = items.map((p, i) => `${i+1}. ${p.name} — ${p.code}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      els.copyBtn.textContent = "Copied!";
      setTimeout(() => { els.copyBtn.innerHTML = copyBtnOriginal; }, 1500);
    }).catch(() => {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    });
  }
  const copyBtnOriginal = els.copyBtn.innerHTML;

  // ---------- events ----------
  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value;
      state.page = 1;
      renderGrid();
    }, 180);
  });
  els.series.addEventListener("change", () => {
    state.series = els.series.value;
    state.page = 1;
    updateSectionOptions();
    renderGrid();
  });
  els.section.addEventListener("change", () => {
    state.section = els.section.value;
    state.page = 1;
    renderGrid();
  });
  els.clearFilters.addEventListener("click", () => {
    state = { query: "", series: "", section: "", page: 1 };
    els.search.value = ""; els.series.value = ""; 
    updateSectionOptions();
    renderGrid();
  });
  els.exportBtn.addEventListener("click", exportExcel);
  els.copyBtn.addEventListener("click", copyAsText);
  els.clearSelBtn.addEventListener("click", () => {
    selected.clear(); renderGrid(); renderSelectionBar();
  });
  els.viewListBtn.addEventListener("click", openListModal);

  renderGrid();
  renderSelectionBar();
})();
