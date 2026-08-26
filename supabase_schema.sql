-- =====================================================================
-- SKEMA DATABASE "KEDAI KASIR" UNTUK SUPABASE
-- =====================================================================
-- CARA PAKAI:
-- 1. Buka project Supabase kamu → menu "SQL Editor" (ikon di sidebar kiri)
-- 2. Klik "New query"
-- 3. Copy-paste SELURUH isi file ini ke situ
-- 4. Klik tombol "Run" (atau Ctrl+Enter)
-- 5. Kalau muncul tulisan "Success. No rows returned" → berarti berhasil.
--    Boleh dijalankan ulang kapan saja dengan aman (tidak akan dobel).
-- =====================================================================

-- Ekstensi buat hash PIN (supaya tidak tersimpan polos) & generate ID acak
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. PRODUK / MENU
-- =====================================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Minuman',
  price numeric not null default 0,
  photo text,
  created_at timestamptz not null default now()
);

alter table products enable row level security;

drop policy if exists "produk bisa dilihat siapa saja" on products;
create policy "produk bisa dilihat siapa saja" on products
  for select using (true);

drop policy if exists "cuma kasir yang bisa ubah produk" on products;
create policy "cuma kasir yang bisa ubah produk" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =====================================================================
-- 2. PENGATURAN TOKO (nama, alamat, status buka/tutup, aturan poin, dst)
-- =====================================================================
create table if not exists app_settings (
  id int primary key default 1,
  store_name text not null default 'Kedai Kasir',
  logo text,
  address text default '',
  web_version text default '',
  store_open boolean not null default true,
  points_per_rupiah int not null default 10000,
  points_for_reward int not null default 10,
  reward_category text not null default 'Minuman',
  updated_at timestamptz not null default now(),
  constraint only_one_row check (id = 1)
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists "pengaturan bisa dilihat siapa saja" on app_settings;
create policy "pengaturan bisa dilihat siapa saja" on app_settings
  for select using (true);

drop policy if exists "cuma kasir yang bisa ubah pengaturan" on app_settings;
create policy "cuma kasir yang bisa ubah pengaturan" on app_settings
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =====================================================================
-- 3. TRANSAKSI (data penjualan — RAHASIA, cuma kasir yang boleh lihat)
-- =====================================================================
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  time timestamptz not null default now(),
  store_name text,
  items jsonb not null default '[]',
  subtotal numeric not null default 0,
  discount jsonb,
  total numeric not null default 0,
  pay_method text,
  cash numeric default 0,
  change numeric default 0,
  customer_phone text,
  points_earned int default 0
);

alter table transactions enable row level security;

drop policy if exists "cuma kasir yang bisa lihat & buat transaksi" on transactions;
create policy "cuma kasir yang bisa lihat & buat transaksi" on transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =====================================================================
-- 4. PROMO
-- =====================================================================
create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text default '',
  type text not null default 'persen', -- 'persen' | 'nominal'
  value numeric not null default 0,
  active boolean not null default true,
  category text not null default 'Semua', -- 'Semua' | 'Minuman' | 'Makanan' | 'Snack'
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table promos enable row level security;

-- Pelanggan (anon) cuma boleh lihat promo yang aktif & belum kedaluwarsa
drop policy if exists "pelanggan lihat promo aktif saja" on promos;
create policy "pelanggan lihat promo aktif saja" on promos
  for select to anon
  using (active = true and (expires_at is null or expires_at > now()));

-- Kasir (login) boleh lihat SEMUA promo termasuk yang nonaktif/kedaluwarsa, buat dikelola
drop policy if exists "kasir lihat semua promo" on promos;
create policy "kasir lihat semua promo" on promos
  for select to authenticated
  using (true);

drop policy if exists "cuma kasir yang bisa kelola promo" on promos;
create policy "cuma kasir yang bisa kelola promo" on promos
  for all to authenticated
  using (true) with check (true);

-- =====================================================================
-- 5. AKUN PELANGGAN (nomor HP + PIN ter-enkripsi)
-- Tidak bisa diakses langsung oleh siapa pun (termasuk kasir) —
-- semua transaksi lewat "fungsi" khusus di bagian bawah, supaya PIN asli
-- tidak pernah bisa dibaca oleh siapa pun, bahkan oleh pemilik project.
-- =====================================================================
create table if not exists customers (
  phone text primary key,
  name text not null,
  pin_hash text not null,
  joined_at timestamptz not null default now()
);

alter table customers enable row level security;
-- Sengaja TIDAK dibuatkan policy apa pun di sini = tertutup total dari luar.
-- Kasir tetap bisa melihat daftar nama & nomor (tanpa PIN) lewat fungsi
-- staff_list_customers() di bagian bawah.

-- Sesi login pelanggan (token acak, berlaku 30 hari, dipakai supaya pelanggan
-- tidak perlu masukin PIN ulang tiap buka halaman)
create table if not exists customer_sessions (
  token uuid primary key default gen_random_uuid(),
  phone text not null references customers(phone) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table customer_sessions enable row level security;
-- Juga tertutup total dari luar — cuma dipakai lewat fungsi.

-- Poin dipisah dari data akun, supaya nomor HP tetap dapat poin walau
-- belum pernah daftar akun Web Pelanggan.
create table if not exists customer_points (
  phone text primary key,
  points int not null default 0,
  updated_at timestamptz not null default now()
);

alter table customer_points enable row level security;
-- Tertutup total dari luar, dipakai lewat fungsi.

-- =====================================================================
-- 6. STRUK PELANGGAN
-- =====================================================================
create table if not exists receipts (
  code text primary key,
  phone text,
  time timestamptz not null default now(),
  data jsonb not null
);

alter table receipts enable row level security;
-- Tertutup dari luar; kasir menulis lewat fungsi staff_complete_sale(),
-- pelanggan membaca lewat fungsi customer_dashboard().

-- =====================================================================
-- 7. KODE PENUKARAN (hasil tukar promo/poin milik pelanggan, dipakai kasir saat checkout)
-- =====================================================================
create table if not exists redeem_codes (
  code text primary key,
  phone text,
  title text not null,
  type text not null, -- 'persen' | 'nominal' | 'gratis'
  value numeric not null default 0,
  category text not null default 'Semua',
  source_promo_id uuid,
  expires_at timestamptz,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

alter table redeem_codes enable row level security;

-- Kasir (login) boleh baca & tandai "sudah dipakai" langsung, buat proses checkout
drop policy if exists "kasir kelola kode penukaran" on redeem_codes;
create policy "kasir kelola kode penukaran" on redeem_codes
  for all to authenticated
  using (true) with check (true);
-- Pelanggan TIDAK boleh baca langsung (supaya tidak bisa intip/pakai kode orang lain) —
-- pembuatan kode dilakukan lewat fungsi customer_redeem_promo()/customer_redeem_points().

-- =====================================================================
-- 8. CATATAN PEMAKAIAN PROMO PER NOMOR HP (supaya 1 nomor cuma 1x per kode promo umum)
-- =====================================================================
create table if not exists used_promo_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code text not null,
  used_at timestamptz not null default now()
);

alter table used_promo_codes enable row level security;

drop policy if exists "kasir kelola catatan pemakaian promo" on used_promo_codes;
create policy "kasir kelola catatan pemakaian promo" on used_promo_codes
  for all to authenticated
  using (true) with check (true);

-- =====================================================================
-- FUNGSI UNTUK PELANGGAN (bisa dipanggil tanpa login staf)
-- Semua fungsi di bawah ini "security definer" artinya dijalankan dengan
-- hak akses penuh WALAUPUN dipanggil oleh pengunjung anonim — tapi isinya
-- sudah dibatasi ketat supaya cuma bisa melakukan hal yang memang diizinkan
-- (contoh: cek PIN benar/salah, tidak pernah mengembalikan PIN aslinya).
-- =====================================================================

-- Daftar akun baru
create or replace function customer_register(p_phone text, p_name text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if exists (select 1 from customers where phone = p_phone) then
    raise exception 'Nomor ini sudah terdaftar. Silakan login.';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN harus 4-6 digit angka.';
  end if;
  insert into customers (phone, name, pin_hash)
  values (p_phone, p_name, crypt(p_pin, gen_salt('bf')));

  insert into customer_sessions (phone) values (p_phone) returning token into v_token;

  return json_build_object('phone', p_phone, 'name', p_name, 'session_token', v_token);
end;
$$;

-- Login akun
create or replace function customer_login(p_phone text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row customers;
  v_token uuid;
begin
  select * into v_row from customers where phone = p_phone;
  if v_row is null then
    raise exception 'Akun belum terdaftar. Silakan daftar dulu.';
  end if;
  if v_row.pin_hash <> crypt(p_pin, v_row.pin_hash) then
    raise exception 'PIN salah.';
  end if;

  insert into customer_sessions (phone) values (p_phone) returning token into v_token;

  return json_build_object('phone', p_phone, 'name', v_row.name, 'session_token', v_token);
end;
$$;

-- Helper internal: ambil nomor HP dari token sesi (null kalau tidak valid/sudah lewat)
create or replace function _session_phone(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  select phone into v_phone from customer_sessions
    where token = p_token and expires_at > now();
  return v_phone;
end;
$$;

-- Data dashboard pelanggan: poin, riwayat struk, riwayat promo yang ditukar
create or replace function customer_dashboard(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_points int;
begin
  v_phone := _session_phone(p_token);
  if v_phone is null then
    raise exception 'Sesi habis, silakan login ulang.';
  end if;

  select points into v_points from customer_points where phone = v_phone;

  return json_build_object(
    'phone', v_phone,
    'points', coalesce(v_points, 0),
    'receipts', (
      select coalesce(json_agg(json_build_object('code', code, 'time', time, 'total', (data->>'total')::numeric) order by time desc), '[]'::json)
      from receipts where phone = v_phone
    ),
    'redeemed', (
      select coalesce(json_agg(json_build_object('code', code, 'title', title, 'category', category, 'used', used, 'redeemedAt', created_at) order by created_at desc), '[]'::json)
      from redeem_codes where phone = v_phone
    )
  );
end;
$$;

-- Ambil detail 1 struk (buat dibuka/dicetak ulang)
create or replace function customer_get_receipt(p_token uuid, p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_data json;
begin
  v_phone := _session_phone(p_token);
  if v_phone is null then raise exception 'Sesi habis, silakan login ulang.'; end if;
  select data into v_data from receipts where code = p_code and phone = v_phone;
  return v_data;
end;
$$;

-- Tukar 1 promo (dari daftar promo yang tampil) jadi kode voucher
create or replace function customer_redeem_promo(p_token uuid, p_promo_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_promo promos;
  v_code text;
begin
  v_phone := _session_phone(p_token);
  if v_phone is null then raise exception 'Sesi habis, silakan login ulang.'; end if;

  select * into v_promo from promos where id = p_promo_id and active = true;
  if v_promo is null then raise exception 'Promo tidak ditemukan atau sudah tidak aktif.'; end if;
  if v_promo.expires_at is not null and v_promo.expires_at <= now() then
    raise exception 'Promo ini sudah kedaluwarsa.';
  end if;
  if exists (select 1 from redeem_codes where phone = v_phone and source_promo_id = p_promo_id) then
    raise exception 'Kamu sudah pernah menukar promo ini.';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into redeem_codes (code, phone, title, type, value, category, source_promo_id, expires_at)
  values (v_code, v_phone, v_promo.title, v_promo.type, v_promo.value, v_promo.category, p_promo_id, v_promo.expires_at);

  return json_build_object('code', v_code, 'title', v_promo.title);
end;
$$;

-- Tukar poin jadi gratis 1 item
create or replace function customer_redeem_points(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_current int;
  v_needed int;
  v_category text;
  v_code text;
  v_title text;
begin
  v_phone := _session_phone(p_token);
  if v_phone is null then raise exception 'Sesi habis, silakan login ulang.'; end if;

  select points_for_reward, reward_category into v_needed, v_category from app_settings where id = 1;

  select points into v_current from customer_points where phone = v_phone for update;
  v_current := coalesce(v_current, 0);
  if v_current < v_needed then
    raise exception 'Poin kamu belum cukup.';
  end if;

  update customer_points set points = v_current - v_needed, updated_at = now() where phone = v_phone;

  v_title := 'Gratis 1 ' || v_category || ' (Tukar Poin)';
  v_code := 'POIN' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into redeem_codes (code, phone, title, type, value, category)
  values (v_code, v_phone, v_title, 'gratis', 0, v_category);

  return json_build_object('code', v_code, 'title', v_title, 'remaining_points', v_current - v_needed);
end;
$$;

-- =====================================================================
-- FUNGSI UNTUK KASIR (wajib sudah login staf / "authenticated")
-- =====================================================================

-- Cek & validasi kode promo/voucher yang diketik kasir saat checkout
create or replace function staff_check_code(p_code text, p_phone text, p_cart_categories text[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(p_code, '\s+', '', 'g'));
  v_promo promos;
  v_redeem redeem_codes;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Hanya kasir yang login yang boleh melakukan ini.';
  end if;

  select * into v_promo from promos where upper(code) = v_code and active = true;
  if v_promo is not null then
    if v_promo.expires_at is not null and v_promo.expires_at <= now() then
      raise exception 'Kode promo ini sudah berakhir masa berlakunya.';
    end if;
    if v_promo.category <> 'Semua' and not (v_promo.category = any(p_cart_categories)) then
      raise exception 'Kode ini cuma berlaku untuk menu %.', v_promo.category;
    end if;
    if p_phone is not null and p_phone <> '' and exists (
      select 1 from used_promo_codes where phone = p_phone and code = v_promo.code
    ) then
      raise exception 'Nomor HP ini sudah pernah pakai kode promo ini sebelumnya.';
    end if;
    return json_build_object('source', 'promo', 'code', v_promo.code, 'title', v_promo.title, 'type', v_promo.type, 'value', v_promo.value, 'category', v_promo.category);
  end if;

  select * into v_redeem from redeem_codes where upper(code) = v_code;
  if v_redeem is not null then
    if v_redeem.used then raise exception 'Kode ini sudah pernah dipakai sebelumnya.'; end if;
    if v_redeem.expires_at is not null and v_redeem.expires_at <= now() then
      raise exception 'Kode penukaran ini sudah kedaluwarsa.';
    end if;
    if v_redeem.phone is not null and p_phone is not null and p_phone <> '' and v_redeem.phone <> p_phone then
      raise exception 'Kode ini bukan milik nomor HP yang dimasukkan.';
    end if;
    if v_redeem.category <> 'Semua' and not (v_redeem.category = any(p_cart_categories)) then
      raise exception 'Kode ini cuma berlaku untuk menu %.', v_redeem.category;
    end if;
    return json_build_object('source', 'redeem', 'code', v_redeem.code, 'title', v_redeem.title, 'type', v_redeem.type, 'value', v_redeem.value, 'category', v_redeem.category, 'auto_phone', v_redeem.phone);
  end if;

  raise exception 'Kode tidak ditemukan atau sudah tidak berlaku.';
end;
$$;

-- Selesaikan transaksi: simpan struk, kasih poin, tandai kode terpakai — semua sekaligus (aman dari gagal separuh jalan)
create or replace function staff_complete_sale(
  p_items jsonb,
  p_subtotal numeric,
  p_discount jsonb,
  p_total numeric,
  p_pay_method text,
  p_cash numeric,
  p_change numeric,
  p_customer_phone text,
  p_applied_code text,
  p_applied_source text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_rp int;
  v_points_earned int := 0;
  v_store_name text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Hanya kasir yang login yang boleh melakukan ini.';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  select store_name into v_store_name from app_settings where id = 1;

  insert into transactions (code, store_name, items, subtotal, discount, total, pay_method, cash, change, customer_phone)
  values (v_code, v_store_name, p_items, p_subtotal, p_discount, p_total, p_pay_method, p_cash, p_change, nullif(p_customer_phone, ''));

  if p_customer_phone is not null and p_customer_phone <> '' then
    select points_per_rupiah into v_rp from app_settings where id = 1;
    v_points_earned := floor(p_total / greatest(v_rp, 1));
    if v_points_earned > 0 then
      insert into customer_points (phone, points) values (p_customer_phone, v_points_earned)
        on conflict (phone) do update set points = customer_points.points + v_points_earned, updated_at = now();
    end if;

    insert into receipts (code, phone, data)
    values (v_code, p_customer_phone, jsonb_build_object(
      'code', v_code, 'time', now(), 'storeName', v_store_name, 'items', p_items, 'subtotal', p_subtotal,
      'discount', p_discount, 'total', p_total, 'payMethod', p_pay_method, 'cash', p_cash, 'change', p_change,
      'pointsEarned', v_points_earned
    ));

    if p_applied_source = 'promo' and p_applied_code is not null then
      insert into used_promo_codes (phone, code) values (p_customer_phone, upper(p_applied_code));
    end if;
  end if;

  if p_applied_source = 'redeem' and p_applied_code is not null then
    update redeem_codes set used = true where upper(code) = upper(p_applied_code);
  end if;

  return json_build_object('code', v_code, 'points_earned', v_points_earned);
end;
$$;

-- Daftar akun pelanggan (tanpa PIN) buat ditampilkan di tab "Akun" kasir
create or replace function staff_list_customers()
returns table(phone text, name text, joined_at timestamptz, points int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Hanya kasir yang login yang boleh melakukan ini.';
  end if;
  return query
    select c.phone, c.name, c.joined_at, coalesce(cp.points, 0) as points
    from customers c
    left join customer_points cp on cp.phone = c.phone
    order by c.joined_at desc;
end;
$$;

-- Hapus akun pelanggan (buat kasus "lupa PIN") — riwayat struk & poin tetap ada
create or replace function staff_delete_customer(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Hanya kasir yang login yang boleh melakukan ini.';
  end if;
  delete from customers where phone = p_phone;
end;
$$;

-- =====================================================================
-- IZIN AKSES FUNGSI (siapa boleh panggil fungsi apa)
-- =====================================================================
revoke all on function customer_register(text, text, text) from public;
revoke all on function customer_login(text, text) from public;
revoke all on function customer_dashboard(uuid) from public;
revoke all on function customer_get_receipt(uuid, text) from public;
revoke all on function customer_redeem_promo(uuid, uuid) from public;
revoke all on function customer_redeem_points(uuid) from public;
revoke all on function staff_check_code(text, text, text[]) from public;
revoke all on function staff_complete_sale(jsonb, numeric, jsonb, numeric, text, numeric, numeric, text, text, text) from public;
revoke all on function staff_list_customers() from public;
revoke all on function staff_delete_customer(text) from public;

grant execute on function customer_register(text, text, text) to anon;
grant execute on function customer_login(text, text) to anon;
grant execute on function customer_dashboard(uuid) to anon;
grant execute on function customer_get_receipt(uuid, text) to anon;
grant execute on function customer_redeem_promo(uuid, uuid) to anon;
grant execute on function customer_redeem_points(uuid) to anon;

grant execute on function staff_check_code(text, text, text[]) to authenticated;
grant execute on function staff_complete_sale(jsonb, numeric, jsonb, numeric, text, numeric, numeric, text, text, text) to authenticated;
grant execute on function staff_list_customers() to authenticated;
grant execute on function staff_delete_customer(text) to authenticated;

-- =====================================================================
-- CONTOH PRODUK AWAL (boleh dihapus/diubah nanti lewat aplikasi)
-- =====================================================================
insert into products (name, category, price)
select * from (values
  ('Kopi Hitam', 'Minuman', 8000),
  ('Es Teh Manis', 'Minuman', 5000),
  ('Nasi Goreng', 'Makanan', 15000),
  ('Mie Goreng', 'Makanan', 13000),
  ('Pisang Goreng', 'Snack', 7000)
) as seed(name, category, price)
where not exists (select 1 from products);

-- =====================================================================
-- SELESAI. Lanjut ke langkah berikutnya: buat akun login kasir di menu
-- "Authentication" → "Add User" (pakai email & password kamu sendiri).
-- =====================================================================
