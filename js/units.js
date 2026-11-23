// Inches written the way a tape measure reads: 47 1/4" (3' 11 1/4").
function frac(x) {
  const sixteenths = Math.round(x * 16);
  let whole = Math.floor(sixteenths / 16), rest = sixteenths % 16;
  if (!rest) return `${whole}`;
  let den = 16;
  while (rest % 2 === 0) { rest /= 2; den /= 2; }
  return whole ? `${whole} ${rest}/${den}` : `${rest}/${den}`;
}

export function fmtIn(inches, { feet = true } = {}) {
  const n = Math.abs(inches);
  const main = `${frac(n)}"`;
  if (!feet || n < 12) return main;
  const ft = Math.floor(n / 12), rem = n - ft * 12;
  return `${main} (${ft}'${rem >= 1 / 32 ? ` ${frac(rem)}"` : ""})`;
}
