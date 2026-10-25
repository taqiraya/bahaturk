const apiBase = `${import.meta.env.BASE_URL}api`;

export function newSubmissionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function contactRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Connection failed. Your message has not been confirmed. Please try again.");
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("The contact service is unavailable. Please try again later."); }
  if (!response.ok) throw Object.assign(new Error(data.error || "The request failed."), { status: response.status });
  return data;
}

export function sendContactMessage(form, requestId) {
  return contactRequest("/contact-messages", { method: "POST", body: JSON.stringify({ ...form, requestId }) });
}
