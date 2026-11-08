// Pure store rules (kg quantities, phone, access code, legacy item display).
export const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", "البحيرة", "الفيوم", "الغربية", "الإسماعيلية",
  "المنوفية", "المنيا", "القليوبية", "الوادي الجديد", "السويس", "أسوان", "أسيوط", "بني سويف", "بورسعيد", "دمياط",
  "الشرقية", "جنوب سيناء", "كفر الشيخ", "مطروح", "الأقصر", "قنا", "شمال سيناء", "سوهاج",
];

const SUNFLOWER = "https://hips.hearstapps.com/hmg-prod/images/sunflower-seeds-1528916973.jpg?crop=0.6666666666666666xw%3A1xh%3Bcenter%2Ctop";
// Display images keyed by product id (DB image column is left untouched).
export const PRODUCT_IMAGES: Record<string, string> = {
  "368ec2a4-241d-415a-a046-6d1b9b0a6fe1": SUNFLOWER,
  "56dccc32-e277-4f76-9176-a8d0152e8dfb": SUNFLOWER,
  "6d3ebbd5-a892-4044-9f5c-a4c0dc9a99e1": "https://www.dryfruithub.com/image/cache/catalog/pumpkin%20seeds%207-550x550w.jpg",
  "525c4493-a017-4a81-a519-7202ade8791b": "https://cf-img-a-in.tosshub.com/sites/visualstory/wp/2024/08/cropped-GettyImages-155420683-scaled-1.jpg?size=900%3A1200",
  "0514394a-50dc-4b64-af03-936c34871ff1": "https://storage.googleapis.com/peppermint-cdn/myplate.food-recipe-images/roasted-chickpeas-garbanzo-beans.jpg",
  "7b046e4d-c2df-4ca1-b752-fb4e07e59c00": "https://media.s-bol.com/J21GZRJRlNnJ/52RN6R/550x515.jpg",
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
export function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/\D/g, "");
}
export const isValidPhone = (p: string) => /^\d{11}$/.test(p);

/** Positive kg with at most 3 decimals, else null. */
export function parseKg(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace("٫", ".");
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
