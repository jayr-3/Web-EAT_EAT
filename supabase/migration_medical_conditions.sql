-- =========================================================
-- migration_medical_conditions.sql
-- เพิ่มการกรองเมนูสำหรับ "โรคที่ต้องจำกัดปริมาณ" (โรคไต / เบาหวาน / ความดันโลหิตสูง)
-- ต่างจากอาการแพ้อาหารเดิม (milk/egg/nuts/shellfish/wheat) ที่ตัดเมนูออกทันที
-- ถ้ามีวัตถุดิบนั้นอยู่เลย — 3 โรคนี้ "ไม่ได้ห้ามกินวัตถุดิบ" แต่ "ห้ามเกินปริมาณ
-- ที่กำหนดต่อเมนู" (เช่น โซเดียม/น้ำตาลต่อจาน) ตามที่ระบบต้องแยกตรรกะการกรองออก
-- จากอาการแพ้แบบเดิม จึงต้องมีตารางและคอลัมน์ใหม่ ไม่ได้ใช้ allergens เดิม
--
-- สิ่งที่สคริปต์นี้ทำ:
--   1) เพิ่มคอลัมน์โภชนาการต่อเมนู: menus.sodium_mg, menus.sugar_g (nullable —
--      ถ้ายังไม่กรอกถือว่า "ไม่ทราบข้อมูล" ระบบจะไม่ตัดเมนูนั้นออกจากโรคกลุ่มนี้
--      เพื่อกันไม่ให้เมนูที่ยังไม่มีข้อมูลหายไปจากผลลัพธ์ทั้งหมด — แอดมินต้อง
--      กรอกค่าจริงทีละเมนูในแผงควบคุม ไม่มีการสุ่ม/ประมาณค่าให้อัตโนมัติ เพราะ
--      เป็นข้อมูลที่กระทบความปลอดภัยของผู้ใช้โดยตรง)
--   2) สร้างตาราง medical_conditions: รายการโรค + เกณฑ์สูงสุดต่อเมนู (อ่านได้
--      สาธารณะ แก้ไขได้เฉพาะแอดมิน เหมือน allergens)
--   3) ใส่ข้อมูลเริ่มต้น 3 โรคตามที่ขอ (โรคไต / เบาหวาน / ความดันโลหิตสูง)
--      พร้อมเกณฑ์อ้างอิงเบื้องต้น — ตัวเลขเหล่านี้เป็นค่าอ้างอิงคร่าว ๆ สำหรับ
--      ระบบสาธิต ไม่ใช่คำแนะนำทางการแพทย์ที่ผ่านการรับรอง ควรให้อาจารย์ที่ปรึกษา
--      หรือนักโภชนาการตรวจสอบตัวเลขก่อนใช้งานจริง — แก้ไขได้ที่ Supabase
--      Table Editor -> ตาราง medical_conditions โดยตรง (หน้าเว็บยังไม่มี
--      ฟอร์มแก้ไขตารางนี้โดยเฉพาะ ต่างจากอาการแพ้อาหารที่แก้ได้จากแผงแอดมิน)
--
-- วิธีใช้: วางรันในโปรเจกต์ Supabase -> SQL Editor -> New query -> Run
-- รันซ้ำได้ปลอดภัย (ใช้ IF NOT EXISTS / ON CONFLICT)
-- =========================================================

alter table public.menus
  add column if not exists sodium_mg int,   -- โซเดียมต่อเมนู (มิลลิกรัม) — ใช้กรองโรคไต/ความดัน
  add column if not exists sugar_g int;     -- น้ำตาลต่อเมนู (กรัม) — ใช้กรองโรคเบาหวาน

create table if not exists public.medical_conditions (
  id text primary key,          -- เช่น 'kidney', 'diabetes', 'hypertension'
  label text not null,          -- ป้ายข้อความที่แสดงผล เช่น 'โรคไต (จำกัดโซเดียม)'
  icon text not null,           -- อิโมจิไอคอนหน้าป้าย
  max_sodium_mg int,            -- โซเดียมสูงสุดต่อเมนูที่ยอมรับได้ (null = ไม่จำกัดโซเดียม)
  max_sugar_g int,              -- น้ำตาลสูงสุดต่อเมนูที่ยอมรับได้ (null = ไม่จำกัดน้ำตาล)
  sort_order int not null default 0
);

alter table public.medical_conditions enable row level security;

drop policy if exists "medical_conditions_public_read" on public.medical_conditions;
create policy "medical_conditions_public_read"
  on public.medical_conditions for select
  using (true);

drop policy if exists "medical_conditions_admin_write" on public.medical_conditions;
create policy "medical_conditions_admin_write"
  on public.medical_conditions for all
  using (public.is_admin())
  with check (public.is_admin());

-- ค่าเริ่มต้น 3 โรค — ตัวเลขเกณฑ์เป็นค่าอ้างอิงเบื้องต้นสำหรับสาธิตระบบเท่านั้น
-- (โซเดียม/น้ำตาล "ต่อเมนู/จาน" ไม่ใช่ต่อวัน) แก้ไขได้ที่ Supabase Table Editor
-- (ตารางนี้จะแสดงเป็นกลุ่มแยกต่างหากในหน้าเว็บ ไม่ปนกับอาการแพ้อาหาร)
insert into public.medical_conditions (id, label, icon, max_sodium_mg, max_sugar_g, sort_order) values
  ('kidney', 'โรคไต (จำกัดโซเดียม)', '🫘', 600, null, 0),
  ('diabetes', 'โรคเบาหวาน (จำกัดน้ำตาล)', '🩸', null, 15, 1),
  ('hypertension', 'ความดันโลหิตสูง (จำกัดโซเดียม)', '💓', 700, null, 2)
on conflict (id) do update set
  label = excluded.label,
  icon = excluded.icon,
  max_sodium_mg = excluded.max_sodium_mg,
  max_sugar_g = excluded.max_sugar_g,
  sort_order = excluded.sort_order;
