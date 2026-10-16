// Cart totals are rounded to the nearest whole rupee. The difference is
// shown as its own "Round off" line so the figures always add up:
//   amount + roundOff = rounded total.
export function roundTotal(value) {
  const n = Number(value);
  // Clean floating-point dust (e.g. 3262.4999999) before rounding.
  const amount = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  const rounded = Math.round(amount); // .50 and above rounds up
  const roundOff = Math.round((rounded - amount) * 100) / 100;
  return { amount, rounded, roundOff };
}
