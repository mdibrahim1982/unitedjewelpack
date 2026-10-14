// Pure helpers for the three customer fields (Shop Name, Location, Mobile),
// shared by the landing login, the staff cart form and the tests.

// "+91 98765 43210", "098765-43210", "9876543210" → "9876543210"
export function normaliseMobile(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// Returns { ok, values, errors } — errors holds CODES ("required" |
// "mobile_invalid"), not text, so each screen can word them itself.
export function validateDetails({ shopName, location, mobile } = {}) {
  const values = {
    shopName: String(shopName ?? "").trim().replace(/\s+/g, " "),
    location: String(location ?? "").trim().replace(/\s+/g, " "),
    mobile: normaliseMobile(mobile),
  };
  const errors = {};
  if (values.shopName.length < 2) errors.shopName = "required";
  if (values.location.length < 2) errors.location = "required";
  if (!values.mobile) errors.mobile = "required";
  else if (!/^[6-9]\d{9}$/.test(values.mobile)) errors.mobile = "mobile_invalid";
  return { ok: Object.keys(errors).length === 0, values, errors };
}
