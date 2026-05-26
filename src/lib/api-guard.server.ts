// Best-effort per-IP rate limiter for public AI endpoints.
// In-memory Map; resets when the worker isolate recycles. Good enough to
// prevent casual scripted abuse of LOVABLE_API_KEY credits.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function getClientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true, retryAfter: 0 };
}

// Sanitize user-controlled text before interpolating into a system prompt.
// Strips control chars and neutralizes common prompt-injection markers so
// memory/history values cannot pose as system instructions.
export function sanitizeForPrompt(s: string, maxLen: number): string {
  if (typeof s !== "string") return "";
  let out = s.replace(/[\u0000-\u001f\u007f]/g, " ");
  // Neutralize role markers / instruction-style headers
  out = out.replace(/\b(system|assistant|user|developer)\s*:/gi, "$1\u200B:");
  out = out.replace(/<\s*\/?\s*(system|assistant|user|instructions?|prompt)[^>]*>/gi, "");
  out = out.replace(/```/g, "ʼʼʼ");
  if (out.length > maxLen) out = out.slice(0, maxLen) + "…";
  return out.trim();
}