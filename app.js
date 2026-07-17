(function () {
  "use strict";

  const PAGE_SIZE = 30;
  let state = {
    query: "",
    series: "",
    section: "",
    page: 1,
  };
  let selected = new Map(); // id -> { product, qty }

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

  // Split a token at digit/letter boundaries so "6a" also yields "6" and "a",
  // and "12m" also yields "12" and "m" - lets "6 a switch" and "6a switch"
  // and "16A" all match the same product regardless of spacing.
  function splitUnits(tok) {
    const out = [tok];
    const m = tok.match(/^(\d+)([a-z]+)$/);
    if (m) { out.push(m[1], m[2]); }
    return out;
  }

  // Tokenized, typo-forgiving search. Handles real-world shorthand like
  // "12M cover" matching "12 Module Cover Plate..." and small typos like
  // "swich" matching "switch".
  function buildHaystackWords(p) {
    let s = normalize(p.name + ' ' + p.code + ' ' + p.section + ' ' + p.series);
    s = s.replace(/\bmodules?\b/g, 'm');
    const raw = s.split(/[^a-z0-9]+/).filter(Boolean);
    const out = [];
    for (const t of raw) out.push(...splitUnits(t));
    return out;
  }
  // Precompute once - avoids re-splitting every product's text on every keystroke.
  for (const p of PRODUCTS) p._words = buildHaystackWords(p);

  function tokenizeQuery(q) {
    const raw = normalize(q).split(/[^a-z0-9]+/).filter(Boolean);
    const out = [];
    for (const t of raw) out.push(...splitUnits(t));
    return out;
  }

  // Small edit-distance check (typo tolerance), capped so it stays cheap.
  function withinEditDistance(a, b, maxDist) {
    if (Math.abs(a.length - b.length) > maxDist) return false;
    if (a === b) return true;
    const al = a.length, bl = b.length;
    let prev = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) prev[j] = j;
    for (let i = 1; i <= al; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur.push(v);
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > maxDist) return false; // early exit
      prev = cur;
    }
    return prev[bl] <= maxDist;
  }

  function tokenMatchesWord(t, w) {
    if (t.length <= 2) return w === t; // short tokens ("m", "6a") need exact match
    if (w.startsWith(t)) return true; // haystack word extends what the user typed
    if (/\d/.test(t)) return false; // anything with a digit (codes, ratings, dimensions) must match exactly/by prefix only - never fuzzy, since e.g. "66101" and "66111" or "WIM2501" and "WIM2731" are unrelated products despite being close by edit distance
    const maxDist = t.length <= 5 ? 1 : 2;
    return withinEditDistance(t, w, maxDist);
  }

  function productMatches(p, query) {
    if (!query.trim()) return true;
    // fast path: plain substring match (covers most code/name searches instantly)
    const plain = normalize(p.name) + " " + normalize(p.code) + " " + normalize(p.section);
    if (plain.includes(normalize(query).trim())) return true;
    // tokenized AND-match: every query word must match some word in the
    // product, in any order, tolerating typos and spacing differences.
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return true;
    return tokens.every(t => p._words.some(w => tokenMatchesWord(t, w)));
  }

  function getFiltered() {
    const q = state.query;
    return PRODUCTS.filter(p => {
      if (state.series && p.series !== state.series) return false;
      if (state.section && p.section !== state.section) return false;
      return productMatches(p, q);
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
    const sel = selected.get(p.id);
    const isSel = !!sel;
    const priceHtml = p.price
      ? `<div class="card-price"><span class="p">₹${escapeHtml(p.price)}</span>${p.mrp ? `<span class="mrp">₹${escapeHtml(p.mrp)}</span>` : ""}</div>`
      : `<div class="card-price">&nbsp;</div>`;
    const imgHtml = p.img
      ? `<img src="images/${encodeURIComponent(p.img)}" alt="${escapeHtml(p.code)}" loading="lazy">`
      : `<div class="noimg">${escapeHtml(p.code)}<br>no photo</div>`;
    const actionHtml = isSel
      ? `<div class="qty-row">
           <button class="qty-btn" data-action="qty-dec" data-id="${p.id}" aria-label="Decrease quantity">−</button>
           <input class="qty-input" type="number" min="1" inputmode="numeric" value="${sel.qty}" data-action="qty-set" data-id="${p.id}">
           <button class="qty-btn" data-action="qty-inc" data-id="${p.id}" aria-label="Increase quantity">+</button>
           <button class="qty-remove" data-action="toggle" data-id="${p.id}" aria-label="Remove from list">✓</button>
         </div>`
      : `<button class="add-btn" data-action="toggle" data-id="${p.id}">+ Add to list</button>`;
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
        ${actionHtml}
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
    els.grid.querySelectorAll('[data-action="qty-inc"]').forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); changeQty(parseInt(el.dataset.id, 10), 1); });
    });
    els.grid.querySelectorAll('[data-action="qty-dec"]').forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); changeQty(parseInt(el.dataset.id, 10), -1); });
    });
    els.grid.querySelectorAll('[data-action="qty-set"]').forEach(el => {
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("change", (e) => {
        e.stopPropagation();
        setQty(parseInt(el.dataset.id, 10), parseInt(el.value, 10));
      });
    });
  }

  function toggleSelect(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    if (selected.has(id)) selected.delete(id);
    else selected.set(id, { product: p, qty: 1 });
    renderGrid();
    renderSelectionBar();
  }

  function changeQty(id, delta) {
    const sel = selected.get(id);
    if (!sel) return;
    sel.qty = Math.max(1, sel.qty + delta);
    renderGrid();
    renderSelectionBar();
  }

  function setQty(id, val) {
    const sel = selected.get(id);
    if (!sel) return;
    sel.qty = (isNaN(val) || val < 1) ? 1 : val;
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
    const sel = selected.get(id);
    const isSel = !!sel;
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
            ${isSel
              ? `<div class="qty-row" style="margin-top:10px;width:100%">
                   <button class="qty-btn" id="modalQtyDec">−</button>
                   <input class="qty-input" type="number" min="1" id="modalQtyInput" value="${sel.qty}">
                   <button class="qty-btn" id="modalQtyInc">+</button>
                   <button class="qty-remove" id="modalToggle" style="margin-left:auto">✓ Remove</button>
                 </div>`
              : `<button class="add-btn" id="modalToggle" style="width:100%;margin-top:10px">+ Add to list</button>`
            }
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
    const decBtn = document.getElementById("modalQtyDec");
    const incBtn = document.getElementById("modalQtyInc");
    const qtyInput = document.getElementById("modalQtyInput");
    if (decBtn) decBtn.addEventListener("click", () => { changeQty(id, -1); openZoom(id); });
    if (incBtn) incBtn.addEventListener("click", () => { changeQty(id, 1); openZoom(id); });
    if (qtyInput) qtyInput.addEventListener("change", () => { setQty(id, parseInt(qtyInput.value, 10)); openZoom(id); });
  }
  function closeZoom() { els.modalRoot.innerHTML = ""; }

  // ---------- selection list view ----------
  function openListModal() {
    const entries = [...selected.entries()];
    els.modalRoot.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-box" style="max-width:440px;max-height:80vh;overflow:auto;position:relative">
          <button class="modal-close" id="modalCloseBtn" style="position:sticky;top:10px;left:100%;background:rgba(0,0,0,.35);color:#fff">&times;</button>
          <div class="modal-info" style="padding-top:0">
            <div style="font-weight:700;margin-bottom:10px;font-size:15px">Selected products (${entries.length})</div>
            ${entries.map(([id, sel]) => `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)">
                <div>
                  <div style="font-size:13px">${escapeHtml(sel.product.name)}</div>
                  <span class="card-code" style="margin-top:4px">${escapeHtml(sel.product.code)}</span>
                </div>
                <div class="qty-row" style="flex:none">
                  <button class="qty-btn" data-qdec="${id}">−</button>
                  <input class="qty-input" type="number" min="1" value="${sel.qty}" data-qset="${id}">
                  <button class="qty-btn" data-qinc="${id}">+</button>
                  <button data-remove="${id}" style="border:none;background:none;color:#a33;cursor:pointer;font-size:18px">&times;</button>
                </div>
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
    els.modalRoot.querySelectorAll("[data-qinc]").forEach(btn => {
      btn.addEventListener("click", () => { changeQty(parseInt(btn.dataset.qinc, 10), 1); renderGrid(); openListModal(); });
    });
    els.modalRoot.querySelectorAll("[data-qdec]").forEach(btn => {
      btn.addEventListener("click", () => { changeQty(parseInt(btn.dataset.qdec, 10), -1); renderGrid(); openListModal(); });
    });
    els.modalRoot.querySelectorAll("[data-qset]").forEach(inp => {
      inp.addEventListener("change", () => { setQty(parseInt(inp.dataset.qset, 10), parseInt(inp.value, 10)); renderGrid(); openListModal(); });
    });
  }

  // ---------- export ----------
  function exportExcel() {
    const entries = [...selected.values()];
    if (!entries.length) return;
    const rows = entries.map((sel, i) => ({
      "S.No": i + 1,
      "Product Name": sel.product.name,
      "Code": sel.product.code,
      "Price (Rs)": sel.product.price || "",
      "Quantity": sel.qty,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:6},{wch:55},{wch:14},{wch:12},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order List");
    const stamp = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Udyanchal_Order_${stamp}.xlsx`);
  }

  function copyAsText() {
    const entries = [...selected.values()];
    if (!entries.length) return;
    const text = entries.map((sel, i) => `${i+1}. ${sel.product.name} — ${sel.product.code} — Qty: ${sel.qty}`).join("\n");
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
