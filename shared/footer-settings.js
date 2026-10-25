export const DEFAULT_FOOTER = Object.freeze({
  address: "5th Macrorayan, Solh Project",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=5th%20Macrorayan%2C%20Solh%20Project%2C%20Kabul",
  phone1: "+93 749 17 17 17",
  phone2: "+90 534 953 56 81",
  email: "info@bahaturk.com",
  facebook: "https://www.facebook.com/profile.php?id=61593495969359",
  instagram: "https://www.instagram.com/baha_turk2/",
  youtube: "https://www.youtube.com/@ba-ha_turk",
});

export function validateFooter(body) {
  const invalid = () => { throw Object.assign(new Error("اطلاعات فوتر معتبر نیست؛ متن، ایمیل و لینک‌ها را بررسی کنید."), { status: 422 }); };
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !(key in DEFAULT_FOOTER))) invalid();
  const value = {};
  for (const key of Object.keys(DEFAULT_FOOTER)) {
    if (typeof body[key] !== "string") invalid();
    value[key] = body[key].trim();
    const limit = key === "address" ? 300 : key.startsWith("phone") ? 40 : key === "email" ? 254 : 2048;
    if (!value[key] || value[key].length > limit) invalid();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) invalid();
  for (const key of ["phone1", "phone2"]) if (!/^\+?[\d ()-]+$/.test(value[key]) || value[key].replace(/\D/g, "").length < 5) invalid();
  for (const key of ["mapUrl", "facebook", "instagram", "youtube"]) {
    let url;
    try { url = new URL(value[key]); } catch { invalid(); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) invalid();
  }
  return value;
}

export const phoneHref = (value) => `tel:${value.replace(/[^\d+]/g, "")}`;
