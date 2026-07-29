import React, { useEffect, useState, useRef, useMemo } from 'react';

type Role = 'user' | 'assistant';
type Message = { id: string; role: Role; content: string; timestamp: number; isWelcome?: boolean; isError?: boolean };
type Slot = { id: string; cells: [Message[] | null, Message[] | null, Message[] | null] };

const DEFAULT_TITLES = ["Archive", "Main Thread", "Branch"];
const MODEL = "openrouter/auto";

const uid = () => Math.random().toString(36).slice(2, 9);
function approxTokens(str: string) { return Math.ceil(str.length / 4); }

export default function App() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeCol, setActiveCol] = useState<number>(1);
  const [colTitles, setColTitles] = useState<string[]>(DEFAULT_TITLES);
  const [inputs, setInputs] = useState<string[]>(["", "", ""]);
  const [apiKey, setApiKey] = useState<string>("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState<number | null>(null);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voiceRate, setVoiceRate] = useState(1);
  const [listeningCol, setListeningCol] = useState<number | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<string>("");
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2800);
  };

  useEffect(() => {
    // cleanup legacy model keys
    try {
      localStorage.removeItem("tri_col_models");
      localStorage.removeItem("tri_models_openrouter");
    } catch {}

    const k = localStorage.getItem("openrouter_key") || "";
    setApiKey(k);
    setKeyInput(k);
    if (!k) setShowKeyModal(true);

    try {
      const savedSlots = localStorage.getItem("tri_slots_openrouter");
      if (savedSlots) {
        const parsed = JSON.parse(savedSlots);
        if (Array.isArray(parsed) && parsed.length > 0) setSlots(parsed);
        else initWelcome();
      } else initWelcome();
      const savedTitles = localStorage.getItem("tri_titles_openrouter");
      if (savedTitles) setColTitles(JSON.parse(savedTitles));
    } catch {
      initWelcome();
    }

    const loadVoices = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length) {
        setVoices(vs);
        if (!selectedVoice) setSelectedVoice(vs[0].voiceURI || vs[0].name);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const initWelcome = () => {
    const welcome: Message = {
      id: "welcome-" + uid(),
      role: "assistant",
      content:
        "TRI-CONTEXT • OpenRouter Edition (BYOK)\n\n• One key (openrouter_key) → uses your default model set at openrouter.ai/settings (openrouter/auto)\n• Click column header to set active context\n• Type in any column → new slot → context = filtered messages in that column\n• Move with < > keeps same vertical plane\n\nSet your OpenRouter key to start. Errors will show in RED with full JSON, not help text.",
      timestamp: Date.now(),
      isWelcome: true,
    };
    setSlots([{ id: "slot-welcome", cells: [null, [welcome], null] }]);
  };

  useEffect(() => {
    if (slots.length) localStorage.setItem("tri_slots_openrouter", JSON.stringify(slots));
  }, [slots]);
  useEffect(() => {
    localStorage.setItem("tri_titles_openrouter", JSON.stringify(colTitles));
  }, [colTitles]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [slots]);

  const tokenCounts = useMemo(() => {
    const counts = [0, 0, 0];
    slots.forEach((s) => {
      s.cells.forEach((cell, ci) => {
        if (cell) counts[ci] += cell.reduce((a, m) => a + approxTokens(m.content), 0);
      });
    });
    return counts;
  }, [slots]);

  const filteredContextCount = useMemo(() => {
    let c = 0;
    slots.forEach((s) => {
      const cell = s.cells[activeCol];
      if (!cell) return;
      cell.forEach((m) => {
        if (m.isWelcome) return;
        if (m.isError) return;
        if (!(m.role === "user" || m.role === "assistant")) return;
        if (!m.content || m.content.trim().length === 0) return;
        if (m.content.trim().startsWith("TRI-CONTEXT")) return;
        c++;
      });
    });
    return c;
  }, [slots, activeCol]);

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    localStorage.setItem("openrouter_key", trimmed);
    setApiKey(trimmed);
    setShowKeyModal(false);
    showToast("Key saved • using openrouter/auto");
  };

  const getContextMessages = (targetCol: number, extraSlots?: Slot[]): Message[] => {
    const src = extraSlots || slots;
    const msgs: Message[] = [];
    src.forEach((slot) => {
      const cell = slot.cells[targetCol];
      if (!cell) return;
      cell.forEach((m) => {
        if (m.isWelcome) return;
        if (m.isError) return;
        if (!(m.role === "user" || m.role === "assistant")) return;
        if (!m.content || m.content.trim().length === 0) return;
        if (m.content.trim().startsWith("TRI-CONTEXT")) return;
        msgs.push(m);
      });
    });
    return msgs;
  };

  const callLLM = async (contextMsgs: Message[], openrouter_key: string) => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouter_key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tri-context.chat",
        "X-Title": "Tri-Context Chat",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: contextMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, data };
    const content = (data as any)?.choices?.[0]?.message?.content || "";
    if (!content) throw { status: res.status, data };
    return content as string;
  };

  const handleSend = async (colIdx: number) => {
    const text = inputs[colIdx].trim();
    if (!text) return;
    if (!apiKey) {
      setShowKeyModal(true);
      return;
    }
    const userMsg: Message = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    const newSlot: Slot = { id: uid(), cells: [null, null, null] as any };
    (newSlot.cells as any)[colIdx] = [userMsg];
    const updatedSlots = [...slots, newSlot];
    setSlots(updatedSlots);
    setInputs((prev) => {
      const n = [...prev];
      n[colIdx] = "";
      return n;
    });
    setActiveCol(colIdx);
    setIsGenerating(colIdx);
    try {
      const contextMsgs = getContextMessages(colIdx, updatedSlots);
      // If filtered context empty and user just sent first message, that's fine (just that one user message) - contextMsgs already contains it
      const assistantText = await callLLM(contextMsgs, apiKey);
      const assistantMsg: Message = { id: uid(), role: "assistant", content: assistantText, timestamp: Date.now() };
      const replySlot: Slot = { id: uid(), cells: [null, null, null] as any };
      (replySlot.cells as any)[colIdx] = [assistantMsg];
      setSlots((prev) => [...prev, replySlot]);
    } catch (err: any) {
      console.error("OpenRouter error full:", err);
      const status = err?.status ?? "???";
      const data = err?.data ?? err;
      const friendly = data?.error?.message || data?.message || `Request failed (${status}). Check key or default model at openrouter.ai/settings.`;
      const rawJson = (() => {
        try { return JSON.stringify(data, null, 2); } catch { return String(data); }
      })();
      const errorContent = `⚠️ OPENROUTER ERROR ${status}\n\n${friendly}\n\n--- RAW ---\n${rawJson}\n\nFix: Check your key is valid, and you have Default Models set at openrouter.ai/settings (required for openrouter/auto router). If no default set, you'll get "No models in auto router"`;
      const errorMsg: Message = { id: uid(), role: "assistant", content: errorContent, timestamp: Date.now(), isError: true };
      const errSlot: Slot = { id: uid(), cells: [null, null, null] as any };
      (errSlot.cells as any)[colIdx] = [errorMsg];
      setSlots((prev) => [...prev, errSlot]);
      // force scroll after error
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    } finally {
      setIsGenerating(null);
    }
  };

  const deleteMessage = (slotIdx: number, colIdx: number, msgIdx: number) => {
    setSlots((prev) => {
      const next = structuredClone(prev) as Slot[];
      const cell = next[slotIdx].cells[colIdx];
      if (!cell) return prev;
      cell.splice(msgIdx, 1);
      if (cell.length === 0) next[slotIdx].cells[colIdx] = null;
      if (next[slotIdx].cells.every((c) => !c)) next.splice(slotIdx, 1);
      return next;
    });
  };
  const moveMessage = (fromSlotIdx: number, fromCol: number, msgIdx: number, toCol: number, toSlotIdx = fromSlotIdx) => {
    if (toCol < 0 || toCol > 2) return;
    if (fromCol === toCol && fromSlotIdx === toSlotIdx) return;
    setSlots((prev) => {
      const next = structuredClone(prev) as Slot[];
      const fromCell = next[fromSlotIdx]?.cells[fromCol];
      if (!fromCell || !fromCell[msgIdx]) return prev;
      const [msg] = fromCell.splice(msgIdx, 1);
      if (fromCell.length === 0) next[fromSlotIdx].cells[fromCol] = null;
      const targetSlot = next[toSlotIdx];
      if (!targetSlot) return prev;
      if (!targetSlot.cells[toCol]) targetSlot.cells[toCol] = [];
      targetSlot.cells[toCol]!.push(msg);
      if (fromSlotIdx !== toSlotIdx && next[fromSlotIdx].cells.every((c) => !c || c.length === 0)) next.splice(fromSlotIdx, 1);
      return next;
    });
  };
  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showToast("Copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("Copied");
    }
  };
  const speakMessage = (content: string) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(content.slice(0, 2000));
    const voice = voices.find((v) => v.voiceURI === selectedVoice || v.name === selectedVoice);
    if (voice) utter.voice = voice;
    utter.rate = voiceRate;
    window.speechSynthesis.speak(utter);
  };
  const onDragStart = (e: React.DragEvent, slotIdx: number, colIdx: number, msgIdx: number) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ slotIdx, colIdx, msgIdx }));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: React.DragEvent, targetSlotIdx: number, targetCol: number) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      moveMessage(data.slotIdx, data.colIdx, data.msgIdx, targetCol, targetSlotIdx);
    } catch {}
  };
  const startListening = (colIdx: number) => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast("SpeechRecognition not supported");
      return;
    }
    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onstart = () => {
      setListeningCol(colIdx);
      setInterimTranscript("");
    };
    rec.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) setInterimTranscript(interim);
      if (final) {
        setInputs((prev) => {
          const n = [...prev];
          n[colIdx] = (n[colIdx] ? n[colIdx] + " " : "") + final;
          return n;
        });
        setInterimTranscript("");
      }
    };
    rec.onend = () => {
      setListeningCol(null);
      setInterimTranscript("");
    };
    rec.onerror = () => {
      setListeningCol(null);
      setInterimTranscript("");
    };
    recognitionRef.current = rec;
    rec.start();
  };
  const stopListening = () => {
    recognitionRef.current?.stop();
    setListeningCol(null);
  };

  const handleExport = () => {
    const payload = { slots, colTitles, exportedAt: new Date().toISOString(), model: MODEL };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    (el as any).href = url;
    (el as any).download = `tri-context-${Date.now()}.json`;
    document.body.appendChild(el);
    (el as any).click();
    el.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${slots.length} slots`);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast(`Importing ${file.name}…`);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.slots) setSlots(data.slots);
        if (data.colTitles) setColTitles(data.colTitles);
        showToast(`Imported ${data.slots?.length || 0} slots`);
      } catch {
        showToast("Invalid JSON");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleClear = () => {
    if (window.confirm("Clear all slots?")) {
      initWelcome();
      localStorage.removeItem("tri_slots_openrouter");
      showToast("Cleared • welcome restored");
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#080808] text-zinc-100 font-mono antialiased selection:bg-white/20">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
        * { font-family: "JetBrains Mono", monospace; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-thumb { background:#222; border-radius:10px; }
        ::-webkit-scrollbar-track { background:transparent; }
      `}</style>

      {/* Header 44px */}
      <header className="h-[44px] min-h-[44px] bg-[#0c0c0c] border-b border-white/[0.08] flex items-center justify-between px-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="bg-white text-black text-[10px] font-bold tracking-[0.18em] px-2 py-1 leading-none">TRI-CONTEXT</div>
          <div className="text-[11px] text-zinc-400 flex items-center gap-2">
            <span className="bg-[#1c1c1e] border border-white/10 px-2 py-0.5 text-[10px] text-zinc-300">{filteredContextCount} ctx • col {activeCol + 1}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setShowKeyModal((v) => !v);
              showToast(apiKey ? "OpenRouter key set ✓" : "Set OpenRouter key");
            }}
            className={`h-7 px-2.5 text-[10px] tracking-widest border transition ${apiKey ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-red-500/15 border-red-500/30 text-red-300 animate-pulse"}`}
          >
            {apiKey ? "OPENROUTER KEY ✓" : "OPENROUTER KEY"}
          </button>
          <button onClick={() => setShowVoiceModal(true)} className="h-7 px-2.5 text-[10px] tracking-widest bg-[#1c1c1e] border border-white/10 text-zinc-300 hover:bg-white/10">VOICE</button>
          <button onClick={handleExport} className="h-7 px-2.5 text-[10px] tracking-widest bg-[#1c1c1e] border border-white/10 text-zinc-300 hover:bg-white/10">EXPORT</button>
          <button onClick={handleClear} className="h-7 px-2.5 text-[10px] tracking-widest bg-[#1c1c1e] border border-white/10 text-zinc-300 hover:text-red-300 hover:border-red-900/50">CLEAR</button>
        </div>
      </header>
      {toast && <div className="fixed top-[50px] left-1/2 -translate-x-1/2 z-50 bg-white text-black text-[11px] px-3 py-1.5 tracking-widest border border-black shadow-xl">{toast}</div>}

      {/* Column headers - grid 3 cols */}
      <div className="grid grid-cols-3 gap-[1px] bg-white/[0.06] sticky top-[44px] z-20 border-b border-white/[0.06]">
        {[0, 1, 2].map((colIdx) => {
          const isActive = activeCol === colIdx;
          return (
            <button
              key={colIdx}
              onClick={() => setActiveCol(colIdx)}
              className={`bg-[#0e0e0f] px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer border-t text-left w-full transition ${isActive ? "border-white/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] ring-1 ring-inset ring-white/20" : "border-transparent hover:border-white/10"}`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                {editingTitle === colIdx ? (
                  <input
                    autoFocus
                    value={colTitles[colIdx]}
                    onChange={(e) => {
                      const n = [...colTitles];
                      n[colIdx] = e.target.value;
                      setColTitles(n);
                    }}
                    onBlur={() => setEditingTitle(null)}
                    onKeyDown={(e) => e.key === "Enter" && setEditingTitle(null)}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-black border border-white/20 px-2 py-1 text-[12px] w-full text-white outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0" onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(colIdx); }}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-white shadow-[0_0_8px_white]" : "bg-zinc-600"}`} />
                    <span className="text-[11px] tracking-[0.14em] font-semibold truncate">{colTitles[colIdx].toUpperCase()}</span>
                  </div>
                )}
                <div className={`text-[9px] px-1.5 py-0.5 border shrink-0 ${isActive ? "border-white/30 text-white" : "border-white/10 text-zinc-500"}`}>{isActive ? "ACTIVE" : "IDLE"}</div>
              </div>
              <div className="flex items-center justify-between w-full">
                <div className="text-[9px] tracking-widest text-zinc-500">{tokenCounts[colIdx]} TOK • {slots.reduce((a, s) => a + (s.cells[colIdx]?.length || 0), 0)} MSGS</div>
                <div className="text-[8px] tracking-widest text-zinc-600 hidden sm:block opacity-70">openrouter/auto → your default</div>
              </div>
              {isGenerating === colIdx && (
                <div className="h-0.5 w-full bg-white/10 overflow-hidden">
                  <div className="h-full w-1/2 bg-white animate-[slide_1s_ease-in-out_infinite]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Scroll container */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-[#080808] scrollbar-thin">
        <div className="min-h-full">
          {slots.length === 0 && <div className="p-8 text-center text-zinc-500 text-[12px]">No slots. Type below to start.</div>}
          {slots.map((slot, slotIdx) => (
            <div key={slot.id} className="grid grid-cols-1 md:grid-cols-3 gap-[12px] md:gap-[1px] bg-transparent md:bg-white/[0.04] border-b border-zinc-800/30 md:border-white/[0.04] min-h-[80px] p-2 md:p-0">
              {[0, 1, 2].map((colIdx) => {
                const cell = slot.cells[colIdx];
                const isActiveCol = activeCol === colIdx;
                return (
                  <div
                    key={colIdx}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, slotIdx, colIdx)}
                    className={`bg-[#111113] md:bg-[#18181b] relative p-2.5 min-h-[80px] transition-colors ${isActiveCol ? "ring-[0.5px] ring-inset ring-white/20" : ""}`}
                  >
                    {!cell || cell.length === 0 ? (
                      <div className="h-[60px] border border-dashed border-white/10 rounded-[2px] flex items-center justify-center text-[10px] text-zinc-600 tracking-widest">empty slot</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {cell.map((msg, msgIdx) => {
                          const isError = !!msg.isError;
                          const isWelcome = !!msg.isWelcome;
                          return (
                            <div
                              key={msg.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, slotIdx, colIdx, msgIdx)}
                              className={`group relative border rounded-[2px] p-2.5 transition
                                ${isError ? "bg-red-950/40 border-red-500/50 text-red-200" : "bg-[#1e1e20] border-white/[0.06] hover:border-white/20"}
                                ${!isError && msg.role === "user" ? "border-l-white/40 border-l-2" : ""}
                                ${!isError && msg.role === "assistant" && !isWelcome ? "border-l-zinc-600 border-l-2" : ""}
                                ${isWelcome ? "border-l-emerald-500/40 border-l-2 border-dashed" : ""}
                              `}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[9px] tracking-widest ${isError ? "text-red-300" : isWelcome ? "text-emerald-300" : msg.role === "user" ? "text-white" : "text-zinc-400"}`}>
                                  {isError ? "ERROR" : isWelcome ? "WELCOME" : msg.role.toUpperCase()} • {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                                  <button onClick={() => moveMessage(slotIdx, colIdx, msgIdx, colIdx - 1)} className="w-5 h-5 bg-black border border-white/10 text-[10px] hover:bg-white hover:text-black">{"<"}</button>
                                  <button onClick={() => moveMessage(slotIdx, colIdx, msgIdx, colIdx + 1)} className="w-5 h-5 bg-black border border-white/10 text-[10px] hover:bg-white hover:text-black">{">"}</button>
                                  <button onClick={() => copyMessage(msg.content)} className="w-5 h-5 bg-black border border-white/10 text-[10px] hover:bg-white/10">⎘</button>
                                  <button onClick={() => speakMessage(msg.content)} className="w-5 h-5 bg-black border border-white/10 text-[10px] hover:bg-white/10">▶</button>
                                  <button onClick={() => deleteMessage(slotIdx, colIdx, msgIdx)} className="w-5 h-5 bg-black border border-white/10 text-[10px] hover:bg-red-900/40 hover:text-red-300">×</button>
                                </div>
                              </div>
                              <div className={`${isError ? "text-[11px] leading-[1.5] whitespace-pre-wrap break-words text-red-200 max-h-[400px] overflow-auto font-mono" : "text-[12px] leading-[1.5] whitespace-pre-wrap break-words text-zinc-200"}`}>{msg.content}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="absolute top-1 right-1 text-[8px] text-zinc-700 tabular-nums pointer-events-none">#{slotIdx}</div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="h-4" />
        </div>
      </div>

      {/* Inputs footer - grid 3 cols */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[1px] bg-white/[0.06] sticky bottom-0 z-20 border-t border-white/[0.08]">
        {[0, 1, 2].map((colIdx) => {
          const isActive = activeCol === colIdx;
          const isListening = listeningCol === colIdx;
          return (
            <div key={colIdx} className={`bg-[#0c0c0c] p-2.5 flex flex-col gap-2 ${isActive ? "ring-1 ring-inset ring-white/20" : ""}`}>
              <div className="flex gap-2">
                <textarea
                  value={inputs[colIdx] + (isListening ? (interimTranscript ? " " + interimTranscript : "") : "")}
                  onChange={(e) => {
                    setInputs((prev) => {
                      const n = [...prev];
                      n[colIdx] = e.target.value;
                      return n;
                    });
                  }}
                  onFocus={() => setActiveCol(colIdx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(colIdx);
                    }
                  }}
                  placeholder={isActive ? `Message ${colTitles[colIdx]}… (Enter)` : `Focus to activate ${colTitles[colIdx]}`}
                  className={`flex-1 min-h-[52px] max-h-[120px] resize-none bg-[#151517] border text-[12px] p-2.5 outline-none placeholder:text-zinc-600 ${isActive ? "border-white/20 focus:border-white/40" : "border-white/10 focus:border-white/20"}`}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleSend(colIdx)} disabled={isGenerating !== null} className="h-7 px-3 bg-white text-black text-[11px] font-semibold tracking-widest hover:bg-zinc-200 disabled:opacity-40">SEND</button>
                  <button onClick={() => (isListening ? stopListening() : startListening(colIdx))} className={`h-7 w-7 border flex items-center justify-center text-[12px] transition ${isListening ? "bg-red-500/20 border-red-500/50 text-red-300 animate-pulse" : "bg-[#1a1a1d] border-white/10 text-zinc-400 hover:bg-white/10"}`}>
                    {isListening ? "●" : "◉"}
                  </button>
                  {isListening && <span className="text-[10px] text-red-300 animate-pulse">LISTENING</span>}
                </div>
                <div className="text-[8px] text-zinc-600 tracking-widest truncate max-w-[160px]">openrouter/auto → your default</div>
              </div>
            </div>
          );
        })}
      </div>

      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-white/15 w-full max-w-[420px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[12px] tracking-[0.2em] font-bold">OPENROUTER API KEY</h2>
              <button onClick={() => setShowKeyModal(false)} className="w-7 h-7 bg-black border border-white/10 text-zinc-400 hover:text-white">×</button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-5 mb-4">Paste your key from openrouter.ai/keys. App uses <span className="text-white">openrouter/auto</span> — your default model set at openrouter.ai/settings. No model selector needed.</p>
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-or-v1-..." className="w-full bg-black border border-white/15 px-3 py-2.5 text-[12px] outline-none focus:border-white/30 text-white mb-4" />
            <div className="flex gap-2">
              <button onClick={saveKey} className="flex-1 h-9 bg-white text-black text-[11px] tracking-widest font-semibold hover:bg-zinc-200">SAVE KEY</button>
              <button onClick={() => { setKeyInput(""); localStorage.removeItem("openrouter_key"); setApiKey(""); }} className="h-9 px-4 bg-[#1c1c1e] border border-white/10 text-[11px] text-zinc-400 hover:bg-white/10">CLEAR</button>
            </div>
            <div className="mt-4 text-[10px] text-zinc-600 leading-4">Stored locally as openrouter_key. Model is fixed to <span className="text-zinc-400">openrouter/auto</span> which respects your OpenRouter dashboard default. If you haven&apos;t set one, OpenRouter picks best available.</div>
          </div>
        </div>
      )}

      {showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-white/15 w-full max-w-[420px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[12px] tracking-[0.2em] font-bold">VOICE SETTINGS</h2>
              <button onClick={() => setShowVoiceModal(false)} className="w-7 h-7 bg-black border border-white/10 text-zinc-400 hover:text-white">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] text-zinc-500 tracking-widest mb-2">SYSTEM VOICE</div>
                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="w-full bg-black border border-white/15 px-3 py-2.5 text-[11px] text-zinc-300 outline-none">
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-zinc-500 tracking-widest">RATE</span><span className="text-[10px] text-zinc-400">{voiceRate.toFixed(1)}x</span></div>
                <input type="range" min={0.5} max={2} step={0.1} value={voiceRate} onChange={(e) => setVoiceRate(parseFloat(e.target.value))} className="w-full accent-white" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { window.speechSynthesis.cancel(); speakMessage("Tri context voice test. This is how assistant messages will sound."); }} className="flex-1 h-8 bg-[#1c1c1e] border border-white/10 text-[11px] text-zinc-300 hover:bg-white/10">TEST VOICE</button>
                <button onClick={() => window.speechSynthesis.cancel()} className="h-8 px-4 bg-red-950/40 border border-red-900/50 text-[11px] text-red-300 hover:bg-red-900/40">STOP ALL</button>
              </div>
              <div className="text-[10px] text-zinc-600 leading-4 pt-2 border-t border-white/5">Mic uses Web Speech API. Speaker uses speechSynthesis. No external TTS.</div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { showToast("Choose JSON to import"); fileInputRef.current?.click(); }} className="flex-1 h-8 bg-[#1c1c1e] border border-white/10 text-[11px] text-zinc-300 hover:bg-white/10">IMPORT JSON</button>
                <button onClick={() => setShowVoiceModal(false)} className="h-8 px-4 bg-white text-black text-[11px] font-semibold">DONE</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <style>{`@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
    </div>
  );
}
