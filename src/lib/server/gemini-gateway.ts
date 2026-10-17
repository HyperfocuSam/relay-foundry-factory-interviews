export function geminiGateway(model: string) {
  const base = process.env.GEMINI_BASE_URL;
  const gatewayKey = process.env.GEMINI_GATEWAY_KEY;
  if (base && !gatewayKey) throw new Error("GEMINI_GATEWAY_KEY is required with GEMINI_BASE_URL.");
  const url = new URL(base || "https://generativelanguage.googleapis.com/v1beta");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("GEMINI_BASE_URL must be an HTTPS API base URL.");
  url.pathname = url.pathname.replace(/\/$/, "") + `/models/${model}:generateContent`;
  return { url: url.toString(), ...(base ? { gatewayKey } : {}) };
}
