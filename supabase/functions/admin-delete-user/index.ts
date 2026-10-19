// =========================================================
// admin-delete-user (Supabase Edge Function)
// ---------------------------------------------------------------
// ลบบัญชีผู้ใช้แบบสมบูรณ์ (ทั้ง auth.users และข้อมูลที่ผูกอยู่ เช่น
// profiles/favorites ที่ตั้ง "on delete cascade" ไว้ใน schema.sql อยู่แล้ว)
//
// ทำไมต้องเป็น Edge Function: ฝั่งเว็บ (ใช้ anon key) ไม่มีสิทธิ์ลบบัญชี Auth
// ของคนอื่นได้โดยตรงตามดีไซน์ของ Supabase — ต้องใช้ Service Role Key ซึ่ง
// "ห้ามฝังไว้ในโค้ดฝั่งเว็บเด็ดขาด" (ใครก็เอาไปอ่านผ่าน DevTools ได้) จึงต้อง
// รันคำสั่งลบนี้อยู่บนฝั่งเซิร์ฟเวอร์ (Edge Function) แทน โดย Service Role Key
// จะถูกอ่านจาก environment variable ที่ Supabase ตั้งให้อัตโนมัติเท่านั้น
//
// ฟังก์ชันนี้ตรวจสิทธิ์เองอีกชั้นก่อนลบทุกครั้ง (ไม่เชื่อฝั่งเว็บเฉย ๆ):
//   1) อ่าน JWT ของผู้เรียกจาก header Authorization ที่ส่งมาด้วย
//   2) ใช้ JWT นั้นตรวจว่า login อยู่จริงและดึง user id ของผู้เรียก
//   3) เช็คว่า profiles.role ของผู้เรียก = 'admin' เท่านั้นถึงจะลบได้
//   4) กันลบบัญชีตัวเอง (เผื่อแอดมินกดผิด จะได้ไม่ล็อกตัวเองออกจากระบบ)
//
// วิธี deploy (ทำครั้งเดียว ต้องมี Supabase CLI):
//   1. supabase login
//   2. supabase link --project-ref pwwdourickprpczrvytw
//   3. supabase functions deploy admin-delete-user
// ไม่ต้องตั้งค่า secret เพิ่มเอง — SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY
// ถูกเตรียมไว้ให้อัตโนมัติในทุก Edge Function ของโปรเจกต์อยู่แล้ว
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // preflight request ของเบราว์เซอร์
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "ไม่พบ token การยืนยันตัวตน" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    // ไคลเอนต์ตัวที่ 1: ใช้ JWT ของผู้เรียก เพื่ออ่านว่า "ผู้เรียกคือใคร" เท่านั้น
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "ยืนยันตัวตนไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ไคลเอนต์ตัวที่ 2: ใช้ Service Role Key (ข้าม RLS ได้) สำหรับเช็คสิทธิ์และลบจริง
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (profileError || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "เฉพาะแอดมินเท่านั้นที่มีสิทธิ์ลบผู้ใช้งาน" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "ไม่พบ userId ที่ต้องการลบ" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "ไม่สามารถลบบัญชีของตัวเองได้" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ลบบัญชีจริง — profiles/favorites ที่อ้างอิง auth.users ไว้แบบ
    // "on delete cascade" (ดู supabase/schema.sql) จะถูกลบตามไปด้วยอัตโนมัติ
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "เกิดข้อผิดพลาดที่ไม่คาดคิด" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
