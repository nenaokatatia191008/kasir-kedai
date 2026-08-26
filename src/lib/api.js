import { supabase } from "./supabaseClient";

/* =========================================================
   PRODUK
========================================================= */
export async function listProducts() {
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price, photo: p.photo, customPrice: p.custom_price }));
}

// Terima array LENGKAP produk (pola yang sama seperti versi lama) — di sini kita
// bandingkan dengan daftar id sebelumnya (prevIds) untuk tahu mana yang baru,
// diubah, atau dihapus, lalu kirim ke Supabase secukupnya saja.
export async function saveProducts(next, prevIds) {
  const rows = next.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    photo: p.photo,
    custom_price: !!p.customPrice,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("products").upsert(rows);
    if (error) throw error;
  }
  const nextIds = next.map((p) => p.id);
  const toDelete = (prevIds || []).filter((id) => !nextIds.includes(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", toDelete);
    if (error) throw error;
  }
}

/* =========================================================
   PENGATURAN TOKO
========================================================= */
export async function getSettings() {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return {
    storeName: data.store_name,
    logo: data.logo,
    background: data.background || null,
    address: data.address || "",
    webVersion: data.web_version || "",
    storeOpen: data.store_open !== false,
    pointsPerRupiah: data.points_per_rupiah || 10000,
    pointsForReward: data.points_for_reward || 10,
    rewardCategory: data.reward_category || "Minuman",
  };
}

export async function updateSettings(fields) {
  const payload = {};
  if (fields.storeName !== undefined) payload.store_name = fields.storeName;
  if (fields.logo !== undefined) payload.logo = fields.logo;
  if (fields.background !== undefined) payload.background = fields.background;
  if (fields.address !== undefined) payload.address = fields.address;
  if (fields.webVersion !== undefined) payload.web_version = fields.webVersion;
  if (fields.storeOpen !== undefined) payload.store_open = fields.storeOpen;
  if (fields.pointsPerRupiah !== undefined) payload.points_per_rupiah = fields.pointsPerRupiah;
  if (fields.pointsForReward !== undefined) payload.points_for_reward = fields.pointsForReward;
  if (fields.rewardCategory !== undefined) payload.reward_category = fields.rewardCategory;
  payload.updated_at = new Date().toISOString();
  const { error } = await supabase.from("app_settings").update(payload).eq("id", 1);
  if (error) throw error;
}

// Baca status TERBARU dari server dulu sebelum membalik, biar tidak ada
// kemungkinan menimpa balik dengan data lama (race condition).
export async function toggleStoreOpen() {
  const current = await getSettings();
  const next = !current.storeOpen;
  await updateSettings({ storeOpen: next });
  return next;
}

/* =========================================================
   AUTENTIKASI KASIR (staf)
========================================================= */
export async function staffSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function staffSignOut() {
  await supabase.auth.signOut();
}

export function onStaffAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function getStaffSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function staffChangePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* =========================================================
   TRANSAKSI (khusus kasir yang sudah login)
========================================================= */
export async function listTransactions() {
  const { data, error } = await supabase.from("transactions").select("*").order("time", { ascending: false });
  if (error) throw error;
  return (data || []).map((t) => ({
    id: t.id,
    code: t.code,
    time: new Date(t.time).getTime(),
    storeName: t.store_name,
    items: t.items,
    subtotal: t.subtotal,
    discount: t.discount,
    total: t.total,
    payMethod: t.pay_method,
    cash: t.cash,
    change: t.change,
    customerPhone: t.customer_phone,
    pointsEarned: t.points_earned,
  }));
}

// Simpan 1 transaksi lengkap SEKALIGUS: struk, poin, & tandai kode
// promo/voucher terpakai — semua dijamin server (RPC), tidak bisa dipalsukan dari browser.
export async function completeSale({ items, subtotal, discount, total, payMethod, cash, change, customerPhone, appliedCode, appliedSource }) {
  const { data, error } = await supabase.rpc("staff_complete_sale", {
    p_items: items,
    p_subtotal: subtotal,
    p_discount: discount,
    p_total: total,
    p_pay_method: payMethod,
    p_cash: cash,
    p_change: change,
    p_customer_phone: customerPhone || null,
    p_applied_code: appliedCode || null,
    p_applied_source: appliedSource || null,
  });
  if (error) throw new Error(error.message);
  return data; // { code, points_earned }
}

// Validasi kode promo/voucher yang diketik kasir (dicek di server, tidak bisa dicurangi)
export async function staffCheckCode(code, phone, cartCategories) {
  const { data, error } = await supabase.rpc("staff_check_code", {
    p_code: code,
    p_phone: phone || null,
    p_cart_categories: cartCategories,
  });
  if (error) throw new Error(error.message);
  return data; // { source, code, title, type, value, category, auto_phone? }
}

export async function resetAllTransactions() {
  // trik umum Supabase buat "hapus semua baris": pakai filter yang selalu benar
  const { error } = await supabase.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}

/* =========================================================
   PROMO
========================================================= */
export async function listPromosAdmin() {
  const { data, error } = await supabase.from("promos").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPromoRow);
}

export async function listPromosPublic() {
  const { data, error } = await supabase.from("promos").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPromoRow);
}

function mapPromoRow(p) {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description,
    type: p.type,
    value: p.value,
    active: p.active,
    category: p.category,
    expiresAt: p.expires_at ? new Date(p.expires_at).getTime() : null,
  };
}

export async function upsertPromo(promo) {
  const row = {
    code: promo.code,
    title: promo.title,
    description: promo.description,
    type: promo.type,
    value: promo.value,
    active: promo.active,
    category: promo.category,
    expires_at: promo.expiresAt ? new Date(promo.expiresAt).toISOString() : null,
  };
  if (promo.id) {
    const { error } = await supabase.from("promos").update(row).eq("id", promo.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("promos").insert(row);
    if (error) throw error;
  }
}

export async function deletePromo(id) {
  const { error } = await supabase.from("promos").delete().eq("id", id);
  if (error) throw error;
}

export async function togglePromoActive(id, active) {
  const { error } = await supabase.from("promos").update({ active }).eq("id", id);
  if (error) throw error;
}

/* =========================================================
   AKUN & SESI PELANGGAN (Web Pelanggan)
========================================================= */
const SESSION_KEY = "kedai_customer_session";

export function loadCustomerSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveCustomerSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearCustomerSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function customerRegister(phone, name, pin) {
  const { data, error } = await supabase.rpc("customer_register", { p_phone: phone, p_name: name, p_pin: pin });
  if (error) throw new Error(error.message);
  const session = { phone: data.phone, name: data.name, token: data.session_token };
  saveCustomerSession(session);
  return session;
}

export async function customerLogin(phone, pin) {
  const { data, error } = await supabase.rpc("customer_login", { p_phone: phone, p_pin: pin });
  if (error) throw new Error(error.message);
  const session = { phone: data.phone, name: data.name, token: data.session_token };
  saveCustomerSession(session);
  return session;
}

export async function customerDashboard(token) {
  const { data, error } = await supabase.rpc("customer_dashboard", { p_token: token });
  if (error) throw new Error(error.message);
  return data; // { phone, points, receipts: [...], redeemed: [...] }
}

export async function customerGetReceipt(token, code) {
  const { data, error } = await supabase.rpc("customer_get_receipt", { p_token: token, p_code: code });
  if (error) throw new Error(error.message);
  return data;
}

export async function customerRedeemPromo(token, promoId) {
  const { data, error } = await supabase.rpc("customer_redeem_promo", { p_token: token, p_promo_id: promoId });
  if (error) throw new Error(error.message);
  return data; // { code, title }
}

export async function customerRedeemPoints(token) {
  const { data, error } = await supabase.rpc("customer_redeem_points", { p_token: token });
  if (error) throw new Error(error.message);
  return data; // { code, title, remaining_points }
}

/* =========================================================
   AKUN PELANGGAN (dilihat/dikelola dari sisi kasir)
========================================================= */
export async function staffListCustomers() {
  const { data, error } = await supabase.rpc("staff_list_customers");
  if (error) throw new Error(error.message);
  return (data || []).map((a) => ({ phone: a.phone, name: a.name, joined: new Date(a.joined_at).getTime(), points: a.points }));
}

export async function staffDeleteCustomer(phone) {
  const { error } = await supabase.rpc("staff_delete_customer", { p_phone: phone });
  if (error) throw new Error(error.message);
}
