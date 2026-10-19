/**
 * guest.js — ตรรกะเฉพาะหน้า guest.html
 * โฟลว์: Guest เลือกวัตถุดิบ + ข้อจำกัดสุขภาพชั่วคราว (3.1.1) -> กดแนะนำเมนู
 * -> Health Condition Filter -> จับคู่วัตถุดิบ -> แสดงผลลัพธ์ (3.2, 3.3)
 */
(async function () {
  initNavbar();

  const listElStart = document.getElementById("results-list");
  try {
    await DataStore.init();
  } catch (err) {
    renderFatalError(listElStart, err.message || "โหลดข้อมูลเมนู/วัตถุดิบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    document.getElementById("btn-recommend").disabled = true;
    return;
  }

  const ingredientPicker = createIngredientPicker({
    inputEl: document.getElementById("ingredient-input"),
    resultsEl: document.getElementById("ingredient-results"),
    chipListEl: document.getElementById("ingredient-chips"),
  });

  const conditionPicker = createConditionPicker(document.getElementById("condition-grid"));

  const summaryEl = document.getElementById("results-summary");
  const listEl = document.getElementById("results-list");

  function renderEmpty(message, glyph = "🍽️") {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="glyph">${glyph}</div>
        <p class="mb-0">${message}</p>
      </div>`;
  }

  function renderResults({ results, excludedCount }, availableCount) {
    if (results.length === 0) {
      summaryEl.textContent = "";
      renderEmpty("ไม่พบเมนูที่ปลอดภัยตามเงื่อนไขที่เลือก ลองปรับอาการแพ้หรือวัตถุดิบดูใหม่", "🚫");
      return;
    }

    summaryEl.textContent =
      excludedCount > 0
        ? `พบ ${results.length} เมนูที่ปลอดภัยสำหรับคุณ (คัดออกไปแล้ว ${excludedCount} เมนูเพราะมีสารก่อภูมิแพ้) · เรียงตามคะแนนความนิยม`
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
            ${match.ratingCount > 0 ? `<span class="tag">★ ${match.avgRating.toFixed(1)} (${match.ratingCount})</span>` : ""}
            <span class="tag">${match.totalCount} ส่วนผสม</span>
          </div>
          <div class="result-tags" style="margin-top:6px">${nutritionTagsHtml(match.menu)}</div>
        </div>
        <div class="result-action">›</div>
      `;
      row.addEventListener("click", () => MenuDrawer.open(match, { showMemberActions: false }));
      listEl.appendChild(row);
    });
  }

  function runRecommendation() {
    const available = ingredientPicker.getSelected();
    const allergenIds = conditionPicker.getSelected();
    const { results, excludedCount } = RecommendEngine.recommend(DataStore.getMenus(), {
      availableIngredients: available,
      allergenIds,
      medicalConditions: DataStore.getMedicalConditions(),
    });
    renderResults({ results, excludedCount }, available.length);
  }

  document.getElementById("btn-recommend").addEventListener("click", runRecommendation);

  // ปุ่ม "ล้างตัวกรอง" — เคลียร์ทั้งวัตถุดิบและอาการแพ้ที่เลือกไว้ กลับสู่สถานะเริ่มต้น
  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    ingredientPicker.setSelected([]);
    conditionPicker.setSelected([]);
    summaryEl.textContent = "";
    renderEmpty("เลือกวัตถุดิบที่มี แล้วกด “แนะนำเมนูให้หน่อย” เพื่อเริ่มค้นหา", "👋");
    Toast.show("ล้างตัวกรองแล้ว", "default");
  });

  // แสดงผลเริ่มต้น: เมนูทั้งหมดที่ยังไม่กรองอะไร เรียงตามลำดับข้อมูล
  renderEmpty("เลือกวัตถุดิบที่มี แล้วกด “แนะนำเมนูให้หน่อย” เพื่อเริ่มค้นหา", "👋");
})();