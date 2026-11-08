// @ts-nocheck
// Store behaviour: per-kg catalogue, RPC-based checkout/tracking, admin with confirm_store_order.
import { createClient } from "@supabase/supabase-js";
import { STORE_CONFIG as config } from "./config";
import { GOVERNORATES, PRODUCT_IMAGES, generateAccessCode, normalizePhone, isValidPhone, parseKg, lineTotal, itemView, isPending } from "./logic";

let client = null;
export function getStoreClient() {
  if (!client) client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export function initStore() {
  const db = getStoreClient();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let products = [], orders = [], activeCategory = "الكل", orderFeed = null;
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem("alameen_cart_kg") || "{}"); } catch { cart = {}; }
  localStorage.removeItem("alameen_cart");
  const num = (n, d = 3) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: d }).format(Number(n) || 0);
  const money = (n) => `${num(n, 2)} ج.م`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cleanDesc = (d) => String(d || "مختار بعناية من خير أرضنا").replace(/\s*•\s*[\d٠-٩.,]+\s*(جرام|جم|كجم|كيلو)\s*$/, "");
  const img = (p) => PRODUCT_IMAGES[p.id] || p.image;
  const stockOf = (id) => Number(products.find((p) => String(p.id) === String(id))?.stock_kg) || 0;
  let toastTimer;
  function notify(text) { const t = $("#toast"); t.textContent = text; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3500); }
  const govOptions = (sel) => '<option value="">اختر المحافظة</option>' + GOVERNORATES.map((g) => `<option${g === sel ? " selected" : ""}>${g}</option>`).join("");
  $("#governorate-select").innerHTML = govOptions();

  async function fetchProducts() {
    const { data, error } = await db.from("products").select("*").eq("active", true).order("created_at");
    if (error || !data) { $("#product-grid").innerHTML = "<p>تعذر تحميل المنتجات حاليًا. حاول تحديث الصفحة.</p>"; return; }
    products = data;
    // drop cart lines that exceed stock
    for (const id of Object.keys(cart)) { const s = stockOf(id); if (!products.some((p) => String(p.id) === id) || s <= 0) delete cart[id]; else if (cart[id] > s) cart[id] = s; }
    saveCart(); drawProducts();
  }

  function drawProducts(list = products.filter((p) => activeCategory === "الكل" || p.category === activeCategory)) {
    const grid = $("#product-grid");
    grid.innerHTML = list.map((p) => {
      const stock = Number(p.stock_kg) || 0;
      return `<article class="product-card"><div class="product-image"><img loading="lazy" src="${esc(img(p))}" alt="${esc(p.name)}"><span class="badge">${esc(p.badge || p.category)}</span></div><div class="product-info"><h3>${esc(p.name)}</h3><p class="product-desc">${esc(cleanDesc(p.description))}</p><div class="product-price">${num(p.price_per_kg, 2)} <small>ج.م / كجم</small></div>${stock > 0
        ? `<div class="stock-note">المتاح: ${num(stock)} كجم</div><div class="kg-row"><input type="number" inputmode="decimal" min="0.001" step="0.001" max="${stock}" value="1" data-kg="${esc(p.id)}" aria-label="الكمية بالكيلو"><button class="button orange" data-add="${esc(p.id)}">أضف</button></div>`
        : `<div class="stock-note out">غير متاح حاليًا</div>`}</div></article>`;
    }).join("") || "<p>لا توجد منتجات في هذا التصنيف حاليًا.</p>";
    $$("[data-add]", grid).forEach((b) => (b.onclick = () => addItem(b.dataset.add, $(`[data-kg="${b.dataset.add}"]`, grid).value)));
  }

  const getCart = () => Object.entries(cart).map(([id, kg]) => ({ product: products.find((p) => String(p.id) === String(id)), kg })).filter((x) => x.product && x.kg > 0);
  const cartTotal = () => getCart().reduce((a, x) => a + lineTotal(x.kg, x.product.price_per_kg), 0);

  function addItem(id, raw) {
    const kg = parseKg(raw); const stock = stockOf(id);
    if (kg === null) return notify("اكتب الكمية بالكيلو (حتى ٣ أرقام عشرية).");
    const next = Math.round(((cart[id] || 0) + kg) * 1000) / 1000;
    if (next > stock) return notify(`الكمية المتاحة ${num(stock)} كجم فقط.`);
    cart[id] = next; saveCart(); notify("اتضاف للسلة بنجاح");
  }
  function saveCart() { localStorage.setItem("alameen_cart_kg", JSON.stringify(cart)); drawCart(); }
  function drawCart() {
    const items = getCart(), sum = cartTotal();
    $("#cart-count").textContent = num(items.length, 0);
    $("#cart-total").textContent = money(sum); $("#checkout-total").textContent = money(sum);
    $("#cart-items").innerHTML = items.length ? items.map(({ product: p, kg }) => `<div class="cart-row"><div><h3>${esc(p.name)}</h3><small>${num(p.price_per_kg, 2)} ج.م / كجم · الإجمالي ${money(lineTotal(kg, p.price_per_kg))}</small></div><div class="quantity"><input class="kg" type="number" inputmode="decimal" min="0" step="0.001" max="${Number(p.stock_kg) || 0}" value="${kg}" data-cart-kg="${esc(p.id)}" aria-label="الكمية بالكيلو"> <small>كجم</small><button data-remove="${esc(p.id)}" aria-label="حذف">×</button></div></div>`).join("") : '<p class="empty-cart">سلتك فاضية.. اختار حاجة بتحبها 🌿</p>';
    $$("[data-cart-kg]").forEach((i) => (i.onchange = () => {
      const id = i.dataset.cartKg, kg = parseKg(i.value), stock = stockOf(id);
      if (kg === null) { notify("كمية غير صحيحة."); return drawCart(); }
      if (kg > stock) { notify(`الكمية المتاحة ${num(stock)} كجم فقط.`); cart[id] = stock; } else cart[id] = kg;
      saveCart();
    }));
    $$("[data-remove]").forEach((b) => (b.onclick = () => { delete cart[b.dataset.remove]; saveCart(); }));
  }

  const shade = $("#shade"), cartPanel = $("#cart-panel");
  $("#cart-button").onclick = () => { cartPanel.classList.add("open"); shade.classList.add("open"); };
  function closeCart() { cartPanel.classList.remove("open"); shade.classList.remove("open"); }
  shade.onclick = closeCart; $("[data-close-cart]").onclick = closeCart;
  $("#checkout-button").onclick = () => { if (!getCart().length) return notify("أضف منتجات للسلة الأول"); closeCart(); $("#checkout-dialog").showModal(); };
  $$("[data-close-dialog]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  $$('input[name="phone"]').forEach((i) => (i.oninput = () => { i.value = normalizePhone(i.value).slice(0, 11); }));

  let submitting = false;
  $("#checkout-form").onsubmit = async (e) => {
    e.preventDefault(); if (submitting) return;
    const f = e.currentTarget, form = new FormData(f), items = getCart();
    const phone = normalizePhone(form.get("phone"));
    if (!isValidPhone(phone)) return notify("رقم الموبايل لازم يكون ١١ رقم بالظبط.");
    if (!form.get("governorate")) return notify("اختر المحافظة.");
    if (!items.length) return notify("السلة فاضية.");
    for (const x of items) if (x.kg > (Number(x.product.stock_kg) || 0)) return notify(`الكمية المتاحة من ${x.product.name} أقل من المطلوب.`);
    const code = generateAccessCode();
    submitting = true;
    const { data, error } = await db.rpc("submit_store_order", {
      p_customer_name: String(form.get("customer_name")).trim(), p_phone: phone, p_address: String(form.get("address")).trim(),
      p_governorate: form.get("governorate"), p_notes: String(form.get("notes") || "").trim() || null,
      p_items: items.map((x) => ({ product_id: x.product.id, quantity_kg: x.kg })), p_access_code: code,
    });
    submitting = false;
    if (error) return notify("ما قدرناش نسجل الطلب: " + (error.message || "جرّب تاني."));
    const res = Array.isArray(data) ? data[0] : data;
    const itemsText = items.map((x) => `${x.product.name} × ${x.kg} كجم`).join("، ");
    cart = {}; saveCart(); f.reset(); $("#checkout-dialog").close();
    $("#success-id").textContent = res?.id ?? ""; $("#success-total").textContent = money(res?.total);
    $("#success-code").textContent = code;
    $("#success-dialog").showModal();
    if (config.whatsappNumber) {
      const text = encodeURIComponent(`طلب جديد من الأمين\nرقم الطلب: ${res?.id}\nالاسم: ${form.get("customer_name")}\nالهاتف: ${phone}\nالمحافظة: ${form.get("governorate")}\nالعنوان: ${form.get("address")}\nالمنتجات: ${itemsText}\nالإجمالي: ${res?.total} ج.م`);
      $("#success-dialog").dataset.wa = `https://wa.me/${config.whatsappNumber}?text=${text}`;
    }
  };
  const successDialog = $("#success-dialog");
  successDialog.addEventListener("close", () => { $("#success-code").textContent = ""; });
  $("#success-home").onclick = () => { successDialog.close(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("#success-track").onclick = () => { const id = $("#success-id").textContent; successDialog.close(); openTrack(id); };

  // ---------- Tracking ----------
  const trackDialog = $("#track-dialog"), trackForm = $("#track-form"), trackArea = $("#track-area");
  let creds = null;
  function openTrack(orderId = "") { creds = null; trackArea.innerHTML = ""; trackForm.reset(); trackForm.order_id.value = orderId; trackForm.style.display = ""; trackDialog.showModal(); }
  trackDialog.addEventListener("close", () => { creds = null; trackArea.innerHTML = ""; trackForm.reset(); });
  $$(".track-open").forEach((b) => (b.onclick = (e) => { e.preventDefault(); $("#main-nav").classList.remove("open"); openTrack(); }));
  trackForm.onsubmit = async (e) => {
    e.preventDefault();
    const c = { p_order_id: trackForm.order_id.value.trim(), p_phone: normalizePhone(trackForm.phone.value), p_access_code: trackForm.code.value.trim().toUpperCase() };
    if (!isValidPhone(c.p_phone)) return notify("رقم الموبايل لازم يكون ١١ رقم بالظبط.");
    if (!/^[A-Z0-9]{12}$/.test(c.p_access_code)) return notify("كود المتابعة ١٢ حرف/رقم.");
    creds = c; await loadTracked();
  };
  async function loadTracked() {
    trackArea.innerHTML = "<p>جاري التحميل…</p>";
    const { data, error } = await db.rpc("get_store_order", creds);
    const o = Array.isArray(data) ? data[0] : data;
    if (error || !o) { trackArea.innerHTML = '<p class="err">مش لاقيين طلب بالبيانات دي. راجع رقم الطلب والموبايل والكود.</p>'; return; }
    trackForm.style.display = "none"; renderTracked(o);
  }
  const STATUS = { new: "في انتظار القبول", pending: "في انتظار القبول", confirmed: "تم التأكيد", preparing: "قيد التجهيز", shipped: "تم الشحن", delivered: "تم التسليم", cancelled: "ملغي" };
  function itemsHtml(items) {
    return (items || []).map((i) => { const v = itemView(i); return `<div>${esc(v.name)} — ${v.isKg ? `${num(v.qty)} كجم × ${num(v.price, 2)} ج.م/كجم` : `${num(v.qty, 0)} × ${num(v.price, 2)} ج.م`} = ${money(v.subtotal)}</div>`; }).join("");
  }
  function renderTracked(o) {
    const pending = isPending(o.status);
    trackArea.innerHTML = `<article class="order-card"><h3>الحالة: <span class="status-pill">${esc(STATUS[o.status] || o.status)}</span></h3><div>${esc(o.customer_name)} · ${esc(o.phone)}</div><div>${esc(o.governorate || "")} · ${esc(o.address)}</div>${o.notes ? `<div>ملاحظات: ${esc(o.notes)}</div>` : ""}${itemsHtml(o.items)}<div class="total"><span>الإجمالي</span><b>${money(o.total)}</b></div></article>
    ${pending ? '<div class="btn-row"><button class="button orange" id="t-edit">تعديل الطلب</button><button class="button forest" id="t-cancel">إلغاء الطلب</button></div>'
      : `<p class="admin-message">${o.status === "cancelled" ? "الطلب ده اتلغى." : "الطلب اتقبل من المتجر، فمش ممكن تعديله أو إلغاؤه دلوقتي. لو محتاج تغيير كلمنا على واتساب."}</p>`}
    <button class="under-link" id="t-again">استعلام عن طلب تاني</button>`;
    $("#t-again", trackArea).onclick = () => openTrack();
    if (!pending) return;
    $("#t-cancel", trackArea).onclick = async () => {
      if (!confirm("متأكد إنك عايز تلغي الطلب؟")) return;
      const { error } = await db.rpc("cancel_pending_store_order", creds);
      if (error) return notify("تعذر الإلغاء: " + error.message);
      notify("تم إلغاء الطلب"); loadTracked();
    };
    $("#t-edit", trackArea).onclick = () => renderEdit(o);
  }
  async function renderEdit(o) {
    if (!products.length) await fetchProducts();
    const current = {}; (o.items || []).forEach((i) => { if (i.product_id) current[i.product_id] = Number(i.quantity_kg ?? i.quantity) || 0; });
    trackArea.innerHTML = `<form id="edit-form"><label>الاسم بالكامل<input name="customer_name" required value="${esc(o.customer_name)}"></label><label>المحافظة<select name="governorate" required>${govOptions(o.governorate)}</select></label><label>العنوان بالتفصيل<textarea name="address" rows="3" required>${esc(o.address)}</textarea></label><label>ملاحظات<textarea name="notes" rows="2">${esc(o.notes || "")}</textarea></label>
    <h3>الكميات (كجم)</h3>${products.map((p) => `<label>${esc(p.name)} — ${num(p.price_per_kg, 2)} ج.م/كجم <small>(المتاح ${num(p.stock_kg)} كجم)</small><input type="number" inputmode="decimal" min="0" step="0.001" max="${Number(p.stock_kg) || 0}" data-edit-kg="${esc(p.id)}" value="${current[p.id] || 0}"></label>`).join("")}
    <div class="btn-row"><button class="button orange" type="submit">حفظ التعديل</button><button class="button forest" type="button" id="edit-back">رجوع</button></div></form>`;
    $("#edit-back", trackArea).onclick = () => renderTracked(o);
    $("#edit-form", trackArea).onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget), items = [];
      for (const i of $$("[data-edit-kg]", trackArea)) {
        if (!i.value || Number(i.value) === 0) continue;
        const kg = parseKg(i.value); if (kg === null) return notify("كمية غير صحيحة.");
        if (kg > stockOf(i.dataset.editKg)) return notify("الكمية المطلوبة أكبر من المتاح.");
        items.push({ product_id: i.dataset.editKg, quantity_kg: kg });
      }
      if (!items.length) return notify("لازم يكون في منتج واحد على الأقل، أو ألغِ الطلب.");
      const { error } = await db.rpc("update_pending_store_order", { ...creds, p_customer_name: String(f.get("customer_name")).trim(), p_address: String(f.get("address")).trim(), p_governorate: f.get("governorate"), p_notes: String(f.get("notes") || "").trim() || null, p_items: items });
      if (error) return notify("تعذر حفظ التعديل: " + error.message);
      notify("الطلب اتعدل"); loadTracked();
    };
  }

  // ---------- Filters / misc ----------
  $$(".filter").forEach((b) => (b.onclick = () => { activeCategory = b.dataset.category; $$(".filter").forEach((x) => x.classList.toggle("selected", x === b)); drawProducts(); }));
  $("#newsletter-form").onsubmit = (e) => { e.preventDefault(); notify("شكرًا لاشتراكك!"); e.currentTarget.reset(); };
  $("#year").textContent = new Date().getFullYear();
  $("#menu-button").onclick = () => $("#main-nav").classList.toggle("open");
  $("#search-button").onclick = () => { const term = prompt("بتدور على إيه؟"); if (!term) return; activeCategory = "الكل"; drawProducts(products.filter((p) => p.name.includes(term) || p.category.includes(term))); $("#products").scrollIntoView(); };

  // ---------- Admin ----------
  const adminDialog = $("#admin-dialog");
  let adminTab = "orders";
  $("#admin-button").onclick = () => { adminDialog.showModal(); renderAdmin(adminTab); };
  $$("[data-admin-tab]").forEach((b) => (b.onclick = () => { $$("[data-admin-tab]").forEach((x) => x.classList.toggle("chosen", x === b)); renderAdmin(b.dataset.adminTab); }));
  async function renderAdmin(tab) {
    adminTab = tab;
    const msg = $("#admin-message"), area = $("#admin-area");
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      if (orderFeed) { db.removeChannel(orderFeed); orderFeed = null; }
      msg.textContent = "سجّل الدخول بحساب فريق المتجر لعرض الطلبات أو تعديل المنتجات.";
      area.innerHTML = '<label>بريد فريق المتجر<input id="staff-email" type="email" placeholder="البريد الإلكتروني"></label><label>كلمة المرور<input id="staff-password" type="password" placeholder="كلمة المرور"></label><button class="button orange wide" id="staff-login">دخول لوحة المتجر</button>';
      $("#staff-login", area).onclick = async () => { const { error } = await db.auth.signInWithPassword({ email: $("#staff-email", area).value, password: $("#staff-password", area).value }); if (error) return notify("تعذر الدخول. راجع البريد وكلمة المرور."); renderAdmin(tab); };
      return;
    }
    const { data: adm } = await db.from("store_admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (!adm) { msg.textContent = "هذا الحساب غير مضاف إلى فريق المتجر."; area.innerHTML = '<button class="under-link" id="staff-logout">تسجيل الخروج</button>'; $("#staff-logout", area).onclick = logout; return; }
    msg.textContent = "أنت مسجل دخول فريق المتجر. التغييرات تُحفظ في قاعدة البيانات.";
    if (!orderFeed) {
      orderFeed = db.channel("alameen-orders")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => { notify(`وصل طلب جديد من ${payload.new.customer_name}`); if (adminDialog.open && adminTab === "orders") renderAdmin("orders"); })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => { if (adminDialog.open && adminTab === "orders") renderAdmin("orders"); })
        .subscribe();
    }
    if (tab === "orders") {
      const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false });
      if (error) { area.innerHTML = "<p>تعذر تحميل الطلبات.</p>"; return; }
      orders = data || [];
      area.innerHTML = (orders.length ? orders.map((o) => {
        const pending = isPending(o.status);
        const opts = pending ? ["cancelled"] : ["confirmed", "preparing", "shipped", "delivered", "cancelled"].filter((s) => s !== "confirmed" || o.status === "confirmed");
        const all = pending ? [o.status, ...opts] : opts.includes(o.status) ? opts : [o.status, ...opts];
        return `<article class="order-card"><h3>${esc(o.customer_name)} — ${money(o.total)}</h3><div>${esc(o.phone)} · ${esc(o.governorate || "")} · ${esc(o.address)}</div>${o.notes ? `<div>ملاحظات: ${esc(o.notes)}</div>` : ""}${itemsHtml(o.items)}<small style="direction:ltr;display:block">#${esc(o.id)}</small>
        ${pending ? `<button class="button orange wide" data-confirm="${esc(o.id)}">تأكيد الطلب</button>` : ""}
        <label>حالة الطلب <select data-status="${esc(o.id)}" data-current="${esc(o.status)}">${[...new Set(all)].map((s) => `<option value="${s}"${s === o.status ? " selected" : ""}>${STATUS[s] || s}</option>`).join("")}</select></label></article>`;
      }).join("") : '<p class="empty-cart">لسه مفيش طلبات.</p>') + '<button class="under-link" id="staff-logout">تسجيل الخروج</button>';
      $$("[data-confirm]", area).forEach((b) => (b.onclick = async () => {
        b.disabled = true;
        const { error } = await db.rpc("confirm_store_order", { p_order_id: b.dataset.confirm });
        if (error) { b.disabled = false; return notify(/stock|مخزون|insufficient|shortage/i.test(error.message) ? "المخزون غير كافٍ لتأكيد الطلب: " + error.message : "تعذر تأكيد الطلب: " + error.message); }
        notify("الطلب اتأكد والمخزون اتخصم"); await fetchProducts(); renderAdmin("orders");
      }));
      $$("[data-status]", area).forEach((s) => (s.onchange = async () => {
        if (s.value === "confirmed" && s.dataset.current !== "confirmed") { s.value = s.dataset.current; return notify("استخدم زر «تأكيد الطلب»."); }
        if (s.value === s.dataset.current) return;
        const { error } = await db.from("orders").update({ status: s.value }).eq("id", s.dataset.status);
        if (error) { s.value = s.dataset.current; return notify("تعذر حفظ الحالة."); }
        notify("حالة الطلب اتحدثت"); renderAdmin("orders");
      }));
    } else {
      if (!products.length) await fetchProducts();
      area.innerHTML = products.map((p) => `<div class="product-edit"><input data-name="${esc(p.id)}" value="${esc(p.name)}" aria-label="الاسم"><label>ج.م/كجم<input type="number" step="0.01" min="0" data-price="${esc(p.id)}" value="${p.price_per_kg ?? ""}"></label><label>المخزون كجم<input type="number" step="0.001" min="0" data-stock="${esc(p.id)}" value="${p.stock_kg ?? 0}"></label><button data-save="${esc(p.id)}">حفظ</button></div>`).join("") + '<p class="product-desc">عدّل الاسم والسعر لكل كيلو والمخزون المتبقي بالكيلو (حتى ٣ أرقام عشرية).</p><button class="under-link" id="staff-logout">تسجيل الخروج</button>';
      $$("[data-save]", area).forEach((b) => (b.onclick = async () => {
        const id = b.dataset.save, name = $(`[data-name="${id}"]`, area).value.trim();
        const price = Math.round(Number($(`[data-price="${id}"]`, area).value) * 100) / 100;
        const stockRaw = $(`[data-stock="${id}"]`, area).value, stock = Number(stockRaw) === 0 ? 0 : parseKg(stockRaw);
        if (!name || !(price >= 0) || stock === null) return notify("راجع القيم (السعر والمخزون أرقام موجبة، المخزون حتى ٣ أرقام عشرية).");
        const { error } = await db.from("products").update({ name, price_per_kg: price, stock_kg: stock }).eq("id", id);
        if (error) return notify("تعذر حفظ التعديل.");
        products = products.map((p) => (String(p.id) === id ? { ...p, name, price_per_kg: price, stock_kg: stock } : p));
        drawProducts(); drawCart(); notify("المنتج اتحدث");
      }));
    }
    const lo = $("#staff-logout", area); if (lo) lo.onclick = logout;
    async function logout() { await db.auth.signOut(); if (orderFeed) { db.removeChannel(orderFeed); orderFeed = null; } renderAdmin(tab); }
  }

  $("#whatsapp-link").href = `https://wa.me/${config.whatsappNumber || "201096941342"}`;
  fetchProducts(); drawCart();
  return () => { if (orderFeed) db.removeChannel(orderFeed); };
}
