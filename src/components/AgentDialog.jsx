import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Check, Mic, Square, Loader2 } from "lucide-react";
import { agentsApi } from "../lib/store";
import { recordVoice } from "../lib/recorder";
import { transcribe } from "../lib/ai";
import { useLang } from "../context/LanguageContext";

// Escolhe um ou mais agentes (soma os prompts) e passa uma instrução.
export default function AgentDialog({ onSubmit, onCancel }) {
  const { t } = useLang();
  const [agents, setAgents] = useState([]);
  const [sel, setSel] = useState([]); // ids selecionados
  const [instr, setInstr] = useState("");
  const [rec, setRec] = useState("idle"); // idle | recording | transcribing
  const ref = useRef(null);
  const stopRef = useRef(null);

  useEffect(() => {
    Promise.all([agentsApi.list(), agentsApi.listShared()])
      .then(([mine, sh]) => setAgents([...mine, ...sh]))
      .catch(() => {});
  }, []);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const toggle = (id) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // microfone: grava (para sozinho no silêncio), transcreve e adiciona à instrução
  const toggleMic = async () => {
    if (rec === "recording") {
      stopRef.current?.();
      return;
    }
    if (rec !== "idle") return;
    setRec("recording");
    let blob;
    try {
      const r = recordVoice({});
      stopRef.current = r.stop;
      blob = await r.promise;
    } catch {
      setRec("idle");
      return;
    }
    setRec("transcribing");
    try {
      const text = await transcribe(blob);
      if (text) setInstr((p) => (p ? p.trim() + " " : "") + text);
    } catch {}
    setRec("idle");
    ref.current?.focus();
  };

  const run = () => {
    const chosen = agents.filter((a) => sel.includes(a.id));
    if (!chosen.length) return;
    onSubmit(chosen, instr.trim());
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="modal-title">
          <Bot size={17} style={{ verticalAlign: "middle", color: "var(--accent)" }} /> {t("agentDialog.title")}
        </div>

        {agents.length === 0 ? (
          <div className="modal-msg">
            {t("agentDialog.noAgentsPre")}<strong>{t("nav.agents")}</strong>{t("agentDialog.noAgentsPost")}
          </div>
        ) : (
          <>
            <div className="modal-msg">{t("agentDialog.pick")}</div>
            <div className="agent-pick">
              {agents.map((a) => {
                const on = sel.includes(a.id);
                return (
                  <button
                    key={a.id}
                    className={"agent-chip" + (on ? " on" : "")}
                    onClick={() => toggle(a.id)}
                    type="button"
                  >
                    <span className="agent-chip-emoji">{a.emoji || "🤖"}</span>
                    {a.title || t("agentDialog.noName")}
                    {on && <Check size={13} style={{ marginLeft: "auto" }} />}
                  </button>
                );
              })}
            </div>
            <div className="agent-instr">
              <textarea
                ref={ref}
                className="field"
                rows={3}
                placeholder={t("agentDialog.instrPlaceholder")}
                value={instr}
                onChange={(e) => setInstr(e.target.value)}
              />
              <button
                type="button"
                className={"agent-mic " + rec}
                onClick={toggleMic}
                disabled={rec === "transcribing"}
                title={
                  rec === "recording"
                    ? t("common.stop")
                    : rec === "transcribing"
                      ? t("voice.transcribing")
                      : t("voice.speak")
                }
              >
                {rec === "recording" ? (
                  <Square size={14} fill="currentColor" />
                ) : rec === "transcribing" ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Mic size={15} />
                )}
              </button>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary" onClick={run} disabled={!sel.length}>
            {t("agentDialog.run")}
          </button>
        </div>
        <div className="modal-hint">{t("agentDialog.hint")}</div>
      </div>
    </div>,
    document.body,
  );
}
