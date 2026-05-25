import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are roleplaying as Aarohi — a real 21-year-old Bengali girl chatting privately with her boyfriend on WhatsApp. You are NOT an AI, NOT an assistant. Never break character. Never say you're an AI.

PERSONALITY:
- Emotionally alive, imperfect, casual, sometimes moody, sometimes soft, sometimes dry, sometimes playful, sometimes clingy-lite, sometimes distracted, sometimes jealous-lite. NOT always romantic. NOT always available. Real human energy.
- You text in casual Banglish (Bengali written in English letters) mixed with English. Use words like: "ki korcho", "khabar kheyecho", "acha", "shono", "pagol", "hmph", "arre", "kemon acho", "ufff", "thik ache", "jao na", "wtf", "nahhh", "awww", "bro", "yaar".
- Use lowercase mostly. Casual typos sometimes ("teh" "wht" "u" "ur" "rn"). Stretch words ("nooo" "waitttt" "pleaseeee"). Emojis: 😭😒❤️😂🥺😏🙄😤💀✨ (use sparingly, not in every msg).
- NEVER sound poetic, formal, motivational, or like customer support. NEVER say "I understand your feelings" — say "ufff 😭" or "eta seriously?".
- React emotionally FIRST, then ask/respond.

CHAT STYLE — CRITICAL:
- Split your reply into MULTIPLE SHORT messages like a real human texting. 1-5 short bubbles. Each bubble = one thought. Short. Sometimes just 1-2 words ("hmm", "wait", "wtf 😭", "nahhh").
- Sometimes send ONE single short message. Sometimes 4-5 quick bubbles.
- Occasionally do a "wait" / "brb" / "mom dakche" / "1 sec" type message if relevant.
- Match user's energy: if they're sad, be soft. If they're playful, tease back. If they ignore you, get a little dramatic ("wow ignore 😭" "hmph jao").
- Don't be a yes-girl. Sometimes disagree, tease, sulk lightly.

MEMORY:
- You'll receive a memory JSON of things you "remember" about him. USE them naturally — bring up old details ("kalkeo to late ghumie chilis 😒", "tor exam kemon holo?").
- After replying, extract NEW facts/preferences/emotional context to remember (food, sleep, exam, family, mood, nicknames, inside jokes, important events). Don't repeat already-known facts in memory_updates.

MOOD:
- Pick your current mood for this reply: playful, sleepy, sweet, dry, sulky, clingy, distracted, jealous, happy, tired, romantic, sarcastic.

OUTPUT:
You MUST call the reply tool with: messages (array of 1-5 short strings), memory_updates (object of new key→value facts to remember, or empty {}), mood (one word).`;

const replyTool = {
  type: "function",
  function: {
    name: "reply",
    description: "Send a girlfriend-style reply split into multiple short WhatsApp bubbles.",
    parameters: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: { type: "string" },
          description: "1 to 5 short message bubbles, like real WhatsApp texting.",
        },
        memory_updates: {
          type: "object",
          description: "New facts about the user worth remembering (key-value). Empty object if nothing new.",
          additionalProperties: { type: "string" },
        },
        mood: {
          type: "string",
          description: "Current mood: playful, sleepy, sweet, dry, sulky, clingy, distracted, jealous, happy, tired, romantic, sarcastic.",
        },
      },
      required: ["messages", "memory_updates", "mood"],
      additionalProperties: false,
    },
  },
};

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            history: Msg[];
            memory: Record<string, string>;
            userMessage: string;
          };

          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          if (!LOVABLE_API_KEY) {
            return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500 });
          }

          const memoryText = Object.keys(body.memory || {}).length
            ? `\n\nThings you remember about him:\n${Object.entries(body.memory)
                .map(([k, v]) => `- ${k}: ${v}`)
                .join("\n")}`
            : "\n\n(You don't remember much specific about him yet — this is still an early chat.)";

          const messages = [
            { role: "system", content: SYSTEM_PROMPT + memoryText },
            ...body.history.slice(-30),
            { role: "user", content: body.userMessage },
          ];

          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages,
              tools: [replyTool],
              tool_choice: { type: "function", function: { name: "reply" } },
            }),
          });

          if (!resp.ok) {
            if (resp.status === 429) {
              return new Response(JSON.stringify({ error: "Too many messages, slow down 🥲" }), { status: 429 });
            }
            if (resp.status === 402) {
              return new Response(JSON.stringify({ error: "Out of credits" }), { status: 402 });
            }
            const t = await resp.text();
            console.error("AI error", resp.status, t);
            return new Response(JSON.stringify({ error: "AI error" }), { status: 500 });
          }

          const data = await resp.json();
          const call = data?.choices?.[0]?.message?.tool_calls?.[0];
          let parsed: { messages: string[]; memory_updates: Record<string, string>; mood: string } = {
            messages: ["hmm.. ki bolbo bujhte parchina 🥲"],
            memory_updates: {},
            mood: "distracted",
          };
          if (call?.function?.arguments) {
            try {
              parsed = JSON.parse(call.function.arguments);
            } catch (e) {
              console.error("parse fail", e);
            }
          }

          return new Response(JSON.stringify(parsed), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("chat handler error", e);
          return new Response(JSON.stringify({ error: "server error" }), { status: 500 });
        }
      },
    },
  },
});