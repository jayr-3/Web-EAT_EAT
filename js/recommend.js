/**
 * recommend.js — ตรรกะเฉพาะหน้า recommend.html (สมาชิก)
 * ต่างจากโหมด Guest ตรงที่: ดึงข้อจำกัดสุขภาพจากโปรไฟล์อัตโนมัติมาตั้งต้นให้
 * (ผู้ใช้ยังปรับเปลี่ยนเฉพาะครั้งนี้ได้) และมีปุ่มบันทึกเมนูโปรด/ให้คะแนนดาว
 * ส่วนลำดับการแนะนำใช้กระบวนการเดียวกับ guest.js ทั้งหมด — ดู js/recommend-engine.js
 * (จับคู่วัตถุดิบ -> คัดกรองอาการแพ้ -> จัดอันดับตามคะแนนความนิยม/รีวิวเฉลี่ย)
 */
(async function () {
  const user = await requireAuth();
  if (!user) return;

  // โหลดโปรไฟล์ก่อนเพื่อวาด sidebar ให้เห็นทันที แม้ภายหลังจะโหลดเมนู/วัตถุดิบไม่สำเร็จ
  // ผู้ใช้จะได้ยังกดเปลี่ยนหน้าอื่นจาก sidebar ได้ ไม่ใช่หน้าที่พังจนออกไปไหนไม่ได้
  const profile = await DB.getProfile(user.id);
  renderAppShell({ activePage: "recommend", user, profile });

  try {
    await DataStore.init();
  } catch (err) {
    renderFatalError(document.getElementById("results-list"), err.message || "โหลดข้อมูลเมนู/วัตถุดิบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    document.getElementById("btn-recommend").disabled = true;
    return;
  }

  const favorites = await DB.getFavorites(user.id);
  const favoriteMenuIds = new Set(favorites.map((f) => f.menu_id));

  const ingredientPicker = createIngredientPicker({
    inputEl: document.getElementById("ingredient-input"),
    resultsEl: document.getElementById("ingredient-results"),
    chipListEl: document.getElementById("ingredient-chips"),
  });

  const conditionPicker = createConditionPicker(document.getElementById("condition-grid"));
  conditionPicker.setSelected(profile?.health_conditions || []);

  const summaryEl = document.getElementById("results-summary");
  const listEl = document.getElementById("results-list");

  function renderEmpty(message, glyph = "🍽️") {
    listEl.innerHTML = `<div class="empty-state"><div class="glyph">${glyph}</div><p class="mb-0">${message}</p></div>`;
  }

  async function toggleFavorite(menuId, isFav) {
    await DB.setFavorite(user.id, menuId, isFav);
    if (isFav) favoriteMenuIds.add(menuId);
    else favoriteMenuIds.delete(menuId);
    Toast.show(isFav ? "บันทึกเป็นเมนูโปรดแล้ว" : "นำออกจากเมนูโปรดแล้ว", "success");
    // อัปเดตรายการที่กำลังแสดงอยู่ทันที ไม่ต้องรอให้กด "ล้างตัวกรอง" แล้วค้นหาใหม่
    // ถึงจะเห็นป้าย ♥ เมนูโปรดที่เพิ่งเปลี่ยน
    if (hasSearched) runRecommendation();
  }

  async function rateMenuHandler(menuId, rating) {
    await DB.rateMenu(user.id, menuId, rating);
    // คะแนนเฉลี่ยที่แคชไว้ใน DataStore ตอนโหลดหน้าครั้งแรกจะไม่อัปเดตเองอีก
    // ต้องรีเฟรชตรงนี้ ไม่งั้นผลการแนะนำครั้งถัดไป (เช่นกด "ล้างตัวกรอง" แล้ว
    // ค้นหาใหม่) จะยังโชว์คะแนน/จำนวนรีวิวเก่าค้างอยู่
    await DataStore.refreshRatingStats();
    Toast.show(`ให้คะแนน ${rating} ดาวแล้ว ระบบจะใช้ปรับคำแนะนำครั้งถัดไป`, "success");
    if (hasSearched) runRecommendation();
  }

  function renderResults({ results, excludedCount }) {
    if (results.length === 0) {
      summaryEl.textContent = "";
      renderEmpty("ไม่พบเมนูที่ปลอดภัยตามเงื่อนไขที่เลือก ลองปรับอาการแพ้หรือวัตถุดิบดูใหม่", "🚫");
      return;
    }
    summaryEl.textContent =
      excludedCount > 0
        ? `พบ ${results.length} เมนูที่ปลอดภัยสำหรับคุณ (คัดออกไปแล้ว ${excludedCount} เมนู) · เรียงตามคะแนนความนิยม`
        : `พบ ${results.length} เมนูที่ตรงกับวัตถุดิบของคุณ · เรียงตามคะแนนความนิยม`;

    listEl.innerHTML = "";
    const defaultImage = "https://placehold.co/150x150?text=No+Image";

    results.forEach((match) => {
      const imageUrl = match.menu.image_url && match.menu.image_url.trim() !== "" ? match.menu.image_url : defaultImage;
      const row = document.createElement("div");
      row.className = "result-row";

      // ปรับ Grid ให้รองรับรูปภาพด้านหน้า (รูปภาพ | วงแหวนเปอร์เซ็นต์ | ข้อความ | ลูกศร)
      row.style.gridTemplateColumns = "60px auto 1fr auto";
      row.style.gap = "12px";
      row.style.alignItems = "center";

      row.innerHTML = `
        <img src="${imageUrl}" alt="${match.menu.name}" onerror="this.src='${defaultImage}'" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" />
        <div class="match-ring" style="--pct:${match.pct}" data-pct="${match.pct}"></div>
        <div>
          <div class="result-title">${match.menu.name}</div>
          <div class="result-tags">
            ${match.ready ? '<span class="tag tag-ready">ทำได้ทันที</span>' : `<span class="tag tag-missing">ขาด ${match.totalCount - match.matchedCount} อย่าง</span>`}
            ${match.isFavorite ? '<span class="tag tag-fave">♥ เมนูโปรด</span>' : ""}
            ${match.ratingCount > 0 ? `<span class="tag">★ ${match.avgRating.toFixed(1)} (${match.ratingCount})</span>` : ""}
            <span class="tag">${match.totalCount} ส่วนผสม</span>
          </div>
          <div class="result-tags" style="margin-top:6px">${nutritionTagsHtml(match.menu)}</div>
        </div>
        <div class="result-action">›</div>
      `;
      row.addEventListener("click", () =>
        MenuDrawer.open(match, {
          showMemberActions: true,
          onToggleFavorite: toggleFavorite,
          onRate: rateMenuHandler,
        })
      );
      listEl.appendChild(row);
    });
  }

  // ไว้เช็คว่าตอนนี้มีผลการค้นหาแสดงอยู่ไหม (ให้สั่งค้นหาซ้ำอัตโนมัติได้ตอน
  // บันทึกเมนูโปรด/ให้คะแนนจากในรายการ โดยไม่ไปรบกวนตอนที่ยังไม่เคยค้นหาเลย)
  let hasSearched = false;

  function runRecommendation() {
    const available = ingredientPicker.getSelected();
    const allergenIds = conditionPicker.getSelected();
    const result = RecommendEngine.recommend(DataStore.getMenus(), {
      availableIngredients: available,
      allergenIds,
      medicalConditions: DataStore.getMedicalConditions(),
      favoriteMenuIds,
    });
    hasSearched = true;
    renderResults(result);
  }

  document.getElementById("btn-recommend").addEventListener("click", runRecommendation);

  // ปุ่ม "ล้างตัวกรอง" — เคลียร์วัตถุดิบและอาการแพ้ที่ปรับไว้เฉพาะครั้งนี้ กลับสู่สถานะเริ่มต้น
  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    ingredientPicker.setSelected([]);
    conditionPicker.setSelected([]);
    summaryEl.textContent = "";
    hasSearched = false;
    renderEmpty("เลือกวัตถุดิบที่มี แล้วกด “แนะนำเมนูให้หน่อย” เพื่อเริ่มค้นหา", "🧑‍🍳");
    Toast.show("ล้างตัวกรองแล้ว", "default");
  });

  renderEmpty("เลือกวัตถุดิบที่มี แล้วกด “แนะนำเมนูให้หน่อย” เพื่อเริ่มค้นหา", "🧑‍🍳");
})();