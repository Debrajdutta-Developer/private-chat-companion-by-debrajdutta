import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Send,
  Check,
  CheckCheck,
  X,
  Play,
  Pause,
  PhoneOff,
  Sticker,
  Image as ImageIcon,
} from "lucide-react";
import avatar from "@/assets/girlfriend-avatar.jpg";
import wallpaper from "@/assets/chat-wallpaper.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aarohi 💚" },
      { name: "description", content: "Chat" },
    ],
  }),
  component: ChatPage,
});

type Msg = {
  id: string;
  from: "me" | "her";
  text: string;
  kind?: "text" | "image" | "audio" | "gif" | "sticker";
  mediaUrl?: string;
  audioDuration?: number;
  ts: number;
  status: "sending" | "sent" | "delivered" | "seen";
};

const STORAGE_KEY = "wa-gf-state-v1";

type Persisted = {
  messages: Msg[];
  memory: Record<string, string>;
};

function loadState(): Persisted {
  if (typeof window === "undefined") return { messages: [], memory: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { messages: [], memory: {} };
}

function formatTime(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDateLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "TODAY";
  if (sameDay(d, yest)) return "YESTERDAY";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;

// Curated GIFs (Tenor CDN — direct media URLs, no API key needed)
const GIF_LIBRARY = [
  "https://media.tenor.com/Ks-i2u-EFmoAAAAi/cute-love.gif",
  "https://media.tenor.com/x8v1oNUOmg4AAAAi/hi-hello.gif",
  "https://media.tenor.com/qjpDfyL5tF8AAAAi/peach-and-goma-cat.gif",
  "https://media.tenor.com/J2VoLyGnW9YAAAAi/hug-anime.gif",
  "https://media.tenor.com/oSASsmsHHTwAAAAi/kiss-anime.gif",
  "https://media.tenor.com/4q5pGtKx-1QAAAAi/angry-mad.gif",
  "https://media.tenor.com/Fxe-CGZQ_-IAAAAi/crying-sad.gif",
  "https://media.tenor.com/FmaCXxYxRMUAAAAi/laughing-lol.gif",
  "https://media.tenor.com/yYbU13_Kv8MAAAAi/sleepy-tired.gif",
  "https://media.tenor.com/Ckj1Ml1nDDoAAAAi/blush-shy.gif",
  "https://media.tenor.com/HzKQ_QH-h7gAAAAi/sus-side-eye.gif",
  "https://media.tenor.com/EpWVcia86VkAAAAi/wave-bye.gif",
];

// Big-emoji "stickers"
const STICKER_LIBRARY = [
  "🥰", "😘", "😭", "😤", "🥺", "😏", "🙄", "😴",
  "💀", "🤡", "❤️", "💔", "🔥", "✨", "🎀", "🫶",
  "😂", "🤭", "😒", "😩", "🤌", "👀", "🙈", "🫦",
];

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"online" | "typing..." | "last seen recently">("online");
  const [thinking, setThinking] = useState(false);
  const [call, setCall] = useState<null | { kind: "voice" | "video"; startedAt: number }>(null);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);
  const [picker, setPicker] = useState<null | "gif" | "sticker">(null);

  // load persisted
  useEffect(() => {
    const s = loadState();
    setMessages(s.messages);
    setMemory(s.memory);
    loadedRef.current = true;
  }, []);

  // persist
  useEffect(() => {
    if (!loadedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, memory }));
  }, [messages, memory]);

  // scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking, status]);

  async function sendMessage(opts?: { kind?: Msg["kind"]; mediaUrl?: string; text?: string; audioDuration?: number; proactive?: boolean }) {
    const proactive = !!opts?.proactive;
    const kind = opts?.kind ?? "text";
    const text = opts?.text ?? input.trim();
    if (!proactive && kind === "text" && (!text || thinking)) return;
    let myMsg: Msg | null = null;
    if (!proactive) {
      myMsg = {
        id: crypto.randomUUID(),
        from: "me",
        text:
          text ||
          (kind === "image"
            ? "📷 Photo"
            : kind === "audio"
            ? "🎤 Voice message"
            : kind === "gif"
            ? "GIF"
            : kind === "sticker"
            ? "Sticker"
            : ""),
        kind,
        mediaUrl: opts?.mediaUrl,
        audioDuration: opts?.audioDuration,
        ts: Date.now(),
        status: "sending",
      };
      const myMsgFinal = myMsg;
      setMessages((m) => [...m, myMsgFinal]);
      if (kind === "text") setInput("");

      // status progression
      await sleep(220);
      setMessages((m) => m.map((x) => (x.id === myMsgFinal.id ? { ...x, status: "sent" } : x)));
      await sleep(rand(250, 600));
      setMessages((m) => m.map((x) => (x.id === myMsgFinal.id ? { ...x, status: "delivered" } : x)));
    }

    // her replies
    setThinking(true);
    // initial "read" pause — she sees the msg but doesn't reply instantly.
    // Sometimes she's quick, sometimes distracted (mom dakche / scrolling reels).
    if (!proactive) {
      const reactionRoll = Math.random();
      let readPause: number;
      if (reactionRoll < 0.12) readPause = rand(400, 1100);
      else if (reactionRoll < 0.75) readPause = rand(2200, 5500);
      else if (reactionRoll < 0.93) readPause = rand(6000, 11000);
      else readPause = rand(13000, 22000);
      await sleep(readPause);
      setMessages((m) => m.map((x) => (x.from === "me" ? { ...x, status: "seen" } : x)));
      await sleep(rand(500, 1600));
    } else {
      await sleep(rand(800, 2200));
    }
    setStatus("typing...");

    try {
      const histBase = myMsg ? [...messages, myMsg] : messages;
      const history = histBase.map((m) => ({
        role: m.from === "me" ? ("user" as const) : ("assistant" as const),
        content:
          m.kind === "image"
            ? "[sent a photo]"
            : m.kind === "audio"
            ? "[sent a voice note]"
            : m.kind === "gif"
            ? "[sent a gif]"
            : m.kind === "sticker"
            ? `[sent a sticker: ${m.text}]`
            : m.text,
      }));
      const userMessage = proactive
        ? "[PROACTIVE_OPENER]"
        : kind === "image"
          ? "[I sent you a photo]"
          : kind === "audio"
          ? "[I sent you a voice note]"
          : kind === "gif"
          ? "[I sent you a funny gif]"
          : kind === "sticker"
          ? `[I sent you a sticker: ${text}]`
          : text;
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: proactive ? history : history.slice(0, -1), memory, userMessage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        await sleep(800);
        setStatus("online");
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            from: "her",
            text: err.error || "network ta abar gondogol korche 😤",
            ts: Date.now(),
            status: "seen",
          },
        ]);
        setThinking(false);
        return;
      }
      const data = (await res.json()) as {
        messages: string[];
        memory_updates: Record<string, string>;
        mood: string;
        send_selfie?: boolean;
        selfie_prompt?: string;
      };

      // simulate typing + bubble-by-bubble — feels like a real person texting
      for (let i = 0; i < data.messages.length; i++) {
        const piece = data.messages[i];
        // Real-ish typing speed: ~110ms/char + base + jitter. Emotional/long
        // msgs take noticeably longer — she pauses to think mid-typing.
        const emotional = /[😭🥺😒❤️😩💀]|love|miss|sorry|hate/i.test(piece);
        const base = 1100 + piece.length * 110 + rand(100, 900);
        const typingTime = Math.min(8500, base + (emotional ? rand(700, 1800) : 0));
        setStatus("typing...");
        await sleep(typingTime);
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            from: "her",
            text: piece,
            ts: Date.now(),
            status: "seen",
          },
        ]);
        if (i < data.messages.length - 1) {
          // pause between bubbles — sometimes she gets distracted
          const r = Math.random();
          setStatus("online");
          if (r < 0.08) await sleep(rand(5000, 9000)); // brb / distracted
          else if (r < 0.25) await sleep(rand(1800, 3200)); // thinking
          else await sleep(rand(700, 1800)); // normal between-bubble pause
        }
      }
      setStatus("online");

      // Selfie generation — she "takes" a pic and sends it
      if (data.send_selfie && data.selfie_prompt) {
        try {
          setStatus("typing...");
          await sleep(rand(1500, 3000));
          const selfieRes = await fetch("/api/public/selfie", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: data.selfie_prompt }),
          });
          if (selfieRes.ok) {
            const sd = (await selfieRes.json()) as { url?: string };
            if (sd.url) {
              setMessages((m) => [
                ...m,
                {
                  id: crypto.randomUUID(),
                  from: "her",
                  text: "📷 Photo",
                  kind: "image",
                  mediaUrl: sd.url,
                  ts: Date.now(),
                  status: "seen",
                },
              ]);
            }
          }
          setStatus("online");
        } catch (e) {
          console.error("selfie fail", e);
          setStatus("online");
        }
      }

      if (data.memory_updates && Object.keys(data.memory_updates).length) {
        setMemory((mem) => ({ ...mem, ...data.memory_updates }));
      }
    } catch (e) {
      console.error(e);
      setStatus("online");
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          from: "her",
          text: "network gone 😩 wait",
          ts: Date.now(),
          status: "seen",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    sendMessage({ kind: "image", mediaUrl: url });
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      recChunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && recChunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const dur = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        sendMessage({ kind: "audio", mediaUrl: url, audioDuration: dur });
      };
      recStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = setInterval(() => {
        setRecElapsed(Math.round((Date.now() - recStartRef.current) / 1000));
      }, 250);
    } catch (err) {
      alert("Mic permission needed for voice messages.");
    }
  }

  function stopRecording(cancel = false) {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    const mr = recorderRef.current;
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null as never;
      mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    }
    if (mr.state !== "inactive") mr.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecElapsed(0);
  }

  function resetChat() {
    if (!confirm("Clear all chat history?")) return;
    setMessages([]);
    setMemory({});
  }

  // group date labels
  const rendered: Array<{ type: "date"; label: string; key: string } | { type: "msg"; msg: Msg }> = [];
  let lastDate = "";
  messages.forEach((m) => {
    const label = formatDateLabel(m.ts);
    if (label !== lastDate) {
      rendered.push({ type: "date", label, key: "d" + m.id });
      lastDate = label;
    }
    rendered.push({ type: "msg", msg: m });
  });

  return (
    <div className="relative flex h-screen w-screen flex-col" style={{ backgroundColor: "var(--wa-chat-bg)" }}>
      {/* Top bar */}
      <header
        className="flex items-center gap-3 px-3 py-2.5 shadow-md"
        style={{ backgroundColor: "var(--wa-header)", color: "var(--wa-header-fg)" }}
      >
        <button className="p-1 opacity-90 hover:opacity-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={avatar}
          alt="Aarohi"
          width={40}
          height={40}
          loading="lazy"
          className="h-10 w-10 rounded-full object-cover"
        />
        <div className="flex flex-1 flex-col leading-tight">
          <span className="text-[15px] font-semibold">Aarohi 💚</span>
          <span className="text-[11.5px] opacity-90">{status}</span>
        </div>
        <button
          onClick={() => setCall({ kind: "video", startedAt: Date.now() })}
          className="p-2 opacity-90 hover:opacity-100"
        >
          <Video className="h-5 w-5" />
        </button>
        <button
          onClick={() => setCall({ kind: "voice", startedAt: Date.now() })}
          className="p-2 opacity-90 hover:opacity-100"
        >
          <Phone className="h-5 w-5" />
        </button>
        <button onClick={resetChat} className="p-2 opacity-90 hover:opacity-100" title="Clear chat">
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="wa-scroll relative flex-1 overflow-y-auto px-3 py-3"
        style={{
          backgroundImage: `linear-gradient(rgba(15,20,25,0.92), rgba(15,20,25,0.92)), url(${wallpaper})`,
          backgroundSize: "320px",
          backgroundRepeat: "repeat",
        }}
      >
        {messages.length === 0 && (
          <div className="mx-auto mt-12 max-w-xs rounded-lg bg-black/40 px-4 py-3 text-center text-[12.5px] text-amber-100/90 shadow-sm">
            🔒 Messages are end-to-end encrypted. Only Aarohi and you can read them.
            <br />
            <span className="opacity-75">Say hi 👋</span>
          </div>
        )}

        <div className="mx-auto flex max-w-2xl flex-col gap-1">
          {rendered.map((item) =>
            item.type === "date" ? (
              <div key={item.key} className="my-2 flex justify-center">
                <span className="rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/80">
                  {item.label}
                </span>
              </div>
            ) : (
              <MessageBubble key={item.msg.id} m={item.msg} />
            ),
          )}

          {thinking && status === "typing..." && (
            <div className="wa-msg-in mt-1 flex">
              <div
                className="flex items-center gap-1 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow"
                style={{ backgroundColor: "var(--wa-bubble-her)" }}
              >
                <span className="wa-dot inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
                <span className="wa-dot inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
                <span className="wa-dot inline-block h-1.5 w-1.5 rounded-full bg-white/60" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 px-2 py-2" style={{ backgroundColor: "var(--wa-chat-bg)" }}>
        {picker && (
          <div
            className="absolute inset-x-0 bottom-[68px] z-30 mx-2 max-h-[55vh] overflow-y-auto rounded-2xl border border-white/10 p-3 shadow-2xl wa-scroll"
            style={{ backgroundColor: "var(--wa-input)" }}
          >
            <div className="mb-2 flex items-center justify-between text-xs text-white/70">
              <div className="flex gap-3">
                <button
                  onClick={() => setPicker("gif")}
                  className={`rounded-full px-3 py-1 font-medium ${picker === "gif" ? "bg-white/15 text-white" : ""}`}
                >
                  GIFs
                </button>
                <button
                  onClick={() => setPicker("sticker")}
                  className={`rounded-full px-3 py-1 font-medium ${picker === "sticker" ? "bg-white/15 text-white" : ""}`}
                >
                  Stickers
                </button>
              </div>
              <button onClick={() => setPicker(null)} className="p-1 text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>
            {picker === "gif" ? (
              <div className="grid grid-cols-3 gap-2">
                {GIF_LIBRARY.map((url) => (
                  <button
                    key={url}
                    onClick={() => {
                      setPicker(null);
                      sendMessage({ kind: "gif", mediaUrl: url });
                    }}
                    className="overflow-hidden rounded-lg bg-black/30 active:scale-95"
                  >
                    <img src={url} alt="gif" className="h-24 w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {STICKER_LIBRARY.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPicker(null);
                      sendMessage({ kind: "sticker", text: s });
                    }}
                    className="flex h-14 items-center justify-center rounded-lg bg-black/20 text-3xl active:scale-90"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePickFile}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePickFile}
        />
        {recording ? (
          <div
            className="flex flex-1 items-center gap-3 rounded-3xl px-4 py-3"
            style={{ backgroundColor: "var(--wa-input)" }}
          >
            <button onClick={() => stopRecording(true)} className="text-red-400">
              <X className="h-5 w-5" />
            </button>
            <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm text-white/90">
              {String(Math.floor(recElapsed / 60)).padStart(2, "0")}:
              {String(recElapsed % 60).padStart(2, "0")}
            </span>
            <span className="flex-1 text-xs text-white/50">Recording… release to send</span>
          </div>
        ) : (
        <div
          className="flex flex-1 items-end gap-1 rounded-3xl px-3 py-1.5"
          style={{ backgroundColor: "var(--wa-input)" }}
        >
          <button
            onClick={() => setPicker((p) => (p === "sticker" ? null : "sticker"))}
            className="p-1.5 text-white/60 hover:text-white/90"
          >
            <Smile className="h-5 w-5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            enterKeyHint="send"
            placeholder="Message"
            className="max-h-32 flex-1 resize-none border-0 bg-transparent py-2 text-[15px] text-white placeholder:text-white/50 focus:outline-none"
          />
          <button
            onClick={() => setPicker((p) => (p === "gif" ? null : "gif"))}
            className="p-1.5 text-xs font-bold text-white/60 hover:text-white/90"
            title="GIF"
          >
            <ImageIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPicker((p) => (p === "sticker" ? null : "sticker"))}
            className="p-1.5 text-white/60 hover:text-white/90"
            title="Sticker"
          >
            <Sticker className="h-5 w-5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 text-white/60 hover:text-white/90"
          >
            <Paperclip className="h-5 w-5 -rotate-45" />
          </button>
          {!input.trim() && (
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="p-1.5 text-white/60 hover:text-white/90"
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>
        )}
        <button
          onClick={() => {
            if (recording) return stopRecording(false);
            if (input.trim()) return sendMessage();
            startRecording();
          }}
          disabled={thinking && !input.trim() && !recording}
          className="flex h-11 w-11 items-center justify-center rounded-full shadow-md transition active:scale-95"
          style={{ backgroundColor: "var(--wa-header)", color: "var(--wa-header-fg)" }}
        >
          {recording ? <Send className="h-5 w-5" /> : input.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>

      {call && <CallOverlay kind={call.kind} onEnd={() => setCall(null)} />}
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const mine = m.from === "me";
  const isSticker = m.kind === "sticker";
  return (
    <div className={`wa-msg-in flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] ${
          isSticker
            ? "px-1 pb-0.5 pt-0.5"
            : `rounded-2xl px-2.5 pb-1.5 pt-1.5 shadow ${mine ? "rounded-tr-sm" : "rounded-tl-sm"}`
        }`}
        style={{
          ...(isSticker
            ? {}
            : {
          backgroundColor: mine ? "var(--wa-bubble-me)" : "var(--wa-bubble-her)",
          color: mine ? "var(--wa-bubble-me-fg)" : "var(--wa-bubble-her-fg)",
              }),
        }}
      >
        {m.kind === "image" && m.mediaUrl ? (
          <img
            src={m.mediaUrl}
            alt="photo"
            className="mb-1 max-h-72 w-full rounded-xl object-cover"
          />
        ) : m.kind === "gif" && m.mediaUrl ? (
          <img
            src={m.mediaUrl}
            alt="gif"
            className="mb-1 max-h-72 w-full rounded-xl object-cover"
          />
        ) : isSticker ? (
          <div className="px-2 text-[72px] leading-none">{m.text}</div>
        ) : m.kind === "audio" && m.mediaUrl ? (
          <AudioBubble url={m.mediaUrl} duration={m.audioDuration ?? 0} />
        ) : (
          <div className="whitespace-pre-wrap break-words px-1 text-[14.5px] leading-snug">
            {m.text}
          </div>
        )}
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 pr-1 text-[10.5px] ${
            isSticker ? "text-white/70" : "opacity-75"
          }`}
        >
          <span>{formatTime(m.ts)}</span>
          {mine && <Ticks status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function AudioBubble({ url, duration }: { url: string; duration: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  }
  return (
    <div className="flex min-w-[180px] items-center gap-2 px-1 py-1">
      <button
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="flex h-1 flex-1 items-center">
        <div className="h-1 w-full rounded-full bg-white/25" />
      </div>
      <span className="text-[11px] opacity-80">
        {String(Math.floor(duration / 60)).padStart(2, "0")}:
        {String(duration % 60).padStart(2, "0")}
      </span>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

function CallOverlay({ kind, onEnd }: { kind: "voice" | "video"; onEnd: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const connectAt = setTimeout(() => setConnected(true), 2200);
    const tick = setInterval(() => setElapsed((e) => (connected ? e + 1 : e)), 1000);
    return () => {
      clearTimeout(connectAt);
      clearInterval(tick);
    };
  }, [connected]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-emerald-900 via-slate-900 to-black px-6 py-12 text-white">
      <div className="flex flex-col items-center gap-3">
        <img src={avatar} alt="Aarohi" className="h-32 w-32 rounded-full object-cover shadow-2xl" />
        <div className="text-2xl font-medium">Aarohi 💚</div>
        <div className="text-sm opacity-80">
          {connected
            ? `${kind === "video" ? "Video call" : "Voice call"} · ${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
            : `Calling…`}
        </div>
      </div>
      {kind === "video" && (
        <div className="absolute right-4 top-16 h-32 w-24 overflow-hidden rounded-xl border border-white/20 bg-black/60 text-[10px] text-white/50 flex items-center justify-center">
          you
        </div>
      )}
      <button
        onClick={onEnd}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-xl active:scale-95"
      >
        <PhoneOff className="h-7 w-7" />
      </button>
    </div>
  );
}

function Ticks({ status }: { status: Msg["status"] }) {
  if (status === "sending") {
    return <span className="inline-block h-3 w-3 rounded-full border border-current opacity-70" />;
  }
  if (status === "sent") return <Check className="h-3.5 w-3.5" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" />;
  return <CheckCheck className="h-3.5 w-3.5" style={{ color: "var(--wa-tick-seen)" }} />;
}
