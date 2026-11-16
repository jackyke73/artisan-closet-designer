// SAMPLE PRICES ONLY. The catalog has no MSRP yet; these numbers exist so the
// designer can show a working total. Replace PRICE_LIST with Artisan's real
// MSRP (part number -> USD) and the formula below is no longer used.

export const PRICES_ARE_SAMPLE = true;

export const PRICE_LIST = {
  // "SO SP1590": 129,
};

function samplePrice(part) {
  const w = +(part.match(/(\d{2})/) || [0, 24])[1];
  if (part === "Closet Kit") return 29;
  if (part.startsWith("SO SP")) return part.includes("2490") ? 175 : 135;
  if (part.startsWith("SO CTB")) return 120;
  if (part.startsWith("SO CBP")) return 140;
  if (/^SO S\d+ER/.test(part)) return 45;
  if (part.startsWith("SO TB")) return Math.round(w * (part.endsWith("24") ? 2.4 : 1.8));
  if (part.startsWith("SO BP")) return Math.round(w * 4.2);
  if (part.startsWith("SO S")) return Math.round(w * (part.endsWith("D") ? 1.5 : 1.1));
  if (part.includes("PC") && part.includes("55.5")) return Math.round(w * (part.startsWith("GD") ? 8 : 4.5));
  if (part.includes("ER4290-FD")) return 390;
  if (part.includes("PC")) return Math.round(w * (part.startsWith("GD") ? 11 : 6.5));
  if (part.startsWith("SO 3DB")) return Math.round(w * 2.5);
  if (part.startsWith("B ")) return Math.round(38 + w * (/[HM]/.test(part.slice(4)) ? 1.6 : 1.1));
  if (part.startsWith("HR")) return 24;
  if (part.startsWith("SR")) return Math.round(w * 3);
  return 0;
}

export const priceOf = (part) => PRICE_LIST[part] ?? samplePrice(part);

export const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
