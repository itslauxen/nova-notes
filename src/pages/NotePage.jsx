import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  Upload,
  Trash2,
  Check,
  Loader2,
  Target,
  MoreVertical,
  BookOpen,
  Tag,
  ListChecks,
  Share2,
  Mic,
  Square,
} from "lucide-react";
import Editor from "../components/Editor";
import Spinner from "../components/Spinner";
import LinkDialog from "../components/LinkDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import EmojiPicker from "../components/EmojiPicker";
import AIDialog from "../components/AIDialog";
import AgentDialog from "../components/AgentDialog";
import ShareDialog from "../components/ShareDialog";
import ReminderDialog from "../components/ReminderDialog";
import { computeSchedule } from "../components/Reminder";
import { RingLoader } from "react-spinners";
import { marked } from "marked";
import { generateNote, transcribe } from "../lib/ai";
import { recordVoice } from "../lib/recorder";
import { notesApi, remindersApi } from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { isAncestor } from "../lib/tree";
import { useLang } from "../context/LanguageContext";

// 5 presets de tamanho de fonte (fator de escala)
const FONT_SCALES = [0.85, 0.93, 1, 1.12, 1.28];

// cor primária atual (para o spinner)
function accentColor() {
  if (typeof window === "undefined") return "#a855f7";
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#a855f7"
  );
}

// conta checkboxes (to-dos) e os dias dos marcadores de progresso
function countTasks(md) {
  const text = md || "";
  const items = text.match(/^\s*[-*+]\s+\[( |x|X)\]/gm) || [];
  let total = items.length;
  let checked = items.filter((l) => /\[(x|X)\]/.test(l)).length;
  const trackers = text.matchAll(/data-count="(\d+)"\s+data-done="([01]*)"/g);
  for (const m of trackers) {
    total += parseInt(m[1], 10);
    checked += (m[2].match(/1/g) || []).length;
  }
  return { total, checked };
}

export default function NotePage({ onChanged, onDeleted }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const [note, setNote] = useState(null);
  const [allNotes, setAllNotes] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [tagInput, setTagInput] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [headMenu, setHeadMenu] = useState(null); // null | { x, y }
  const [aiOpen, setAiOpen] = useState(false);
  const [refactorOpen, setRefactorOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [readMode, setReadMode] = useState(false);
  const [tagAdding, setTagAdding] = useState(false);
  const [reminderCfg, setReminderCfg] = useState(null); // null | { id, initial }
  const reminderCache = useRef({});
  const remSyncTimer = useRef(null);

  // só mostra o loader se demorar mais de 500ms
  const [showLoader, setShowLoader] = useState(false);
  useEffect(() => {
    setShowLoader(false);
    const t = setTimeout(() => setShowLoader(true), 500);
    return () => clearTimeout(t);
  }, [id]);

  // modo leitura é salvo por nota (independente)
  useEffect(() => {
    let on = false;
    try {
      on = localStorage.getItem(`nova-read-${id}`) === "1";
    } catch {}
    setReadMode(on);
  }, [id]);
  const toggleRead = () =>
    setReadMode((v) => {
      const nv = !v;
      try {
        localStorage.setItem(`nova-read-${id}`, nv ? "1" : "0");
      } catch {}
      return nv;
    });
  const [fontIdx, setFontIdx] = useState(() => {
    const v = parseInt(localStorage.getItem("nova-note-font") || "2", 10);
    return Number.isFinite(v) && v >= 0 && v < FONT_SCALES.length ? v : 2;
  });
  const [refRec, setRefRec] = useState("idle"); // idle | recording | transcribing
  const voiceStopRef = useRef(null);
  const refStopRef = useRef(null);
  const runVoiceRef = useRef(null);
  const runRefactorVoiceRef = useRef(null);
  const addReminderRef = useRef(null);
  const openReminderConfigRef = useRef(null);
  const addSubpageRef = useRef(null);

  // botão de microfone flutuante (arrastável, posição salva no localStorage)
  const [micPos, setMicPos] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("nova-mic-pos") || "null");
      if (s && typeof s.x === "number") return s;
    } catch {}
    return null;
  });
  useEffect(() => {
    setMicPos((p) => {
      if (p == null)
        return { x: window.innerWidth - 74, y: window.innerHeight - 110 };
      // mantém dentro da tela atual, preservando o dock (abinha na borda)
      return {
        ...p,
        x: Math.max(8, Math.min(window.innerWidth - 58, p.x)),
        y: Math.max(8, Math.min(window.innerHeight - 58, p.y)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [micDragging, setMicDragging] = useState(false);
  const micDrag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const onMicDown = (e) => {
    e.preventDefault();
    const d = micDrag.current;
    d.active = true;
    d.moved = false;
    d.sx = e.clientX;
    d.sy = e.clientY;
    d.ox = micPos?.x ?? 0;
    d.oy = micPos?.y ?? 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMicMove = (e) => {
    const d = micDrag.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx,
      dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 6) {
      d.moved = true;
      setMicDragging(true); // desliga a transição enquanto segue o dedo
    }
    if (d.moved) {
      setMicPos({
        x: Math.max(8, Math.min(window.innerWidth - 58, d.ox + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 58, d.oy + dy)),
        dock: null,
      });
    }
  };
  const onMicUp = (e) => {
    const d = micDrag.current;
    if (!d.active) return;
    d.active = false;
    setMicDragging(false); // religa a transição -> o snap pro canto anima
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}
    if (d.moved) {
      // encostou numa borda lateral -> vira uma abinha pra não atrapalhar
      let dock = null;
      if (micPos.x <= 14) dock = "left";
      else if (micPos.x >= window.innerWidth - 58 - 14) dock = "right";
      const next = { ...micPos, dock };
      setMicPos(next);
      try {
        localStorage.setItem("nova-mic-pos", JSON.stringify(next));
      } catch {}
    } else {
      runRefactorVoiceRef.current?.(); // toque (sem arrastar) -> grava/refatora
    }
  };

  useEffect(() => {
    localStorage.setItem("nova-note-font", String(fontIdx));
  }, [fontIdx]);

  const openHeadMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHeadMenu({ x: Math.max(8, r.right - 210), y: r.bottom + 4 });
  };
  const saveTimer = useRef(null);
  const fileInput = useRef(null);
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const [aiPos, setAiPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    let active = true;
    notesApi.get(id).then((n) => active && setNote(n));
    notesApi
      .list()
      .then((ns) => active && setAllNotes(ns.filter((n) => n.id !== id)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  // abre o diálogo de link (disparado pelo menu "/")
  useEffect(() => {
    const openLink = () => setLinkOpen(true);
    const openAi = () => setAiOpen(true);
    const openVoice = () => runVoiceRef.current?.();
    const openRefactor = () => setRefactorOpen(true);
    const openAgent = () => setAgentOpen(true);
    const refVoice = () => runRefactorVoiceRef.current?.();
    const addRem = () => addReminderRef.current?.();
    const cfgRem = (e) => openReminderConfigRef.current?.(e.detail?.id);
    const doneRem = (e) => setReminderDone(e.detail?.id, e.detail?.done);
    const addSub = () => addSubpageRef.current?.();
    window.addEventListener("nova:add-link", openLink);
    window.addEventListener("nova:ai-generate", openAi);
    window.addEventListener("nova:ai-voice", openVoice);
    window.addEventListener("nova:ai-refactor", openRefactor);
    window.addEventListener("nova:ai-agent", openAgent);
    window.addEventListener("nova:refactor-voice", refVoice);
    window.addEventListener("nova:add-reminder", addRem);
    window.addEventListener("nova:reminder-config", cfgRem);
    window.addEventListener("nova:reminder-done", doneRem);
    window.addEventListener("nova:add-subpage", addSub);
    return () => {
      window.removeEventListener("nova:add-link", openLink);
      window.removeEventListener("nova:ai-generate", openAi);
      window.removeEventListener("nova:ai-voice", openVoice);
      window.removeEventListener("nova:ai-refactor", openRefactor);
      window.removeEventListener("nova:ai-agent", openAgent);
      window.removeEventListener("nova:refactor-voice", refVoice);
      window.removeEventListener("nova:add-reminder", addRem);
      window.removeEventListener("nova:reminder-config", cfgRem);
      window.removeEventListener("nova:reminder-done", doneRem);
      window.removeEventListener("nova:add-subpage", addSub);
    };
  }, []);

  const runAi = async (instruction, meta) => {
    setAiOpen(false);
    setAiError(null);
    // posiciona o indicador no cursor e rola até ele
    const ed0 = editorRef.current;
    if (ed0 && bodyRef.current) {
      ed0.chain().focus().scrollIntoView().run();
      try {
        const c = ed0.view.coordsAtPos(ed0.state.selection.from);
        const r = bodyRef.current.getBoundingClientRect();
        setAiPos({ top: c.top - r.top, left: c.left - r.left });
      } catch {
        setAiPos({ top: 0, left: 0 });
      }
    }
    setAiBusy(true);
    try {
      const { content, title, emoji } = await generateNote(instruction, meta);
      const ed = editorRef.current;
      if (ed && content)
        ed.chain().focus().insertContent(marked.parse(content)).run();
      const patch = {};
      if (meta && title) patch.title = title;
      if (meta && emoji)
        patch.emoji = Array.from(emoji.trim())[0] || emoji.trim();
      if (Object.keys(patch).length) queueSave(patch);
    } catch (e) {
      setAiError(e.message || t("note.genFail"));
    } finally {
      setAiBusy(false);
    }
  };

  // refatora: pega o conteúdo atual da nota e reescreve conforme o pedido.
  // opts.silent = não mostra o "Gerando" no texto (usado no fluxo por voz)
  const runRefactor = async (userPrompt, opts = {}) => {
    const silent = !!opts.silent;
    setRefactorOpen(false);
    setAiError(null);
    const ed = editorRef.current;
    if (!ed) return;
    const current = ed.storage.markdown.getMarkdown();
    if (!silent && bodyRef.current) {
      // posiciona o "Gerando" no cursor (clampado pra não sair da tela)
      ed.chain().focus().scrollIntoView().run();
      try {
        const c = ed.view.coordsAtPos(ed.state.selection.from);
        const r = bodyRef.current.getBoundingClientRect();
        setAiPos({
          top: Math.max(0, c.top - r.top),
          left: Math.max(0, Math.min(c.left - r.left, r.width - 150)),
        });
      } catch {
        setAiPos({ top: 0, left: 0 });
      }
    } else if (silent) {
      setAiPos({ top: 0, left: 0 });
    }
    if (!silent) setAiBusy(true);
    try {
      const prompt =
        "Abaixo está o conteúdo atual de uma nota em Markdown. Reescreva/refatore o " +
        "conteúdo TODO conforme o pedido do usuário e devolva a nota completa em " +
        "Markdown (sem comentários nem explicações). Pedido: " +
        userPrompt +
        "\n\n--- Conteúdo atual ---\n" +
        (current || "(vazio)");
      const { content } = await generateNote(prompt, false);
      if (content) {
        ed.chain().focus().setContent(content).run();
        // setContent não dispara onUpdate -> salva manualmente
        handleContent(ed.storage.markdown.getMarkdown());
        // anima o texto novo aparecendo
        const pm = bodyRef.current?.querySelector(".ProseMirror");
        if (pm) {
          pm.classList.remove("refactor-in");
          void pm.offsetWidth; // reinicia a animação
          pm.classList.add("refactor-in");
          setTimeout(() => pm.classList.remove("refactor-in"), 650);
        }
      }
    } catch (e) {
      setAiError(e.message || t("note.refactorFail"));
    } finally {
      if (!silent) setAiBusy(false);
    }
  };

  // roda um ou mais agentes (soma os prompts) + instrução, insere no cursor
  const runAgent = async (chosenAgents, instruction) => {
    setAgentOpen(false);
    setAiError(null);
    const ed0 = editorRef.current;
    if (ed0 && bodyRef.current) {
      ed0.chain().focus().scrollIntoView().run();
      try {
        const c = ed0.view.coordsAtPos(ed0.state.selection.from);
        const r = bodyRef.current.getBoundingClientRect();
        setAiPos({ top: c.top - r.top, left: c.left - r.left });
      } catch {
        setAiPos({ top: 0, left: 0 });
      }
    }
    setAiBusy(true);
    try {
      const persona = chosenAgents
        .map((a) => (a.content || "").trim())
        .filter(Boolean)
        .join("\n\n---\n\n");
      const ed = editorRef.current;
      const noteMd = ed ? ed.storage.markdown.getMarkdown() : "";
      let prompt = persona;
      if (instruction) prompt += `\n\n# Instrução do usuário\n${instruction}`;
      if (noteMd.trim())
        prompt += `\n\n# Conteúdo atual da nota (contexto)\n${noteMd}`;
      const { content } = await generateNote(prompt, false);
      if (ed && content)
        ed.chain().focus().insertContent(marked.parse(content)).run();
    } catch (e) {
      setAiError(e.message || t("note.agentFail"));
    } finally {
      setAiBusy(false);
    }
  };

  // gesto direito na nota: grava a instrução (para no silêncio) e refatora
  const runRefactorVoice = async () => {
    if (readMode) return;
    if (refRec === "recording") {
      refStopRef.current?.();
      return;
    }
    if (refRec !== "idle") return;
    setAiError(null);
    setRefRec("recording");
    let blob;
    try {
      const r = recordVoice({});
      refStopRef.current = r.stop;
      blob = await r.promise;
    } catch {
      setRefRec("idle");
      setAiError(t("voice.micAccessFail"));
      return;
    }
    setRefRec("transcribing");
    let text = "";
    try {
      text = await transcribe(blob);
    } catch (e) {
      setRefRec("idle");
      setAiError(e.message || t("note.transcribeFail"));
      return;
    }
    if (!text) {
      setRefRec("idle");
      return;
    }
    // gera sem o "Gerando" no texto — só o spinner no botão do mic
    setRefRec("generating");
    await runRefactor(text, { silent: true });
    setRefRec("idle");
  };
  runRefactorVoiceRef.current = runRefactorVoice;

  // grava a voz, transcreve e gera o texto no cursor (item "/" Gerar com voz)
  const runVoice = async () => {
    // posiciona o indicador no cursor (igual ao "Gerando")
    const ed0 = editorRef.current;
    if (ed0 && bodyRef.current) {
      ed0.chain().focus().scrollIntoView().run();
      try {
        const c = ed0.view.coordsAtPos(ed0.state.selection.from);
        const r = bodyRef.current.getBoundingClientRect();
        setAiPos({ top: c.top - r.top, left: c.left - r.left });
      } catch {
        setAiPos({ top: 0, left: 0 });
      }
    }
    setAiError(null);
    setRecording(true);
    let blob;
    try {
      const rec = recordVoice({});
      voiceStopRef.current = rec.stop;
      blob = await rec.promise;
    } catch {
      setRecording(false);
      setAiError(t("voice.micAccessFail"));
      return;
    }
    setRecording(false);
    setAiBusy(true);
    try {
      const text = await transcribe(blob);
      if (!text) throw new Error(t("voice.notUnderstood"));
      // enquadra o ditado como pedido de nota, pra a IA aplicar as regras
      // de formatação do SYSTEM (checkboxes, tabelas, títulos…)
      const prompt =
        "A seguir está um ditado de voz. Transforme em uma nota bem organizada " +
        "em Markdown, aplicando a formatação adequada (use checkboxes '- [ ] ' para " +
        "itens acionáveis/listas de compras/tarefas, tabelas quando houver dados a " +
        "comparar, títulos e listas quando ajudar). Preserve o conteúdo, melhore só a " +
        'estrutura. Ditado:\n\n"' +
        text +
        '"';
      const { content } = await generateNote(prompt, false);
      const ed = editorRef.current;
      if (ed && content)
        ed.chain().focus().insertContent(marked.parse(content)).run();
    } catch (e) {
      setAiError(e.message || t("note.genFail"));
    } finally {
      setAiBusy(false);
    }
  };
  runVoiceRef.current = runVoice;

  // ---------- lembretes ----------
  const findReminderNode = (rid) => {
    const ed = editorRef.current;
    if (!ed) return null;
    let found = null;
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === "reminder" && node.attrs.id === rid) {
        found = { node, pos };
        return false;
      }
    });
    return found;
  };
  const updateReminderNode = (rid, attrs) => {
    const ed = editorRef.current;
    const f = findReminderNode(rid);
    if (ed && f) ed.view.dispatch(ed.state.tr.setNodeMarkup(f.pos, undefined, { ...f.node.attrs, ...attrs }));
  };

  const addReminder = async () => {
    const ed = editorRef.current;
    if (!ed) return;
    let row;
    try {
      row = await remindersApi.create({ note_id: id, text: "", kind: "once" });
    } catch {
      return;
    }
    reminderCache.current[row.id] = "";
    ed.chain().focus().insertContent({ type: "reminder", attrs: { id: row.id, done: false, kind: "once" } }).run();
    setReminderCfg({ id: row.id, initial: { kind: "once" } });
  };

  const openReminderConfig = (rid) => {
    const f = findReminderNode(rid);
    const a = f?.node.attrs;
    setReminderCfg({
      id: rid,
      initial: a ? { kind: a.kind, fireAt: a.fireAt, time: a.time, intervalHours: a.intervalHours } : { kind: "once" },
    });
  };

  const saveReminderConfig = async (cfg) => {
    const rid = reminderCfg?.id;
    setReminderCfg(null);
    if (!rid) return;
    const { next_fire_at, summary } = computeSchedule(cfg, t);
    updateReminderNode(rid, {
      kind: cfg.kind,
      fireAt: cfg.fireAt || null,
      time: cfg.time || null,
      intervalHours: cfg.intervalHours || null,
      summary,
    });
    try {
      await remindersApi.update(rid, {
        kind: cfg.kind,
        fire_at: cfg.kind === "once" ? next_fire_at : null,
        time_of_day: cfg.time || null,
        interval_hours: cfg.intervalHours || null,
        next_fire_at,
        active: true,
        done: false,
      });
    } catch {}
    editorRef.current?.chain().focus().run();
  };

  const setReminderDone = (rid, done) => {
    remindersApi.update(rid, { done, active: !done }).catch(() => {});
  };
  addReminderRef.current = addReminder;
  openReminderConfigRef.current = openReminderConfig;

  // ---------- subpáginas / hierarquia ----------
  const addSubpage = async () => {
    const ed = editorRef.current;
    if (!ed) return;
    let child;
    try {
      child = await notesApi.create({ parent_id: id, title: t("note.newSubpage") });
    } catch {
      return;
    }
    ed.chain().focus().insertContent(`<a href="/note/${child.id}">${child.title}</a> `).run();
    try {
      await notesApi.update(id, { content: ed.storage.markdown.getMarkdown() });
    } catch {}
    onChanged?.();
    navigate(`/note/${child.id}`);
  };
  addSubpageRef.current = addSubpage;

  // aninha uma nota existente (mencionada) como filha da atual, evitando ciclo
  const linkNoteAsChild = async (childId) => {
    if (!childId || childId === id) return;
    const map = new Map(allNotes.map((n) => [n.id, n]));
    if (note) map.set(id, note);
    if (isAncestor(map, id, childId)) return; // child é ancestral -> evita ciclo
    try {
      await notesApi.update(childId, { parent_id: id });
      onChanged?.();
    } catch {}
  };

  // sincroniza texto dos lembretes e apaga do banco os removidos da nota
  const syncReminders = async () => {
    const ed = editorRef.current;
    if (!ed || !isSupabaseConfigured) return;
    const present = new Map();
    ed.state.doc.descendants((node) => {
      if (node.type.name === "reminder" && node.attrs.id) present.set(node.attrs.id, node.textContent || "");
    });
    for (const [rid, text] of present) {
      if (reminderCache.current[rid] !== text) {
        reminderCache.current[rid] = text;
        remindersApi.update(rid, { text }).catch(() => {});
      }
    }
    try {
      const rows = await remindersApi.listForNote(id);
      for (const r of rows)
        if (!present.has(r.id)) {
          remindersApi.remove(r.id).catch(() => {});
          delete reminderCache.current[r.id];
        }
    } catch {}
  };

  const queueSave = (patch) => {
    setNote((n) => ({ ...n, ...patch }));
    setStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await notesApi.update(id, patch);
      setStatus("saved");
      onChanged?.();
      setTimeout(() => setStatus("idle"), 1500);
    }, 600);
  };

  const handleContent = (content) => {
    const patch = { content };
    const { total, checked } = countTasks(content);
    if (total > 0) {
      patch.progress = Math.round((checked / total) * 100);
      patch.done = patch.progress === 100;
    }
    queueSave(patch);
    clearTimeout(remSyncTimer.current);
    remSyncTimer.current = setTimeout(syncReminders, 900);
  };

  const exportMd = () => {
    const blob = new Blob([note.content || ""], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(note.title || "nota").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importMd = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    queueSave({ content: text, title: file.name.replace(/\.md$/i, "") });
    e.target.value = "";
  };

  const confirmDelete = async () => {
    setConfirmOpen(false);
    await notesApi.remove(id);
    onDeleted?.(id);
  };

  const insertLink = ({ text, href }) => {
    setLinkOpen(false);
    const ed = editorRef.current;
    if (ed)
      ed.chain().focus().insertContent(`<a href="${href}">${text}</a> `).run();
    // mencionar uma nota interna aninha ela como subpágina desta
    const m = /\/note\/([\w-]+)/.exec(href || "");
    if (m) linkNoteAsChild(m[1]);
  };

  // clique em link: nota interna navega no app, externo abre em nova aba
  const onBodyClick = (e) => {
    const a = e.target.closest && e.target.closest("a");
    if (a) {
      const href = a.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      if (href.startsWith("/note/")) navigate(href);
      else window.open(href, "_blank", "noopener");
      return;
    }
  };

  // área clicável abaixo do editor -> garante uma linha no fim e foca nela
  // (sem rolar pro topo: seta a seleção e foca o DOM com preventScroll)
  const addLineAtEnd = () => {
    if (readMode) return;
    const ed = editorRef.current;
    if (!ed) return;
    const last = ed.state.doc.lastChild;
    const emptyPara =
      last && last.type.name === "paragraph" && last.content.size === 0;
    if (!emptyPara) {
      ed.chain()
        .insertContentAt(ed.state.doc.content.size, { type: "paragraph" })
        .run();
    }
    ed.commands.setTextSelection(ed.state.doc.content.size);
    try {
      ed.view.dom.focus({ preventScroll: true });
    } catch {
      ed.view.dom.focus();
    }
  };

  // marca/desmarca todas as checkboxes (to-dos) da página
  const toggleAllChecks = () => {
    const ed = editorRef.current;
    if (!ed) return;
    let total = 0,
      checked = 0;
    ed.state.doc.descendants((n) => {
      if (n.type.name === "taskItem") {
        total++;
        if (n.attrs.checked) checked++;
      }
    });
    if (!total) return;
    const target = checked < total; // se nem todas marcadas -> marca todas
    ed.chain()
      .focus()
      .command(({ tr }) => {
        tr.doc.descendants((n, pos) => {
          if (n.type.name === "taskItem" && n.attrs.checked !== target)
            tr.setNodeMarkup(pos, undefined, { ...n.attrs, checked: target });
        });
        return true;
      })
      .run();
  };

  const toggleGoal = () =>
    queueSave({
      is_goal: !note.is_goal,
      emoji: !note.is_goal && note.emoji === "📄" ? "🎯" : note.emoji,
    });
  const focusBody = () => editorRef.current?.commands.focus("start");

  // some o balão de erro sozinho depois de alguns segundos
  useEffect(() => {
    if (!aiError) return;
    const t = setTimeout(() => setAiError(null), 6000);
    return () => clearTimeout(t);
  }, [aiError]);

  // sincroniza o título (carregar nota / título gerado pela IA) sem mover o cursor
  useEffect(() => {
    const el = titleRef.current;
    if (el && el.textContent !== (note?.title || ""))
      el.textContent = note?.title || "";
  }, [note?.title]);

  if (!note) return showLoader ? <Spinner /> : null;

  return (
    <div className="editor-page" style={{ "--note-fs": FONT_SCALES[fontIdx] }}>
      <div className="editor-head">
        <button
          className={"goal-toggle" + (note.is_goal ? " on" : "")}
          onClick={toggleGoal}
          title={t("note.markAsGoal")}
        >
          <Target size={15} />{" "}
          {note.is_goal ? t("note.goal") : t("note.markAsGoal")}
        </button>
        {note.is_goal &&
          (() => {
            const { total, checked } = countTasks(note.content);
            if (total > 0) {
              return (
                <div
                  className="head-progress"
                  title={t("note.calcFromTasks")}
                >
                  <div className="progress" style={{ width: 110 }}>
                    <span style={{ width: `${note.progress || 0}%` }} />
                  </div>
                  <span className="head-progress-val">
                    {note.progress || 0}% · {checked}/{total} ✓{" "}
                  </span>
                </div>
              );
            }
            return (
              <div className="head-progress">
                <input
                  className="range"
                  type="range"
                  min="0"
                  max="100"
                  value={note.progress || 0}
                  onChange={(e) =>
                    queueSave({
                      progress: Number(e.target.value),
                      done: Number(e.target.value) === 100,
                    })
                  }
                />
                <span className="head-progress-val">{note.progress || 0}%</span>
              </div>
            );
          })()}
        {status === "saving" && (
          <span className="save-tag">
            <Loader2 size={14} className="spin" /> {t("common.savingEllipsis")}
          </span>
        )}
        {status === "saved" && (
          <span className="save-tag" style={{ color: "var(--accent)" }}>
            <Check size={14} /> {t("common.saved")}
          </span>
        )}
        <div className="spacer" />
        <div className="head-actions">
          <button
            className="icon-btn head-full"
            title={t("common.share")}
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={18} />
          </button>
          <button
            className="icon-btn head-full"
            title={t("note.importMd")}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={18} />
          </button>
          <button
            className="icon-btn head-full"
            title={t("note.exportMd")}
            onClick={exportMd}
          >
            <Download size={18} />
          </button>
          <button
            className="icon-btn head-full"
            title={t("common.delete")}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={18} />
          </button>

          <button
            className="icon-btn head-more"
            title={t("common.more")}
            onClick={openHeadMenu}
          >
            <MoreVertical size={18} />
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".md,text/markdown"
          hidden
          onChange={importMd}
        />
      </div>

      <div className="editor-body fade-in">
        <div className="title-meta">
          <div className="emoji-wrap">
            <button
              className="emoji-input"
              onClick={() => setEmojiOpen((o) => !o)}
              title={t("note.pickEmoji")}
            >
              {note.emoji || "📄"}
            </button>
            {emojiOpen && (
              <EmojiPicker
                onPick={(e) => {
                  queueSave({ emoji: e });
                  setEmojiOpen(false);
                }}
                onClose={() => setEmojiOpen(false)}
              />
            )}
          </div>
          <div className="title-controls">
            {tagAdding && (
              <input
                className="tag-input"
                autoFocus
                placeholder="tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onBlur={() => setTagAdding(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    const t = tagInput.trim().replace(/^#/, "");
                    if (t && !(note.tags || []).includes(t))
                      queueSave({ tags: [...(note.tags || []), t] });
                    setTagInput("");
                  } else if (e.key === "Escape") setTagAdding(false);
                }}
              />
            )}
            <button
              className="meta-btn"
              onClick={() => setTagAdding(true)}
              title={t("note.addTag")}
            >
              <Tag size={17} />
            </button>
            <button
              className={"meta-btn" + (readMode ? " active" : "")}
              onClick={toggleRead}
              title={t("note.readMode")}
            >
              <BookOpen size={18} />
            </button>
          </div>
        </div>
        <div
          ref={titleRef}
          className="title-input"
          contentEditable={!readMode}
          suppressContentEditableWarning
          data-placeholder={t("common.untitled")}
          onInput={(e) => queueSave({ title: e.currentTarget.textContent })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              focusBody();
            }
          }}
        />
        {(note.tags || []).length > 0 && (
          <div className="tags-row">
            {(note.tags || []).map((t) => (
              <span className="tag-chip" key={t}>
                <span className="tag-text">{t}</span>
                <button
                  onClick={() =>
                    queueSave({
                      tags: (note.tags || []).filter((x) => x !== t),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          ref={bodyRef}
          onClick={onBodyClick}
          className={"note-body" + (aiBusy || recording ? " generating" : "")}
          style={{ position: "relative" }}
        >
          {recording && (
            <button
              className="ai-listening"
              style={{ top: aiPos.top, left: aiPos.left }}
              onClick={() => voiceStopRef.current?.()}
              title={t("note.stopAndGenerate")}
            >
              <span className="ai-listening-text">{t("note.listening")}</span>
              <span className="ai-listening-dot" />
            </button>
          )}
          {aiBusy && (
            <div
              className="ai-generating"
              style={{ top: aiPos.top, left: aiPos.left }}
            >
              <span className="ai-generating-text">{t("note.generating")}</span>
              <RingLoader color={accentColor()} size={20} />
            </div>
          )}
          {aiError && (
            <div
              className="ai-error"
              style={{ top: aiPos.top, left: aiPos.left }}
            >
              <span className="ai-error-msg">{aiError}</span>
              <button onClick={() => setAiError(null)}>×</button>
            </div>
          )}
          <Editor
            content={note.content}
            onChange={handleContent}
            onEditor={(ed) => (editorRef.current = ed)}
            editable={!readMode}
          />
          {!readMode && (
            <div className="editor-pad" onClick={addLineAtEnd} />
          )}
        </div>
      </div>

      {!readMode &&
        micPos &&
        createPortal(
          <button
            className={
              "note-mic " +
              refRec +
              (micPos.dock ? " dock-" + micPos.dock : "") +
              (micDragging ? " dragging" : "")
            }
            style={
              micPos.dock ? { top: micPos.y } : { left: micPos.x, top: micPos.y }
            }
            onPointerDown={onMicDown}
            onPointerMove={onMicMove}
            onPointerUp={onMicUp}
            title={
              refRec === "recording"
                ? t("note.micRecording")
                : refRec === "transcribing"
                  ? t("note.micTranscribing")
                  : t("note.micIdle")
            }
          >
            {refRec === "recording" ? (
              <Square size={18} fill="currentColor" />
            ) : refRec === "transcribing" || refRec === "generating" ? (
              <RingLoader color={accentColor()} size={26} />
            ) : (
              <Mic size={micPos.dock ? 16 : 20} />
            )}
          </button>,
          document.body,
        )}

      {headMenu &&
        createPortal(
          <>
            <div className="menu-backdrop" onClick={() => setHeadMenu(null)} />
            <div
              className="card-menu"
              style={{
                position: "fixed",
                top: headMenu.y,
                left: headMenu.x,
                right: "auto",
                zIndex: 120,
              }}
            >
              <div className="menu-fontsize">
                <span>{t("note.font")}</span>
                <div className="fs-options">
                  {FONT_SCALES.map((s, i) => (
                    <button
                      key={i}
                      className={i === fontIdx ? "active" : ""}
                      style={{ fontSize: 11 + i * 2.5 }}
                      onClick={() => setFontIdx(i)}
                      title={t("note.fontSize", { n: i + 1 })}
                    >
                      A
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  setHeadMenu(null);
                  toggleRead();
                }}
              >
                <BookOpen size={14} /> {t("note.readMode")}{" "}
                {readMode && (
                  <Check
                    size={13}
                    style={{ marginLeft: "auto", color: "var(--accent)" }}
                  />
                )}
              </button>
              <button
                onClick={() => {
                  setHeadMenu(null);
                  toggleAllChecks();
                }}
              >
                <ListChecks size={14} /> {t("note.toggleAllTasks")}
              </button>
              <button
                onClick={() => {
                  setHeadMenu(null);
                  setShareOpen(true);
                }}
              >
                <Share2 size={14} /> {t("common.share")}
              </button>

              <button
                onClick={() => {
                  setHeadMenu(null);
                  toggleGoal();
                }}
              >
                <Target size={14} /> {t("note.goal")}{" "}
                {note.is_goal && (
                  <Check
                    size={13}
                    style={{ marginLeft: "auto", color: "var(--accent)" }}
                  />
                )}
              </button>
              <button
                onClick={() => {
                  setHeadMenu(null);
                  fileInput.current?.click();
                }}
              >
                <Upload size={14} /> {t("note.importMd")}
              </button>
              <button
                onClick={() => {
                  setHeadMenu(null);
                  exportMd();
                }}
              >
                <Download size={14} /> {t("note.exportMd")}
              </button>
              <button
                className="danger"
                onClick={() => {
                  setHeadMenu(null);
                  setConfirmOpen(true);
                }}
              >
                <Trash2 size={14} /> {t("common.delete")}
              </button>
            </div>
          </>,
          document.body,
        )}

      {aiOpen && (
        <AIDialog
          onSubmit={runAi}
          onCancel={() => setAiOpen(false)}
          defaultMeta={
            (!note.title || note.title === "Sem título") &&
            (!note.emoji || note.emoji === "📄")
          }
        />
      )}
      {refactorOpen && (
        <AIDialog
          title={t("note.refactorTitle")}
          message={t("note.refactorMsg")}
          placeholder={t("note.refactorPlaceholder")}
          hideMeta
          onSubmit={runRefactor}
          onCancel={() => setRefactorOpen(false)}
        />
      )}
      {agentOpen && (
        <AgentDialog onSubmit={runAgent} onCancel={() => setAgentOpen(false)} />
      )}
      {shareOpen && (
        <ShareDialog
          noteId={id}
          title={note.title}
          onClose={() => setShareOpen(false)}
        />
      )}
      {reminderCfg && (
        <ReminderDialog
          initial={reminderCfg.initial}
          onSave={saveReminderConfig}
          onCancel={() => setReminderCfg(null)}
        />
      )}
      {linkOpen && (
        <LinkDialog
          notes={allNotes}
          onConfirm={insertLink}
          onCancel={() => setLinkOpen(false)}
        />
      )}
      {confirmOpen && (
        <ConfirmDialog
          title={t("note.deleteNote")}
          message={t("note.deleteConfirm", { title: note.title || t("common.untitled") })}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
