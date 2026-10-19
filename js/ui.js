/**
 * ui.js
 * ---------------------------------------------------------------
 * ส่วนประกอบ UI ที่ใช้ร่วมกันหลายหน้า: navbar, toast, ตัวเลือกวัตถุดิบ
 * แบบ search & autocomplete, ตัวเลือกอาการแพ้/โรคประจำตัว และ
 * แผงรายละเอียดเมนู (drawer)
 * ---------------------------------------------------------------
 */

/* ---------- ธีมมืด/สว่าง ---------- */
/**
 * จัดเก็บ/อ่าน/สลับธีมผ่าน data-theme บน <html> + localStorage
 * หมายเหตุ: แต่ละหน้าควรมี inline script เล็กๆ ใน <head> ที่อ่านค่าจาก
 * localStorage แล้วตั้ง data-theme ไว้ก่อนที่ CSS จะ paint (กัน flash สีผิด
 * ตอนโหลดหน้า) ไฟล์นี้โหลดท้าย body จึงใช้สำหรับ "ปุ่มกด" และ sync ไอคอนเท่านั้น
 */
const Theme = (() => {
  const KEY = "theme";
  function get() {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    }
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }
  function set(theme) {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }
  function toggle() {
    const next = get() === "dark" ? "light" : "dark";
    set(next);
    return next;
  }
  return { get, apply, set, toggle };
})();

function syncThemeToggleIcon(btn) {
  if (!btn) return;
  const isDark = Theme.get() === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";
  btn.setAttribute("aria-label", isDark ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด");
  btn.title = isDark ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด";
}

/** ผูกปุ่มสลับธีม 1 ปุ่ม — เรียกซ้ำได้หลายปุ่มในหน้าเดียว (เช่น sidebar + mobile topbar) */
function initThemeToggle(btn) {
  if (!btn || btn.dataset.themeBound) return;
  btn.dataset.themeBound = "1";
  syncThemeToggleIcon(btn);
  btn.addEventListener("click", () => {
    Theme.toggle();
    document.querySelectorAll("[data-theme-toggle]").forEach(syncThemeToggleIcon);
  });
}

/* ---------- App shell (sidebar) สำหรับหน้าสมาชิก/แอดมิน ---------- */
/**
 * วาด sidebar ของพื้นที่ที่ต้องล็อกอิน (recommend/history/profile/admin)
 * แสดงลิงก์ "แผงควบคุมแอดมิน" และป้าย role สีต่างเฉพาะบัญชีที่เป็นแอดมินเท่านั้น
 *
 * @param {Object} opts
 * @param {"recommend"|"history"|"profile"|"admin"} opts.activePage
 * @param {{id:string, email:string}} opts.user
 * @param {{name?:string, role?:string}} [opts.profile]
 */
function renderAppShell({ activePage, user, profile }) {
  const role = profile?.role === "admin" ? "admin" : "member";
  const displayName = profile?.name || user?.email || "";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const avatarUrl = profile?.avatar_url || "";

  // 1. เรนเดอร์เมนู Sidebar ด้านซ้าย
  const navItems = [
    { page: "home", href: "home.html", icon: "🏠", label: "หน้าหลัก" },
    { page: "recommend", href: "recommend.html", icon: "🔎", label: "ค้นหาเมนู" },
    { page: "history", href: "history.html", icon: "❤️", label: "เมนูโปรด/ประวัติ" },
    { page: "profile", href: "profile.html", icon: "⚙️", label: "โปรไฟล์" },
  ];

  const navHtml = navItems
    .map(
      (item) => `
      <a href="${item.href}" class="sidebar-link ${item.page === activePage ? "is-active" : ""}">
        <span class="sidebar-link-icon">${item.icon}</span>
        <span>${item.label}</span>
      </a>`
    )
    .join("");

  const adminNavHtml =
    role === "admin"
      ? `
      <div class="sidebar-divider"></div>
      <a href="admin.html" class="sidebar-link is-admin-link ${activePage === "admin" ? "is-active" : ""}">
        <span class="sidebar-link-icon">🛠️</span>
        <span>จัดการข้อมูล</span>
      </a>`
      : "";

  const avatarContent = avatarUrl 
    ? `<img src="${avatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">` 
    : initial;

  const sidebarEl = document.getElementById("app-sidebar");
  if (sidebarEl) {
    sidebarEl.innerHTML = `
      <a href="recommend.html" class="sidebar-brand"><span class="brand-mark">🍲</span> กินอะไรดี</a>
      <div class="sidebar-user">
        <div class="avatar avatar-sidebar">${avatarContent}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${displayName}</div>
          <span class="role-badge role-badge-${role}">${role === "admin" ? "แอดมิน" : "สมาชิก"}</span>
        </div>
      </div>
      <nav class="sidebar-nav">${navHtml}${adminNavHtml}</nav>
      <div class="row" style="margin-top:16px; gap:8px;">
        <button type="button" class="theme-toggle theme-toggle-sidebar" data-theme-toggle></button>
        <button type="button" id="app-shell-logout" class="sidebar-logout" style="margin-top:0; flex:1;">ออกจากระบบ</button>
      </div>
    `;
  }

  // 2. เรนเดอร์แถบด้านบนสำหรับมือถือ (แสดงปุ่มสามขีด โลโก้ และสถานะผู้ใช้มุมบนขวา)
  const mobileTopbar = document.querySelector(".mobile-topbar");
  if (mobileTopbar) {
    const userBadgeIcon = avatarUrl
      ? `<img src="${avatarUrl}" alt="User" style="width:26px; height:26px; border-radius:50%; object-fit:cover;">`
      : `<span style="width:26px; height:26px; border-radius:50%; background:#FF5A1F; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold;">${initial}</span>`;

    mobileTopbar.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="mobile-topbar-toggle" aria-label="เปิดเมนู">☰</button>
        <a href="home.html" class="brand" style="text-decoration:none; font-weight:bold; color:inherit;"><span class="brand-mark">🍲</span> กินอะไรดี</a>
      </div>
      <div class="mobile-user-status" style="display:flex; align-items:center; gap:10px; font-size:0.85rem; font-weight:500; color:var(--ink);">
        <button type="button" class="theme-toggle" data-theme-toggle style="width:32px; height:32px; font-size:0.95rem;"></button>
        ${userBadgeIcon}
        <span style="max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</span>
      </div>
    `;
  }

  document.getElementById("app-shell-logout")?.addEventListener("click", async () => {
    await DB.signOut();
    window.location.href = "index.html";
  });

  // ผูกปุ่มสลับธีมทั้งใน sidebar และ mobile topbar (มีได้พร้อมกันในหน้าเดียว)
  document.querySelectorAll("[data-theme-toggle]").forEach(initThemeToggle);

  // 3. ผูกคำสั่งเปิด/ปิด Sidebar เมื่อกดปุ่มสามขีดหรือพื้นหลังฉากหลัง (Overlay)
  const toggle = document.querySelector(".mobile-topbar-toggle");
  const overlay = document.getElementById("app-sidebar-overlay");
  const closeSidebar = () => document.body.classList.remove("sidebar-open");

  toggle?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.body.classList.toggle("sidebar-open");
  });
  overlay?.addEventListener("click", closeSidebar);
  sidebarEl?.querySelectorAll(".sidebar-link").forEach((a) => a.addEventListener("click", closeSidebar));
}

/* ---------- Navbar ---------- */
function initNavbar() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    links.querySelectorAll(".nav-link").forEach((a) =>
      a.addEventListener("click", () => links.classList.remove("is-open"))
    );
  }

  const current = document.body.dataset.page;
  document.querySelectorAll(".nav-link").forEach((a) => {
    if (a.dataset.page === current) a.classList.add("is-active");
  });

  initThemeToggle(document.querySelector("[data-theme-toggle]"));
}

/* ---------- Toast ---------- */
const Toast = (() => {
  function host() {
    let el = document.querySelector(".toast-host");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast-host";
      document.body.appendChild(el);
    }
    return el;
  }
  function show(message, type = "default", duration = 2600) {
    const el = document.createElement("div");
    el.className = "toast" + (type !== "default" ? ` toast-${type}` : "");
    el.textContent = message;
    host().appendChild(el);
    setTimeout(() => el.remove(), duration);
  }
  return { show };
})();

/* ---------- Ingredient chip picker (Search & Autocomplete) ---------- */
function createIngredientPicker({ inputEl, resultsEl, chipListEl, emptyText = "ยังไม่ได้เลือกวัตถุดิบ" }) {
  let selected = [];

  function renderChips() {
    chipListEl.innerHTML = "";
    if (selected.length === 0) {
      chipListEl.innerHTML = `<span class="chip-empty">${emptyText}</span>`;
      return;
    }
    selected.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.innerHTML = `${name} <button type="button" aria-label="ลบ ${name}">✕</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        selected = selected.filter((n) => n !== name);
        renderChips();
      });
      chipListEl.appendChild(chip);
    });
  }

  function addIngredient(name) {
    if (!selected.includes(name)) selected.push(name);
    inputEl.value = "";
    closeResults();
    renderChips();
    inputEl.focus();
  }

  function closeResults() {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("is-open");
  }

  function renderResults(matches) {
    resultsEl.innerHTML = "";
    if (matches.length === 0) {
      closeResults();
      return;
    }
    matches.forEach((ing) => {
      const opt = document.createElement("div");
      opt.className = "picker-option";
      opt.innerHTML = `<span>${ing.name}</span><span class="cat">${ing.category}</span>`;
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addIngredient(ing.name);
      });
      resultsEl.appendChild(opt);
    });
    resultsEl.classList.add("is-open");
  }

  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim();
    if (!q) return closeResults();
    renderResults(DataStore.searchIngredients(q));
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const q = inputEl.value.trim();
      if (q) addIngredient(q);
    }
    if (e.key === "Escape") closeResults();
  });

  inputEl.addEventListener("blur", () => setTimeout(closeResults, 120));

  renderChips();

  return {
    getSelected: () => selected.slice(),
    setSelected: (names) => {
      selected = names.slice();
      renderChips();
    },
  };
}

/* ---------- Health condition picker ---------- */
/**
 * สร้างตัวเลือกอาการแพ้/โรคประจำตัว แบ่งเป็น 2 กลุ่มที่ตรรกะกรองต่างกัน:
 *
 *  1) "อาการแพ้อาหาร" (จากตาราง allergens) — แบบ 2 ระดับ: หมวดใหญ่ (เช่น
 *     "แพ้ถั่ว") จะกางออกมาเป็นตัวเลือกย่อยที่เจาะจงกว่า (เช่น "แพ้ถั่วลิสง")
 *     ตามคอลัมน์ parent_id — เลือกแล้ว "ตัดเมนูที่มีวัตถุดิบตรงคำสำคัญออกทันที"
 *     (ถ้าหมวดใหญ่ไหนไม่มีลูกเลย จะแสดงเป็น checkbox ปกติ)
 *
 *  2) "โรคที่ต้องจำกัดปริมาณ" (จากตาราง medical_conditions เช่น โรคไต/เบาหวาน/
 *     ความดัน) — เลือกแล้ว "ไม่ตัดเมนูทันที" แต่จะตัดเฉพาะเมนูที่ปริมาณ
 *     โซเดียม/น้ำตาลต่อจาน "เกิน" เกณฑ์ของโรคนั้น (ดู recommend-engine.js)
 *     จึงต้องแยกกลุ่มให้ผู้ใช้เห็นชัดว่าความหมายไม่เหมือนอาการแพ้
 *
 * ค่าที่เลือกทั้ง 2 กลุ่มรวมกันเป็นลิสต์เดียว (เหมือนเดิม) ส่งต่อให้
 * RecommendEngine.recommend() เป็น allergenIds — ตัวเอนจินจะแยกเองว่า id ไหน
 * อยู่กลุ่มไหนโดยเทียบกับ DataStore.getMedicalConditions()
 */
function createConditionPicker(gridEl) {
  const allergens = DataStore.getAllergens();
  const medicalConditions = typeof DataStore.getMedicalConditions === "function" ? DataStore.getMedicalConditions() : [];
  let selected = [];

  const topLevel = allergens.filter((a) => !a.parent_id);
  const childrenOf = (id) => allergens.filter((a) => a.parent_id === id);

  function childCheckboxHtml(a) {
    return `
      <label class="condition-toggle condition-toggle-sub" data-id="${a.id}">
        <input type="checkbox" value="${a.id}" />
        <span>${a.icon} ${a.label}</span>
      </label>`;
  }

  const allergenHtml = topLevel
    .map((a) => {
      const children = childrenOf(a.id);
      if (children.length === 0) {
        return `
          <label class="condition-toggle" data-id="${a.id}">
            <input type="checkbox" value="${a.id}" />
            <span>${a.icon} ${a.label}</span>
          </label>`;
      }
      return `
        <div class="condition-group" data-group-id="${a.id}">
          <button type="button" class="condition-group-header">
            <span>${a.icon} ${a.label}</span>
            <span class="condition-group-chevron">⌄</span>
          </button>
          <div class="condition-group-children">
            ${children.map(childCheckboxHtml).join("")}
          </div>
        </div>`;
    })
    .join("");

  const medicalHtml = medicalConditions
    .map(
      (c) => `
        <label class="condition-toggle" data-id="${c.id}">
          <input type="checkbox" value="${c.id}" />
          <span>${c.icon} ${c.label}</span>
        </label>`
    )
    .join("");

  // กลุ่มโรคที่จำกัดปริมาณแสดงแยกส่วนชัดเจน พร้อมคำอธิบายสั้น ๆ ว่าความหมาย
  // ไม่เหมือนอาการแพ้ (ไม่ได้ตัดออกทันที แค่กันเมนูที่เกินปริมาณที่กำหนด)
  gridEl.innerHTML =
    allergenHtml +
    (medicalHtml
      ? `
        <div class="condition-section-title" style="grid-column:1 / -1; margin-top:14px;">
          <strong style="font-size:0.9rem;">โรคที่ต้องจำกัดปริมาณ</strong>
          <p class="form-note mb-0">ไม่ได้งดทั้งหมด แค่กันเมนูที่โซเดียม/น้ำตาลต่อจานเกินเกณฑ์ของโรคนั้น</p>
        </div>
        ${medicalHtml}`
      : "");

  // ปุ่มกาง/ยุบหมวดใหญ่
  gridEl.querySelectorAll(".condition-group-header").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".condition-group").classList.toggle("is-open");
    });
  });

  gridEl.querySelectorAll(".condition-toggle").forEach((label) => {
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      label.classList.toggle("is-checked", input.checked);
      selected = Array.from(gridEl.querySelectorAll("input:checked")).map((i) => i.value);
    });
  });

  return {
    getSelected: () => selected.slice(),
    setSelected: (ids) => {
      selected = ids.slice();
      gridEl.querySelectorAll(".condition-toggle").forEach((label) => {
        const input = label.querySelector("input");
        input.checked = ids.includes(input.value);
        label.classList.toggle("is-checked", input.checked);
        // กางหมวดใหญ่ออกอัตโนมัติถ้ามีตัวเลือกย่อยที่ถูกเลือกไว้อยู่ข้างใน
        if (input.checked) {
          const group = label.closest(".condition-group");
          if (group) group.classList.add("is-open");
        }
      });
    },
  };
}

/* ---------- ค่าโซเดียม/น้ำตาลต่อเมนู (แสดงเป็นป้ายในรายการแนะนำและหน้ารายละเอียด) ---------- */
function nutritionTagsHtml(menu) {
  const fmt = (v, unit) => (v == null ? "ไม่มีข้อมูล" : `${Number(v).toLocaleString("th-TH")} ${unit}`);
  const cls = (v) => (v == null ? "tag tag-nodata" : "tag");
  return `<span class="${cls(menu.sodiumMg)}">🧂 โซเดียม ${fmt(menu.sodiumMg, "มก.")}</span>` +
    `<span class="${cls(menu.sugarG)}">🍬 น้ำตาล ${fmt(menu.sugarG, "ก.")}</span>`;
}

/* ---------- Menu detail drawer ---------- */
const MenuDrawer = (() => {
  let overlayEl, drawerBodyEl, drawerFootEl, drawerTitleEl;

  function ensureDom() {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "overlay";
    overlayEl.innerHTML = `
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <h3 class="drawer-title" style="margin:0"></h3>
          <button type="button" class="drawer-close" aria-label="ปิด">✕</button>
        </div>
        <div class="drawer-body"></div>
        <div class="drawer-foot"></div>
      </div>`;
    document.body.appendChild(overlayEl);
    drawerTitleEl = overlayEl.querySelector(".drawer-title");
    drawerBodyEl = overlayEl.querySelector(".drawer-body");
    drawerFootEl = overlayEl.querySelector(".drawer-foot");
    overlayEl.querySelector(".drawer-close").addEventListener("click", close);
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function close() {
    overlayEl.classList.remove("is-open");
  }

  function open(match, opts = {}) {
    ensureDom();
    const { menu, matchedCount, totalCount, missing, pct, isFavorite = false } = match;

    drawerTitleEl.textContent = menu.name;

    const ingredientListHtml = menu.ingredients
      .map((ing) => {
        const isMissing = missing.some((m) => m.raw === ing.raw);
        return `<div class="ingredient-line">
          <span>${ing.raw}</span>
          <span class="${isMissing ? "missing" : "have"}">${isMissing ? "ยังไม่มี" : "มีแล้ว ✓"}</span>
        </div>`;
      })
      .join("");

    const stepsHtml = menu.steps
      .map((s) => `<li>${s.replace(/^\d+\.\s*/, "")}</li>`)
      .join("");

    const defaultImg = "https://placehold.co/400x300?text=No+Image";
    const imgUrl = menu.image_url && menu.image_url.trim() !== "" ? menu.image_url : defaultImg;

    drawerBodyEl.innerHTML = `
      <div class="drawer-hero" style="width: 100%; margin-bottom: 24px; border-radius: 8px; overflow: hidden; background: #F7F7F8;">
        <img src="${imgUrl}" alt="${menu.name}" onerror="this.src='${defaultImg}'" style="width: 100%; height: 260px; object-fit: cover; display: block;" />
      </div>
      <div class="row-wrap" style="margin-bottom:18px">
        <span class="tag ${pct === 100 ? "tag-ready" : "tag-missing"}">${pct === 100 ? "ทำได้ทันที" : `ขาด ${totalCount - matchedCount} อย่าง`}</span>
        <span class="tag">ตรงกับวัตถุดิบที่มี ${pct}%</span>
      </div>
      <h4>ค่าโภชนาการต่อจาน</h4>
      <div class="row-wrap" style="margin-bottom:6px">${nutritionTagsHtml(menu)}</div>
      <p class="muted" style="font-size:12px;margin:0 0 18px">เป็นค่าโดยประมาณ ใช้ประกอบการเลือกเมนูเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์</p>
      <h4>ส่วนผสม (${totalCount} รายการ)</h4>
      <div class="stack" style="margin-bottom:22px">${ingredientListHtml}</div>
      <h4>วิธีทำ</h4>
      <ol class="step-list">${stepsHtml}</ol>
    `;

    drawerFootEl.innerHTML = "";
    if (opts.showMemberActions) {
      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "btn " + (isFavorite ? "btn-dark" : "btn-outline");
      favBtn.textContent = isFavorite ? "♥ บันทึกไว้แล้ว" : "♡ บันทึกเป็นเมนูโปรด";
      favBtn.addEventListener("click", () => {
        const next = !favBtn.dataset.fav || favBtn.dataset.fav === "false";
        opts.onToggleFavorite?.(menu.id, next);
        favBtn.dataset.fav = String(next);
        favBtn.className = "btn " + (next ? "btn-dark" : "btn-outline");
        favBtn.textContent = next ? "♥ บันทึกไว้แล้ว" : "♡ บันทึกเป็นเมนูโปรด";
      });
      favBtn.dataset.fav = String(isFavorite);
      drawerFootEl.appendChild(favBtn);

      const rateWrap = document.createElement("div");
      rateWrap.className = "rating-stars";
      rateWrap.setAttribute("aria-label", "ให้คะแนนเมนูนี้");
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement("button");
        star.type = "button";
        star.textContent = "★";
        star.addEventListener("click", () => {
          opts.onRate?.(menu.id, i);
          Array.from(rateWrap.children).forEach((c, idx) => c.classList.toggle("is-active", idx < i));
        });
        rateWrap.appendChild(star);
      }
      drawerFootEl.appendChild(rateWrap);
    } else {
      const hint = document.createElement("p");
      hint.className = "form-note";
      hint.style.margin = "0";
      hint.textContent = "สมัครสมาชิกเพื่อบันทึกเมนูโปรดและให้คะแนน สำหรับคำแนะนำที่แม่นยำขึ้นในครั้งถัดไป";
      drawerFootEl.appendChild(hint);
    }

    overlayEl.classList.add("is-open");
  }

  return { open, close };
})();

function renderFatalError(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="glyph">⚠️</div>
      <p class="mb-0" style="max-width:52ch; margin-inline:auto">${message}</p>
    </div>`;
}

/* ---------- Auth form helpers ---------- */
function restrictToAscii(inputEl) {
  inputEl.addEventListener("input", () => {
    const cleaned = inputEl.value.replace(/[^\x00-\x7F]/g, "");
    if (cleaned !== inputEl.value) inputEl.value = cleaned;
  });
}

/**
 * ตรวจรูปแบบอีเมลให้เข้มงวดกว่า type="email" เริ่มต้นของเบราว์เซอร์ (ซึ่งยอมรับ
 * อะไรก็ได้ที่มี "@" กับตัวอักษรตามหลังแค่ตัวเดียว) — ต้องมีโดเมนที่ประกอบด้วย
 * ส่วนย่อยคั่นด้วยจุด ลงท้ายด้วยนามสกุล (TLD) ที่เป็นตัวอักษรล้วนอย่างน้อย 2 ตัว
 * ไม่มีจุด/ขีดติดกันผิดที่ และห้ามขึ้น/ลงท้ายด้วยจุดหรือขีด
 */
function isValidEmail(email) {
  const value = (email || "").trim();
  if (!value) return false;
  const re = /^[a-zA-Z0-9][a-zA-Z0-9._%+-]*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return re.test(value);
}

/**
 * ผูกการตรวจอีเมลแบบเรียลไทม์เข้ากับ input: ขึ้นข้อความเตือนใต้ช่อง (ต้องมี
 * <small class="field-error"> เป็นพี่น้องอยู่ใน .field เดียวกัน) และตั้ง
 * setCustomValidity ไว้ด้วย เพื่อให้เบราว์เซอร์กันการ submit ฟอร์มโดยอัตโนมัติ
 * ถ้ารูปแบบยังไม่ถูกต้อง (ไม่ต้องเขียน logic กันซ้ำเองใน onSubmit)
 */
function bindEmailValidation(inputEl) {
  const errorEl = inputEl.closest(".field")?.querySelector(".field-error");
  function check() {
    const value = inputEl.value.trim();
    const ok = value === "" || isValidEmail(value);
    inputEl.setCustomValidity(ok ? "" : "กรุณากรอกอีเมลให้ถูกต้อง เช่น name@example.com");
    if (errorEl) errorEl.classList.toggle("is-visible", !ok);
    return ok;
  }
  inputEl.addEventListener("input", check);
  inputEl.addEventListener("blur", check);
  return check;
}

function mapAuthErrorMessage(message = "") {
  const msg = message.toLowerCase();
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return 'อีเมลนี้เคยสมัครสมาชิกไว้แล้ว <a href="login.html">ไปหน้าเข้าสู่ระบบ</a>';
  }
  if (msg.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง";
  }
  if (msg.includes("email not confirmed")) {
    return "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบกล่องจดหมาย หรือแจ้งผู้ดูแลระบบให้ปิดการยืนยันอีเมล";
  }
  if (msg.includes("password") && msg.includes("6")) {
    return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
  }
  return message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

function bindAuthForm({ form, submitBtn, errorEl, submittingText, onSubmit }) {
  const originalText = submitBtn.textContent;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("is-visible");
    submitBtn.disabled = true;
    submitBtn.textContent = submittingText;
    try {
      await onSubmit();
    } catch (err) {
      errorEl.innerHTML = mapAuthErrorMessage(err.message);
      errorEl.classList.add("is-visible");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}
