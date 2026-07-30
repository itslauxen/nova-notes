import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, X, Check } from "lucide-react";
import { sharesApi, usersApi } from "../lib/store";
import { isSupabaseConfigured } from "../lib/supabase";
import { useLang } from "../context/LanguageContext";

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

// Compartilha uma página/agente: autocomplete de usuários (nome + email).
export default function ShareDialog({ noteId, title, onClose }) {
  const { t } = useLang();
  const [users, setUsers] = useState([]);
  const [shares, setShares] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const loadShares = () => sharesApi.listFor(noteId).then(setShares).catch(() => {});
  useEffect(() => {
    usersApi.list().then(setUsers).catch(() => {});
    loadShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const sharedEmails = useMemo(
    () => new Set(shares.map((s) => s.shared_with_email)),
    [shares],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !sharedEmails.has((u.email || "").toLowerCase()))
      .filter(
        (u) =>
          !q ||
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [users, query, sharedEmails]);

  const add = async (email) => {
    const e = (email || "").trim().toLowerCase();
    if (!isEmail(e)) {
      setErr(t("share.invalidEmail"));
      return;
    }
    setErr("");
    setQuery("");
    setOpen(false);
    try {
      await sharesApi.share(noteId, e);
      await loadShares();
    } catch (x) {
      setErr(x.message || t("share.shareFail"));
    }
  };

  const remove = async (id) => {
    await sharesApi.unshare(id);
    loadShares();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <Share2 size={17} style={{ verticalAlign: "middle", color: "var(--accent)" }} /> {t("common.share")}
        </div>

        {!isSupabaseConfigured ? (
          <div className="modal-msg">{t("share.needCloud")}</div>
        ) : (
          <>
            <div className="share-ac">
              <input
                className="field"
                placeholder={t("share.searchPlaceholder")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filtered[0]) add(filtered[0].email);
                    else if (isEmail(query.trim())) add(query);
                  }
                }}
              />
              {open && filtered.length > 0 && (
                <div className="share-ac-list">
                  {filtered.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="share-ac-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(u.email);
                      }}
                    >
                      <span className="share-ac-name">{u.name || u.email}</span>
                      {u.name && <span className="share-ac-email">{u.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="share-caption">
              {t("share.caption", { what: title || t("share.thisPage") })}
            </div>
            {err && <div className="share-err">{err}</div>}

            {shares.length > 0 && (
              <div className="share-list">
                {shares.map((s) => (
                  <div className="share-row" key={s.id}>
                    <span className="share-row-icon"><Check size={13} /></span>
                    <span>{s.shared_with_email}</span>
                    <button onClick={() => remove(s.id)} title={t("share.removeAccess")}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
