/**
 * data.js
 * ---------------------------------------------------------------
 * โหลดข้อมูลตั้งต้นของระบบ (เมนูอาหาร / วัตถุดิบ / ตัวเลือกอาการแพ้)
 * จากตาราง Supabase โดยตรงทั้งหมด — ไม่มีไฟล์ข้อมูลสำรองในเครื่องอีกต่อไป
 *
 * ตารางที่ต้องมี (ดู supabase/schema.sql + supabase/seed.sql):
 *   menus(id, name, ingredients jsonb, steps jsonb, sodium_mg, sugar_g)
 *   ingredients(name, category)
 *   allergens(id, label, icon, parent_id, keywords text[]) — parent_id ไม่ว่าง = ตัวเลือกย่อย
 *     (อาการแพ้อาหาร — มีวัตถุดิบตรงคำสำคัญแล้วตัดเมนูออกทันที)
 *   medical_conditions(id, label, icon, max_sodium_mg, max_sugar_g) — โรคที่
 *     "จำกัดปริมาณ" เช่น โรคไต/เบาหวาน/ความดัน ตัดเมนูออกเฉพาะที่โซเดียม/น้ำตาล
 *     เกินเกณฑ์ ไม่ใช่ตัดทันทีแบบอาการแพ้ (ดู supabase/migration_medical_conditions.sql)
 *     — ยังไม่มีก็ไม่พัง แค่ไม่มีกลุ่มโรคนี้ให้เลือก
 *   menu_rating_stats(menu_id, avg_rating, rating_count) — view สรุปคะแนนเฉลี่ย
 *     ต่อเมนูจาก favorites.rating ของสมาชิกทุกคน ใช้บวกคะแนนตอนแนะนำเมนู
 *     (ดู supabase/migration_menu_rating_stats.sql) — ไม่มีก็ไม่พัง แค่ไม่มีผลบวกส่วนนี้
 *
 * ถ้ายังไม่ได้รันสคริปต์ตั้งค่าฐานข้อมูล หรือเชื่อมต่อ Supabase ไม่ได้
 * DataStore.init() จะโยน error ออกมา ให้แต่ละหน้าจับ error นี้แล้วแสดง
 * ข้อความแจ้งเตือนที่เหมาะสม (ดูตัวอย่างใน js/guest.js)
 * ---------------------------------------------------------------
 */

const DataStore = (() => {
  let menus = null;
  let ingredients = null;
  let allergens = null;
  let medicalConditions = null;

  /** ตรวจว่าเมนูมีวัตถุดิบที่ตรงกับคำสำคัญของอาการแพ้ข้อใดบ้าง */
  function tagAllergens(menuIngredients, allergenDefs) {
    const text = menuIngredients.map((i) => i.name).join(" ");
    return allergenDefs
      .filter((a) => a.keywords.some((kw) => text.includes(kw)))
      .map((a) => a.id);
  }

  async function init() {
    if (menus && ingredients && allergens && medicalConditions) return; // โหลดครั้งเดียวพอ
    ensureSupabase();

    const [menuRes, ingredientRes, allergenRes, medicalRes, ratingRes, nutritionRes] = await Promise.all([
      supa.from("menus").select("id, name, ingredients, steps, image_url").order("id"),
      supa.from("ingredients").select("name, category").order("name"),
      supa.from("allergens").select("id, label, icon, keywords, parent_id").order("sort_order"),
      // โรคที่ "จำกัดปริมาณ" (โรคไต/เบาหวาน/ความดัน) แยกตารางจาก allergens เพราะ
      // ตรรกะกรองต่างกัน (เกินเกณฑ์โซเดียม/น้ำตาร ไม่ใช่มีวัตถุดิบนั้นแล้วตัดทิ้งทันที)
      // ถ้ายังไม่ได้รัน migration_medical_conditions.sql จะ error ได้ จึงไม่ throw
      // ทิ้งทั้งหน้า แค่ข้ามกลุ่มโรคนี้ไปเฉย ๆ (ฟีเจอร์อื่นยังใช้ได้ตามปกติ)
      supa.from("medical_conditions").select("id, label, icon, max_sodium_mg, max_sugar_g").order("sort_order"),
      // คะแนนเฉลี่ย/จำนวนคนให้คะแนนต่อเมนู (ดู supabase/migration_menu_rating_stats.sql) —
      // เป็น view สาธารณะ ถ้าโปรเจกต์ยังไม่ได้รัน migration นี้จะ error ได้ จึงไม่ throw
      // ทิ้งทั้งหน้า แค่ข้ามการบวกคะแนนส่วนนี้ไปเฉย ๆ (ไม่กระทบฟีเจอร์อื่น)
      supa.from("menu_rating_stats").select("menu_id, avg_rating, rating_count"),
      // โซเดียม/น้ำตาลต่อเมนู (ดู supabase/migration_medical_conditions.sql) — คอลัมน์
      // ใหม่ แยกคิวรีออกมาต่างหากเหมือนกัน กันพังทั้งแอปถ้ายังไม่ได้รัน migration นี้
      supa.from("menus").select("id, sodium_mg, sugar_g"),
    ]);

    if (menuRes.error) throw menuRes.error;
    if (ingredientRes.error) throw ingredientRes.error;
    if (allergenRes.error) throw allergenRes.error;

    if (menuRes.data.length === 0) {
      throw new Error("ยังไม่มีข้อมูลเมนูในฐานข้อมูล กรุณารัน supabase/schema.sql และ supabase/seed.sql ก่อน");
    }

    const ratingByMenuId = {};
    if (!ratingRes.error) {
      (ratingRes.data || []).forEach((r) => {
        ratingByMenuId[r.menu_id] = { avgRating: Number(r.avg_rating) || 0, ratingCount: Number(r.rating_count) || 0 };
      });
    } else {
      console.warn(
        "[data.js] โหลดคะแนนเฉลี่ยเมนูไม่สำเร็จ (ยังไม่ได้รัน supabase/migration_menu_rating_stats.sql?):",
        ratingRes.error.message
      );
    }

    if (!medicalRes.error) {
      medicalConditions = (medicalRes.data || []).map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        maxSodiumMg: c.max_sodium_mg,
        maxSugarG: c.max_sugar_g,
      }));
    } else {
      console.warn(
        "[data.js] โหลดรายการโรคที่จำกัดปริมาณไม่สำเร็จ (ยังไม่ได้รัน supabase/migration_medical_conditions.sql?):",
        medicalRes.error.message
      );
      medicalConditions = [];
    }

    const nutritionByMenuId = {};
    if (!nutritionRes.error) {
      (nutritionRes.data || []).forEach((r) => {
        nutritionByMenuId[r.id] = { sodiumMg: r.sodium_mg, sugarG: r.sugar_g };
      });
    } else {
      console.warn(
        "[data.js] โหลดข้อมูลโซเดียม/น้ำตาลต่อเมนูไม่สำเร็จ (ยังไม่ได้รัน supabase/migration_medical_conditions.sql?):",
        nutritionRes.error.message
      );
    }

    allergens = allergenRes.data;
    ingredients = ingredientRes.data;
    menus = menuRes.data.map((m) => {
      const stats = ratingByMenuId[m.id] || { avgRating: 0, ratingCount: 0 };
      const nutrition = nutritionByMenuId[m.id] || { sodiumMg: null, sugarG: null };
      return {
        id: m.id,
        name: m.name,
        ingredients: m.ingredients,
        steps: m.steps,
        image_url: m.image_url,
        sodiumMg: nutrition.sodiumMg,
        sugarG: nutrition.sugarG,
        allergenTags: tagAllergens(m.ingredients, allergens),
        avgRating: stats.avgRating,
        ratingCount: stats.ratingCount,
      };
    });
  }

  /**
   * รีเฟรชเฉพาะคะแนนเฉลี่ย/จำนวนคนให้คะแนนของทุกเมนู (menu_rating_stats)
   * โดยไม่โหลดเมนู/วัตถุดิบ/อาการแพ้ใหม่ทั้งหมด — เรียกหลังผู้ใช้เพิ่งให้คะแนน
   * เมนูไปหมาด ๆ เพื่อให้ผลการแนะนำครั้งถัดไป (เช่นหลังกด "ล้างตัวกรอง" แล้ว
   * ค้นหาใหม่) ใช้ตัวเลขล่าสุด ไม่ค้างค่าที่โหลดไว้ตอนเปิดหน้าครั้งแรก
   */
  async function refreshRatingStats() {
    if (!menus) return;
    ensureSupabase();
    const { data, error } = await supa.from("menu_rating_stats").select("menu_id, avg_rating, rating_count");
    if (error) {
      console.warn("[data.js] รีเฟรชคะแนนเฉลี่ยเมนูไม่สำเร็จ:", error.message);
      return;
    }
    const ratingByMenuId = {};
    (data || []).forEach((r) => {
      ratingByMenuId[r.menu_id] = { avgRating: Number(r.avg_rating) || 0, ratingCount: Number(r.rating_count) || 0 };
    });
    menus.forEach((m) => {
      const stats = ratingByMenuId[m.id] || { avgRating: 0, ratingCount: 0 };
      m.avgRating = stats.avgRating;
      m.ratingCount = stats.ratingCount;
    });
  }

  function getMenus() {
    return menus || [];
  }

  function getMenuById(id) {
    return (menus || []).find((m) => m.id === Number(id));
  }

  function getIngredients() {
    return ingredients || [];
  }

  function getAllergens() {
    return allergens || [];
  }

  function getMedicalConditions() {
    return medicalConditions || [];
  }

  /** ค้นหาวัตถุดิบจากชื่อ (ใช้กับช่อง Search & Autocomplete) */
  function searchIngredients(query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (ingredients || [])
      .filter((i) => i.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  return {
    init,
    refreshRatingStats,
    getMenus,
    getMenuById,
    getIngredients,
    getAllergens,
    getMedicalConditions,
    searchIngredients,
  };
})();
