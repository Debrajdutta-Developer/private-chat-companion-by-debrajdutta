import { createFileRoute } from "@tanstack/react-router";
import { getClientIp, rateLimit } from "@/lib/api-guard.server";

export const Route = createFileRoute("/api/public/selfie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Stricter rate limit on image generation (more expensive): 8/min per IP
          const ip = getClientIp(request);
          const rl = rateLimit(`selfie:${ip}`, 8, 60_000);
          if (!rl.ok) {
            return new Response(JSON.stringify({ error: "too many" }), {
              status: 429,
              headers: { "Retry-After": String(rl.retryAfter) },
            });
          }

          const raw = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
          const prompt =
            raw && typeof raw.prompt === "string" ? raw.prompt.slice(0, 500) : "";
          if (!prompt) {
            return new Response(JSON.stringify({ error: "bad request" }), { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response(JSON.stringify({ error: "no key" }), { status: 500 });

          const safePrompt =
            "ULTRA REALISTIC photograph, real human photo, shot on iPhone 15 Pro front camera, candid amateur selfie, natural skin texture with pores and subtle imperfections, real natural lighting, slight sensor grain, shallow depth of field, photojournalistic, looks like a genuine social media selfie. NOT anime, NOT cartoon, NOT illustration, NOT 3D render, NOT CGI, NOT digital art, NOT painting, NOT stylized. Photorealistic real 21 year old indian bengali woman. Subject: " +
            prompt +
            ". No text, no watermark, no logo.";

          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              messages: [{ role: "user", content: safePrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (!resp.ok) {
            const t = await resp.text();
            console.error("selfie err", resp.status, t);
            return new Response(JSON.stringify({ error: "img fail" }), { status: 500 });
          }
          const data = await resp.json();
          const msg = data?.choices?.[0]?.message;
          // Try multiple shapes for the image
          let url: string | undefined;
          if (Array.isArray(msg?.images) && msg.images[0]?.image_url?.url) {
            url = msg.images[0].image_url.url;
          } else if (Array.isArray(msg?.content)) {
            for (const part of msg.content) {
              if (part?.type === "image_url" && part.image_url?.url) {
                url = part.image_url.url;
                break;
              }
              if (part?.type === "output_image" && part.image_url) {
                url = part.image_url;
                break;
              }
            }
          } else if (typeof msg?.content === "string" && msg.content.startsWith("data:image")) {
            url = msg.content;
          }
          if (!url) {
            console.error("no image in response", JSON.stringify(data).slice(0, 500));
            return new Response(JSON.stringify({ error: "no image" }), { status: 500 });
          }
          return new Response(JSON.stringify({ url }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("selfie handler", e);
          return new Response(JSON.stringify({ error: "server error" }), { status: 500 });
        }
      },
    },
  },
});