/**
 * recommend-engine.js
 * ---------------------------------------------------------------
 * แกนหลักของ "ระบบแนะนำเมนูอาหาร" — ใช้เทคนิคการแนะนำแบบมีเงื่อนไข
 * (Constraint-based Recommendation) แบ่งการทำงานเป็นชั้น (Layer) ตามลำดับ
 * โดย "ความปลอดภัยมาก่อนความชอบ" คือกรองอาการแพ้/โรคก่อน แล้วค่อยจับคู่วัตถุดิบ:
 *
 *  เมนูทั้งหมด
 *    ▼ Layer 1a กรองอาการแพ้      — ตัดเมนูที่มีวัตถุดิบตรงคำสำคัญของสิ่งที่แพ้ (เด็ดขาด)
 *    ▼ Layer 1b กรองโรคประจำตัว   — ตัดเมนูที่โซเดียม/น้ำตาลเกินเกณฑ์ของโรคที่เลือก
 *    ▼ Layer 2  จับคู่วัตถุดิบ      — เก็บเฉพาะเมนูที่ใช้วัตถุดิบที่ผู้ใช้มีอย่างน้อย 1 อย่าง
 *    ▼ Layer 3  จัดอันดับ          — คะแนนเฉลี่ย → จำนวนผู้ให้คะแนน → % วัตถุดิบตรง
 *  เมนูแนะนำ
 *
 *  1a) อาการแพ้อาหาร (เช่น แพ้นม/ไข่/ถั่ว) — เมนูใดมีวัตถุดิบตรงกับ
 *      เงื่อนไขอาการแพ้แม้แต่รายการเดียว จะถูกตัดออกทันที (100% exclusion)
 *  1b) โรคที่ "จำกัดปริมาณ" (โรคไต / เบาหวาน / ความดันโลหิตสูง) — ไม่ได้
 *      ห้ามกินวัตถุดิบใด ๆ แต่จะตัดเฉพาะเมนูที่ปริมาณโซเดียม/น้ำตาลต่อจาน
 *      "เกิน" เกณฑ์สูงสุดที่กำหนดไว้ของโรคนั้นเท่านั้น
 *  2)  การจับคู่ข้อมูล (Ingredient Matching) — เทียบวัตถุดิบที่ผู้ใช้มีกับส่วนผสม
 *      ของเมนูที่ผ่านการกรองแล้ว
 *  3)  การคำนวณคะแนนและจัดลำดับ — ใช้ "คะแนนความนิยม" (ค่าเฉลี่ยรีวิว 1-5 ดาว)
 *      เรียงจากมากไปน้อย (เมนูที่ยังไม่มีรีวิวถือว่าคะแนน = 0 จึงอยู่ท้ายแถว
 *      ไม่ได้ถูกตัดออก) ถ้าเท่ากันใช้ "จำนวนรีวิว" ตัดสินรอง แล้วจึงใช้ % วัตถุดิบตรง
 * ---------------------------------------------------------------
 */

const RecommendEngine = (() => {
  function normalize(str) {
    return str.toLowerCase().replace(/\s+/g, "");
  }

  /** true ถ้าวัตถุดิบของผู้ใช้ "ครอบคลุม" ชื่อวัตถุดิบในเมนู (ใช้การเทียบแบบ substring ทั้งสองทาง) */
  function ingredientMatches(userIngredient, menuIngredientName) {
    const u = normalize(userIngredient);
    const m = normalize(menuIngredientName);

    if (!u || !m) return false;

    // --- เงื่อนไขยกเว้นคำ (Exclusion Logic) กันคำที่ substring ตรงกันโดยบังเอิญ ---
    if (u === "ไก่") {
      // ดักไม่ให้ "ไก่" ไปตรงกับ ไข่, รสดี, ซุป
      if (m.includes("ไข่") || m.includes("รสดี") || m.includes("ซุป")) return false;
    }
    if (u === "หมู") {
      // ดักไม่ให้ "หมู" ไปตรงกับ รสดี, ซุป
      if (m.includes("รสดี") || m.includes("ซุป")) return false;
    }
    // ---------------------------------------------

    return m.includes(u) || u.includes(m);
  }

  /**
   * Layer 2: การจับคู่ข้อมูล
   * เทียบวัตถุดิบที่ผู้ใช้มีกับส่วนผสมของแต่ละเมนู คืนรายการเมนูพร้อมรายละเอียด
   * การจับคู่ (matched/missing/pct) — ถ้าผู้ใช้ไม่ได้กรอกวัตถุดิบเลย ถือว่ายัง
   * ไม่มีเงื่อนไขกรอง จึงคืนเมนูทั้งหมดไว้ก่อน (ให้ขั้นตอนที่ 3 จัดอันดับด้วย
   * คะแนนความนิยมแทน); ถ้ากรอกวัตถุดิบมา จะคัดเฉพาะเมนูที่จับคู่ได้อย่างน้อย
   * 1 รายการ (ไม่ต้องครบทุกอย่าง) ไว้เป็นตัวเลือกเบื้องต้น
   */
  function matchByIngredients(menus, availableIngredients) {
    const matched = menus.map((menu) => {
      const total = menu.ingredients.length;
      const matchedIngredients = [];
      const missing = [];

      menu.ingredients.forEach((ing) => {
        const hit = availableIngredients.some((userIng) => ingredientMatches(userIng, ing.name));
        if (hit) matchedIngredients.push(ing);
        else missing.push(ing);
      });

      return {
        menu,
        matchedCount: matchedIngredients.length,
        totalCount: total,
        missing,
        pct: total > 0 ? Math.round((matchedIngredients.length / total) * 100) : 0,
        ready: matchedIngredients.length === total,
        avgRating: menu.avgRating || 0,
        ratingCount: menu.ratingCount || 0,
      };
    });

    if (availableIngredients && availableIngredients.length > 0) {
      return matched.filter((item) => item.matchedCount > 0);
    }
    return matched;
  }

  /**
   * Layer 1a + 1b: การคัดกรองความปลอดภัย (ทำกับ "เมนูทั้งหมด" ก่อนจับคู่วัตถุดิบ)
   * แยกเงื่อนไขที่เลือกไว้ (selectedIds) เป็น 2 แบบ ตรรกะไม่เหมือนกัน
   * และต้องผ่านทุกเงื่อนไขพร้อมกัน (AND) — คืน { safe, unsafe }
   *
   *  1a) อาการแพ้อาหาร (เช่น แพ้นม/ไข่/ถั่ว) — ตัดเมนูที่ menu.allergenTags
   *      มีค่าตรงกับอาการแพ้ที่เลือกไว้แม้แต่ข้อเดียวออกทันที (100% exclusion)
   *
   *  1b) โรคที่ "จำกัดปริมาณ" (เช่น โรคไต/เบาหวาน/ความดัน จาก medicalConditions
   *      ที่ DataStore.getMedicalConditions() ส่งมา) — "ไม่ได้ห้ามกินทั้งหมด"
   *      ตัดเฉพาะเมนูที่ปริมาณโซเดียม/น้ำตาลต่อจาน "เกิน" เกณฑ์สูงสุดของโรคนั้น
   *      (max_sodium_mg / max_sugar_g) เท่านั้น — ถ้าเมนูยังไม่มีข้อมูลโภชนาการ
   *      (sodiumMg/sugarG เป็น null เพราะแอดมินยังไม่ได้กรอก) จะไม่ตัดออก เพื่อ
   *      กันไม่ให้เมนูทั้งหมดหายไปจากผลลัพธ์ก่อนมีข้อมูลจริงครบ
   */
  function filterByHealthConditions(menus, selectedIds, medicalConditions = []) {
    if (!selectedIds || selectedIds.length === 0) return { safe: menus.slice(), unsafe: [] };

    const medicalById = new Map(medicalConditions.map((c) => [c.id, c]));
    const selectedMedicalIds = selectedIds.filter((id) => medicalById.has(id));
    const selectedAllergenIds = selectedIds.filter((id) => !medicalById.has(id));

    const safe = [];
    const unsafe = [];
    menus.forEach((menu) => {
      if (isMenuSafe(menu, selectedAllergenIds, selectedMedicalIds, medicalById)) safe.push(menu);
      else unsafe.push(menu);
    });
    return { safe, unsafe };
  }

  function isMenuSafe(menu, selectedAllergenIds, selectedMedicalIds, medicalById) {
    // 1a) อาการแพ้อาหาร — ตัดทันทีถ้ามีวัตถุดิบตรงคำสำคัญ
    if (menu.allergenTags.some((tag) => selectedAllergenIds.includes(tag))) return false;

    // 1b) โรคที่จำกัดปริมาณ — ตัดเฉพาะเมนูที่ "เกิน" เกณฑ์ของโรคที่เลือกไว้
    for (const condId of selectedMedicalIds) {
      const cond = medicalById.get(condId);
      if (!cond) continue;
      if (cond.maxSodiumMg != null && menu.sodiumMg != null && menu.sodiumMg > cond.maxSodiumMg) return false;
      if (cond.maxSugarG != null && menu.sugarG != null && menu.sugarG > cond.maxSugarG) return false;
    }
    return true;
  }

  /**
   * Layer 3: การคำนวณคะแนนและจัดลำดับ
   * เรียงตามคะแนนเฉลี่ยรีวิว (1-5 ดาว) จากมากไปน้อยเป็นหลัก ถ้าคะแนนเฉลี่ย
   * เท่ากัน ใช้ "จำนวนรีวิว" มากไปน้อยเป็นตัวตัดสินรอง (เมนูที่มีคนรีวิวเยอะ
   * กว่าในคะแนนเฉลี่ยเท่ากันถือว่าน่าเชื่อถือกว่า) ถ้ายังเท่ากันอีก (เช่น
   * ยังไม่มีรีวิวทั้งคู่) ค่อยใช้ % ที่จับคู่วัตถุดิบได้เป็นตัวตัดสินสุดท้าย
   */
  function rankByPopularity(matchedList) {
    return matchedList
      .slice()
      .sort(
        (a, b) =>
          b.avgRating - a.avgRating ||
          b.ratingCount - a.ratingCount ||
          b.pct - a.pct ||
          b.matchedCount - a.matchedCount
      );
  }

  /** บวก isFavorite เข้าไปในผลลัพธ์แต่ละแถว (ใช้แสดงป้าย ♥ เมนูโปรด — ไม่มีผลต่อการจัดอันดับ) */
  function withFavoriteFlag(matchedList, favoriteMenuIds) {
    if (!favoriteMenuIds || favoriteMenuIds.size === 0) return matchedList;
    return matchedList.map((item) => ({ ...item, isFavorite: favoriteMenuIds.has(item.menu.id) }));
  }

  /** จุดเรียกใช้งานหลัก: รันครบทุก Layer ตามลำดับ 1a/1b → 2 → 3 */
  function recommend(
    menus,
    { availableIngredients = [], allergenIds = [], medicalConditions = [], favoriteMenuIds = new Set() } = {}
  ) {
    // Layer 1a + 1b: คัดกรองความปลอดภัย (อาการแพ้ + โรคที่จำกัดปริมาณ) จากเมนูทั้งหมด
    const { safe, unsafe } = filterByHealthConditions(menus, allergenIds, medicalConditions);
    // Layer 2: จับคู่วัตถุดิบเฉพาะเมนูที่ปลอดภัย
    const matched = matchByIngredients(safe, availableIngredients);
    // Layer 3: คำนวณคะแนนและจัดลำดับ
    const ranked = rankByPopularity(matched);
    const results = withFavoriteFlag(ranked, favoriteMenuIds);

    // จำนวนเมนู "ที่จะแสดงให้ผู้ใช้ถ้าไม่มีการกรองความปลอดภัย" แต่ถูกคัดออก
    // (นับเฉพาะเมนูที่ตรงกับวัตถุดิบที่ผู้ใช้มี เพื่อไม่ให้ตัวเลขสับสน)
    const excludedCount = unsafe.length > 0 ? matchByIngredients(unsafe, availableIngredients).length : 0;

    return { results, excludedCount };
  }

  return { ingredientMatches, matchByIngredients, filterByHealthConditions, rankByPopularity, recommend };
})();
