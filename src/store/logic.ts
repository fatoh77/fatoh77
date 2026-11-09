// Pure store rules (kg quantities, phone, access code, legacy item display).
export const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", "البحيرة", "الفيوم", "الغربية", "الإسماعيلية",
  "المنوفية", "المنيا", "القليوبية", "الوادي الجديد", "السويس", "أسوان", "أسيوط", "بني سويف", "بورسعيد", "دمياط",
  "الشرقية", "جنوب سيناء", "كفر الشيخ", "مطروح", "الأقصر", "قنا", "شمال سيناء", "سوهاج",
];

// Product-matched photo stand-ins; the database values remain untouched.
export const PRODUCT_IMAGES: Record<string, string> = {
  "368ec2a4-241d-415a-a046-6d1b9b0a6fe1": "/assets/products/photo-f86937728-960.jpg",
  "56dccc32-e277-4f76-9176-a8d0152e8dfb": "/assets/products/photo-f85644637-960.jpg",
  "6d3ebbd5-a892-4044-9f5c-a4c0dc9a99e1": "/assets/products/photo-f29509141-960.jpg",
  "525c4493-a017-4a81-a519-7202ade8791b": "/assets/products/photo-f62609564-960.jpg",
  "0514394a-50dc-4b64-af03-936c34871ff1": "/assets/products/photo-f87521449-960.jpg",
  "7b046e4d-c2df-4ca1-b752-fb4e07e59c00": "/assets/products/photo-f9506024-960.jpg",
};
export const PRODUCT_IMAGE_FALLBACKS: Record<string, string> = {
  "368ec2a4-241d-415a-a046-6d1b9b0a6fe1": "/assets/products/photo-f86937728-500.jpg",
  "56dccc32-e277-4f76-9176-a8d0152e8dfb": "/assets/products/photo-f85644637-500.jpg",
  "6d3ebbd5-a892-4044-9f5c-a4c0dc9a99e1": "/assets/products/photo-f29509141-500.jpg",
  "525c4493-a017-4a81-a519-7202ade8791b": "/assets/products/photo-f62609564-500.jpg",
  "0514394a-50dc-4b64-af03-936c34871ff1": "/assets/products/photo-f87521449-500.jpg",
  "7b046e4d-c2df-4ca1-b752-fb4e07e59c00": "/assets/products/photo-f9506024-500.jpg",
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export function generateAccessCode(length = 12): string {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    const b = buf[0] ?? 255;
    if (b < 252) out += ALPHABET[b % 36]; // 252 = 7*36, avoids modulo bias
  }
  return out;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const normalizeNumerals = (v: unknown) => String(v ?? "").replace(/[٠-٩۰-۹]/g, (d) => {
  const index = AR_DIGITS.indexOf(d);
  return String(index >= 0 ? index : PERSIAN_DIGITS.indexOf(d));
});
export function normalizePhone(v: unknown): string {
  return normalizeNumerals(v).replace(/\D/g, "");
}
export const isValidPhone = (p: string) => /^\d{11,15}$/.test(p);

/** Convert the customer's selected unit to the single kg unit stored in Postgres. */
export function quantityToKg(v: unknown, unit: "kg" | "ton" = "kg"): number | null {
  const quantity = parseKg(v);
  if (quantity === null) return null;
  const kg = unit === "ton" ? quantity * 1000 : quantity;
  return Number.isFinite(kg) ? Math.round(kg * 1000) / 1000 : null;
}

/** Keep large stock and order quantities readable while the database stays in kg. */
export function formatKg(v: unknown): { value: number; unit: "كجم" | "طن" } {
  const kg = Number(v);
  if (Number.isFinite(kg) && kg >= 1000) {
    return { value: Math.round((kg / 1000) * 1000) / 1000, unit: "طن" };
  }
  return { value: Number.isFinite(kg) ? kg : 0, unit: "كجم" };
}

/** Positive kg with at most 3 decimals, else null. */
export function parseKg(v: unknown): number | null {
  const s = normalizeNumerals(v).trim().replace("٫", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}
export const lineTotal = (kg: number, pricePerKg: number) => Math.round(kg * 1000 * Number(pricePerKg)) / 1000;

export function itemView(i: any) {
  const isKg = i.quantity_kg != null;
  const qty = Number(isKg ? i.quantity_kg : i.quantity) || 0;
  const price = Number(i.price_per_kg ?? i.price) || 0;
  const subtotal = i.subtotal != null ? Number(i.subtotal) : i.line_total != null ? Number(i.line_total) : qty * price;
  return { name: i.name ?? i.product_name ?? "", qty, price, isKg, subtotal };
}
export const isPending = (s: string) => s === "new" || s === "pending";
