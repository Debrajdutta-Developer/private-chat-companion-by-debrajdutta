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
  kind?: "text" | "image" | "audio";
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

  async function sendMessage(opts?: { kind?: "text" | "image" | "audio"; mediaUrl?: string; text?: string; audioDuration?: number }) {
    const kind = opts?.kind ?? "text";
    const text = opts?.text ?? input.trim();
    if (kind === "text" && (!text || thinking)) return;
    const myMsg: Msg = {
      id: crypto.randomUUID(),
      from: "me",
      text: text || (kind === "image" ? "📷 Photo" : kind === "audio" ? "🎤 Voice message" : ""),
      kind,
      mediaUrl: opts?.mediaUrl,
      audioDuration: opts?.audioDuration,
      ts: Date.now(),
      status: "sending",
    };
    setMessages((m) => [...m, myMsg]);
    if (kind === "text") setInput("");

    // status progression
    await sleep(220);
    setMessages((m) => m.map((x) => (x.id === myMsg.id ? { ...x, status: "sent" } : x)));
    await sleep(rand(250, 600));
    setMessages((m) => m.map((x) => (x.id === myMsg.id ? { ...x, status: "delivered" } : x)));

    // her replies
    setThinking(true);
    await sleep(rand(600, 1800));
    setStatus("typing...");
    // mark seen when she starts engaging
    setMessages((m) => m.map((x) => (x.from === "me" ? { ...x, status: "seen" } : x)));

    try {
      const history = [...messages, myMsg].map((m) => ({
        role: m.from === "me" ? ("user" as const) : ("assistant" as const),
        content: m.kind === "image" ? "[sent a photo]" : m.kind === "audio" ? "[sent a voice note]" : m.text,
      }));
      const userMessage = kind === "image" ? "[I sent you a photo]" : kind === "audio" ? "[I sent you a voice note]" : text;
      const res = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(0, -1), memory, userMessage }),
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
      };

      // simulate typing + bubble-by-bubble
      for (let i = 0; i < data.messages.length; i++) {
        const piece = data.messages[i];
        const typingTime = Math.min(3500, 400 + piece.length * 38 + rand(0, 400));
        setStatus("typing...");
        await sleep(typingTime);
        setStatus(i === data.messages.length - 1 ? "online" : "typing...");
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
        if (i < data.messages.length - 1) await sleep(rand(250, 700));
      }
      setStatus("online");

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
    <div className="flex h-screen w-screen flex-col" style={{ backgroundColor: "var(--wa-chat-bg)" }}>
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
        <button className="p-2 opacity-90 hover:opacity-100">
          <Video className="h-5 w-5" />
        </button>
        <button className="p-2 opacity-90 hover:opacity-100">
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
        <div
          className="flex flex-1 items-end gap-1 rounded-3xl px-3 py-1.5"
          style={{ backgroundColor: "var(--wa-input)" }}
        >
          <button className="p-1.5 text-white/60 hover:text-white/90">
            <Smile className="h-5 w-5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder="Message"
            className="max-h-32 flex-1 resize-none border-0 bg-transparent py-2 text-[15px] text-white placeholder:text-white/50 focus:outline-none"
          />
          <button className="p-1.5 text-white/60 hover:text-white/90">
            <Paperclip className="h-5 w-5 -rotate-45" />
          </button>
          {!input.trim() && (
            <button className="p-1.5 text-white/60 hover:text-white/90">
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>
        <button
          onClick={sendMessage}
          disabled={thinking && !input.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-full shadow-md transition active:scale-95"
          style={{ backgroundColor: "var(--wa-header)", color: "var(--wa-header-fg)" }}
        >
          {input.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const mine = m.from === "me";
  return (
    <div className={`wa-msg-in flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-2.5 pb-1.5 pt-1.5 shadow ${
          mine ? "rounded-tr-sm" : "rounded-tl-sm"
        }`}
        style={{
          backgroundColor: mine ? "var(--wa-bubble-me)" : "var(--wa-bubble-her)",
          color: mine ? "var(--wa-bubble-me-fg)" : "var(--wa-bubble-her-fg)",
        }}
      >
        <div className="whitespace-pre-wrap break-words px-1 text-[14.5px] leading-snug">
          {m.text}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[10.5px] opacity-75">
          <span>{formatTime(m.ts)}</span>
          {mine && <Ticks status={m.status} />}
        </div>
      </div>
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
