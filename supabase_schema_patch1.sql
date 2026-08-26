-- =====================================================================
-- PATCH TAMBAHAN — jalankan ini SETELAH supabase_schema.sql
-- (nambah 1 kolom yang kelewatan buat fitur "Harga Bebas" per produk)
-- =====================================================================
alter table products add column if not exists custom_price boolean not null default false;
alter table app_settings add column if not exists background text;
