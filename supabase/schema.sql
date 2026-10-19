-- =========================================================
-- schema.sql
-- โครงสร้างฐานข้อมูลของระบบแนะนำเมนูอาหาร (รองรับ role: member / admin)
--
-- วิธีใช้: เปิดโปรเจกต์ Supabase -> เมนู SQL Editor -> New query
-- วางไฟล์นี้ทั้งหมดแล้วกด Run (รันซ้ำได้ปลอดภัย จะล้างตารางเก่าก่อนสร้างใหม่)
-- จากนั้นรัน seed.sql แล้วรัน make-admin.sql เพื่อตั้งแอดมินคนแรก
--
-- หมายเหตุ: ถ้าเคยเจอ error ทำนอง "column menus.id does not exist"
-- แปลว่ามีตารางชื่อซ้ำที่โครงสร้างคอลัมน์ไม่ตรงกันอยู่ก่อนแล้ว (เช่นเคย
-- สร้างผ่าน Table Editor ไว้ก่อน) สคริปต์นี้แก้ปัญหาด้วยการลบของเก่าทิ้ง
-- ก่อนสร้างใหม่ทั้งหมดให้ตรงกับที่แอปต้องการ
-- =========================================================

drop table if exists public.favorites cascade;
drop table if exists public.profiles cascade;
drop table if exists public.menus cascade;
drop table if exists public.ingredients cascade;
drop table if exists public.allergens cascade;
drop table if exists public.medical_conditions cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_admin(uuid) cascade;
drop function if exists public.prevent_role_escalation() cascade;

-- ---------------------------------------------------------
-- 1) menus: ข้อมูลเมนูอาหาร (อ่านได้สาธารณะ แก้ไขได้เฉพาะแอดมิน)
-- ---------------------------------------------------------
create table if not exists public.menus (
  id int primary key,
  name text not null,
  image_url text,                                   -- ลิงก์รูปภาพประจำเมนู (แก้ไขได้จากแผงควบคุมแอดมิน)
  ingredients jsonb not null default '[]'::jsonb,  -- [{ "raw": "...", "name": "..." }, ...]
  steps jsonb not null default '[]'::jsonb,          -- ["ขั้นตอนที่ 1", "ขั้นตอนที่ 2", ...]
  sodium_mg int,                                     -- โซเดียมต่อเมนู (มก.) — ใช้กรองโรคไต/ความดัน (null = ไม่ทราบข้อมูล)
  sugar_g int                                        -- น้ำตาลต่อเมนู (ก.) — ใช้กรองโรคเบาหวาน (null = ไม่ทราบข้อมูล)
);

alter table public.menus enable row level security;

drop policy if exists "menus_public_read" on public.menus;
create policy "menus_public_read"
  on public.menus for select
  using (true);

-- ---------------------------------------------------------
-- 2) ingredients: รายการวัตถุดิบสำหรับ autocomplete (อ่านได้สาธารณะ แก้ไขได้เฉพาะแอดมิน)
-- ---------------------------------------------------------
create table if not exists public.ingredients (
  id bigserial primary key,
  name text not null,
  category text
);

alter table public.ingredients enable row level security;

drop policy if exists "ingredients_public_read" on public.ingredients;
create policy "ingredients_public_read"
  on public.ingredients for select
  using (true);

-- ---------------------------------------------------------
-- 3) allergens: ตัวเลือกอาการแพ้/โรคประจำตัว + คำสำคัญที่ใช้กรองเมนู
--    (อ่านได้สาธารณะ แก้ไขได้เฉพาะแอดมิน)
-- ---------------------------------------------------------
create table if not exists public.allergens (
  id text primary key,        -- เช่น 'milk', 'egg', 'nuts', 'shellfish', 'wheat'
  label text not null,        -- ป้ายข้อความที่แสดงผล เช่น 'แพ้นมวัว'
  icon text not null,         -- อิโมจิไอคอนหน้าป้าย
  parent_id text references public.allergens (id) on delete cascade, -- ถ้าไม่ว่าง = เป็นตัวเลือกย่อยของหมวดนี้ เช่น 'nuts_peanut' มี parent_id = 'nuts'
  keywords text[] not null default '{}',  -- คำที่ใช้จับคู่กับชื่อวัตถุดิบในเมนู
  sort_order int not null default 0
);

alter table public.allergens enable row level security;

drop policy if exists "allergens_public_read" on public.allergens;
create policy "allergens_public_read"
  on public.allergens for select
  using (true);

-- ---------------------------------------------------------
-- 3b) medical_conditions: โรคประจำตัวที่ "จำกัดปริมาณ" (ไม่ใช่ตัดออกทั้งหมด
--     แบบอาการแพ้) เช่น โรคไต/เบาหวาน/ความดัน — ตัดเมนูออกเฉพาะเมนูที่
--     ปริมาณโซเดียม/น้ำตาร "เกิน" เกณฑ์ที่กำหนดต่อโรคนั้นเท่านั้น
--     (อ่านได้สาธารณะ แก้ไขได้เฉพาะแอดมิน เหมือน allergens)
-- ---------------------------------------------------------
create table if not exists public.medical_conditions (
  id text primary key,        -- เช่น 'kidney', 'diabetes', 'hypertension'
  label text not null,        -- ป้ายข้อความที่แสดงผล เช่น 'โรคไต (จำกัดโซเดียม)'
  icon text not null,         -- อิโมจิไอคอนหน้าป้าย
  max_sodium_mg int,          -- โซเดียมสูงสุดต่อเมนูที่ยอมรับได้ (null = ไม่จำกัดโซเดียม)
  max_sugar_g int,            -- น้ำตาลสูงสุดต่อเมนูที่ยอมรับได้ (null = ไม่จำกัดน้ำตาล)
  sort_order int not null default 0
);

alter table public.medical_conditions enable row level security;

drop policy if exists "medical_conditions_public_read" on public.medical_conditions;
create policy "medical_conditions_public_read"
  on public.medical_conditions for select
  using (true);

-- ---------------------------------------------------------
-- 4) profiles: โปรไฟล์สุขภาพของสมาชิก (1 แถวต่อ 1 บัญชีผู้ใช้) + role
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  avatar_url text,                                   -- ลิงก์รูปโปรไฟล์ (เก็บไฟล์จริงไว้ใน Storage bucket "avatars")
  age int,
  weight_kg numeric,
  height_cm numeric,
  health_conditions text[] not null default '{}',
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ฟังก์ชันเช็คว่าผู้ใช้ปัจจุบันเป็นแอดมินหรือไม่ ใช้ security definer เพื่อ
-- ข้าม RLS ตอนอ่าน profiles ของตัวเอง (กันปัญหา policy อ้างอิงตัวเองวนลูป)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- สร้างแถว profiles ให้อัตโนมัติทันทีที่มีผู้ใช้สมัครใหม่ใน auth.users
-- โดยดึงชื่อ/อายุ/น้ำหนัก/ส่วนสูง/อาการแพ้ มาจาก user metadata ที่ส่งมาตอน signUp()
-- (วิธีนี้กันปัญหา RLS ตอนยังไม่มี session ทันทีหลังสมัคร เช่น กรณีเปิดยืนยันอีเมล)
-- role จะเป็น 'member' เสมอตอนสมัคร — เลื่อนเป็นแอดมินทีหลังผ่าน make-admin.sql เท่านั้น
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, age, weight_kg, height_cm, health_conditions)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'name',
    nullif(new.raw_user_meta_data ->> 'age', '')::int,
    nullif(new.raw_user_meta_data ->> 'weight_kg', '')::numeric,
    nullif(new.raw_user_meta_data ->> 'height_cm', '')::numeric,
    coalesce(
      (select array_agg(value) from jsonb_array_elements_text(
        coalesce(new.raw_user_meta_data -> 'health_conditions', '[]'::jsonb)
      )),
      '{}'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- กันไม่ให้ผู้ใช้ทั่วไปเปลี่ยน role ของตัวเองได้ แม้จะยิง request ตรงไป
-- Supabase REST API เอง (ข้าม UI) เพราะ policy "profiles_update_own" อนุญาต
-- ให้แก้ไขแถวของตัวเองได้ทุกคอลัมน์ ยกเว้น role ซึ่ง trigger นี้เช็คซ้ำอีกชั้น
-- อนุญาตให้เปลี่ยน role ได้เฉพาะตอนที่ผู้เรียกเป็นแอดมินอยู่แล้วเท่านั้น
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() เป็น NULL เมื่อรันตรงจาก SQL Editor / migration (ไม่มี session
  -- ของผู้ใช้) ถือว่าเป็นทางที่เชื่อถือได้ (เช่น make-admin.sql) จึงข้ามการเช็ค
  -- แต่ถ้ามาจาก request ของผู้ใช้ที่ล็อกอินอยู่ (auth.uid() ไม่ใช่ NULL) ต้อง
  -- เป็นแอดมินเท่านั้นถึงจะเปลี่ยน role ของแถวไหนก็ได้ (รวมถึงของตัวเอง)
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนบทบาทผู้ใช้ (role)';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profiles_role_guard on public.profiles;
create trigger on_profiles_role_guard
  before update on public.profiles
  for each row execute procedure public.prevent_role_escalation();

-- ---------------------------------------------------------
-- 5) favorites: เมนูโปรด + คะแนนที่สมาชิกให้ (ใช้ทำ personalization ด้วย)
-- ---------------------------------------------------------
create table if not exists public.favorites (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  menu_id int not null references public.menus (id) on delete cascade,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, menu_id)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own"
  on public.favorites for select
  using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own"
  on public.favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own"
  on public.favorites for update
  using (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 5b) menu_rating_stats: คะแนนเฉลี่ย + จำนวนคนให้คะแนนของแต่ละเมนู รวมจาก
--     favorites.rating ของสมาชิกทุกคน ใช้บวกคะแนนในระบบแนะนำเมนู (ยิ่งเมนู
--     ไหนคนให้คะแนนดีเยอะ ยิ่งถูกจัดอันดับขึ้นก่อน) และโชว์เป็นดาวในผลลัพธ์
--     เป็น "view" สรุปข้อมูลระดับเมนู ไม่เปิดเผยว่าใครให้คะแนนอะไร จึงให้
--     guest/สมาชิกทุกคนอ่านได้ ทั้งที่ตาราง favorites เองยังเป็นข้อมูลส่วนตัว
--     (RLS "favorites_select_own" ด้านบน) — view ที่สร้างโดยเจ้าของฐานข้อมูล
--     (ไม่ได้ตั้ง security_invoker) จะ bypass RLS ของตารางต้นทางได้ตามปกติ
-- ---------------------------------------------------------
create or replace view public.menu_rating_stats as
select
  menu_id,
  round(avg(rating)::numeric, 2) as avg_rating,
  count(rating) as rating_count
from public.favorites
where rating is not null
group by menu_id;

grant select on public.menu_rating_stats to anon, authenticated;

-- ---------------------------------------------------------
-- 6) สิทธิ์แก้ไขข้อมูลกลาง (menus / ingredients / allergens) เฉพาะแอดมิน
--    ผู้ใช้ทั่วไปอ่านได้อย่างเดียว (ตาม policy _public_read ด้านบน)
--    "for all" ครอบคลุม insert/update/delete ในคำสั่งเดียว
-- ---------------------------------------------------------
drop policy if exists "menus_admin_write" on public.menus;
create policy "menus_admin_write"
  on public.menus for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ingredients_admin_write" on public.ingredients;
create policy "ingredients_admin_write"
  on public.ingredients for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "allergens_admin_write" on public.allergens;
create policy "allergens_admin_write"
  on public.allergens for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "medical_conditions_admin_write" on public.medical_conditions;
create policy "medical_conditions_admin_write"
  on public.medical_conditions for all
  using (public.is_admin())
  with check (public.is_admin());

-- ค่าเริ่มต้น 3 โรค — ตัวเลขเกณฑ์เป็นค่าอ้างอิงเบื้องต้นสำหรับสาธิตระบบเท่านั้น
-- (โซเดียม/น้ำตาลนับ "ต่อเมนู/จาน" ไม่ใช่ต่อวัน) ควรให้อาจารย์ที่ปรึกษาหรือ
-- นักโภชนาการตรวจทานก่อนใช้งานจริง แก้ไขทีหลังได้ที่ Supabase Table Editor
-- -> ตาราง medical_conditions โดยตรง (หน้าเว็บยังไม่มีฟอร์มแก้ไขตารางนี้)
insert into public.medical_conditions (id, label, icon, max_sodium_mg, max_sugar_g, sort_order) values
  ('kidney', 'โรคไต (จำกัดโซเดียม)', '🫘', 600, null, 0),
  ('diabetes', 'โรคเบาหวาน (จำกัดน้ำตาล)', '🩸', null, 15, 1),
  ('hypertension', 'ความดันโลหิตสูง (จำกัดโซเดียม)', '💓', 700, null, 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- 7) Supabase Storage: ที่เก็บไฟล์รูปภาพ
--    - "menu-images" : รูปเมนูอาหาร อ่านได้สาธารณะ แก้ไขได้เฉพาะแอดมิน
--    - "avatars"     : รูปโปรไฟล์ อ่านได้สาธารณะ แต่ละคนแก้ไขได้แค่โฟลเดอร์
--                      ของตัวเอง (พาธต้องขึ้นต้นด้วย {user_id}/...)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read"
  on storage.objects for select
  using (bucket_id = 'menu-images');

drop policy if exists "menu_images_admin_write" on storage.objects;
create policy "menu_images_admin_write"
  on storage.objects for all
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
  on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
