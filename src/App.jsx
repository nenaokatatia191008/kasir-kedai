import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Minus, Trash2, Receipt, Coffee, UtensilsCrossed, Cookie, X, Search, TrendingUp, ShoppingBag, Wallet, Printer, Pencil, ClipboardList, Store, Settings as SettingsIcon, Image as ImageIcon, Upload, User, Phone, Lock, LogOut, Gift, Tag, CheckCircle2, ArrowLeft, Sparkles, Shield, Users, RotateCcw, Ticket, PencilLine, MapPin, Info, Mail, KeyRound } from "lucide-react";
import * as api from "./lib/api";

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root {
  --bg: #1C1815;
  --surface: #241F1B;
  --surface-2: #2E2822;
  --surface-3: #382F27;
  --accent: #E8A33D;
  --accent-soft: #6b552d;
  --accent-2: #8FAE7C;
  --accent-red: #C4695A;
  --text: #F5EFE6;
  --text-muted: #A69C8E;
  --border: #3D362F;
}
.kasir-root { font-family: 'Inter', sans-serif; color: var(--text); position: relative; width: 100%; max-width: 100%; box-sizing: border-box; display: block; }
.kasir-bg-layer { position: absolute; inset: 0; background: var(--bg); background-size: cover; background-position: center; z-index: 0; }
.kasir-content { position: relative; z-index: 1; }
.kasir-root .font-display { font-family: 'Fraunces', serif; }
.kasir-root .font-mono { font-family: 'JetBrains Mono', monospace; }
.kasir-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.kasir-root ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 4px; }
.kasir-root ::-webkit-scrollbar-track { background: transparent; }
.ticket-edge {
  background-image: radial-gradient(circle at 0 50%, var(--surface-2) 5px, transparent 5.5px), radial-gradient(circle at 100% 50%, var(--surface-2) 5px, transparent 5.5px);
  background-size: 100% 16px;
  background-repeat: repeat-y;
}
.dash { background-image: repeating-linear-gradient(to right, var(--border) 0, var(--border) 6px, transparent 6px, transparent 12px); height: 1px; }
@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.slide-up { animation: slideUp 0.25s ease-out; }
.kasir-root button { cursor: pointer; }
.kasir-root input:focus, .kasir-root button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
`;

// Perlu format UUID asli karena sekarang dipakai sebagai id di tabel Supabase (products, promos)
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); }));
const rupiah = (n) => "Rp " + Math.round(n).toLocaleString("id-ID");
// Alfabet aman dari salah baca: tanpa O/0, I/L/1, S/5, Z/2, B/8, G/6
const CODE_CHARS = "346789ACDEFHJKMNPRTUVWXY";
const generateReceiptCode = () => {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
};
// Menyamakan karakter yang sering tertukar saat diketik ulang manusia, dipakai hanya untuk pencocokan pencarian
const AMBIG_MAP = { O: "0", I: "1", L: "1", S: "5", Z: "2", B: "8", G: "6", Q: "0" };
const canonCode = (str) =>
  (str || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .split("")
    .map((ch) => AMBIG_MAP[ch] || ch)
    .join("");

// Kategori yang bisa dipakai untuk membatasi berlakunya kode promo
const PROMO_CATEGORIES = ["Semua", "Minuman", "Makanan", "Snack"];
const isPromoExpired = (p) => !!(p && p.expiresAt && Date.now() > p.expiresAt);
// Konversi timestamp (ms) <-> string untuk input type="datetime-local" (memakai waktu lokal perangkat)
const msToLocalInput = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToMs = (str) => {
  if (!str) return null;
  const t = new Date(str).getTime();
  return Number.isNaN(t) ? null : t;
};

// (Menu awal sudah di-seed langsung lewat SQL di Supabase, jadi tidak perlu lagi didaftarkan di sini)

const DEFAULT_SETTINGS = { storeName: "Kedai Kasir", logo: null, background: null, staffPin: "1234", storeOpen: true, address: "", webVersion: "", pointsPerRupiah: 10000, pointsForReward: 10, rewardCategory: "Minuman" };

const CATEGORY_ICON = { Minuman: Coffee, Makanan: UtensilsCrossed, Snack: Cookie };
const CATEGORY_LIST = ["Minuman", "Makanan", "Snack"];

// Resize + compress an uploaded image file into a small base64 data URL
function resizeImageFile(file, maxDim = 500, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Gagal memuat gambar"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Data produk & pengaturan diambil dari Supabase (bisa dibaca siapa saja, tanpa login).
// Data transaksi baru dimuat KALAU staf sudah login (lihat authSession).
function useStorage(authSession) {
  const [products, setProducts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [settings, setSettings] = useState(null);
  const [ready, setReady] = useState(false);

  const loadPublicData = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([api.listProducts(), api.getSettings()]);
      setProducts(p);
      setSettings(s);
    } catch (e) {
      console.error("gagal memuat data toko", e);
    }
    setReady(true);
  }, []);

  useEffect(() => { loadPublicData(); }, [loadPublicData]);

  // Transaksi cuma bisa dibaca staf yang sudah login (lihat kebijakan RLS di Supabase)
  useEffect(() => {
    if (!authSession) { setTransactions([]); return; }
    (async () => {
      try {
        const t = await api.listTransactions();
        setTransactions(t);
      } catch (e) {
        console.error("gagal memuat transaksi", e);
        setTransactions([]);
      }
    })();
  }, [authSession]);

  const saveProducts = useCallback(async (next) => {
    const prevIds = (products || []).map((p) => p.id);
    setProducts(next);
    try {
      await api.saveProducts(next, prevIds);
    } catch (e) {
      console.error("save products failed", e);
      alert("Gagal menyimpan produk: " + (e.message || e));
    }
  }, [products]);

  // Transaksi ditulis lewat api.completeSale() saat checkout (lihat CashierApp) — fungsi ini
  // cuma dipakai untuk "reset semua transaksi" di tab Laporan.
  const saveTransactions = useCallback(async (next) => {
    setTransactions(next);
    if (next.length === 0) {
      try {
        await api.resetAllTransactions();
      } catch (e) { console.error("reset transactions failed", e); }
    }
  }, []);

  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    try {
      await api.updateSettings(next);
    } catch (e) {
      console.error("save settings failed", e);
      alert("Gagal menyimpan pengaturan: " + (e.message || e));
    }
  }, []);

  const toggleStoreOpen = useCallback(async () => {
    try {
      const next = await api.toggleStoreOpen();
      setSettings((prev) => ({ ...prev, storeOpen: next }));
    } catch (e) {
      console.error("toggle store open failed", e);
    }
  }, []);

  return { products, transactions, settings, ready, saveProducts, saveTransactions, saveSettings, toggleStoreOpen, setTransactions };
}

// Normalisasi nomor HP jadi kunci yang konsisten (hanya digit).
// Samakan semua variasi penulisan nomor HP Indonesia (0812.../+62812.../62812...) jadi satu format
// kanonik "62xxxxxxxxxx" — supaya nomor yang sama tetap dikenali sebagai akun/poin yang sama
// walaupun kasir & pelanggan menuliskannya dengan format berbeda.
const normPhone = (p) => {
  let d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (!d.startsWith("62")) d = "62" + d;
  return d;
};

// Jam & tanggal berjalan (update tiap detik) — dipakai di header kasir & web pelanggan
function LiveClock({ compact }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = now.toLocaleDateString("id-ID", { weekday: compact ? "short" : "long", day: "numeric", month: compact ? "short" : "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9999, padding: "6px 12px" }}>
      <span className="font-mono" style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.5 }}>{timeStr}</span>
      <span style={{ width: 1, height: 12, background: "var(--border)" }} />
      <span style={{ fontSize: compact ? 10.5 : 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{dateStr}</span>
    </div>
  );
}

function CashierApp({ onExit, authSession }) {
  const { products, transactions, settings, ready, saveProducts, saveTransactions, saveSettings, toggleStoreOpen, setTransactions } = useStorage(authSession);
  const [tab, setTab] = useState("kasir");
  const [category, setCategory] = useState("Semua");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState("Tunai");
  const [cashGiven, setCashGiven] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [productForm, setProductForm] = useState(null);
  const [reportRange, setReportRange] = useState("hari-ini");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customPriceProduct, setCustomPriceProduct] = useState(null); // produk yang lagi diisi harga manual
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null); // {title, type, value, code, redeemKey?}
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      const matchCat = category === "Semua" || p.category === category;
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, category, search]);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
  // Kalau promo dibatasi untuk kategori tertentu (Minuman/Makanan/Snack), potongan cuma dihitung
  // dari subtotal item-item kategori itu di keranjang, bukan dari seluruh belanjaan.
  const promoBase = useMemo(() => {
    if (!appliedPromo) return 0;
    if (!appliedPromo.category || appliedPromo.category === "Semua") return subtotal;
    return cart.filter((i) => i.category === appliedPromo.category).reduce((s, i) => s + i.price * i.qty, 0);
  }, [appliedPromo, cart, subtotal]);
  const discountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.type === "persen") return Math.round((promoBase * appliedPromo.value) / 100);
    if (appliedPromo.type === "gratis") {
      // Poin ditukar jadi gratis 1 item kategori terkait — gratiskan item termurah di kategori itu
      const matching = cart.filter((i) => i.category === appliedPromo.category);
      if (matching.length === 0) return 0;
      return Math.min(...matching.map((i) => i.price));
    }
    return Math.min(appliedPromo.value, promoBase);
  }, [appliedPromo, promoBase, cart]);
  const cartTotal = Math.max(subtotal - discountAmount, 0);
  const cashNum = parseInt(cashGiven || "0", 10) || 0;
  const change = cashNum - cartTotal;

  const addToCart = (product, overridePrice) => {
    if (product.customPrice && typeof overridePrice !== "number") {
      setCustomPriceProduct(product);
      return;
    }
    const price = typeof overridePrice === "number" ? overridePrice : product.price;
    setCart((prev) => {
      if (product.customPrice) {
        return [...prev, { ...product, price, qty: 1, lineId: uid() }];
      }
      const existing = prev.find((i) => i.id === product.id && !i.customPrice);
      if (existing) return prev.map((i) => (i.lineId === existing.lineId ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { ...product, price, qty: 1, lineId: uid() }];
    });
  };

  const confirmCustomPrice = (price) => {
    if (!customPriceProduct || !(price > 0)) return;
    addToCart(customPriceProduct, price);
    setCustomPriceProduct(null);
  };

  const changeQty = (lineId, delta) => {
    setCart((prev) =>
      prev
        .map((i) => (i.lineId === lineId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeFromCart = (lineId) => setCart((prev) => prev.filter((i) => i.lineId !== lineId));
  const clearCart = () => {
    setCart([]); setCashGiven(""); setPayMethod("Tunai"); setCustomerPhone("");
    setPromoCodeInput(""); setAppliedPromo(null); setPromoError("");
  };

  const applyPromoCode = async () => {
    const codeClean = promoCodeInput.replace(/\s+/g, "").toUpperCase();
    if (!codeClean) return;
    setPromoBusy(true);
    setPromoError("");
    const phone = normPhone(customerPhone);
    const cartCategories = [...new Set(cart.map((i) => i.category))];
    try {
      // Semua validasi (aktif/tidak, kedaluwarsa, kategori cocok, sudah pernah dipakai nomor
      // ini atau belum) sekarang dicek di server (Supabase), jadi tidak bisa dicurangi dari browser.
      const result = await api.staffCheckCode(codeClean, phone, cartCategories);
      if (result.auto_phone && !phone) setCustomerPhone(result.auto_phone);
      setAppliedPromo({
        source: result.source,
        title: result.title,
        type: result.type,
        value: result.value,
        code: result.code,
        category: result.category,
      });
    } catch (e) {
      setPromoError(e.message || "Kode tidak ditemukan atau sudah tidak berlaku.");
    }
    setPromoBusy(false);
  };

  const removePromo = () => { setAppliedPromo(null); setPromoCodeInput(""); setPromoError(""); };

  const completeSale = async () => {
    if (cart.length === 0) return;
    if (payMethod === "Tunai" && cashNum < cartTotal) return;
    const phone = normPhone(customerPhone);
    try {
      // 1 pemanggilan ke server ini SEKALIGUS: menyimpan struk, menghitung & menambah poin,
      // dan menandai kode promo/voucher terpakai — semuanya dijamin oleh database, tidak
      // mungkin gagal separuh jalan.
      const result = await api.completeSale({
        items: cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, category: i.category })),
        subtotal,
        discount: appliedPromo ? { title: appliedPromo.title, type: appliedPromo.type, value: appliedPromo.value, category: appliedPromo.category || "Semua", amount: discountAmount } : null,
        total: cartTotal,
        payMethod,
        cash: payMethod === "Tunai" ? cashNum : cartTotal,
        change: payMethod === "Tunai" ? Math.max(change, 0) : 0,
        customerPhone: phone || null,
        appliedCode: appliedPromo ? appliedPromo.code : null,
        appliedSource: appliedPromo ? appliedPromo.source : null,
      });
      const trx = {
        code: result.code,
        time: Date.now(),
        storeName: settings.storeName || "Kedai Kasir",
        items: cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, category: i.category })),
        subtotal,
        discount: appliedPromo ? { title: appliedPromo.title, type: appliedPromo.type, value: appliedPromo.value, category: appliedPromo.category || "Semua", amount: discountAmount } : null,
        total: cartTotal,
        payMethod,
        cash: payMethod === "Tunai" ? cashNum : cartTotal,
        change: payMethod === "Tunai" ? Math.max(change, 0) : 0,
        customerPhone: phone || null,
        pointsEarned: result.points_earned || 0,
      };
      setTransactions((prev) => [trx, ...(prev || [])]);
      setReceipt(trx);
      clearCart();
    } catch (e) {
      alert("Gagal menyelesaikan transaksi: " + (e.message || e));
    }
  };

  const resetTransactions = async () => {
    await saveTransactions([]);
  };

  // ---- Reporting ----
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const rangeStart = useMemo(() => {
    if (reportRange === "hari-ini") return startOfDay(now);
    if (reportRange === "7-hari") return startOfDay(now) - 6 * 86400000;
    if (reportRange === "30-hari") return startOfDay(now) - 29 * 86400000;
    return 0;
  }, [reportRange]);

  const filteredTrx = useMemo(
    () => (transactions || []).filter((t) => t.time >= rangeStart),
    [transactions, rangeStart]
  );

  const reportStats = useMemo(() => {
    const revenue = filteredTrx.reduce((s, t) => s + t.total, 0);
    const count = filteredTrx.length;
    const avg = count ? revenue / count : 0;
    const itemTally = {};
    filteredTrx.forEach((t) =>
      t.items.forEach((i) => {
        itemTally[i.name] = (itemTally[i.name] || 0) + i.qty;
      })
    );
    const topItems = Object.entries(itemTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { revenue, count, avg, topItems };
  }, [filteredTrx]);

  if (!ready) {
    return (
      <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <style>{FONT_STYLE}</style>
        <div style={{ color: "var(--text-muted)" }}>Menyiapkan kasir…</div>
      </div>
    );
  }

  return (
    <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 600, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
      <style>{FONT_STYLE}</style>
      <div
        className="kasir-bg-layer"
        style={settings.background ? {
          backgroundImage: `linear-gradient(rgba(20,17,15,0.82), rgba(20,17,15,0.88)), url(${settings.background})`,
        } : {}}
      />

      <div className="kasir-content">
        {/* Header */}
        <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {settings.logo ? (
              <img src={settings.logo} alt="logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Store size={20} color="#1C1815" />
              </div>
            )}
            <div>
              <div className="font-display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{settings.storeName || "Kedai Kasir"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Kasir kedai makanan &amp; minuman</div>
            </div>
            <button
              onClick={toggleStoreOpen}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9999,
                border: "1px solid " + (settings.storeOpen !== false ? "var(--accent-2)" : "var(--accent-red)"),
                background: settings.storeOpen !== false ? "rgba(143,174,124,0.12)" : "rgba(196,105,90,0.12)",
                color: settings.storeOpen !== false ? "var(--accent-2)" : "var(--accent-red)",
                fontWeight: 700, fontSize: 12.5, marginLeft: 6,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
              {settings.storeOpen !== false ? "Kedai Buka" : "Kedai Tutup"}
            </button>
            <LiveClock />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
              {[
                { id: "kasir", label: "Kasir", icon: ShoppingBag },
                { id: "menu", label: "Menu", icon: ClipboardList },
                { id: "promo", label: "Promo", icon: Gift },
                { id: "akun", label: "Akun", icon: Users },
                { id: "laporan", label: "Laporan", icon: TrendingUp },
                { id: "cekstruk", label: "Cek Struk", icon: Receipt },
                { id: "pengaturan", label: "Pengaturan", icon: SettingsIcon },
              ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 14px", borderRadius: 8, border: "none",
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#1C1815" : "var(--text-muted)",
                    fontWeight: 600, fontSize: 13, transition: "all 0.15s",
                  }}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
            </div>
            {onExit && (
              <button
                onClick={onExit}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 12.5 }}
              >
                <ArrowLeft size={14} /> Ganti Mode
              </button>
            )}
          </div>
        </div>

        {tab === "kasir" && (
          <div style={{ display: "flex", minHeight: 560, flexWrap: "wrap" }}>
            {/* Product panel */}
            <div style={{ flex: "1 1 480px", minWidth: 0, padding: 20 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 200px" }}>
                  <Search size={15} color="var(--text-muted)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari menu..."
                    style={{
                      width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 13, boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Semua", ...CATEGORY_LIST].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      style={{
                        padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                        border: "1px solid " + (category === c ? "var(--accent)" : "var(--border)"),
                        background: category === c ? "var(--accent-soft)" : "var(--surface-2)",
                        color: category === c ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                {filteredProducts.map((p) => {
                  const Icon = CATEGORY_ICON[p.category] || Coffee;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      style={{
                        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
                        padding: 14, textAlign: "left", display: "flex", flexDirection: "column", gap: 10,
                        transition: "transform 0.12s, border-color 0.12s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    >
                      {p.photo ? (
                        <img src={p.photo} alt={p.name} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 7 }} />
                      ) : (
                        <div style={{ width: 30, height: 30, borderRadius: 7, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={15} color="var(--accent)" />
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                      {p.customPrice ? (
                        <div className="font-mono" style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700 }}>Harga sesuai pesanan</div>
                      ) : (
                        <div className="font-mono" style={{ fontSize: 13, color: "var(--accent-2)", fontWeight: 700 }}>{rupiah(p.price)}</div>
                      )}
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", color: "var(--text-muted)", fontSize: 13, padding: 30, textAlign: "center" }}>
                    Menu tidak ditemukan.
                  </div>
                )}
              </div>
            </div>

            {/* Order ticket panel */}
            <div style={{ width: 320, flex: "0 0 320px", background: "var(--surface-2)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "16px 18px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                <Receipt size={16} color="var(--accent)" />
                <div className="font-display" style={{ fontWeight: 600, fontSize: 15 }}>Pesanan</div>
                {cart.length > 0 && (
                  <button onClick={clearCart} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-muted)", fontSize: 12 }}>
                    Kosongkan
                  </button>
                )}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px", minHeight: 120 }}>
                {cart.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
                    Belum ada pesanan.<br />Ketuk menu untuk menambah.
                  </div>
                )}
                {cart.map((item) => (
                  <div key={item.lineId} className="slide-up" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{item.name}</div>
                      <button onClick={() => removeFromCart(item.lineId)} style={{ background: "none", border: "none", color: "var(--accent-red)", padding: 0 }}>
                        <X size={13} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-3)", borderRadius: 6, padding: "2px 6px" }}>
                        <button onClick={() => changeQty(item.lineId, -1)} style={{ background: "none", border: "none", color: "var(--text)", padding: 2 }}><Minus size={12} /></button>
                        <span className="font-mono" style={{ fontSize: 12, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
                        <button onClick={() => changeQty(item.lineId, 1)} style={{ background: "none", border: "none", color: "var(--text)", padding: 2 }}><Plus size={12} /></button>
                      </div>
                      <div className="font-mono" style={{ fontSize: 12.5, color: "var(--accent-2)" }}>{rupiah(item.price * item.qty)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ticket-edge" style={{ padding: "14px 18px 0" }}>
                <div className="dash" style={{ margin: "0 0 14px" }} />

                <div style={{ marginBottom: 10 }}>
                  {!appliedPromo ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyPromoCode(); }}
                        placeholder="Kode promo (opsional)"
                        className="font-mono"
                        style={{ flex: 1, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", color: "var(--text)", fontSize: 12, boxSizing: "border-box", textTransform: "uppercase" }}
                      />
                      <button type="button" onClick={applyPromoCode} disabled={promoBusy} style={{ padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-3)", color: "var(--accent)", fontWeight: 700, fontSize: 11.5 }}>
                        {promoBusy ? "…" : "Pakai"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 7, padding: "7px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Ticket size={13} color="var(--accent)" />
                          <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>{appliedPromo.title}</span>
                          {appliedPromo.category && appliedPromo.category !== "Semua" && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-muted)" }}>
                              {appliedPromo.category}
                            </span>
                          )}
                        </div>
                        <button type="button" onClick={removePromo} style={{ background: "none", border: "none", color: "var(--accent-red)" }}><X size={13} /></button>
                      </div>
                      {appliedPromo.category && appliedPromo.category !== "Semua" && promoBase === 0 && (
                        <div style={{ fontSize: 10.5, color: "var(--accent-red)", marginTop: 5 }}>
                          Belum ada menu {appliedPromo.category} di keranjang — diskon belum berlaku.
                        </div>
                      )}
                    </div>
                  )}
                  {promoError && <div style={{ fontSize: 11, color: "var(--accent-red)", marginTop: 5 }}>{promoError}</div>}
                </div>

                {appliedPromo && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: "var(--text-muted)" }}>
                    <span>Subtotal</span>
                    <span className="font-mono">{rupiah(subtotal)}</span>
                  </div>
                )}
                {appliedPromo && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, color: "var(--accent-2)" }}>
                    <span>Diskon</span>
                    <span className="font-mono">-{rupiah(discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>Total</span>
                  <span className="font-mono" style={{ fontWeight: 700, fontSize: 17, color: "var(--accent)" }}>{rupiah(cartTotal)}</span>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {["Tunai", "QRIS", "Debit"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setPayMethod(m)}
                      style={{
                        flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                        border: "1px solid " + (payMethod === m ? "var(--accent)" : "var(--border)"),
                        background: payMethod === m ? "var(--accent-soft)" : "var(--surface-3)",
                        color: payMethod === m ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="No. HP pelanggan (opsional, buat riwayat, promo & poin)"
                  className="font-mono"
                  style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 12.5, boxSizing: "border-box", marginBottom: normPhone(customerPhone).length >= 10 ? 4 : 10 }}
                />
                {normPhone(customerPhone).length >= 10 && (
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 10 }}>
                    Nomor ini dapat sekitar{" "}
                    <b style={{ color: "var(--accent-2)" }}>{Math.floor(cartTotal / (settings.pointsPerRupiah || 10000))} poin</b> dari belanja ini
                    (poinnya bisa dicek/ditukar setelah daftar akun Web Pelanggan pakai nomor yang sama).
                  </div>
                )}

                {payMethod === "Tunai" && (
                  <div style={{ marginBottom: 10 }}>
                    <input
                      type="number"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      placeholder="Uang diterima"
                      className="font-mono"
                      style={{ width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
                    />
                    {cashGiven !== "" && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, color: change < 0 ? "var(--accent-red)" : "var(--accent-2)" }}>
                        <span>{change < 0 ? "Kurang" : "Kembalian"}</span>
                        <span className="font-mono">{rupiah(Math.abs(change))}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={completeSale}
                  disabled={cart.length === 0 || (payMethod === "Tunai" && cashNum < cartTotal)}
                  style={{
                    width: "100%", padding: "11px 0", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13.5,
                    marginBottom: 16,
                    background: cart.length === 0 || (payMethod === "Tunai" && cashNum < cartTotal) ? "var(--surface-3)" : "var(--accent)",
                    color: cart.length === 0 || (payMethod === "Tunai" && cashNum < cartTotal) ? "var(--text-muted)" : "#1C1815",
                  }}
                >
                  Selesaikan &amp; Cetak Struk
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "menu" && (
          <MenuTab
            products={products}
            saveProducts={saveProducts}
            productForm={productForm}
            setProductForm={setProductForm}
          />
        )}

        {tab === "laporan" && (
          <ReportTab
            reportRange={reportRange}
            setReportRange={setReportRange}
            stats={reportStats}
            transactions={filteredTrx}
            onReset={resetTransactions}
            hasAnyTransactions={(transactions || []).length > 0}
          />
        )}

        {tab === "cekstruk" && <CekStrukTab localTransactions={transactions} />}

        {tab === "promo" && <PromoAdminTab />}

        {tab === "akun" && <CustomerAccountsTab />}

        {tab === "pengaturan" && (
          <SettingsTab settings={settings} saveSettings={saveSettings} />
        )}
      </div>

      {customPriceProduct && (
        <CustomPriceModal
          product={customPriceProduct}
          onCancel={() => setCustomPriceProduct(null)}
          onConfirm={confirmCustomPrice}
        />
      )}

      {receipt && <ReceiptModal trx={receipt} storeName={settings.storeName} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function MenuTab({ products, saveProducts, productForm, setProductForm }) {
  const [formError, setFormError] = useState("");
  const startNew = () => { setProductForm({ id: null, name: "", category: "Minuman", price: "", photo: null, customPrice: false }); setFormError(""); };
  const startEdit = (p) => { setProductForm({ id: p.id, name: p.name, category: p.category, price: String(p.price || ""), photo: p.photo || null, customPrice: !!p.customPrice }); setFormError(""); };

  const submit = async (e) => {
    e.preventDefault();
    if (!productForm.name.trim()) { setFormError("Nama menu belum diisi."); return; }
    let price = 0;
    if (!productForm.customPrice) {
      price = parseInt(productForm.price, 10) || 0;
      if (price <= 0) { setFormError("Harga harus diisi dan lebih dari 0. Atau aktifkan \"Harga Bebas\" kalau harganya berubah-ubah."); return; }
    }
    setFormError("");
    if (productForm.id) {
      const next = products.map((p) => (p.id === productForm.id ? { ...p, name: productForm.name.trim(), category: productForm.category, price, photo: productForm.photo, customPrice: !!productForm.customPrice } : p));
      await saveProducts(next);
    } else {
      const next = [...products, { id: uid(), name: productForm.name.trim(), category: productForm.category, price, photo: productForm.photo, customPrice: !!productForm.customPrice }];
      await saveProducts(next);
    }
    setProductForm(null);
  };

  const remove = async (id) => {
    await saveProducts(products.filter((p) => p.id !== id));
  };

  const onPhotoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 400, 0.75);
      setProductForm((f) => ({ ...f, photo: dataUrl }));
    } catch (err) {
      console.error("resize failed", err);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>Daftar Menu ({products.length})</div>
        <button
          onClick={startNew}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "#1C1815", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}
        >
          <Plus size={15} /> Tambah Menu
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {products.map((p) => {
          const Icon = CATEGORY_ICON[p.category] || Coffee;
          return (
            <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                {p.photo ? (
                  <img src={p.photo} alt={p.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} color="var(--accent)" />
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(p)} style={{ background: "var(--surface-3)", border: "none", borderRadius: 6, padding: 6, color: "var(--text-muted)" }}><Pencil size={13} /></button>
                  <button onClick={() => remove(p.id)} style={{ background: "var(--surface-3)", border: "none", borderRadius: 6, padding: 6, color: "var(--accent-red)" }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 10 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", margin: "3px 0 8px" }}>{p.category}</div>
              {p.customPrice ? (
                <div className="font-mono" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <PencilLine size={12} /> Harga saat jual
                </div>
              ) : (
                <div className="font-mono" style={{ fontSize: 14, color: "var(--accent-2)", fontWeight: 700 }}>{rupiah(p.price)}</div>
              )}
            </div>
          );
        })}
      </div>

      {productForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={() => setProductForm(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="slide-up"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: 320, maxHeight: "88vh", overflowY: "auto" }}
          >
            <div className="font-display" style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              {productForm.id ? "Edit Menu" : "Tambah Menu"}
            </div>

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Foto menu</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 14px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {productForm.photo ? <img src={productForm.photo} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageIcon size={18} color="var(--text-muted)" />}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 12px", fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                <Upload size={13} /> Pilih Foto
                <input type="file" accept="image/*" onChange={onPhotoPick} style={{ display: "none" }} />
              </label>
              {productForm.photo && (
                <button type="button" onClick={() => setProductForm((f) => ({ ...f, photo: null }))} style={{ background: "none", border: "none", color: "var(--accent-red)", fontSize: 11.5 }}>Hapus</button>
              )}
            </div>

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Nama menu *</label>
            <input
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 12px", boxSizing: "border-box" }}
            />
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Kategori</label>
            <div style={{ display: "flex", gap: 6, margin: "5px 0 12px" }}>
              {CATEGORY_LIST.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setProductForm({ ...productForm, category: c })}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                    border: "1px solid " + (productForm.category === c ? "var(--accent)" : "var(--border)"),
                    background: productForm.category === c ? "var(--accent-soft)" : "var(--surface-2)",
                    color: productForm.category === c ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Jenis Harga</label>
            <div style={{ display: "flex", gap: 6, margin: "5px 0 12px" }}>
              <button
                type="button"
                onClick={() => setProductForm({ ...productForm, customPrice: false })}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  border: "1px solid " + (!productForm.customPrice ? "var(--accent)" : "var(--border)"),
                  background: !productForm.customPrice ? "var(--accent-soft)" : "var(--surface-2)",
                  color: !productForm.customPrice ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                Harga Tetap
              </button>
              <button
                type="button"
                onClick={() => setProductForm({ ...productForm, customPrice: true })}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                  border: "1px solid " + (productForm.customPrice ? "var(--accent)" : "var(--border)"),
                  background: productForm.customPrice ? "var(--accent-soft)" : "var(--surface-2)",
                  color: productForm.customPrice ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                Harga Bebas
              </button>
            </div>

            {productForm.customPrice ? (
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", marginBottom: 10 }}>
                Harga akan diketik kasir setiap kali item ini dijual — cocok untuk barang yang harganya berubah-ubah (mis. barang custom, satuan tidak tetap).
              </div>
            ) : (
              <>
                <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Harga (Rp) *</label>
                <input
                  type="number"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  className="font-mono"
                  style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 10px", boxSizing: "border-box" }}
                />
              </>
            )}
            {formError && <div style={{ fontSize: 12, color: "var(--accent-red)", marginBottom: 12 }}>{formError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: formError ? 0 : 8 }}>
              <button type="button" onClick={() => setProductForm(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 13 }}>Batal</button>
              <button type="button" onClick={submit} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomPriceModal({ product, onCancel, onConfirm }) {
  const [price, setPrice] = useState("");
  const num = parseInt(price, 10) || 0;

  const confirm = () => {
    if (num <= 0) return;
    onConfirm(num);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="slide-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <PencilLine size={16} color="var(--accent)" />
          <div className="font-display" style={{ fontSize: 16, fontWeight: 600 }}>Masukkan Harga</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{product.name}</div>
        <input
          autoFocus
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
          placeholder="mis. 15000"
          className="font-mono"
          style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "10px 12px", color: "var(--text)", fontSize: 15, boxSizing: "border-box", marginBottom: 16 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 13 }}>Batal</button>
          <button type="button" onClick={confirm} disabled={num <= 0} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: num > 0 ? "var(--accent)" : "var(--surface-3)", color: num > 0 ? "#1C1815" : "var(--text-muted)", fontWeight: 700, fontSize: 13 }}>Tambah ke Pesanan</button>
        </div>
      </div>
    </div>
  );
}

function ReportTab({ reportRange, setReportRange, stats, transactions, onReset, hasAnyTransactions }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const doReset = async () => {
    setResetting(true);
    await onReset();
    setResetting(false);
    setConfirmReset(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>Laporan Penjualan</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { id: "hari-ini", label: "Hari ini" },
            { id: "7-hari", label: "7 hari" },
            { id: "30-hari", label: "30 hari" },
            { id: "semua", label: "Semua" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setReportRange(r.id)}
              style={{
                padding: "7px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                border: "1px solid " + (reportRange === r.id ? "var(--accent)" : "var(--border)"),
                background: reportRange === r.id ? "var(--accent-soft)" : "var(--surface-2)",
                color: reportRange === r.id ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setConfirmReset(true)}
            disabled={!hasAnyTransactions}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", background: "transparent",
              color: hasAnyTransactions ? "var(--accent-red)" : "var(--text-muted)",
              opacity: hasAnyTransactions ? 1 : 0.5,
            }}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Total Pendapatan", value: rupiah(stats.revenue), icon: Wallet, color: "var(--accent)" },
          { label: "Jumlah Transaksi", value: stats.count, icon: ShoppingBag, color: "var(--accent-2)" },
          { label: "Rata-rata / Transaksi", value: rupiah(stats.avg), icon: TrendingUp, color: "var(--accent)" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
              <Icon size={16} color={c.color} />
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, margin: "10px 0 2px" }}>{c.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{c.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Menu Terlaris</div>
          {stats.topItems.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Belum ada data.</div>}
          {stats.topItems.map(([name, qty], idx) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: idx < stats.topItems.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)", width: 16 }}>{idx + 1}</div>
              <div style={{ fontSize: 12.5, flex: 1 }}>{name}</div>
              <div className="font-mono" style={{ fontSize: 12, color: "var(--accent-2)", fontWeight: 700 }}>{qty}x</div>
            </div>
          ))}
        </div>

        <div style={{ flex: "1.4 1 320px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, maxHeight: 320, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Riwayat Transaksi</div>
          {transactions.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Belum ada transaksi.</div>}
          {transactions.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 12.5 }}>{t.items.length} item · {t.payMethod}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{new Date(t.time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div className="font-mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>{rupiah(t.total)}</div>
            </div>
          ))}
        </div>
      </div>

      {confirmReset && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16 }} onClick={() => !resetting && setConfirmReset(false)}>
          <div onClick={(e) => e.stopPropagation()} className="slide-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <RotateCcw size={17} color="var(--accent-red)" />
              <div className="font-display" style={{ fontSize: 16, fontWeight: 600 }}>Reset Laporan?</div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
              Ini akan menghapus <b>semua riwayat transaksi</b> di perangkat ini secara permanen. Struk yang sudah dibagikan lewat kode/Cek Struk atau riwayat di akun pelanggan tidak ikut terhapus. Tindakan ini tidak bisa dibatalkan.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirmReset(false)} disabled={resetting} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 13 }}>Batal</button>
              <button type="button" onClick={doReset} disabled={resetting} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--accent-red)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                {resetting ? "Menghapus…" : "Ya, Hapus Semua"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PromoAdminTab() {
  const [promos, setPromos] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");

  const reload = async () => {
    try { setPromos(await api.listPromosAdmin()); } catch (e) { console.error(e); setPromos([]); }
  };

  useEffect(() => { reload(); }, []);

  const startNew = () => { setForm({ id: null, code: "", title: "", description: "", type: "persen", value: "", active: true, category: "Semua", expiresAtInput: "" }); setFormError(""); };
  const startEdit = (p) => { setForm({ ...p, value: String(p.value), category: p.category || "Semua", expiresAtInput: msToLocalInput(p.expiresAt) }); setFormError(""); };

  const submit = async (e) => {
    e.preventDefault();
    const value = parseFloat(form.value) || 0;
    if (!form.code.trim() || !form.title.trim() || value <= 0) { setFormError("Lengkapi kode, judul, dan nilai potongan terlebih dulu."); return; }
    const codeClean = form.code.trim().toUpperCase().replace(/\s+/g, "");
    // Kode promo harus unik, supaya tidak ada dua promo beda tapi kodenya sama (bikin bingung saat ditukar/dipakai)
    const codeTaken = (promos || []).some((p) => p.code.toUpperCase() === codeClean && p.id !== form.id);
    if (codeTaken) { setFormError("Kode promo ini sudah dipakai promo lain. Pakai kode yang berbeda."); return; }
    const expiresAt = localInputToMs(form.expiresAtInput);
    if (form.expiresAtInput && !expiresAt) { setFormError("Format tanggal berakhir tidak valid."); return; }
    const category = form.category || "Semua";
    try {
      await api.upsertPromo({ id: form.id, code: codeClean, title: form.title, description: form.description, type: form.type, value, active: form.active, category, expiresAt });
      await reload();
      setForm(null);
      setFormError("");
    } catch (e) {
      setFormError("Gagal menyimpan promo: " + (e.message || e));
    }
  };

  const toggleActive = async (p) => {
    await api.togglePromoActive(p.id, !p.active);
    await reload();
  };

  const remove = async (id) => {
    await api.deletePromo(id);
    await reload();
  };

  if (promos === null) return <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>Memuat promo…</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>Kelola Promo</div>
        <button onClick={startNew} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "#1C1815", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13 }}>
          <Plus size={15} /> Buat Promo
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
        Promo yang aktif, belum berakhir, dan cocok kategorinya akan muncul di Web Pelanggan dan bisa ditukarkan oleh pelanggan yang login.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {(promos || []).length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Belum ada promo. Buat yang pertama!</div>}
        {(promos || []).map((p) => {
          const expired = isPromoExpired(p);
          return (
            <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, opacity: p.active && !expired ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-3)", borderRadius: 6, padding: "4px 8px" }}>
                  <Tag size={12} color="var(--accent)" />
                  <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{p.code}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(p)} style={{ background: "var(--surface-3)", border: "none", borderRadius: 6, padding: 6, color: "var(--text-muted)" }}><Pencil size={13} /></button>
                  <button onClick={() => remove(p.id)} style={{ background: "var(--surface-3)", border: "none", borderRadius: 6, padding: 6, color: "var(--accent-red)" }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, margin: "10px 0 4px" }}>{p.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>{p.description}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-muted)" }}>
                  Berlaku: {p.category || "Semua"}
                </span>
                {p.expiresAt && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: expired ? "rgba(196,105,90,0.12)" : "var(--surface-3)", color: expired ? "var(--accent-red)" : "var(--text-muted)" }}>
                    {expired ? "Berakhir " : "s.d. "}{new Date(p.expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="font-mono" style={{ fontSize: 13, color: "var(--accent-2)", fontWeight: 700 }}>
                  {p.type === "persen" ? `${p.value}%` : rupiah(p.value)}
                </span>
                <button
                  onClick={() => toggleActive(p)}
                  style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "1px solid " + (p.active ? "var(--accent-2)" : "var(--border)"), background: "transparent", color: p.active ? "var(--accent-2)" : "var(--text-muted)" }}
                >
                  {p.active ? "Aktif" : "Nonaktif"}
                </button>
              </div>
              {expired && <div style={{ fontSize: 10.5, color: "var(--accent-red)", marginTop: 8 }}>Sudah kedaluwarsa — tidak muncul lagi di Web Pelanggan.</div>}
            </div>
          );
        })}
      </div>

      {form && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="slide-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: 320, maxHeight: "88vh", overflowY: "auto" }}>
            <div className="font-display" style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{form.id ? "Edit Promo" : "Buat Promo"}</div>

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Kode Promo</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="mis. NGOPI10" className="font-mono" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 12px", boxSizing: "border-box", textTransform: "uppercase" }} />

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Judul Promo</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Diskon Kopi 10%" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 12px", boxSizing: "border-box" }} />

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Keterangan</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="mis. Berlaku untuk semua menu minuman" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 12px", boxSizing: "border-box" }} />

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Berlaku untuk Kategori</label>
            <div style={{ display: "flex", gap: 6, margin: "5px 0 12px", flexWrap: "wrap" }}>
              {PROMO_CATEGORIES.map((c) => (
                <button type="button" key={c} onClick={() => setForm({ ...form, category: c })} style={{ flex: "1 1 70px", padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600, border: "1px solid " + (form.category === c ? "var(--accent)" : "var(--border)"), background: form.category === c ? "var(--accent-soft)" : "var(--surface-2)", color: form.category === c ? "var(--accent)" : "var(--text-muted)" }}>
                  {c}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Jenis Potongan</label>
            <div style={{ display: "flex", gap: 6, margin: "5px 0 12px" }}>
              {[{ id: "persen", label: "Persen (%)" }, { id: "nominal", label: "Nominal (Rp)" }].map((o) => (
                <button type="button" key={o.id} onClick={() => setForm({ ...form, type: o.id })} style={{ flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11.5, fontWeight: 600, border: "1px solid " + (form.type === o.id ? "var(--accent)" : "var(--border)"), background: form.type === o.id ? "var(--accent-soft)" : "var(--surface-2)", color: form.type === o.id ? "var(--accent)" : "var(--text-muted)" }}>
                  {o.label}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Nilai Potongan</label>
            <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === "persen" ? "mis. 10" : "mis. 5000"} className="font-mono" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 12px", boxSizing: "border-box" }} />

            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Berakhir Pada (opsional)</label>
            <input type="datetime-local" value={form.expiresAtInput} onChange={(e) => setForm({ ...form, expiresAtInput: e.target.value })} className="font-mono" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0 6px", boxSizing: "border-box" }} />
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 14 }}>Kosongkan kalau promo tidak punya batas waktu.</div>

            {formError && <div style={{ fontSize: 11.5, color: "var(--accent-red)", marginBottom: 12 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setForm(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 13 }}>Batal</button>
              <button type="button" onClick={submit} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerAccountsTab() {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // akun yang mau dihapus
  const [deleting, setDeleting] = useState(false);

  const loadAccounts = async () => {
    try {
      const results = await api.staffListCustomers();
      setAccounts(results);
    } catch (e) {
      setAccounts([]);
      setError("Gagal memuat daftar akun pelanggan.");
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.staffDeleteCustomer(confirmDelete.phone);
      setAccounts((prev) => (prev || []).filter((a) => a.phone !== confirmDelete.phone));
    } catch (e) {
      console.error("gagal menghapus akun", e);
      setError("Gagal menghapus akun. Coba lagi.");
    }
    setDeleting(false);
    setConfirmDelete(null);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Users size={18} color="var(--accent)" />
        <div className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>Akun Pelanggan Terdaftar {accounts ? `(${accounts.length})` : ""}</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
        Semua pelanggan yang sudah daftar akun lewat Web Pelanggan di kedai ini. Kalau pelanggan lupa PIN, hapus akunnya di sini
        supaya mereka bisa daftar ulang dengan PIN baru — riwayat struk mereka (dicari lewat nomor HP) tidak ikut terhapus.
      </div>

      {accounts === null && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Memuat…</div>}
      {error && <div style={{ fontSize: 13, color: "var(--accent-red)" }}>{error}</div>}
      {accounts && accounts.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Belum ada pelanggan yang daftar akun.</div>
      )}

      {accounts && accounts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {accounts.map((a) => (
            <div key={a.phone} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={15} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div>
                </div>
                <button
                  onClick={() => setConfirmDelete(a)}
                  title="Hapus akun pelanggan"
                  style={{ background: "var(--surface-3)", border: "none", borderRadius: 6, padding: 6, color: "var(--accent-red)" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="font-mono" style={{ fontSize: 12, color: "var(--accent-2)", marginBottom: 4 }}>{a.phone}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {a.joined && (
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Daftar {new Date(a.joined).toLocaleDateString("id-ID", { dateStyle: "medium" })}</div>
                )}
                <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--surface-3)", padding: "2px 7px", borderRadius: 999 }}>
                  {a.points || 0} poin
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 16 }} onClick={() => !deleting && setConfirmDelete(null)}>
          <div onClick={(e) => e.stopPropagation()} className="slide-up" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, width: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Trash2 size={17} color="var(--accent-red)" />
              <div className="font-display" style={{ fontSize: 16, fontWeight: 600 }}>Hapus Akun Pelanggan?</div>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.5 }}>
              Akun <b>{confirmDelete.name}</b> ({confirmDelete.phone}) akan dihapus. Pelanggan bisa daftar ulang dengan nomor
              yang sama dan PIN baru. Riwayat struk & promo yang sudah ditukar tetap tersimpan.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 13 }}>Batal</button>
              <button type="button" onClick={doDelete} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--accent-red)", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                {deleting ? "Menghapus…" : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ settings, saveSettings }) {
  const [name, setName] = useState(settings.storeName || "");
  const [address, setAddress] = useState(settings.address || "");
  const [webVersion, setWebVersion] = useState(settings.webVersion || "");
  const [pointsPerRupiah, setPointsPerRupiah] = useState(String(settings.pointsPerRupiah || 10000));
  const [pointsForReward, setPointsForReward] = useState(String(settings.pointsForReward || 10));
  const [rewardCategory, setRewardCategory] = useState(settings.rewardCategory || "Minuman");
  const [pointsSaved, setPointsSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef(null);
  const bgInputRef = useRef(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => { setName(settings.storeName || ""); }, [settings.storeName]);
  useEffect(() => { setAddress(settings.address || ""); }, [settings.address]);
  useEffect(() => { setWebVersion(settings.webVersion || ""); }, [settings.webVersion]);
  useEffect(() => { setPointsPerRupiah(String(settings.pointsPerRupiah || 10000)); }, [settings.pointsPerRupiah]);
  useEffect(() => { setPointsForReward(String(settings.pointsForReward || 10)); }, [settings.pointsForReward]);
  useEffect(() => { setRewardCategory(settings.rewardCategory || "Minuman"); }, [settings.rewardCategory]);

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const submitName = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleaned = name.trim() || "Kedai Kasir";
    if (cleaned === settings.storeName) return;
    await saveSettings({ ...settings, storeName: cleaned });
    flashSaved();
  };

  const submitAddress = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleaned = address.trim();
    if (cleaned === (settings.address || "")) return;
    await saveSettings({ ...settings, address: cleaned });
    flashSaved();
  };

  const submitWebVersion = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleaned = webVersion.trim();
    if (cleaned === (settings.webVersion || "")) return;
    await saveSettings({ ...settings, webVersion: cleaned });
    flashSaved();
  };

  const submitPoints = async () => {
    const rp = Math.max(1000, parseInt(pointsPerRupiah, 10) || 10000);
    const need = Math.max(1, parseInt(pointsForReward, 10) || 10);
    await saveSettings({ ...settings, pointsPerRupiah: rp, pointsForReward: need, rewardCategory });
    setPointsSaved(true);
    setTimeout(() => setPointsSaved(false), 1500);
  };

  const submitPin = async () => {
    setPinError("");
    if (newPin.length < 6) { setPinError("Password minimal 6 karakter."); return; }
    if (newPin !== confirmPin) { setPinError("Konfirmasi password tidak cocok."); return; }
    try {
      await api.staffChangePassword(newPin);
      setNewPin(""); setConfirmPin("");
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 1500);
    } catch (e) {
      setPinError(e.message || "Gagal mengubah password.");
    }
  };

  const onLogoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 200, 0.85);
      await saveSettings({ ...settings, logo: dataUrl });
      flashSaved();
    } catch (err) { console.error(err); }
  };

  const onBgPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 1200, 0.7);
      await saveSettings({ ...settings, background: dataUrl });
      flashSaved();
    } catch (err) { console.error(err); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Pengaturan Toko</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>
        Sesuaikan nama, logo, dan tampilan latar aplikasi kasirmu.
        {saved && <span style={{ color: "var(--accent-2)", fontWeight: 600, marginLeft: 8 }}>Tersimpan ✓</span>}
      </div>

      {/* Store name */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Nama Toko / Kedai</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitName}
            placeholder="mis. Kedai Bu Tini"
            style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
          <button type="button" onClick={submitName} style={{ padding: "0 16px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>Simpan</button>
        </div>
      </div>

      {/* Alamat toko */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <MapPin size={14} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Alamat / Lokasi Kedai</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onBlur={submitAddress}
            placeholder="mis. Jl. Merdeka No. 12, Ungaran, Kab. Semarang"
            rows={2}
            style={{ flex: "1 1 200px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
          />
          <button type="button" onClick={submitAddress} style={{ padding: "0 16px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13, alignSelf: "flex-start" }}>Simpan</button>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Alamat ini juga akan tampil di Web Pelanggan.</div>
      </div>

      {/* Versi web */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Info size={14} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Versi Aplikasi</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={webVersion}
            onChange={(e) => setWebVersion(e.target.value)}
            onBlur={submitWebVersion}
            placeholder="mis. v1.2.0"
            className="font-mono"
            style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
          <button type="button" onClick={submitWebVersion} style={{ padding: "0 16px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>Simpan</button>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8 }}>Dipakai buat menandai versi aplikasi ini — muncul di halaman pilih mode.</div>
      </div>

      {/* Poin Member */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Gift size={14} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Poin Member</div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
          Setiap nomor HP yang diketik kasir saat checkout otomatis dapat poin (tidak wajib punya akun dulu). Pelanggan bisa cek
          & tukar poinnya sendiri lewat Web Pelanggan (login/daftar pakai nomor yang sama) jadi kode gratis 1 item, ditunjukkan
          ke kasir saat checkout berikutnya.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Rp per 1 poin</label>
            <input
              type="number"
              value={pointsPerRupiah}
              onChange={(e) => setPointsPerRupiah(e.target.value)}
              className="font-mono"
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>mis. 10000 = tiap Rp10.000 belanja dapat 1 poin</div>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Poin untuk 1 hadiah</label>
            <input
              type="number"
              value={pointsForReward}
              onChange={(e) => setPointsForReward(e.target.value)}
              className="font-mono"
              style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, margin: "5px 0", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>mis. 10 = 10 poin bisa ditukar</div>
          </div>
        </div>
        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Hadiah berupa gratis 1 item kategori</label>
        <div style={{ display: "flex", gap: 6, margin: "5px 0 14px", flexWrap: "wrap" }}>
          {CATEGORY_LIST.map((c) => (
            <button type="button" key={c} onClick={() => setRewardCategory(c)} style={{ flex: "1 1 90px", padding: "8px 0", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "1px solid " + (rewardCategory === c ? "var(--accent)" : "var(--border)"), background: rewardCategory === c ? "var(--accent-soft)" : "var(--surface-2)", color: rewardCategory === c ? "var(--accent)" : "var(--text-muted)" }}>
              {c}
            </button>
          ))}
        </div>
        <button type="button" onClick={submitPoints} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>
          {pointsSaved ? "Tersimpan ✓" : "Simpan Pengaturan Poin"}
        </button>
      </div>

      {/* Password Kasir */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Shield size={14} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Password Mode Kasir</div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 12 }}>
          Ini password akun staf kamu (email tidak bisa diubah di sini — kelola lewat dashboard Supabase).
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input
            type="password"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            placeholder="Password baru (min. 6 karakter)"
            className="font-mono"
            style={{ flex: "1 1 140px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
          <input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitPin(); }}
            placeholder="Ulangi password baru"
            className="font-mono"
            style={{ flex: "1 1 140px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        {pinError && <div style={{ fontSize: 11.5, color: "var(--accent-red)", marginBottom: 8 }}>{pinError}</div>}
        {pinSaved && <div style={{ fontSize: 11.5, color: "var(--accent-2)", marginBottom: 8 }}>PIN kasir berhasil diubah ✓</div>}
        <button type="button" onClick={submitPin} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 12.5 }}>Ubah Password</button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Logo Toko</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {settings.logo ? <img src={settings.logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Store size={20} color="var(--text-muted)" />}
          </div>
          <button type="button" onClick={() => logoInputRef.current && logoInputRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
            <Upload size={13} /> Unggah Logo
          </button>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={onLogoPick} style={{ display: "none" }} />
          {settings.logo && (
            <button type="button" onClick={() => saveSettings({ ...settings, logo: null })} style={{ background: "none", border: "none", color: "var(--accent-red)", fontSize: 12 }}>Hapus</button>
          )}
        </div>
      </div>

      {/* Background wallpaper */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Wallpaper Latar Belakang</div>
        <div style={{ width: "100%", height: 100, borderRadius: 8, background: settings.background ? `linear-gradient(rgba(20,17,15,0.5), rgba(20,17,15,0.5)), url(${settings.background}) center/cover` : "var(--surface-2)", border: "1px solid var(--border)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {!settings.background && <ImageIcon size={20} color="var(--text-muted)" />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={() => bgInputRef.current && bgInputRef.current.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
            <Upload size={13} /> Unggah Wallpaper
          </button>
          <input ref={bgInputRef} type="file" accept="image/*" onChange={onBgPick} style={{ display: "none" }} />
          {settings.background && (
            <button type="button" onClick={() => saveSettings({ ...settings, background: null })} style={{ background: "none", border: "none", color: "var(--accent-red)", fontSize: 12 }}>Pakai warna polos</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CekStrukTab({ localTransactions }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null); // "loading" | trx object
  const [error, setError] = useState("");

  const search = async (e) => {
    e.preventDefault();
    const clean = code.replace(/\s+/g, "").toUpperCase();
    if (!clean) return;
    const target = canonCode(clean);
    setError("");
    setResult("loading");

    // Kasir sudah login & sudah punya akses penuh ke semua transaksi, jadi cukup cari di situ
    // (termasuk toleran salah ketik huruf yang mirip lewat canonCode).
    const local = (localTransactions || []).find((t) => canonCode(t.code) === target);
    if (local) {
      setResult(local);
      return;
    }

    setResult(null);
    setError(`Struk dengan kode "${clean}" tidak ditemukan. Pastikan kode ditulis persis seperti di struk.`);
  };

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Cek Struk Online</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 18 }}>
        Pembeli bisa masukkan kode struk yang diberikan saat bayar untuk melihat detail belanjaannya di sini — di perangkat mana pun yang membuka aplikasi ini.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(e); }}
          placeholder="Masukkan kode struk, mis. 7K2Q9M"
          className="font-mono"
          style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, letterSpacing: 1, boxSizing: "border-box", textTransform: "uppercase" }}
        />
        <button type="button" onClick={search} style={{ padding: "0 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13 }}>Cari</button>
      </div>

      {result === "loading" && <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Mencari…</div>}
      {error && <div style={{ fontSize: 13, color: "var(--accent-red)", marginBottom: 16 }}>{error}</div>}

      {!result && (localTransactions || []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>Transaksi terbaru di perangkat ini (klik untuk cek):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(localTransactions || []).slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setCode(t.code || ""); setResult(t); setError(""); }}
                className="font-mono"
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--accent)", fontSize: 12, letterSpacing: 1, fontWeight: 700 }}
              >
                {t.code || "—"}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && result !== "loading" && (
        <div className="slide-up font-mono" style={{ background: "#F5EFE6", color: "#1C1815", borderRadius: 10, padding: "20px 18px" }}>
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <div className="font-display" style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 16 }}>{result.storeName || "Kedai Kasir"}</div>
            <div style={{ fontSize: 10, marginTop: 2 }}>{new Date(result.time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
          </div>
          <div style={{ borderTop: "1px dashed #1C1815", margin: "10px 0" }} />
          {result.items.map((i) => (
            <div key={i.id} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11.5 }}>{i.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
                <span>{i.qty} x {rupiah(i.price)}</span>
                <span>{rupiah(i.qty * i.price)}</span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed #1C1815", margin: "10px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
            <span>TOTAL</span><span>{rupiah(result.total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6 }}>
            <span>{result.payMethod}</span><span>{rupiah(result.cash)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptModal({ trx, storeName, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="slide-up font-mono"
        style={{ background: "#F5EFE6", color: "#1C1815", width: 300, borderRadius: 6, padding: "22px 20px", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div className="font-display" style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 17 }}>{storeName || "Kedai Kasir"}</div>
          <div style={{ fontSize: 10, marginTop: 2 }}>{new Date(trx.time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
        <div style={{ borderTop: "1px dashed #1C1815", margin: "10px 0" }} />
        {trx.items.map((i) => (
          <div key={i.id} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
              <span>{i.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
              <span>{i.qty} x {rupiah(i.price)}</span>
              <span>{rupiah(i.qty * i.price)}</span>
            </div>
          </div>
        ))}
        <div style={{ borderTop: "1px dashed #1C1815", margin: "10px 0" }} />
        {trx.discount && trx.discount.amount > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span>Subtotal</span><span>{rupiah(trx.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span>Diskon ({trx.discount.title})</span><span>-{rupiah(trx.discount.amount)}</span>
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
          <span>TOTAL</span><span>{rupiah(trx.total)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6 }}>
          <span>{trx.payMethod}</span><span>{rupiah(trx.cash)}</span>
        </div>
        {trx.payMethod === "Tunai" && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span>Kembali</span><span>{rupiah(trx.change)}</span>
          </div>
        )}
        {trx.customerPhone && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6, fontWeight: 700, color: "#7A6A4F" }}>
            <span>Poin Didapat</span>
            <span>{trx.pointsEarned > 0 ? `+${trx.pointsEarned} poin` : "0 poin (belanja belum capai batas minimal)"}</span>
          </div>
        )}
        <div style={{ borderTop: "1px dashed #1C1815", margin: "12px 0 10px" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9.5, opacity: 0.7, marginBottom: 4 }}>KODE CEK STRUK ONLINE</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>{trx.code}</div>
        </div>
        <div style={{ borderTop: "1px dashed #1C1815", margin: "10px 0" }} />
        <div style={{ textAlign: "center", fontSize: 10.5, opacity: 0.8 }}>Terima kasih sudah mampir!</div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={() => window.print()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 7, border: "1px solid #1C1815", background: "transparent", color: "#1C1815", fontWeight: 600, fontSize: 12 }}>
            <Printer size={13} /> Cetak
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: "9px 0", borderRadius: 7, border: "none", background: "#1C1815", color: "#F5EFE6", fontWeight: 700, fontSize: 12 }}>
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerPortal({ onExit }) {
  const [account, setAccount] = useState(() => api.loadCustomerSession()); // {phone, name, token}
  const [publicSettings, setPublicSettings] = useState({ storeName: "Kedai Kasir", logo: null, storeOpen: true, address: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadPublicSettings = async () => {
      try {
        const s = await api.getSettings();
        if (!cancelled) setPublicSettings(s);
      } catch (e) { /* pakai default */ }
      if (!cancelled) setLoading(false);
    };
    loadPublicSettings();
    // Cek ulang status toko secara berkala, supaya saat kasir buka/tutup kedai,
    // web pelanggan yang sedang terbuka ikut ter-update tanpa perlu di-refresh manual.
    const interval = setInterval(loadPublicSettings, 1500);
    const onVisible = () => { if (document.visibilityState === "visible") loadPublicSettings(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", loadPublicSettings);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", loadPublicSettings);
    };
  }, []);

  const handleLogout = () => {
    api.clearCustomerSession();
    setAccount(null);
  };

  if (loading) {
    return (
      <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <style>{FONT_STYLE}</style>
        <div style={{ color: "var(--text-muted)" }}>Memuat…</div>
      </div>
    );
  }

  return (
    <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 600, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg)" }}>
      <style>{FONT_STYLE}</style>
      <div className="kasir-content">
        <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {publicSettings.logo ? (
              <img src={publicSettings.logo} alt="logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Store size={20} color="#1C1815" />
              </div>
            )}
            <div>
              <div className="font-display" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{publicSettings.storeName || "Kedai Kasir"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{publicSettings.address ? publicSettings.address : "Web Pelanggan"}</div>
            </div>
            <span
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9999,
                border: "1px solid " + (publicSettings.storeOpen !== false ? "var(--accent-2)" : "var(--accent-red)"),
                background: publicSettings.storeOpen !== false ? "rgba(143,174,124,0.12)" : "rgba(196,105,90,0.12)",
                color: publicSettings.storeOpen !== false ? "var(--accent-2)" : "var(--accent-red)",
                fontWeight: 700, fontSize: 11.5, marginLeft: 4,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
              {publicSettings.storeOpen !== false ? "Sedang Buka" : "Sedang Tutup"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <LiveClock compact />
            {account && (
              <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
                <LogOut size={13} /> Keluar
              </button>
            )}
            <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
              <ArrowLeft size={13} /> Ganti Mode
            </button>
          </div>
        </div>

        {!account ? (
          <CustomerLogin storeName={publicSettings.storeName} onLogin={setAccount} />
        ) : (
          <CustomerDashboard account={account} />
        )}
      </div>
    </div>
  );
}

function CustomerLogin({ storeName, onLogin }) {
  const [mode, setMode] = useState("login"); // login | daftar
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const cleanPhone = normPhone(phone);
    if (cleanPhone.length < 10) { setError("Nomor HP tidak valid."); return; }
    if (pin.length !== 4) { setError("PIN harus 4 digit angka."); return; }
    if (mode === "daftar" && !name.trim()) { setError("Nama belum diisi."); return; }
    setError("");
    setBusy(true);
    try {
      const session = mode === "login" ? await api.customerLogin(cleanPhone, pin) : await api.customerRegister(cleanPhone, name.trim(), pin);
      onLogin(session);
    } catch (e3) {
      setError(e3.message || "Terjadi kesalahan, coba lagi.");
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 500, padding: 24 }}>
      <div className="slide-up" style={{ width: 320, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
            <User size={20} color="var(--accent)" />
          </div>
          <div className="font-display" style={{ fontSize: 17, fontWeight: 600 }}>{mode === "login" ? "Masuk Akun" : "Daftar Akun Baru"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>{storeName || "Kedai Kasir"} — lihat struk & tukar promo</div>
        </div>

        {mode === "daftar" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Nama</label>
            <div style={{ position: "relative", marginTop: 5 }}>
              <User size={14} color="var(--text-muted)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px 9px 32px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Nomor HP</label>
          <div style={{ position: "relative", marginTop: 5 }}>
            <Phone size={14} color="var(--text-muted)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="font-mono" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px 9px 32px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11.5, color: "var(--text-muted)" }}>PIN (4 digit)</label>
          <div style={{ position: "relative", marginTop: 5 }}>
            <Lock size={14} color="var(--text-muted)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }} placeholder="••••" className="font-mono" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 10px 9px 32px", color: "var(--text)", fontSize: 13, letterSpacing: 3, boxSizing: "border-box" }} />
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: "var(--accent-red)", marginBottom: 12 }}>{error}</div>}

        <button type="button" onClick={submit} disabled={busy} style={{ width: "100%", padding: "11px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>
          {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          {mode === "login" ? (
            <>Belum punya akun? <button type="button" onClick={() => { setMode("daftar"); setError(""); }} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600 }}>Daftar</button></>
          ) : (
            <>Sudah punya akun? <button type="button" onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 600 }}>Masuk</button></>
          )}
        </div>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button type="button" onClick={() => setShowForgot((v) => !v)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11.5, textDecoration: "underline" }}>
              Lupa PIN?
            </button>
            {showForgot && (
              <div className="slide-up" style={{ marginTop: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, color: "var(--text-muted)", textAlign: "left", lineHeight: 1.5 }}>
                PIN tidak bisa direset sendiri dari sini. Datang langsung ke kedai dan minta kasir menghapus akun lama
                dengan nomor HP kamu, lalu daftar ulang dengan PIN baru.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerDashboard({ account }) {
  const [receipts, setReceipts] = useState(null);
  const [promos, setPromos] = useState(null);
  const [redeemed, setRedeemed] = useState(null);
  const [points, setPoints] = useState(0);
  const [pointRules, setPointRules] = useState({ pointsForReward: 10, rewardCategory: "Minuman" });
  const [openReceipt, setOpenReceipt] = useState(null);
  const [redeemMsg, setRedeemMsg] = useState("");
  const [redeemErr, setRedeemErr] = useState("");
  const [pointsBusy, setPointsBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const dash = await api.customerDashboard(account.token);
      setPoints(dash.points || 0);
      setReceipts(dash.receipts || []);
      setRedeemed(dash.redeemed || []);
    } catch (e) {
      console.error("gagal memuat dashboard", e);
    }
    try {
      const list = await api.listPromosPublic();
      setPromos(list);
    } catch (e) { setPromos([]); }
    try {
      const s = await api.getSettings();
      setPointRules({ pointsForReward: s.pointsForReward || 10, rewardCategory: s.rewardCategory || "Minuman" });
    } catch (e) { /* pakai default */ }
  }, [account.token]);

  useEffect(() => {
    loadAll();
    // Muat ulang berkala supaya promo baru/berakhir & status tukar promo selalu terkini,
    // dan tidak "nyangkut" di data lama kalau kasir baru saja mengubah promo.
    const interval = setInterval(loadAll, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", loadAll);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", loadAll);
    };
  }, [loadAll]);

  const openStruk = async (code) => {
    try {
      const data = await api.customerGetReceipt(account.token, code);
      if (data) setOpenReceipt(data);
    } catch (e) { /* tidak ketemu */ }
  };

  // "Sudah ditukar" dicek berdasarkan KODE promo (dijamin unik di server)
  const isRedeemed = (promo) => (redeemed || []).some((r) => r.code === promo.code);

  const redeemPromo = async (promo) => {
    setRedeemErr("");
    if (isRedeemed(promo)) return;
    try {
      const result = await api.customerRedeemPromo(account.token, promo.id);
      await loadAll();
      setRedeemMsg(`Promo "${result.title}" berhasil ditukar! Tunjukkan kode ${result.code} ke kasir.`);
      setTimeout(() => setRedeemMsg(""), 6000);
    } catch (e) {
      setRedeemErr(e.message || "Gagal menukar promo.");
    }
  };

  const redeemPoints = async () => {
    setRedeemErr("");
    if (points < pointRules.pointsForReward) return;
    setPointsBusy(true);
    try {
      const result = await api.customerRedeemPoints(account.token);
      setPoints(result.remaining_points);
      await loadAll();
      setRedeemMsg(`Poin berhasil ditukar! Tunjukkan kode ${result.code} ke kasir untuk gratis 1 ${pointRules.rewardCategory}.`);
      setTimeout(() => setRedeemMsg(""), 7000);
    } catch (e) {
      setRedeemErr(e.message || "Gagal menukar poin.");
    }
    setPointsBusy(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Halo, {account.name} 👋</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Ini riwayat belanja dan promo yang bisa kamu tukar.</div>

      {redeemMsg && (
        <div className="slide-up" style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 18 }}>
          <CheckCircle2 size={16} /> {redeemMsg}
        </div>
      )}
      {redeemErr && (
        <div className="slide-up" style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(196,105,90,0.12)", border: "1px solid var(--accent-red)", color: "var(--accent-red)", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 18 }}>
          {redeemErr}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={18} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Poin Kamu</div>
            <div className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{points} poin</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 6 }}>
            {points >= pointRules.pointsForReward
              ? `Cukup untuk gratis 1 ${pointRules.rewardCategory}!`
              : `${pointRules.pointsForReward - points} poin lagi buat gratis 1 ${pointRules.rewardCategory}`}
          </div>
          <button
            onClick={redeemPoints}
            disabled={points < pointRules.pointsForReward || pointsBusy}
            style={{ padding: "8px 16px", borderRadius: 7, border: "none", fontWeight: 700, fontSize: 12.5, background: points >= pointRules.pointsForReward ? "var(--accent)" : "var(--surface-3)", color: points >= pointRules.pointsForReward ? "#1C1815" : "var(--text-muted)" }}
          >
            {pointsBusy ? "Menukar…" : "Tukar Poin"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {/* Promo */}
        <div style={{ flex: "1 1 300px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Gift size={15} color="var(--accent)" />
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Promo Tersedia</div>
          </div>
          {promos === null && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Memuat…</div>}
          {promos && promos.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Belum ada promo aktif saat ini.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(promos || []).map((p) => {
              const already = isRedeemed(p);
              return (
                <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-3)", borderRadius: 6, padding: "4px 8px" }}>
                      <Tag size={11} color="var(--accent)" />
                      <span className="font-mono" style={{ fontSize: 11.5, fontWeight: 700 }}>{p.code}</span>
                    </div>
                    <span className="font-mono" style={{ fontSize: 13, color: "var(--accent-2)", fontWeight: 700 }}>{p.type === "persen" ? `${p.value}%` : rupiah(p.value)}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{p.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>{p.description}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-muted)" }}>
                      Berlaku: {p.category || "Semua"}
                    </span>
                    {p.expiresAt && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: "var(--surface-3)", color: "var(--text-muted)" }}>
                        s.d. {new Date(p.expiresAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => redeemPromo(p)}
                    disabled={already}
                    style={{ width: "100%", padding: "8px 0", borderRadius: 7, border: "none", fontWeight: 700, fontSize: 12.5, background: already ? "var(--surface-3)" : "var(--accent)", color: already ? "var(--text-muted)" : "#1C1815" }}
                  >
                    {already ? "Sudah Ditukar" : "Tukarkan"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Riwayat struk */}
        <div style={{ flex: "1.2 1 320px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Receipt size={15} color="var(--accent)" />
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Riwayat Struk</div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, maxHeight: 360, overflowY: "auto" }}>
            {receipts === null && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Memuat…</div>}
            {receipts && receipts.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Belum ada transaksi yang tercatat dengan nomor HP ini. Sebutkan nomor HP-mu ke kasir saat bayar berikutnya.</div>}
            {(receipts || []).map((r) => (
              <button
                key={r.code}
                onClick={() => openStruk(r.code)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: "1px solid var(--border)", background: "none", border: "none", textAlign: "left" }}
              >
                <div>
                  <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{r.code}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{new Date(r.time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
                <div className="font-mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{rupiah(r.total)}</div>
              </button>
            ))}
          </div>

          {redeemed && redeemed.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Promo Sudah Ditukar</div>
              {redeemed.map((r) => (
                <div key={r.confirmCode || `${r.code}-${r.redeemedAt}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, padding: "6px 0", borderBottom: "1px solid var(--border)", gap: 8 }}>
                  <span>
                    {r.title}
                    <span className="font-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 6 }}>({r.code})</span>
                  </span>
                  <span className="font-mono" style={{ color: "var(--accent)", flexShrink: 0 }}>{r.confirmCode}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {openReceipt && <ReceiptModal trx={openReceipt} storeName={openReceipt.storeName} onClose={() => setOpenReceipt(null)} />}
    </div>
  );
}
function StaffGate({ onUnlock, onExit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError("Isi email dan password dulu."); return; }
    setBusy(true);
    setError("");
    try {
      await api.staffSignIn(email.trim(), password);
      onUnlock();
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "Email atau password salah." : (e.message || "Gagal masuk."));
    }
    setBusy(false);
  };

  return (
    <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 500, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONT_STYLE}</style>
      <div className="slide-up" style={{ width: 300, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <Shield size={20} color="var(--accent)" />
        </div>
        <div className="font-display" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Masuk Mode Kasir</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 18 }}>Khusus penjual/kasir. Masuk pakai akun staf.</div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Mail size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email staf"
            style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px 10px 32px", color: "var(--text)", fontSize: 13, textAlign: "left", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ position: "relative", marginBottom: 12 }}>
          <KeyRound size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Password"
            style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px 10px 32px", color: "var(--text)", fontSize: 13, textAlign: "left", boxSizing: "border-box" }}
          />
        </div>
        {error && <div style={{ fontSize: 12, color: "var(--accent-red)", marginBottom: 12 }}>{error}</div>}
        <button type="button" onClick={submit} disabled={busy} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1C1815", fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <button type="button" onClick={onExit} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12 }}>Batal, kembali</button>
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>
          Akun staf dibuat lewat dashboard Supabase → menu Authentication → Add User.
        </div>
      </div>
    </div>
  );
}

// Halaman "Lihat Menu" — bisa diakses siapa saja tanpa login, cuma nampilkan daftar menu, harga & foto
function MenuPreview({ onExit }) {
  const [meta, setMeta] = useState({ storeName: "Kedai Kasir", logo: null, storeOpen: true, address: "" });
  const [products, setProducts] = useState(null);
  const [activeCat, setActiveCat] = useState("Semua");
  const [query, setQuery] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setMeta((prev) => ({ ...prev, ...s }));
    } catch (e) { /* pakai default */ }
    try {
      const p = await api.listProducts();
      setProducts(p);
    } catch (e) { setProducts([]); }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 4000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const filtered = useMemo(() => {
    let list = products || [];
    if (activeCat !== "Semua") list = list.filter((p) => p.category === activeCat);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, query]);

  return (
    <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 600, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <style>{FONT_STYLE}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "16px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {meta.logo ? (
            <img src={meta.logo} alt="logo" style={{ width: 40, height: 40, borderRadius: 9, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 9, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Store size={19} color="#1C1815" />
            </div>
          )}
          <div>
            <div className="font-display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{meta.storeName || "Kedai Kasir"}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{meta.address || "Lihat Menu"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999, background: meta.storeOpen !== false ? "rgba(122,168,116,0.14)" : "rgba(196,105,90,0.12)", color: meta.storeOpen !== false ? "var(--accent-2)" : "var(--accent-red)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
            {meta.storeOpen !== false ? "Buka" : "Tutup"}
          </span>
          <LiveClock compact />
          <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>
            <ArrowLeft size={13} /> Kembali
          </button>
        </div>
      </div>

      <div style={{ padding: "14px 20px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari menu…"
            style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px 9px 32px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Semua", ...CATEGORY_LIST].map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "1px solid " + (activeCat === c ? "var(--accent)" : "var(--border)"), background: activeCat === c ? "var(--accent-soft)" : "transparent", color: activeCat === c ? "var(--accent)" : "var(--text-muted)" }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {products === null && <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 30 }}>Memuat menu…</div>}
        {products && products.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 30 }}>Menu belum tersedia. Coba lagi nanti.</div>
        )}
        {products && products.length > 0 && filtered.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 30 }}>Tidak ada menu yang cocok.</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
          {filtered.map((p) => {
            const Icon = CATEGORY_ICON[p.category] || UtensilsCrossed;
            return (
              <div key={p.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ width: "100%", aspectRatio: "4/3", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {p.photo ? (
                    <img src={p.photo} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Icon size={28} color="var(--text-muted)" />
                  )}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, marginBottom: 3 }}>{p.category}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>{p.name}</div>
                  <div className="font-mono" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--accent-2)" }}>{rupiah(p.price)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RoleSelect({ onSelect }) {
  const [meta, setMeta] = useState({ storeName: "Kedai Kasir", webVersion: "" });

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSettings();
        setMeta({ storeName: s.storeName || "Kedai Kasir", webVersion: s.webVersion || "" });
      } catch (e) { /* pakai default */ }
    })();
  }, []);

  return (
    <div className="kasir-root" style={{ width: "100%", boxSizing: "border-box", minHeight: 500, borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <style>{FONT_STYLE}</style>
      <div className="slide-up" style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Sparkles size={24} color="#1C1815" />
        </div>
        <div className="font-display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{meta.storeName}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}>Pilih mode untuk melanjutkan</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => onSelect("kasir")} style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 16px" }}>
            <ShoppingBag size={22} color="var(--accent)" />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Mode Kasir</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Untuk pemilik/kasir kedai</div>
          </button>
          <button onClick={() => onSelect("pelanggan")} style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "22px 16px" }}>
            <User size={22} color="var(--accent)" />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Web Pelanggan</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Cek struk &amp; tukar promo</div>
          </button>
        </div>
        <button onClick={() => onSelect("menu")} style={{ marginTop: 12, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "transparent", border: "1px dashed var(--border)", borderRadius: 12, padding: "14px 16px", color: "var(--text-muted)" }}>
          <ClipboardList size={17} color="var(--accent)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Lihat Menu</span>
          <span style={{ fontSize: 11 }}>— tanpa perlu login</span>
        </button>
      </div>
      <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {meta.webVersion && (
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>{meta.webVersion}</span>
        )}
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: 0.2 }}>Created by D.M.N, copyright prohibited</span>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("select"); // select | kasir | pelanggan | menu
  const [authSession, setAuthSession] = useState(undefined); // undefined = belum dicek, null = belum login

  useEffect(() => {
    api.getStaffSession().then(setAuthSession);
    const unsub = api.onStaffAuthChange((session) => setAuthSession(session));
    return unsub;
  }, []);

  if (mode === "select") return <RoleSelect onSelect={setMode} />;
  if (mode === "menu") return <MenuPreview onExit={() => setMode("select")} />;
  if (mode === "kasir") {
    if (authSession === undefined) return null; // masih mengecek sesi login
    if (!authSession) {
      return <StaffGate onUnlock={() => {}} onExit={() => setMode("select")} />;
    }
    return <CashierApp authSession={authSession} onExit={async () => { await api.staffSignOut(); setMode("select"); }} />;
  }
  return <CustomerPortal onExit={() => setMode("select")} />;
}
