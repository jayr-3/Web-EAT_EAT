/**
 * recommend-engine.js
 * ---------------------------------------------------------------
 * แกนหลักของ "ระบบแนะนำเมนูอาหาร" — ใช้เทคนิคการแนะนำแบบมีเงื่อนไข
 * (Constraint-based Recommendation) แบ่งการทำงานเป็น 3 ขั้นตอนตามลำดับ
 * ตรงตามกระบวนการที่ออกแบบไว้ในโครงร่างปัญหาพิเศษ:
 *
 *  1) การจับคู่ข้อมูล (Ingredient Matching)
 *     นำรายการวัตถุดิบที่ผู้ใช้ป้อนเข้ามา ไปเปรียบเทียบกับส่วนผสมของเมนูอาหาร
 *     ในฐานข้อมูลทีละเมนู เพื่อคัดกรองเบื้องต้นว่ามีเมนูใดบ้างที่สามารถ
 *     ประกอบขึ้นได้ (บางส่วนหรือทั้งหมด) จากวัตถุดิบชุดนี้
 *
 *  2) การคัดกรองข้อมูล (Safety Filter)
 *     นำเงื่อนไขอาการแพ้ / โรคประจำตัวที่ผู้ใช้เลือกไว้ มาสร้างเป็นเงื่อนไข
 *     ตัดออก แล้วตรวจสอบซ้อนกับผลลัพธ์จากขั้นตอนที่ 1 — เมนูใดมีวัตถุดิบ
 *     ตรงกับเงื่อนไขอาการแพ้แม้แต่รายการเดียว จะถูกตัดออกทันที เพื่อการันตี
 *     ว่าผลลัพธ์สุดท้ายเป็นเมนูที่ปลอดภัย 100%
 *
 *  3) การคำนวณคะแนนและจัดลำดับ (Scoring & Ranking)
 *     นำเมนูที่ผ่านการคัดกรองความปลอดภัยแล้วมาจัดเรียงลำดับการแสดงผล โดยใช้
 *     "คะแนนความนิยม" — ค่าเฉลี่ยรีวิว (1-5 ดาว) ที่สมาชิกคนอื่นเคยให้ไว้กับ
 *     เมนูนั้น เรียงจากมากไปน้อย (เมนูที่ยังไม่มีรีวิวถือว่าคะแนนความนิยม = 0
 *     จึงอยู่ท้ายแถว ไม่ได้ถูกตัดออก) ถ้าคะแนนเฉลี่ยเท่ากัน ใช้ "จำนวนรีวิว"
 *     มากไปน้อยตัดสินรอง
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
   * ขั้นตอนที่ 1: การจับคู่ข้อมูล
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
   * ขั้นตอนที่ 2: การคัดกรองข้อมูล (ความปลอดภัยจากอาการแพ้)
   * ตัดรายการที่ menu.allergenTags มีค่าตรงกับอาการแพ้ที่เลือกไว้แม้แต่ข้อเดียวออก
   */
  function filterByHealthConditions(matchedList, selectedAllergenIds) {
    if (!selectedAllergenIds || selectedAllergenIds.length === 0) return matchedList.slice();
    return matchedList.filter((item) => !item.menu.allergenTags.some((tag) => selectedAllergenIds.includes(tag)));
  }

  /**
   * ขั้นตอนที่ 3: การคำนวณคะแนนและจัดลำดับ
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

  /** จุดเรียกใช้งานหลัก: รันครบทั้ง 3 ขั้นตอนตามลำดับ */
  function recommend(menus, { availableIngredients = [], allergenIds = [], favoriteMenuIds = new Set() } = {}) {
    const matched = matchByIngredients(menus, availableIngredients); // 1) จับคู่ข้อมูล
    const safe = filterByHealthConditions(matched, allergenIds); // 2) คัดกรองความปลอดภัย
    const ranked = rankByPopularity(safe); // 3) คำนวณคะแนนและจัดลำดับ
    const results = withFavoriteFlag(ranked, favoriteMenuIds);

    return {
      results,
      excludedCount: matched.length - safe.length,
    };
  }

  return { ingredientMatches, matchByIngredients, filterByHealthConditions, rankByPopularity, recommend };
})();
