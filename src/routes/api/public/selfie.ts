import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/selfie")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { prompt } = (await request.json()) as { prompt: string };
          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response(JSON.stringify({ error: "no key" }), { status: 500 });

          const safePrompt =
            "Realistic phone selfie photo, candid, natural lighting, slight grain, looks like a real iPhone front-camera photo. Subject: " +
            prompt +
            ". Cute, SFW, fully clothed, modest, casual. No text, no watermark.";

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