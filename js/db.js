/**
 * db.js
 * ---------------------------------------------------------------
 * ชั้นเข้าถึงข้อมูลผู้ใช้งานสมาชิก (สมัคร/ล็อกอิน/โปรไฟล์/เมนูโปรด/ประวัติ)
 * และชุดฟังก์ชันสำหรับแอดมิน (จัดการเมนู/วัตถุดิบ/อาการแพ้/สิทธิ์ผู้ใช้)
 *
 * ทุกฟังก์ชันเป็น async และมีรูปแบบผลลัพธ์เดียวกันไม่ว่าจะวิ่งไปที่ไหน:
 *   - ถ้า isSupabaseConfigured = true  -> เรียก Supabase (auth + table)
 *   - ถ้ายังไม่ตั้งค่า                  -> ใช้ localStorage เป็นฐานข้อมูลจำลอง
 *     (โหมดสาธิตรองรับเฉพาะ auth/profile/favorites พื้นฐาน — ฟังก์ชันฝั่ง
 *     admin ต้องใช้ Supabase จริงเท่านั้น เพราะผูกกับ Row Level Security)
 *
 * โครงสร้างตารางที่แนะนำฝั่ง Supabase (ดูรายละเอียดเต็มใน supabase/schema.sql):
 *   profiles(id uuid pk references auth.users, email, name, age, weight_kg,
 *            height_cm, health_conditions text[], role 'member'|'admin', created_at)
 *   favorites(id, user_id uuid references auth.users, menu_id int,
 *             rating int, created_at)
 *   menus(id, name, ingredients jsonb, steps jsonb)
 *   ingredients(id, name, category)
 *   allergens(id, label, icon, parent_id, keywords text[], sort_order) — parent_id ไม่ว่าง = ตัวเลือกย่อย
 * ---------------------------------------------------------------
 */

const DB = (() => {
  const LS_USERS = "fr_demo_users";
  const LS_SESSION = "fr_demo_session";
  const LS_FAVORITES = "fr_demo_favorites";

  // ---------- helpers: localStorage demo mode ----------
  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function writeLS(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function uid() {
    return "u_" + Math.random().toString(36).slice(2, 10);
  }

  // หมายเหตุ: ensureSupabase() มาจาก js/supabase-client.js (โหลดไว้ก่อนไฟล์นี้เสมอ)

  // ---------- auth ----------
  async function signUp({ name, email, password, age, weight, height, healthConditions }) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      // ส่งข้อมูลโปรไฟล์ไปเป็น user metadata แทนการ insert เอง เพราะทันทีหลังสมัคร
      // อาจยังไม่มี session (กรณีเปิดยืนยันอีเมล) ทำให้ insert ตรง ๆ ติด RLS ได้
      // ฝั่งฐานข้อมูลมี trigger (ดู supabase/schema.sql) คอยสร้างแถวใน profiles
      // จาก metadata ชุดนี้ให้อัตโนมัติทันทีที่มีผู้ใช้ใหม่เกิดขึ้นใน auth.users
      const { data, error } = await supa.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            age,
            weight_kg: weight,
            height_cm: height,
            health_conditions: healthConditions || [],
          },
        },
      });
      if (error) throw error;
      const userId = data.user.id;
      return { id: userId, email, name };
    }

    const users = readLS(LS_USERS, {});
    if (users[email]) throw new Error("อีเมลนี้ถูกใช้สมัครไว้แล้ว");
    const id = uid();
    users[email] = { id, email, password, name, age, weight, height, healthConditions: healthConditions || [] };
    writeLS(LS_USERS, users);
    writeLS(LS_SESSION, { userId: id, email });
    return { id, email, name };
  }

  async function signIn({ email, password }) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { id: data.user.id, email: data.user.email };
    }

    const users = readLS(LS_USERS, {});
    const user = users[email];
    if (!user || user.password !== password) throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    writeLS(LS_SESSION, { userId: user.id, email });
    return { id: user.id, email, name: user.name };
  }

  async function signOut() {
    if (isSupabaseConfigured) {
      ensureSupabase();
      await supa.auth.signOut();
      return;
    }
    localStorage.removeItem(LS_SESSION);
  }

  /**
   * ลืมรหัสผ่าน: ให้ Supabase ส่งอีเมลที่มีลิงก์รีเซ็ตรหัสผ่านไปให้ (ถ้าอีเมลนี้
   * มีอยู่จริงในระบบ) ลิงก์จะพาไปที่ reset-password.html พร้อม session ชั่วคราว
   * สำหรับตั้งรหัสผ่านใหม่เท่านั้น — หน้าตอบกลับจะเหมือนกันไม่ว่าจะมีอีเมลนี้ในระบบ
   * หรือไม่ เพื่อไม่ให้ใครใช้ฟอร์มนี้เช็คได้ว่าอีเมลไหนสมัครสมาชิกไว้บ้าง
   */
  async function resetPasswordForEmail(email) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const redirectTo = new URL("reset-password.html", window.location.href).toString();
      const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return true;
    }
    throw new Error("โหมดสาธิต (ยังไม่เชื่อมต่อ Supabase) ไม่รองรับการส่งอีเมลรีเซ็ตรหัสผ่าน");
  }

  /** อ่าน session ปัจจุบัน — ใช้เช็คว่าลิงก์รีเซ็ตรหัสผ่านยังใช้ได้อยู่ไหมในหน้า reset-password.html */
  async function getSession() {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { data } = await supa.auth.getSession();
      return data.session;
    }
    return null;
  }

  /** ตั้งรหัสผ่านใหม่ — ต้องมี session ที่ได้จากลิงก์รีเซ็ตรหัสผ่าน (หรือ session ปกติ) อยู่แล้ว */
  async function updatePassword(newPassword) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { error } = await supa.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return true;
    }
    throw new Error("โหมดสาธิต (ยังไม่เชื่อมต่อ Supabase) ไม่รองรับการตั้งรหัสผ่านใหม่");
  }

  async function getCurrentUser() {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { data } = await supa.auth.getUser();
      if (!data.user) return null;
      return { id: data.user.id, email: data.user.email };
    }
    const session = readLS(LS_SESSION, null);
    if (!session) return null;
    const users = readLS(LS_USERS, {});
    const user = users[session.email];
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  }

  // ---------- profile ----------
  async function getProfile(userId) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { data, error } = await supa.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    }
    const users = readLS(LS_USERS, {});
    const entry = Object.values(users).find((u) => u.id === userId);
    if (!entry) return null;
    return {
      id: entry.id,
      email: entry.email,
      name: entry.name,
      age: entry.age,
      weight_kg: entry.weight,
      height_cm: entry.height,
      health_conditions: entry.healthConditions || [],
      role: entry.role || "member",
    };
  }

  async function updateProfile(userId, patch) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { error } = await supa.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      return;
    }
    const users = readLS(LS_USERS, {});
    const email = Object.keys(users).find((e) => users[e].id === userId);
    if (!email) return;
    Object.assign(users[email], {
      name: patch.name ?? users[email].name,
      age: patch.age ?? users[email].age,
      weight: patch.weight_kg ?? users[email].weight,
      height: patch.height_cm ?? users[email].height,
      healthConditions: patch.health_conditions ?? users[email].healthConditions,
    });
    writeLS(LS_USERS, users);
  }

  // ---------- avatar (Supabase Storage bucket "avatars") ----------
  // อัปโหลดไฟล์รูปโปรไฟล์จริงขึ้น Storage แล้วบันทึกลิงก์ลง profiles.avatar_url
  // พาธไฟล์ต้องขึ้นต้นด้วย {user_id}/ เสมอ ตาม RLS policy "avatars_owner_write"
  async function uploadAvatar(userId, file) {
    if (!isSupabaseConfigured) {
      throw new Error("ฟีเจอร์อัปโหลดรูปโปรไฟล์ใช้ได้เฉพาะเมื่อเชื่อมต่อ Supabase แล้ว");
    }
    ensureSupabase();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/avatar_${Date.now()}.${ext}`;
    const { error: uploadError } = await supa.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (uploadError) throw uploadError;
    const { data } = supa.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = data.publicUrl;
    await updateProfile(userId, { avatar_url: avatarUrl });
    return avatarUrl;
  }

  // ---------- favorites / ratings / history ----------
  async function getFavorites(userId) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { data, error } = await supa
        .from("favorites")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
    const all = readLS(LS_FAVORITES, {});
    return all[userId] || [];
  }

  async function setFavorite(userId, menuId, isFavorite) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      if (isFavorite) {
        const { error } = await supa
          .from("favorites")
          .upsert(
            { user_id: userId, menu_id: menuId, created_at: new Date().toISOString() },
            { onConflict: "user_id,menu_id" }
          );
        if (error) throw error;
      } else {
        const { error } = await supa.from("favorites").delete().eq("user_id", userId).eq("menu_id", menuId);
        if (error) throw error;
      }
      return;
    }
    const all = readLS(LS_FAVORITES, {});
    const list = all[userId] || [];
    const idx = list.findIndex((f) => f.menu_id === menuId);
    if (isFavorite && idx === -1) {
      list.unshift({ menu_id: menuId, rating: null, created_at: new Date().toISOString() });
    } else if (!isFavorite && idx !== -1) {
      list.splice(idx, 1);
    }
    all[userId] = list;
    writeLS(LS_FAVORITES, all);
  }

  async function rateMenu(userId, menuId, rating) {
    if (isSupabaseConfigured) {
      ensureSupabase();
      const { error } = await supa
        .from("favorites")
        .upsert(
          { user_id: userId, menu_id: menuId, rating, created_at: new Date().toISOString() },
          { onConflict: "user_id,menu_id" }
        );
      if (error) throw error;
      return;
    }
    const all = readLS(LS_FAVORITES, {});
    const list = all[userId] || [];
    let entry = list.find((f) => f.menu_id === menuId);
    if (!entry) {
      entry = { menu_id: menuId, created_at: new Date().toISOString() };
      list.unshift(entry);
    }
    entry.rating = rating;
    all[userId] = list;
    writeLS(LS_FAVORITES, all);
  }

  // ---------- admin: จัดการเมนู/วัตถุดิบ/อาการแพ้/สิทธิ์ผู้ใช้ ----------
  // ทุกฟังก์ชันในนี้ต้องพึ่ง Supabase จริงเท่านั้น (ไม่มีโหมดสาธิต) เพราะ
  // ข้อมูลกลางเหล่านี้ไม่มีสำเนาในเครื่องแล้ว และถูกป้องกันด้วย RLS
  // policy "..._admin_write" ที่อนุญาตเฉพาะบัญชีที่ profiles.role = 'admin'
  const admin = {
    // เมนู
    async listMenus() {
      ensureSupabase();
      const { data, error } = await supa.from("menus").select("*").order("id");
      if (error) throw error;
      return data;
    },
    async saveMenu(menu) {
      ensureSupabase();
      const { error } = await supa.from("menus").upsert(menu);
      if (error) throw error;
    },
    async deleteMenu(id) {
      ensureSupabase();
      const { error } = await supa.from("menus").delete().eq("id", id);
      if (error) throw error;
    },
    // อัปโหลดรูปเมนูขึ้น Storage bucket "menu-images" แล้วคืนลิงก์สาธารณะกลับไป
    // ให้หน้า admin เอาไปใส่ในช่อง image_url ก่อนกดบันทึกเมนู
    async uploadMenuImage(menuId, file) {
      ensureSupabase();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `menu-${menuId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supa.storage
        .from("menu-images")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supa.storage.from("menu-images").getPublicUrl(path);
      return data.publicUrl;
    },

    // วัตถุดิบ
    async listIngredients() {
      ensureSupabase();
      const { data, error } = await supa.from("ingredients").select("*").order("name");
      if (error) throw error;
      return data;
    },
    async saveIngredient(ingredient) {
      ensureSupabase();
      const { error } = await supa.from("ingredients").upsert(ingredient);
      if (error) throw error;
    },
    async deleteIngredient(id) {
      ensureSupabase();
      const { error } = await supa.from("ingredients").delete().eq("id", id);
      if (error) throw error;
    },

    // อาการแพ้/โรคประจำตัว
    async listAllergens() {
      ensureSupabase();
      const { data, error } = await supa.from("allergens").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    async saveAllergen(allergen) {
      ensureSupabase();
      const { error } = await supa.from("allergens").upsert(allergen);
      if (error) throw error;
    },
    async deleteAllergen(id) {
      ensureSupabase();
      const { error } = await supa.from("allergens").delete().eq("id", id);
      if (error) throw error;
    },

    // ผู้ใช้งาน / สิทธิ์
    async listUsers() {
      ensureSupabase();
      const { data, error } = await supa.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async setRole(userId, role) {
      ensureSupabase();
      const { error } = await supa.from("profiles").update({ role }).eq("id", userId);
      if (error) throw error;
    },

    /** ดูข้อมูลผู้ใช้งานรายคนแบบละเอียด (รวมเมนูโปรด/รีวิวของคนนั้นด้วย) */
    async getUserDetail(userId) {
      ensureSupabase();
      const [{ data: profile, error: profileError }, { data: favorites, error: favError }] = await Promise.all([
        supa.from("profiles").select("*").eq("id", userId).single(),
        supa
          .from("favorites")
          .select("menu_id, rating, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);
      if (profileError) throw profileError;
      if (favError) throw favError;
      return { profile, favorites: favorites || [] };
    },

    /**
     * ลบบัญชีผู้ใช้แบบสมบูรณ์ (ทั้งบัญชี Auth และข้อมูลที่ผูกอยู่ทั้งหมด)
     * ฝั่งเว็บลบบัญชี Auth ของคนอื่นตรง ๆ ด้วย anon key ไม่ได้ (ต้องใช้ Service
     * Role Key ซึ่งห้ามฝังในโค้ดฝั่งเว็บ) จึงเรียกผ่าน Edge Function
     * "admin-delete-user" ที่รันบนฝั่งเซิร์ฟเวอร์แทน — ดูรายละเอียดการ deploy
     * ที่ supabase/functions/admin-delete-user/index.ts
     */
    async deleteUser(userId) {
      ensureSupabase();
      const { data, error } = await supa.functions.invoke("admin-delete-user", {
        body: { userId },
      });
      if (error) {
        // supabase-js ห่อ error ตอบกลับจากฟังก์ชัน (เช่นข้อความภาษาไทยที่เราส่งมา)
        // ไว้ใน error.context แทนที่จะโยน error.message ตรง ๆ — ดึงออกมาถ้ามี
        const detail = await error.context?.json?.().catch(() => null);
        throw new Error(detail?.error || error.message || "ลบผู้ใช้งานไม่สำเร็จ");
      }
      if (data?.error) throw new Error(data.error);
    },
  };

  return {
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    resetPasswordForEmail,
    getSession,
    updatePassword,
    getProfile,
    updateProfile,
    getFavorites,
    setFavorite,
    rateMenu,
    uploadAvatar,
    admin,
  };
})();
