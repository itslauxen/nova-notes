import { useEffect, useRef, useState } from "react";
import { Bot, Plus, Trash2, Check, Share2 } from "lucide-react";
import { agentsApi } from "../lib/store";
import { useLang } from "../context/LanguageContext";
import ConfirmDialog from "../components/ConfirmDialog";
import ShareDialog from "../components/ShareDialog";

// Página de Agentes: prompts em Markdown reutilizáveis (usados no atalho /agente).
export default function Agents() {
  const { t } = useLang();
  const [agents, setAgents] = useState([]);
  const [sharedAgents, setSharedAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // { id, name }
  const [shareFor, setShareFor] = useState(null); // { id, title }
  const [savedId, setSavedId] = useState(null);
  const timers = useRef({});

  const load = () => {
    agentsApi
      .list()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
    agentsApi.listShared().then(setSharedAgents).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    const a = await agentsApi.create({ content: "" });
    await load();
    // foca o novo no topo
    setAgents((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
  };

  // salva com debounce por agente
  const patch = (id, p) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      await agentsApi.update(id, p);
      setSavedId(id);
      setTimeout(() => setSavedId((s) => (s === id ? null : s)), 1200);
    }, 500);
  };

  return (
    <div className="panel" style={{ maxWidth: 820 }}>
      <div className="panel-title">
        <Bot size={22} style={{ verticalAlign: "-4px", marginRight: 8, color: "var(--accent)" }} />
        {t("nav.agents")}
      </div>
      <div className="panel-sub">
        {t("agents.subPre")}<code>/agente</code>{t("agents.subPost")}
      </div>

      <button className="btn-primary" onClick={create} style={{ marginBottom: 20 }}>
        <Plus size={15} /> {t("agents.newAgent")}
      </button>

      {loading ? (
        <div className="agent-empty">{t("agents.loading")}</div>
      ) : agents.length === 0 ? (
        <div className="agent-empty">{t("agents.empty")}</div>
      ) : (
        <div className="agent-list">
          {agents.map((a) => (
            <div className="agent-card" key={a.id}>
              <div className="agent-card-head">
                <input
                  className="agent-name"
                  value={a.title || ""}
                  placeholder={t("agents.agentName")}
                  onChange={(e) => patch(a.id, { title: e.target.value })}
                />
                {savedId === a.id && (
                  <span className="agent-saved">
                    <Check size={13} /> {t("common.saved")}
                  </span>
                )}
                <button
                  className="agent-del"
                  title={t("common.share")}
                  onClick={() => setShareFor({ id: a.id, title: a.title })}
                >
                  <Share2 size={15} />
                </button>
                <button
                  className="agent-del"
                  title={t("common.delete")}
                  onClick={() => setConfirm({ id: a.id, name: a.title || t("agents.agentFallback") })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea
                className="agent-prompt field"
                rows={5}
                placeholder={t("agents.promptPlaceholder")}
                value={a.content || ""}
                onChange={(e) => patch(a.id, { content: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      {sharedAgents.length > 0 && (
        <>
          <div className="panel-title" style={{ fontSize: 18, marginTop: 28 }}>
            {t("agents.sharedWithMe")}
          </div>
          <div className="agent-list">
            {sharedAgents.map((a) => (
              <div className="agent-card" key={a.id}>
                <div className="agent-card-head">
                  <input className="agent-name" value={a.title || ""} readOnly />
                </div>
                <textarea
                  className="agent-prompt field"
                  rows={5}
                  value={a.content || ""}
                  readOnly
                />
              </div>
            ))}
          </div>
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={t("agents.deleteAgent")}
          message={t("agents.deleteConfirm", { name: confirm.name })}
          onConfirm={async () => {
            await agentsApi.remove(confirm.id);
            setConfirm(null);
            load();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {shareFor && (
        <ShareDialog
          noteId={shareFor.id}
          title={shareFor.title}
          onClose={() => setShareFor(null)}
        />
      )}
    </div>
  );
}
