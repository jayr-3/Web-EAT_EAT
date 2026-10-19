/**
 * admin.js — ตรรกะหน้า admin.html
 * เข้าถึงได้เฉพาะบัญชีที่ profiles.role = 'admin' (ตรวจโดย requireAdmin())
 * จัดการข้อมูลกลาง 3 ตาราง (menus, ingredients, allergens) และสิทธิ์ผู้ใช้ (profiles.role)
 */
(async function () {
  const auth = await requireAdmin();
  if (!auth) return;
  const { user, profile } = auth;

  renderAppShell({ activePage: "admin", user, profile });

  // ใช้ชื่อ/ไอคอนอาการแพ้ ตอนแสดงรายละเอียดผู้ใช้งาน (ข้อ "เรียกดูข้อมูล")
  try {
    await DataStore.init();
  } catch (err) {
    console.warn("[admin] โหลดรายการอาการแพ้ไม่สำเร็จ (จะแสดงเป็นรหัสดิบแทน):", err.message);
  }

  // ---------- Tab switching ----------
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      document.querySelector(`[data-tab-panel="${btn.dataset.tab}"]`).classList.add("is-active");
    });
  });

  /** แปลงบรรทัดวัตถุดิบ เช่น "หมูสับ 80 กรัม" -> ตัดตัวเลข/หน่วยท้ายออกเหลือ "หมูสับ" */
  function cleanIngredientName(line) {
    const qtyPattern =
      /\s*[\d๐-๙./¼½¾⅓⅔]+\s*(กรัม|มิลลิลิตร|ลิตร|ช้อนชา|ช้อนโต๊ะ|ถ้วยตวง|ก้อน|ชุด|ดอก|ราก|ฟอง|ชิ้น|ต้น|หัว|ใบ|ลูก)?\s*$/;
    let name = line.replace(qtyPattern, "").trim();
    name = name.replace(/[\d๐-๙./¼½¾⅓⅔]+\s*$/, "").trim();
    return name || line.trim();
  }

  // =========================================================
  // เมนูอาหาร
  // =========================================================
  const menuListEl = document.getElementById("menu-list");
  const menuForm = document.getElementById("menu-form");
  const menuFormError = document.getElementById("menu-form-error");
  const menuFormTitle = document.getElementById("menu-form-title");
  const menuFormCancel = document.getElementById("menu-form-cancel");
  let menus = [];

  // ---------- พรีวิว + อัปโหลดรูปภาพเมนู ----------
  const menuImageFileInput = document.getElementById("menu-image-file");
  const menuImagePreview = document.getElementById("menu-image-preview");
  const menuImagePreviewEmpty = document.getElementById("menu-image-preview-empty");

  function setMenuImagePreview(url) {
    if (url) {
      menuImagePreview.src = url;
      menuImagePreview.style.display = "block";
      menuImagePreviewEmpty.style.display = "none";
    } else {
      menuImagePreview.src = "";
      menuImagePreview.style.display = "none";
      menuImagePreviewEmpty.style.display = "inline";
    }
  }

  menuImageFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      Toast.show("กรุณาเลือกไฟล์รูปภาพชนิด JPEG, PNG หรือ WEBP", "danger");
      e.target.value = "";
      return;
    }
    const menuIdVal = document.getElementById("menu-id").value;
    const idForPath = menuIdVal || "new";
    try {
      Toast.show("กำลังอัปโหลดรูป...", "default", 1500);
      const url = await DB.admin.uploadMenuImage(idForPath, file);
      document.getElementById("menu-image").value = url;
      setMenuImagePreview(url);
      Toast.show("อัปโหลดรูปสำเร็จ", "success");
    } catch (err) {
      Toast.show(err.message || "อัปโหลดรูปไม่สำเร็จ", "danger");
    } finally {
      e.target.value = "";
    }
  });

  document.getElementById("menu-image").addEventListener("input", (e) => setMenuImagePreview(e.target.value.trim()));

  function resetMenuForm() {
    menuForm.reset();
    document.getElementById("menu-id").value = "";
    // [เพิ่ม] ล้างค่าช่องรูปภาพ
    const imgInput = document.getElementById("menu-image");
    if (imgInput) imgInput.value = "";
    setMenuImagePreview("");

    menuFormTitle.textContent = "เพิ่มเมนูใหม่";
    menuFormCancel.classList.add("hidden");
  }

  function editMenu(menu) {
    document.getElementById("menu-id").value = menu.id;
    document.getElementById("menu-name").value = menu.name;
    // [เพิ่ม] ดึงลิงก์รูปภาพเดิมมาใส่ในช่อง input
    const imgInput = document.getElementById("menu-image");
    if (imgInput) imgInput.value = menu.image_url || "";
    setMenuImagePreview(menu.image_url || "");

    document.getElementById("menu-ingredients").value = menu.ingredients.map((i) => i.raw).join("\n");
    document.getElementById("menu-steps").value = menu.steps.join("\n");
    // โซเดียม/น้ำตาลต่อจาน — ใช้กรองเมนูสำหรับโรคไต/เบาหวาน/ความดัน (เว้นว่างได้ถ้ายังไม่ทราบค่า)
    const sodiumInput = document.getElementById("menu-sodium");
    const sugarInput = document.getElementById("menu-sugar");
    if (sodiumInput) sodiumInput.value = menu.sodium_mg ?? "";
    if (sugarInput) sugarInput.value = menu.sugar_g ?? "";
    menuFormTitle.textContent = `แก้ไขเมนู: ${menu.name}`;
    menuFormCancel.classList.remove("hidden");
    menuForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderMenus() {
    if (menus.length === 0) {
      menuListEl.innerHTML = `<div class="empty-state"><div class="glyph">🍽️</div><p class="mb-0">ยังไม่มีเมนูในระบบ</p></div>`;
      return;
    }
    menuListEl.innerHTML = "";
    menus.forEach((menu) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const nutritionMeta =
        menu.sodium_mg != null || menu.sugar_g != null
          ? ` · ${menu.sodium_mg != null ? `โซเดียม ${menu.sodium_mg}มก.` : "ไม่ทราบโซเดียม"} / ${
              menu.sugar_g != null ? `น้ำตาล ${menu.sugar_g}ก.` : "ไม่ทราบน้ำตาล"
            }`
          : " · ยังไม่มีข้อมูลโซเดียม/น้ำตาล";
      row.innerHTML = `
        <div class="info">
          <div class="title">#${menu.id} ${escapeHtml(menu.name)}</div>
          <div class="meta">${menu.ingredients.length} วัตถุดิบ · ${menu.steps.length} ขั้นตอน${nutritionMeta}</div>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm" data-action="edit">แก้ไข</button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete">ลบ</button>
        </div>`;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editMenu(menu));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteMenu(menu));
      menuListEl.appendChild(row);
    });
  }

  async function loadMenus() {
    menus = await DB.admin.listMenus();
    renderMenus();
  }

  async function deleteMenu(menu) {
    if (!confirm(`ลบเมนู "${menu.name}" ใช่หรือไม่?`)) return;
    try {
      await DB.admin.deleteMenu(menu.id);
      Toast.show("ลบเมนูแล้ว", "success");
      await loadMenus();
    } catch (err) {
      Toast.show(err.message || "ลบไม่สำเร็จ", "danger");
    }
  }

  menuFormCancel.addEventListener("click", resetMenuForm);

  menuForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    menuFormError.classList.remove("is-visible");
    const idVal = document.getElementById("menu-id").value;
    
    // [เพิ่ม] อ่านค่ารูปภาพจากช่อง menu-image
    const imgInput = document.getElementById("menu-image");
    const imageUrl = imgInput ? imgInput.value.trim() : "";

    const ingredientLines = document
      .getElementById("menu-ingredients")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const stepLines = document
      .getElementById("menu-steps")
      .value.split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const nextId = idVal ? Number(idVal) : (menus.reduce((max, m) => Math.max(max, m.id), 0) || 0) + 1;

    // โซเดียม/น้ำตาลต่อจาน — เว้นว่างได้ถ้ายังไม่ทราบค่าจริง (เก็บเป็น null ไม่ใช่ 0
    // เพื่อให้ระบบรู้ว่า "ยังไม่มีข้อมูล" ต่างจาก "มีค่าเท่ากับศูนย์จริง ๆ")
    const sodiumRaw = document.getElementById("menu-sodium")?.value.trim();
    const sugarRaw = document.getElementById("menu-sugar")?.value.trim();

    const menu = {
      id: nextId,
      name: document.getElementById("menu-name").value.trim(),
      image_url: imageUrl, // [เพิ่ม] ส่ง image_url ไปบันทึก
      ingredients: ingredientLines.map((raw) => ({ raw, name: cleanIngredientName(raw) })),
      steps: stepLines,
      sodium_mg: sodiumRaw ? Number(sodiumRaw) : null,
      sugar_g: sugarRaw ? Number(sugarRaw) : null,
    };

    const submitBtn = menuForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await DB.admin.saveMenu(menu);
      Toast.show("บันทึกเมนูแล้ว", "success");
      resetMenuForm();
      await loadMenus();
    } catch (err) {
      menuFormError.textContent = err.message || "บันทึกไม่สำเร็จ";
      menuFormError.classList.add("is-visible");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // =========================================================
  // วัตถุดิบ
  // =========================================================
  const ingredientListEl = document.getElementById("ingredient-list");
  const ingredientForm = document.getElementById("ingredient-form");
  const ingredientFormError = document.getElementById("ingredient-form-error");
  const ingredientFormTitle = document.getElementById("ingredient-form-title");
  const ingredientFormCancel = document.getElementById("ingredient-form-cancel");
  let ingredientsList = [];

  function resetIngredientForm() {
    ingredientForm.reset();
    document.getElementById("ingredient-id").value = "";
    ingredientFormTitle.textContent = "เพิ่มวัตถุดิบใหม่";
    ingredientFormCancel.classList.add("hidden");
  }

  function editIngredient(ing) {
    document.getElementById("ingredient-id").value = ing.id;
    document.getElementById("ingredient-name").value = ing.name;
    document.getElementById("ingredient-category").value = ing.category || "";
    ingredientFormTitle.textContent = `แก้ไขวัตถุดิบ: ${ing.name}`;
    ingredientFormCancel.classList.remove("hidden");
    ingredientForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderIngredients() {
    const categories = [...new Set(ingredientsList.map((i) => i.category).filter(Boolean))];
    document.getElementById("ingredient-category-options").innerHTML = categories
      .map((c) => `<option value="${escapeHtml(c)}"></option>`)
      .join("");

    if (ingredientsList.length === 0) {
      ingredientListEl.innerHTML = `<div class="empty-state"><div class="glyph">🥕</div><p class="mb-0">ยังไม่มีวัตถุดิบในระบบ</p></div>`;
      return;
    }
    ingredientListEl.innerHTML = "";
    ingredientsList.forEach((ing) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="info">
          <div class="title">${escapeHtml(ing.name)}</div>
          <div class="meta">${escapeHtml(ing.category || "ไม่ระบุหมวดหมู่")}</div>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm" data-action="edit">แก้ไข</button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete">ลบ</button>
        </div>`;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editIngredient(ing));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteIngredient(ing));
      ingredientListEl.appendChild(row);
    });
  }

  async function loadIngredients() {
    ingredientsList = await DB.admin.listIngredients();
    renderIngredients();
  }

  async function deleteIngredient(ing) {
    if (!confirm(`ลบวัตถุดิบ "${ing.name}" ใช่หรือไม่?`)) return;
    try {
      await DB.admin.deleteIngredient(ing.id);
      Toast.show("ลบวัตถุดิบแล้ว", "success");
      await loadIngredients();
    } catch (err) {
      Toast.show(err.message || "ลบไม่สำเร็จ", "danger");
    }
  }

  ingredientFormCancel.addEventListener("click", resetIngredientForm);

  ingredientForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    ingredientFormError.classList.remove("is-visible");
    const idVal = document.getElementById("ingredient-id").value;
    const ingredient = {
      ...(idVal ? { id: Number(idVal) } : {}),
      name: document.getElementById("ingredient-name").value.trim(),
      category: document.getElementById("ingredient-category").value.trim() || null,
    };
    const submitBtn = ingredientForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await DB.admin.saveIngredient(ingredient);
      Toast.show("บันทึกวัตถุดิบแล้ว", "success");
      resetIngredientForm();
      await loadIngredients();
    } catch (err) {
      ingredientFormError.textContent = err.message || "บันทึกไม่สำเร็จ";
      ingredientFormError.classList.add("is-visible");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // =========================================================
  // อาการแพ้ / โรคประจำตัว
  // =========================================================
  const allergenListEl = document.getElementById("allergen-list");
  const allergenForm = document.getElementById("allergen-form");
  const allergenFormError = document.getElementById("allergen-form-error");
  const allergenFormTitle = document.getElementById("allergen-form-title");
  const allergenFormCancel = document.getElementById("allergen-form-cancel");
  const allergenIdInput = document.getElementById("allergen-id");
  const allergenParentSelect = document.getElementById("allergen-parent");
  let allergensList = [];

  // เติมตัวเลือก "หมวดหมู่หลัก" ในฟอร์ม จากรายการหมวดใหญ่ที่มีอยู่ (ไม่รวมตัวเอง
  // ตอนแก้ไข กันเลือกตัวเองเป็นพ่อของตัวเอง และไม่รวมหมวดที่เป็นหมวดย่อยอยู่แล้ว
  // เพื่อกันการซ้อนเกิน 2 ระดับ)
  function refreshAllergenParentOptions(excludeId = null) {
    const topLevelOptions = allergensList.filter((a) => !a.parent_id && a.id !== excludeId);
    allergenParentSelect.innerHTML =
      `<option value="">— ไม่มี (เป็นหมวดหมู่หลักเอง) —</option>` +
      topLevelOptions.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.icon)} ${escapeHtml(a.label)}</option>`).join("");
  }

  function resetAllergenForm() {
    allergenForm.reset();
    document.getElementById("allergen-order").value = 0;
    allergenIdInput.disabled = false;
    refreshAllergenParentOptions();
    allergenFormTitle.textContent = "เพิ่มตัวเลือกอาการแพ้ใหม่";
    allergenFormCancel.classList.add("hidden");
  }

  function editAllergen(a) {
    allergenIdInput.value = a.id;
    allergenIdInput.disabled = true;
    document.getElementById("allergen-label").value = a.label;
    document.getElementById("allergen-icon").value = a.icon;
    document.getElementById("allergen-keywords").value = a.keywords.join(", ");
    document.getElementById("allergen-order").value = a.sort_order;
    refreshAllergenParentOptions(a.id);
    allergenParentSelect.value = a.parent_id || "";
    allergenFormTitle.textContent = `แก้ไข: ${a.label}`;
    allergenFormCancel.classList.remove("hidden");
    allergenForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAllergens() {
    if (allergensList.length === 0) {
      allergenListEl.innerHTML = `<div class="empty-state"><div class="glyph">🛡️</div><p class="mb-0">ยังไม่มีตัวเลือกอาการแพ้</p></div>`;
      return;
    }
    const topLevel = allergensList.filter((a) => !a.parent_id);
    const childrenOf = (id) => allergensList.filter((a) => a.parent_id === id);

    function rowHtml(a, isChild) {
      return `
        <div class="admin-row${isChild ? " admin-row-sub" : ""}" data-id="${escapeHtml(a.id)}" style="${isChild ? "margin-left:24px; border-style:dashed;" : ""}">
          <div class="info">
            <div class="title">${escapeHtml(a.icon)} ${escapeHtml(a.label)} <span class="meta">(${escapeHtml(a.id)})</span></div>
            <div class="meta">คำสำคัญ: ${a.keywords.join(", ")}</div>
          </div>
          <div class="actions">
            <button class="btn btn-outline btn-sm" data-action="edit">แก้ไข</button>
            <button class="btn btn-danger-outline btn-sm" data-action="delete">ลบ</button>
          </div>
        </div>`;
    }

    allergenListEl.innerHTML = topLevel
      .map((a) => rowHtml(a, false) + childrenOf(a.id).map((c) => rowHtml(c, true)).join(""))
      .join("");

    allergenListEl.querySelectorAll(".admin-row").forEach((row) => {
      const a = allergensList.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-action="edit"]').addEventListener("click", () => editAllergen(a));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteAllergen(a));
    });
  }

  async function loadAllergens() {
    allergensList = await DB.admin.listAllergens();
    renderAllergens();
    refreshAllergenParentOptions(allergenIdInput.disabled ? allergenIdInput.value : null);
  }

  async function deleteAllergen(a) {
    const hasChildren = allergensList.some((x) => x.parent_id === a.id);
    const warning = hasChildren ? ` (หมวดย่อยทั้งหมดข้างใต้จะถูกลบไปด้วย!)` : "";
    if (!confirm(`ลบตัวเลือก "${a.label}" ใช่หรือไม่?${warning}`)) return;
    try {
      await DB.admin.deleteAllergen(a.id);
      Toast.show("ลบแล้ว", "success");
      await loadAllergens();
    } catch (err) {
      Toast.show(err.message || "ลบไม่สำเร็จ", "danger");
    }
  }

  allergenFormCancel.addEventListener("click", resetAllergenForm);

  allergenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    allergenFormError.classList.remove("is-visible");
    const keywords = document
      .getElementById("allergen-keywords")
      .value.split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const allergen = {
      id: allergenIdInput.value.trim(),
      label: document.getElementById("allergen-label").value.trim(),
      icon: document.getElementById("allergen-icon").value.trim(),
      parent_id: allergenParentSelect.value || null,
      keywords,
      sort_order: Number(document.getElementById("allergen-order").value) || 0,
    };

    const submitBtn = allergenForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await DB.admin.saveAllergen(allergen);
      Toast.show("บันทึกแล้ว", "success");
      resetAllergenForm();
      await loadAllergens();
    } catch (err) {
      allergenFormError.textContent = err.message || "บันทึกไม่สำเร็จ";
      allergenFormError.classList.add("is-visible");
    } finally {
      submitBtn.disabled = false;
    }
  });

  // =========================================================
  // ผู้ใช้งาน / สิทธิ์
  // =========================================================
  const userListEl = document.getElementById("user-list");

  function renderUsers(users) {
    if (users.length === 0) {
      userListEl.innerHTML = `<div class="empty-state"><div class="glyph">👤</div><p class="mb-0">ยังไม่มีผู้ใช้งานในระบบ</p></div>`;
      return;
    }
    userListEl.innerHTML = "";
    users.forEach((u) => {
      const isMe = u.id === user.id;
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="info">
          <div class="title">${escapeHtml(u.name || "(ไม่ระบุชื่อ)")} ${isMe ? '<span class="meta">(คุณ)</span>' : ""}</div>
          <div class="meta">${escapeHtml(u.email || "-")}</div>
        </div>
        <div class="actions" style="flex-wrap:wrap; justify-content:flex-end">
          <span class="admin-badge ${u.role === "admin" ? "is-admin" : ""}">${u.role === "admin" ? "แอดมิน" : "สมาชิก"}</span>
          <button class="btn btn-outline btn-sm" data-action="view">เรียกดูข้อมูล</button>
          <button class="btn btn-outline btn-sm" data-action="toggle">
            ${u.role === "admin" ? "ถอดสิทธิ์แอดมิน" : "ตั้งเป็นแอดมิน"}
          </button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete" ${isMe ? "disabled" : ""}>ลบ</button>
        </div>`;
      row.querySelector('[data-action="view"]').addEventListener("click", () => viewUser(u));
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => toggleRole(u));
      if (!isMe) row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteUser(u));
      userListEl.appendChild(row);
    });
  }

  async function loadUsers() {
    const users = await DB.admin.listUsers();
    renderUsers(users);
  }

  async function toggleRole(u) {
    const nextRole = u.role === "admin" ? "member" : "admin";
    if (!confirm(`เปลี่ยนสิทธิ์ของ "${u.name || u.email}" เป็น "${nextRole === "admin" ? "แอดมิน" : "สมาชิก"}" ใช่หรือไม่?`)) return;
    try {
      await DB.admin.setRole(u.id, nextRole);
      Toast.show("อัปเดตสิทธิ์แล้ว", "success");
      await loadUsers();
    } catch (err) {
      Toast.show(err.message || "อัปเดตไม่สำเร็จ", "danger");
    }
  }

  async function deleteUser(u) {
    if (
      !confirm(
        `ลบบัญชี "${u.name || u.email}" อย่างถาวรใช่หรือไม่?\n\nการลบนี้ย้อนกลับไม่ได้ ข้อมูลบัญชี เมนูโปรด และรีวิวทั้งหมดของผู้ใช้นี้จะถูกลบไปด้วย`
      )
    )
      return;
    try {
      await DB.admin.deleteUser(u.id);
      Toast.show("ลบบัญชีผู้ใช้แล้ว", "success");
      await loadUsers();
    } catch (err) {
      Toast.show(err.message || "ลบไม่สำเร็จ", "danger", 6000);
    }
  }

  // ---------- Drawer "เรียกดูข้อมูล" ผู้ใช้งาน ----------
  let userDrawerOverlay, userDrawerBody;
  function ensureUserDrawer() {
    if (userDrawerOverlay) return;
    userDrawerOverlay = document.createElement("div");
    userDrawerOverlay.className = "overlay";
    userDrawerOverlay.innerHTML = `
      <div class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <h3 class="drawer-title" style="margin:0">ข้อมูลผู้ใช้งาน</h3>
          <button type="button" class="drawer-close" aria-label="ปิด">✕</button>
        </div>
        <div class="drawer-body"></div>
      </div>`;
    document.body.appendChild(userDrawerOverlay);
    userDrawerBody = userDrawerOverlay.querySelector(".drawer-body");
    userDrawerOverlay.querySelector(".drawer-close").addEventListener("click", () => {
      userDrawerOverlay.classList.remove("is-open");
    });
    userDrawerOverlay.addEventListener("click", (e) => {
      if (e.target === userDrawerOverlay) userDrawerOverlay.classList.remove("is-open");
    });
  }

  async function viewUser(u) {
    ensureUserDrawer();
    userDrawerBody.innerHTML = `<p class="mb-0">กำลังโหลดข้อมูล...</p>`;
    userDrawerOverlay.classList.add("is-open");
    try {
      const { profile: p, favorites } = await DB.getUserDetail(u.id);
      const allergens = DataStore.getAllergens();
      const conditionLabels = (p.health_conditions || [])
        .map((id) => {
          const a = allergens.find((x) => x.id === id);
          return a ? `${escapeHtml(a.icon)} ${escapeHtml(a.label)}` : escapeHtml(id);
        });
      const createdAt = p.created_at
        ? new Date(p.created_at).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
        : "-";
      const avatarHtml = p.avatar_url
        ? `<img src="${escapeHtml(p.avatar_url)}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover" />`
        : `<div class="avatar" style="width:64px;height:64px;font-size:1.4rem">${escapeHtml((p.name || p.email || "?").trim().charAt(0).toUpperCase())}</div>`;

      userDrawerBody.innerHTML = `
        <div class="row" style="margin-bottom:20px; gap:16px;">
          ${avatarHtml}
          <div>
            <div style="font-weight:700; font-size:1.1rem">${escapeHtml(p.name || "(ไม่ระบุชื่อ)")}</div>
            <span class="admin-badge ${p.role === "admin" ? "is-admin" : ""}">${p.role === "admin" ? "แอดมิน" : "สมาชิก"}</span>
          </div>
        </div>
        <div class="stack" style="gap:10px; margin-bottom:22px">
          <div class="ingredient-line"><span>อีเมล</span><span>${escapeHtml(p.email || "-")}</span></div>
          <div class="ingredient-line"><span>อายุ</span><span>${p.age ?? "-"}</span></div>
          <div class="ingredient-line"><span>น้ำหนัก</span><span>${p.weight_kg ? p.weight_kg + " กก." : "-"}</span></div>
          <div class="ingredient-line"><span>ส่วนสูง</span><span>${p.height_cm ? p.height_cm + " ซม." : "-"}</span></div>
          <div class="ingredient-line"><span>สมัครเมื่อ</span><span>${createdAt}</span></div>
        </div>
        <h4>อาการแพ้ / โรคประจำตัว</h4>
        <div class="row-wrap" style="margin-bottom:22px">
          ${conditionLabels.length ? conditionLabels.map((c) => `<span class="tag">${c}</span>`).join("") : '<span class="tag">ไม่ระบุ</span>'}
        </div>
        <h4>เมนูโปรด / รีวิว (${favorites.length})</h4>
        <div class="stack" style="gap:8px">
          ${
            favorites.length
              ? favorites
                  .map((f) => {
                    const menu = DataStore.getMenuById(f.menu_id);
                    const stars = f.rating ? `${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}` : "ยังไม่ให้คะแนน";
                    return `<div class="ingredient-line"><span>${menu ? escapeHtml(menu.name) : `เมนู #${escapeHtml(f.menu_id)}`}</span><span>${stars}</span></div>`;
                  })
                  .join("")
              : '<p class="form-note" style="margin:0">ยังไม่มีเมนูโปรด</p>'
          }
        </div>
      `;
    } catch (err) {
      userDrawerBody.innerHTML = `<div class="empty-state"><div class="glyph">⚠️</div><p class="mb-0">${err.message || "โหลดข้อมูลไม่สำเร็จ"}</p></div>`;
    }
  }

  // ---------- โหลดข้อมูลทั้งหมดตอนเปิดหน้า ----------
  try {
    await Promise.all([loadMenus(), loadIngredients(), loadAllergens(), loadUsers()]);
  } catch (err) {
    Toast.show(err.message || "โหลดข้อมูลไม่สำเร็จ", "danger", 6000);
  }
})();