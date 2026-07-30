import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Check, Pencil, MoreVertical } from "lucide-react";
import { notesApi } from "../lib/store";
import { useLang } from "../context/LanguageContext";

marked.setOptions({ breaks: true });
const stop = (e) => e.stopPropagation();

function GoalCard({
  g,
  isEditing,
  menuOpen,
  onMenu,
  onPatch,
  onUnmark,
  onToggleEdit,
  onOpen,
}) {
  const { t } = useLang();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: g.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : g.done ? 0.65 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="card goal-card clickable"
      onClick={() => !isEditing && onOpen(g.id)}
      {...attributes}
      {...listeners}
    >
      <div className="goal-top">
        <div className="goal-title">
          <span>{g.emoji || "🎯"}</span>
          <span>{g.title || t("common.untitled")}</span>
        </div>
        <div className="goal-actions" onClick={stop} onPointerDown={stop}>
          <button
            className="icon-btn"
            title={g.done ? t("goals.reopen") : t("goals.complete")}
            onClick={() =>
              onPatch(g.id, {
                done: !g.done,
                progress: g.done ? g.progress : 100,
              })
            }
          >
            <Check
              size={16}
              style={{ color: g.done ? "var(--accent)" : "inherit" }}
            />
          </button>
          <button
            className="icon-btn"
            title={t("common.more")}
            onClick={() => onMenu(menuOpen ? null : g.id)}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-backdrop" onClick={() => onMenu(null)} />
              <div className="card-menu">
                <button
                  onClick={() => {
                    onToggleEdit(g.id);
                    onMenu(null);
                  }}
                >
                  <Pencil size={14} />{" "}
                  {isEditing ? t("goals.exitEdit") : t("goals.editDesc")}
                </button>
                <button className="danger" onClick={() => onUnmark(g.id)}>
                  <Trash2 size={14} /> {t("goals.removeFromGoals")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <>
          <textarea
            className="field"
            rows={4}
            autoFocus
            placeholder={t("goals.descPlaceholder")}
            value={g.content || ""}
            onClick={stop}
            onPointerDown={stop}
            onChange={(e) => onPatch(g.id, { content: e.target.value })}
          />
          <div className="goal-slider-row" onClick={stop} onPointerDown={stop}>
            <input
              className="range"
              type="range"
              min="0"
              max="100"
              value={g.progress || 0}
              onChange={(e) =>
                onPatch(g.id, {
                  progress: Number(e.target.value),
                  done: Number(e.target.value) === 100,
                })
              }
            />
            <span className="goal-meta">{g.progress || 0}%</span>
          </div>
          <button
            className="btn-text"
            onClick={(e) => {
              stop(e);
              onToggleEdit(null);
            }}
          >
            {t("goals.finishEditing")}
          </button>
        </>
      ) : (
        <>
          {g.content ? (
            <div
              className="goal-desc"
              dangerouslySetInnerHTML={{ __html: marked.parse(g.content) }}
            />
          ) : (
            <div className="goal-desc empty">
              {t("goals.noDesc")}
            </div>
          )}
          <div className="goal-foot">
            <div className="goal-meta">{t("goals.percentDone", { n: g.progress || 0 })}</div>
            <div className="progress">
              <span style={{ width: `${g.progress || 0}%` }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Goals() {
  const navigate = useNavigate();
  const { t } = useLang();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 100, tolerance: 2 },
    }),
  );

  const refresh = () =>
    notesApi
      .listGoals()
      .then((g) => {
        setGoals(g);
        setError(null);
      })
      .catch((e) => {
        console.error("[NOVA] erro ao carregar objetivos:", e);
        setError(e.message || String(e));
      })
      .finally(() => setLoading(false));
  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    const note = await notesApi.create({
      is_goal: true,
      emoji: "🎯",
      title: t("goals.newGoal"),
      position: goals.length,
    });
    navigate(`/note/${note.id}`);
  };
  const patch = async (id, p) => {
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
    await notesApi.update(id, p);
  };
  const unmark = async (id) => {
    setMenu(null);
    await notesApi.update(id, { is_goal: false });
    refresh();
  };
  const toggleEdit = (id) => setEditing((cur) => (cur === id ? null : id));

  const onDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldI = goals.findIndex((g) => g.id === active.id);
    const newI = goals.findIndex((g) => g.id === over.id);
    const reordered = arrayMove(goals, oldI, newI);
    setGoals(reordered);
    // persiste a nova ordem (position = índice)
    await Promise.all(
      reordered.map((g, i) =>
        g.position === i ? null : notesApi.update(g.id, { position: i }),
      ),
    );
  };

  return (
    <div className="panel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div className="panel-title">{t("nav.goals")}</div>
          <div className="panel-sub">
            {t("goals.sub")}
          </div>
        </div>
        <button className="btn-primary" onClick={add}>
          <Plus size={16} style={{ verticalAlign: "middle" }} /> {t("common.new")}
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{ borderColor: "var(--accent)", marginBottom: 18 }}
        >
          <strong>{t("goals.loadFail")}</strong>
          <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 6 }}>
            {error}
          </p>
          <p
            style={{ color: "var(--text-faint)", fontSize: 12.5, marginTop: 8 }}
          >
            {t("goals.errHint1")}{" "}
            <code>supabase_schema.sql</code> {t("goals.errHint2")}{" "}
            <code>is_goal</code>, <code>progress</code>, <code>done</code>,{" "}
            <code>position</code> {t("goals.errHint3")} <code>notes</code>{t("goals.errHint4")}
          </p>
        </div>
      )}

      {loading ? (
        <div className="goals-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              className="card goal-card skeleton-card"
              key={i}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="sk sk-title" />
              <div className="sk sk-line" />
              <div className="sk sk-line" />
              <div className="sk sk-line short" />
              <div className="goal-foot">
                <div className="sk sk-bar" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? null : goals.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>
          {t("goals.empty")}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={goals.map((g) => g.id)}
            strategy={rectSortingStrategy}
          >
            <div className="goals-grid fade-in">
              {goals.map((g) => (
                <GoalCard
                  key={g.id}
                  g={g}
                  isEditing={editing === g.id}
                  menuOpen={menu === g.id}
                  onMenu={setMenu}
                  onPatch={patch}
                  onUnmark={unmark}
                  onToggleEdit={toggleEdit}
                  onOpen={(id) => navigate(`/note/${id}`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
