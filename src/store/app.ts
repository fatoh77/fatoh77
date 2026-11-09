// @ts-nocheck
// Store behaviour: per-kg catalogue, RPC-based checkout/tracking, admin with confirm_store_order.
import { createClient } from "@supabase/supabase-js";
import { STORE_CONFIG as config } from "./config";
import { GOVERNORATES, PRODUCT_IMAGES, PRODUCT_IMAGE_FALLBACKS, generateAccessCode, normalizePhone, isValidPhone, parseKg, quantityToKg, formatKg, lineTotal, itemView, isPending } from "./logic";

let client = null;
export function getStoreClient() {
  if (!client) client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export function initStore() {
  const db = getStoreClient();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let products = [], orders = [], activeCategory = "الكل", searchTerm = "", orderFeed = null;
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem("alameen_cart_kg") || "{}"); } catch { cart = {}; }
  localStorage.removeItem("alameen_cart");
  const num = (n, d = 3) => new Intl.NumberFormat("ar-EG", { maximumFractionDigits: d }).format(Number(n) || 0);
  const money = (n) => `${num(n, 2)} ج.م`;
  const quantityLabel = (kg) => { const q = formatKg(kg); return `${num(q.value)} ${q.unit}`; };
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
    if (error || !data) { $("#product-grid").innerHTML = '<div class="catalog-error"><p>تعذر تحميل المحاصيل حاليًا.</p><button type="button" class="button forest" data-retry-products>أعد المحاولة</button></div>'; $(`[data-retry-products]`, $("#product-grid")).onclick = fetchProducts; return; }
    products = data;
    const heroProduct = products.find((p) => Number(p.stock_kg) > 0) || products[0];
    if (heroProduct) {
      const heroImage = $("#hero-product-image");
      heroImage.onerror = () => {
        const fallback = PRODUCT_IMAGE_FALLBACKS[heroProduct.id];
        heroImage.onerror = () => { heroImage.onerror = null; heroImage.hidden = true; heroImage.parentElement.classList.add("image-unavailable"); };
        if (fallback) heroImage.src = fallback;
        else heroImage.onerror();
      };
      heroImage.src = img(heroProduct); heroImage.alt = `${heroProduct.name}، ${heroProduct.category}`;
    }
    $("#all-product-count").textContent = num(products.length, 0);
    $$(".filter[data-category]").forEach((button) => {
      const category = button.dataset.category;
      const count = category === "الكل" ? products.length : products.filter((p) => p.category === category).length;
      const badge = $("small", button);
      if (badge) badge.textContent = num(count, 0);
    });
    // drop cart lines that exceed stock
    for (const id of Object.keys(cart)) { const s = stockOf(id); if (!products.some((p) => String(p.id) === id) || s <= 0) delete cart[id]; else if (cart[id] > s) cart[id] = s; }
    saveCart(); drawProducts();
  }

  function drawProducts() {
    const term = searchTerm.trim().toLocaleLowerCase("ar");
    const list = products.filter((p) => (activeCategory === "الكل" || p.category === activeCategory)
      && (!term || `${p.name} ${p.category} ${cleanDesc(p.description)}`.toLocaleLowerCase("ar").includes(term)));
    const grid = $("#product-grid");
    grid.innerHTML = list.map((p) => {
      const stock = Number(p.stock_kg) || 0;
      const productImage = img(p), backupImage = PRODUCT_IMAGE_FALLBACKS[p.id] || "";
      const imageHost = productImage.startsWith("/assets/products/") ? "Wikimedia Commons" : (() => { try { return new URL(productImage, window.location.href).hostname; } catch { return ""; } })();
      return `<article class="product-card"><div class="product-image"><img loading="lazy" src="${esc(productImage)}" alt="${esc(p.name)}" data-source="${esc(imageHost)}" data-subject="${esc(p.name)}" data-fallback="${esc(backupImage)}" referrerpolicy="no-referrer"><span class="image-unavailable-label" aria-hidden="true">صورة المحصول غير متاحة</span><span class="badge">${esc(p.category)}</span></div><div class="product-info"><h3>${esc(p.name)}</h3><p class="product-desc">${esc(cleanDesc(p.description))}</p><div class="product-price">${num(p.price_per_kg, 2)} <small>ج.م / كجم</small></div>${stock > 0
        ? `<div class="stock-note">المتاح: ${quantityLabel(stock)}</div><div class="kg-row"><input type="number" inputmode="decimal" min="0.001" step="0.001" value="1" data-qty="${esc(p.id)}" aria-label="الكمية المطلوبة من ${esc(p.name)}"><select data-unit="${esc(p.id)}" aria-label="وحدة الكمية"><option value="kg">كجم</option><option value="ton">طن</option></select><button class="button orange" data-add="${esc(p.id)}">أضف للسلة</button></div>`
        : `<div class="stock-note out">غير متاح حاليًا</div>`}</div></article>`;
    }).join("") || '<p class="empty-catalog">لا توجد محاصيل مطابقة. جرّب كلمة بحث أو تصنيفًا آخر.</p>';
    $$("img[data-fallback]", grid).forEach((image) => (image.onerror = () => {
      const fallback = image.dataset.fallback;
      image.dataset.fallback = "";
      image.onerror = () => { image.onerror = null; image.hidden = true; image.parentElement.classList.add("image-unavailable"); };
      if (fallback) image.src = fallback;
      else image.onerror();
    }));
    $$("[data-add]", grid).forEach((b) => (b.onclick = () => addItem(b.dataset.add, $(`[data-qty="${b.dataset.add}"]`, grid).value, $(`[data-unit="${b.dataset.add}"]`, grid).value)));
  }

  const getCart = () => Object.entries(cart).map(([id, kg]) => ({ product: products.find((p) => String(p.id) === String(id)), kg })).filter((x) => x.product && x.kg > 0);
  const cartTotal = () => getCart().reduce((a, x) => a + lineTotal(x.kg, x.product.price_per_kg), 0);

  function addItem(id, raw, unit = "kg") {
    const kg = quantityToKg(raw, unit); const stock = stockOf(id);
    if (kg === null) return notify("اكتب كمية صحيحة بالكيلو أو بالطن.");
    const next = Math.round(((cart[id] || 0) + kg) * 1000) / 1000;
    if (next > stock) return notify(`الكمية المتاحة ${quantityLabel(stock)} فقط.`);
    cart[id] = next; saveCart(); notify("اتضاف للسلة بنجاح");
  }
  function saveCart() { localStorage.setItem("alameen_cart_kg", JSON.stringify(cart)); drawCart(); }
  function drawCart() {
    const items = getCart(), sum = cartTotal();
    $("#cart-count").textContent = num(items.length, 0);
    $("#cart-total").textContent = money(sum); $("#checkout-total").textContent = money(sum);
    $("#cart-items").innerHTML = items.length ? items.map(({ product: p, kg }) => {
      const displayQty = formatKg(kg), unit = displayQty.unit === "طن" ? "ton" : "kg";
      return `<div class="cart-row"><div><h3>${esc(p.name)}</h3><small>${quantityLabel(kg)} · ${num(p.price_per_kg, 2)} ج.م/كجم · الإجمالي ${money(lineTotal(kg, p.price_per_kg))}</small></div><div class="quantity"><input class="kg" type="number" inputmode="decimal" min="0.001" step="0.001" value="${displayQty.value}" data-cart-kg="${esc(p.id)}" aria-label="كمية ${esc(p.name)}"><select data-cart-unit="${esc(p.id)}" aria-label="وحدة كمية ${esc(p.name)}"><option value="kg"${unit === "kg" ? " selected" : ""}>كجم</option><option value="ton"${unit === "ton" ? " selected" : ""}>طن</option></select><button data-remove="${esc(p.id)}" aria-label="حذف ${esc(p.name)} من السلة">×</button></div></div>`;
    }).join("") : '<p class="empty-cart">سلتك فاضية.. اختار حاجة بتحبها 🌿</p>';
    $$("[data-cart-kg]").forEach((i) => (i.onchange = () => {
      const id = i.dataset.cartKg, unit = $(`[data-cart-unit="${id}"]`).value, kg = quantityToKg(i.value, unit), stock = stockOf(id);
      if (kg === null) { notify("كمية غير صحيحة."); return drawCart(); }
      if (kg > stock) { notify(`الكمية المتاحة ${quantityLabel(stock)} فقط.`); cart[id] = stock; } else cart[id] = kg;
      saveCart();
    }));
    $$("[data-cart-unit]").forEach((select) => (select.onchange = () => {
      const id = select.dataset.cartUnit, input = $(`[data-cart-kg="${id}"]`), previous = select.dataset.previousUnit || (Number(cart[id]) >= 1000 ? "ton" : "kg");
      const currentKg = quantityToKg(input.value, previous);
      if (currentKg !== null) input.value = String(Math.round((currentKg / (select.value === "ton" ? 1000 : 1)) * 1000) / 1000);
      select.dataset.previousUnit = select.value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    $$("[data-remove]").forEach((b) => (b.onclick = () => { delete cart[b.dataset.remove]; saveCart(); }));
  }

  const shade = $("#shade"), cartPanel = $("#cart-panel");
  $("#cart-button").onclick = () => { cartPanel.classList.add("open"); shade.classList.add("open"); };
  function closeCart() { cartPanel.classList.remove("open"); shade.classList.remove("open"); }
  shade.onclick = closeCart; $("[data-close-cart]").onclick = closeCart;
  $("#checkout-button").onclick = () => { if (!getCart().length) return notify("أضف منتجات للسلة الأول"); closeCart(); $("#checkout-dialog").showModal(); };
  $$("[data-close-dialog]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  $$('input[name="phone"]').forEach((i) => (i.oninput = () => { i.value = normalizePhone(i.value).slice(0, 15); }));

  let submitting = false;
  $("#checkout-form").onsubmit = async (e) => {
    e.preventDefault(); if (submitting) return;
    const f = e.currentTarget, form = new FormData(f), items = getCart();
    const phone = normalizePhone(form.get("phone"));
    if (!isValidPhone(phone)) return notify("يرجى كتابة رقم هاتف صحيح لا يقل عن ١١ رقمًا.");
    if (!form.get("governorate")) return notify("اختر المحافظة.");
    if (!items.length) return notify("السلة فاضية.");
    for (const x of items) if (x.kg > (Number(x.product.stock_kg) || 0)) return notify(`الكمية المتاحة من ${x.product.name}: ${quantityLabel(x.product.stock_kg)}.`);
    const code = generateAccessCode(), submitButton = $("#checkout-form button[type=submit]");
    submitting = true; submitButton.disabled = true; submitButton.textContent = "جارٍ إرسال الطلب…";
    let data, error;
    try {
      ({ data, error } = await db.rpc("submit_store_order", {
        p_customer_name: String(form.get("customer_name")).trim(), p_phone: phone, p_address: String(form.get("address")).trim(),
        p_governorate: form.get("governorate"), p_notes: String(form.get("notes") || "").trim() || null,
        p_items: items.map((x) => ({ product_id: x.product.id, quantity_kg: x.kg })), p_access_code: code,
      }));
    } catch {
      error = { message: "network" };
    } finally {
      submitting = false; submitButton.disabled = false; submitButton.innerHTML = 'تأكيد الطلب <span aria-hidden="true">←</span>';
    }
    if (error) {
      const inventoryError = /stock|مخزون|insufficient|shortage/i.test(error.message || "");
      return notify(inventoryError ? "الكمية المتاحة اتغيرت. راجع المخزون وحاول تاني." : "تعذر تسجيل الطلب حاليًا. حاول مرة تانية بعد قليل.");
    }
    const res = Array.isArray(data) ? data[0] : data;
    if (!res?.id) return notify("وصل رد غير مكتمل من قاعدة الطلبات. لم يتم تفريغ السلة؛ حاول الاستعلام قبل إعادة الإرسال.");
    const itemsText = items.map((x) => `${x.product.name} × ${quantityLabel(x.kg)}`).join("، ");
    cart = {}; saveCart(); $("#checkout-dialog").close();
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
  $("#success-track").onclick = () => { const phone = normalizePhone($("#checkout-form [name=phone]").value); successDialog.close(); openTrack(phone); };
  $("#success-copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#success-code").textContent); notify("اتنسخ كود المتابعة."); }
    catch { notify("انسخ الكود يدويًا قبل إغلاق نافذة الطلب."); }
  };

  // ---------- Tracking ----------
  const trackDialog = $("#track-dialog"), trackForm = $("#track-form"), trackArea = $("#track-area");
  let creds = null;
  let trackedPhone = "";
  function openTrack(phone = "") { creds = null; trackedPhone = ""; trackArea.innerHTML = ""; trackForm.reset(); trackForm.phone.value = phone; trackForm.style.display = ""; trackDialog.showModal(); }
  trackDialog.addEventListener("close", () => { creds = null; trackArea.innerHTML = ""; trackForm.reset(); });
  $$(".track-open").forEach((b) => (b.onclick = (e) => { e.preventDefault(); $("#main-nav").classList.remove("open"); openTrack(); }));
  trackForm.onsubmit = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(trackForm.phone.value);
    if (!isValidPhone(phone)) return notify("يرجى كتابة رقم هاتف صحيح لا يقل عن ١١ رقمًا.");
    trackedPhone = phone;
    await loadCustomerOrders(phone);
  };
  async function loadCustomerOrders(phone) {
    trackArea.innerHTML = '<p class="loading-state">جاري البحث عن طلباتك…</p>';
    let data, error;
    try { ({ data, error } = await db.rpc("get_customer_orders_by_phone", { p_phone: phone })); }
    catch { error = { message: "network" }; }
    if (error) { trackArea.innerHTML = '<p class="err">تعذر تحميل الطلبات الآن. راجع الرقم وحاول تاني.</p>'; return; }
    const ordersForPhone = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
    if (!ordersForPhone.length) { trackArea.innerHTML = '<p class="empty-cart">ملقيناش طلبات مرتبطة بالرقم ده.</p><button type="button" class="under-link" id="track-another">جرّب رقم تاني</button>'; $("#track-another", trackArea).onclick = () => openTrack(); return; }
    trackForm.style.display = "none";
    trackArea.innerHTML = `<div class="track-results"><div class="track-results-head"><h3>طلباتك (${num(ordersForPhone.length, 0)})</h3><button type="button" class="under-link" id="track-another">استعلام برقم آخر</button></div>${ordersForPhone.map((o) => {
      const date = new Date(o.created_at);
      const dateLabel = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
      const pending = isPending(o.status);
      return `<article class="order-card"><h3>طلب <bdi dir="ltr">#${esc(String(o.id).slice(0, 8))}</bdi> <span class="status-pill">${esc(STATUS[o.status] || o.status)}</span></h3>${dateLabel ? `<small>${dateLabel}</small>` : ""}${itemsHtml(o.items)}<div class="total"><span>الإجمالي</span><b>${money(o.total)}</b></div>${pending ? `<details class="order-access"><summary>تعديل أو إلغاء الطلب</summary><label>كود المتابعة<input type="text" maxlength="12" data-order-code="${esc(o.id)}" dir="ltr" autocomplete="one-time-code" placeholder="الكود المكوّن من ١٢ حرفًا"/></label><button type="button" class="button forest" data-open-order="${esc(o.id)}">فتح الطلب</button></details>` : ""}</article>`;
    }).join("")}</div>`;
    $("#track-another", trackArea).onclick = () => openTrack();
    $$('[data-open-order]', trackArea).forEach((button) => (button.onclick = async () => {
      const input = $(`[data-order-code="${button.dataset.openOrder}"]`, trackArea), code = input.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{12}$/.test(code)) return notify("أدخل كود المتابعة المكوّن من ١٢ حرفًا.");
      creds = { p_order_id: button.dataset.openOrder, p_phone: phone, p_access_code: code };
      await loadTracked();
    }));
  }
  async function loadTracked() {
    trackArea.innerHTML = "<p>جاري التحميل…</p>";
    trackArea.innerHTML = '<p class="loading-state">جاري تحميل تفاصيل الطلب…</p>';
    let data, error;
    try { ({ data, error } = await db.rpc("get_store_order", creds)); }
    catch { error = { message: "network" }; }
    const o = Array.isArray(data) ? data[0] : data;
    if (error || !o) { trackArea.innerHTML = '<p class="err">مش لاقيين طلب بالبيانات دي. راجع رقم الموبايل وكود المتابعة.</p><button type="button" class="under-link" id="back-to-orders">العودة لقائمة الطلبات</button>'; $("#back-to-orders", trackArea).onclick = () => loadCustomerOrders(creds.p_phone); return; }
    trackForm.style.display = "none"; renderTracked(o);
  }
  const STATUS = { new: "في انتظار القبول", pending: "في انتظار القبول", confirmed: "تم التأكيد", preparing: "قيد التجهيز", shipped: "تم الشحن", delivered: "تم التسليم", cancelled: "ملغي" };
  function itemsHtml(items) {
    return (items || []).map((i) => { const v = itemView(i); const qtyText = v.isKg ? quantityLabel(v.qty) : `${num(v.qty, 0)} وحدة`; return `<div class="order-line">${esc(v.name)} — ${qtyText} × ${num(v.price, 2)} ${v.isKg ? "ج.م/كجم" : "ج.م"} = ${money(v.subtotal)}</div>`; }).join("");
  }
  function renderTracked(o) {
    const pending = isPending(o.status);
    trackArea.innerHTML = `<article class="order-card"><h3>الحالة: <span class="status-pill">${esc(STATUS[o.status] || o.status)}</span></h3><div>${esc(o.customer_name)} · ${esc(o.phone)}</div><div>${esc(o.governorate || "")} · ${esc(o.address)}</div>${o.notes ? `<div>ملاحظات: ${esc(o.notes)}</div>` : ""}${itemsHtml(o.items)}<div class="total"><span>الإجمالي</span><b>${money(o.total)}</b></div></article>
    ${pending ? '<div class="btn-row"><button class="button orange" id="t-edit">تعديل الطلب</button><button class="button forest" id="t-cancel">إلغاء الطلب</button></div>'
      : `<p class="admin-message">${o.status === "cancelled" ? "الطلب ده اتلغى." : "الطلب اتقبل من المتجر، فمش ممكن تعديله أو إلغاؤه دلوقتي. لو محتاج تغيير كلمنا على واتساب."}</p>`}
    <button class="under-link" id="t-again">العودة لكل طلباتي</button>`;
    $("#t-again", trackArea).onclick = () => loadCustomerOrders(creds.p_phone);
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
    <h3>الكميات — بالكيلو أو الطن</h3>${products.map((p) => { const q = formatKg(current[p.id] || 0); const unit = q.unit === "طن" ? "ton" : "kg"; return `<label>${esc(p.name)} — ${num(p.price_per_kg, 2)} ج.م/كجم <small>(المتاح ${quantityLabel(p.stock_kg)})</small><div class="edit-quantity"><input type="number" inputmode="decimal" min="0" step="0.001" data-edit-kg="${esc(p.id)}" value="${q.value}"><select data-edit-unit="${esc(p.id)}" aria-label="وحدة كمية ${esc(p.name)}"><option value="kg"${unit === "kg" ? " selected" : ""}>كجم</option><option value="ton"${unit === "ton" ? " selected" : ""}>طن</option></select></div></label>`; }).join("")}
    <div class="btn-row"><button class="button orange" type="submit">حفظ التعديل</button><button class="button forest" type="button" id="edit-back">رجوع</button></div></form>`;
    $("#edit-back", trackArea).onclick = () => renderTracked(o);
    $$('[data-edit-unit]', trackArea).forEach((select) => (select.onchange = () => {
      const id = select.dataset.editUnit, input = $(`[data-edit-kg="${id}"]`, trackArea), previous = select.dataset.previousUnit || (Number(current[id]) >= 1000 ? "ton" : "kg");
      const currentKg = quantityToKg(input.value, previous);
      if (currentKg !== null) input.value = String(Math.round((currentKg / (select.value === "ton" ? 1000 : 1)) * 1000) / 1000);
      select.dataset.previousUnit = select.value;
    }));
    $("#edit-form", trackArea).onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget), items = [];
      for (const i of $$("[data-edit-kg]", trackArea)) {
        if (!i.value || Number(i.value) === 0) continue;
        const kg = quantityToKg(i.value, $(`[data-edit-unit="${i.dataset.editKg}"]`, trackArea).value); if (kg === null) return notify("كمية غير صحيحة.");
        if (kg > stockOf(i.dataset.editKg)) return notify("الكمية المطلوبة أكبر من المتاح في المخزون.");
        items.push({ product_id: i.dataset.editKg, quantity_kg: kg });
      }
      if (!items.length) return notify("لازم يكون في منتج واحد على الأقل، أو ألغِ الطلب.");
      const { error } = await db.rpc("update_pending_store_order", { ...creds, p_customer_name: String(f.get("customer_name")).trim(), p_address: String(f.get("address")).trim(), p_governorate: f.get("governorate"), p_notes: String(f.get("notes") || "").trim() || null, p_items: items });
      if (error) return notify("تعذر حفظ التعديل: " + error.message);
      notify("الطلب اتعدل"); loadTracked();
    };
  }

  // ---------- Filters / misc ----------
  $$(".filter").forEach((b) => (b.onclick = () => {
    activeCategory = b.dataset.category;
    $$(".filter").forEach((x) => { x.classList.toggle("selected", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    drawProducts();
  }));
  $("#product-search").oninput = (e) => { searchTerm = e.currentTarget.value; drawProducts(); };
  $$("#main-nav a:not(.track-open)").forEach((a) => (a.onclick = () => { $("#main-nav").classList.remove("open"); $("#menu-button").setAttribute("aria-expanded", "false"); $("#menu-button").setAttribute("aria-label", "فتح القائمة"); }));
  $("#year").textContent = new Date().getFullYear();
  $("#menu-button").onclick = () => {
    const open = $("#main-nav").classList.toggle("open");
    $("#menu-button").setAttribute("aria-expanded", String(open));
    $("#menu-button").setAttribute("aria-label", open ? "إغلاق القائمة" : "فتح القائمة");
  };
  $("#search-button").onclick = () => { $("#products").scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("#product-search").focus(), 250); };

  // ---------- Admin ----------
  const adminDialog = $("#admin-dialog");
  let adminTab = "orders";
  function openAdmin() { if (!adminDialog.open) adminDialog.showModal(); renderAdmin(adminTab); }
  $("#admin-button").onclick = openAdmin;
  $("#admin-open-link").onclick = openAdmin;
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
        // Cancelling a confirmed order needs an inventory refund RPC; only pending orders can be cancelled here.
        const opts = pending ? ["cancelled"] : ["confirmed", "preparing", "shipped", "delivered"].filter((s) => s !== "confirmed" || o.status === "confirmed");
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
        const priceRaw = $(`[data-price="${id}"]`, area).value.trim();
        const price = Math.round(Number(priceRaw) * 100) / 100;
        const stockRaw = $(`[data-stock="${id}"]`, area).value.trim(), stock = stockRaw === "0" ? 0 : parseKg(stockRaw);
        if (!name || priceRaw === "" || !Number.isFinite(price) || price < 0 || stock === null) return notify("راجع القيم: اكتب السعر والمخزون، ويمكن أن يكون المخزون صفرًا.");
        const { error } = await db.from("products").update({ name, price_per_kg: price, stock_kg: stock }).eq("id", id);
        if (error) return notify("تعذر حفظ التعديل.");
        products = products.map((p) => (String(p.id) === id ? { ...p, name, price_per_kg: price, stock_kg: stock } : p));
        if (stock === 0) delete cart[id]; else if (cart[id] > stock) cart[id] = stock;
        saveCart(); drawProducts(); notify("المنتج اتحدث");
      }));
    }
    const lo = $("#staff-logout", area); if (lo) lo.onclick = logout;
    async function logout() { await db.auth.signOut(); if (orderFeed) { db.removeChannel(orderFeed); orderFeed = null; } renderAdmin(tab); }
  }

  const waBase = `https://wa.me/${config.whatsappNumber || "201096941342"}`;
  $("#whatsapp-link").href = waBase;
  $("#bulk-whatsapp").href = `${waBase}?text=${encodeURIComponent("السلام عليكم، محتاج أستفسر عن الكميات المتاحة والأسعار بالجملة من متجر الأمين.")}`;
  fetchProducts(); drawCart();
  return () => { if (orderFeed) db.removeChannel(orderFeed); };
}
