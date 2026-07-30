import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ArrowRight, Target, CalendarCheck, Mic, Loader2 } from "lucide-react";
import JarvisCore from "../components/JarvisCore";
import VoiceCore from "../components/VoiceCore";
import { habitsApi, notesApi } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LanguageContext";
import { transcribe, generateNote } from "../lib/ai";
import { setVoiceLevel, setVoiceActive } from "../lib/voiceLevel";
import { triggerStarSpin } from "../lib/warp";
import { setCoreSpin, setCoreCollapse } from "../lib/coreSpin";

function greeting(t) {
  const h = new Date().getHours();
  if (h < 6) return t("home.greetEarly");
  if (h < 12) return t("home.greetMorning");
  if (h < 18) return t("home.greetAfternoon");
  return t("home.greetEvening");
}

const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// mesmos parâmetros da cena (JarvisCore) para os ícones orbitarem igual
const INCL = 0.35;
const GALAXY_SPEED = 0.13;

export default function Home({
  onNewNote,
  onRefresh,
  pendingVoice,
  onVoiceConsumed,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLang();
  const firstName = (
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    ""
  ).split(" ")[0];
  const overlay = useRef(null);
  const homeRef = useRef(null);
  const orbitRef = useRef(null);
  const voiceRef = useRef(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  // flags de órbita (lidas pelo loop a cada frame)
  const habitOrbiting = useRef(true);
  const voiceOrbiting = useRef(true);

  const [clock, setClock] = useState("");
  const [habits, setHabits] = useState([]);
  const [open, setOpen] = useState(false);
  const [recState, setRecState] = useState("idle"); // idle | connecting | recording | processing
  const [closing, setClosing] = useState(false); // holograma fechando no fim
  const [voiceErr, setVoiceErr] = useState("");
  const media = useRef(null); // { stream, recorder, audioCtx, ampRaf }

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    habitsApi
      .list()
      .then(setHabits)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ delay: 0.3 })
        .to(".home-clock", { opacity: 1, duration: 0.8 })
        .to(".home-hello", { opacity: 1, y: 0, duration: 0.8 }, "-=0.4")
        .fromTo(
          ".home-title",
          { y: 24, opacity: 0 },
          { y: 0, opacity: 1, duration: 1, ease: "power3.out" },
          "-=0.3",
        )
        .to(".home-sub", { opacity: 1, duration: 0.8 }, "-=0.5")
        .to(".home-actions", { opacity: 1, y: 0, duration: 0.1 }, "-=0.4");
    }, overlay);
    return () => ctx.revert();
  }, []);

  // posição na órbita (mesma matemática da galáxia). phase desloca o ângulo.
  const computePos = (phase = 0) => {
    const home = homeRef.current;
    if (!home) return { x: 0, y: 0, scale: 1 };
    const W = home.clientWidth;
    const H = home.clientHeight;
    const maxR = Math.min(W, H) * 0.45;
    const rr = maxR * 0.82;
    const focal = maxR * 2.4;
    const cx = W / 2;
    const cy = H / 2 - 20 - (W <= 760 ? H * 0.06 : 0);
    const spin =
      (GALAXY_SPEED * tRef.current) / Math.max(0.4, rr / (maxR * 0.5)) + phase;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    const rx = rr * cs;
    const rz = -rr * sn;
    const y2 = -rz * Math.sin(INCL);
    const z2 = rz * Math.cos(INCL);
    const scale = focal / (focal + z2);
    return {
      x: cx + rx * scale - 24,
      y: cy + y2 * scale - 24,
      scale: 0.27 + scale * 0.63,
    };
  };

  // loop único: avança o tempo e posiciona cada ícone que estiver em órbita
  useEffect(() => {
    const loop = () => {
      if (homeRef.current) {
        tRef.current += 0.016;
        if (habitOrbiting.current && orbitRef.current) {
          const p = computePos(0);
          gsap.set(orbitRef.current, {
            x: p.x,
            y: p.y,
            scale: p.scale,
            opacity: 1,
          });
        }
        if (voiceOrbiting.current && voiceRef.current) {
          const p = computePos(Math.PI); // lado oposto da órbita
          gsap.set(voiceRef.current, {
            x: p.x,
            y: p.y,
            scale: p.scale,
            opacity: 1,
          });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- menu de hábitos (ícone que voa pro topo) ---------------- */
  const openMenu = () => {
    habitOrbiting.current = false;
    const el = orbitRef.current;
    setOpen(true);
    requestAnimationFrame(() => {
      const parent = el.offsetParent || homeRef.current;
      const pr = parent.getBoundingClientRect();
      const menuW = el.offsetWidth || 196;
      const burger = document.querySelector(".burger");
      const topY =
        burger && burger.getClientRects().length
          ? burger.getBoundingClientRect().top
          : 16;
      const tx = window.innerWidth - menuW - 16 - pr.left;
      const ty = topY - pr.top;
      gsap.to(el, {
        x: tx,
        y: ty,
        scale: 1,
        opacity: 1,
        duration: 0.5,
        ease: "power3.out",
      });
    });
  };

  const closeMenu = () => {
    const el = orbitRef.current;
    gsap.to(el, {
      scale: 0.5,
      opacity: 0.5,
      duration: 0.15,
      ease: "power2.in",
      onComplete: () => {
        setOpen(false);
        requestAnimationFrame(() => {
          const p = computePos(0);
          gsap.to(el, {
            x: p.x,
            y: p.y,
            scale: p.scale,
            opacity: 1,
            duration: 0.45,
            ease: "power3.out",
            onComplete: () => {
              habitOrbiting.current = true;
            },
          });
        });
      },
    });
  };

  const done = (h) => !!(h.log || {})[todayKey()];
  const toggleToday = (h) => {
    const k = todayKey();
    const log = { ...(h.log || {}) };
    if (log[k]) delete log[k];
    else log[k] = true;
    setHabits((hs) => hs.map((x) => (x.id === h.id ? { ...x, log } : x)));
    habitsApi.update(h.id, { log });
  };

  /* ---------------- gravação de voz (ícone que voa pro canto) ----------------
     O voo usa TRANSIÇÃO CSS (transform), que roda na thread de composição.
     Assim, mesmo quando o getUserMedia congela a thread principal ao conectar
     o microfone, o ícone continua deslizando até o canto e o loader segue girando. */
  const setFlyTransition = (on) => {
    const el = voiceRef.current;
    if (el)
      el.style.transition = on
        ? "transform 0.55s cubic-bezier(0.22,1,0.36,1)"
        : "none";
  };
  // mode: 'core' (núcleo grande, gravando) | 'loader' (spinner pequeno) -> margem menor
  const flyVoiceToCorner = (mode = "loader") => {
    const el = voiceRef.current;
    if (!el) return;
    const parent = el.offsetParent || homeRef.current;
    const pr = parent.getBoundingClientRect();
    const w = el.offsetWidth || 50;
    const h = el.offsetHeight || 50;
    const isMobile = window.innerWidth <= 760;
    let mx, my;
    if (mode === "core") {
      // o núcleo transborda o botão; margem maior pra o espaço VISUAL ficar certo
      const coreSize = isMobile ? 44 : 88;
      const overflow = Math.max(0, (coreSize - h) / 2);
      const visual = isMobile ? 24 : 34;
      mx = overflow + visual;
      my = overflow + (isMobile ? 40 : visual);
    } else {
      // loader pequeno: bem perto do canto
      mx = isMobile ? 16 : 22;
      my = isMobile ? 34 : 22;
    }
    const tx = window.innerWidth - mx - w - pr.left;
    const ty = window.innerHeight - my - h - pr.top;
    setFlyTransition(true);
    void el.offsetWidth; // garante que o estado atual foi registrado antes da transição
    el.style.transform = `translate(${tx}px, ${ty}px) scale(1)`;
    el.style.opacity = "1";
  };

  // reposiciona conforme o estado: gravando (núcleo grande) fica mais pra dentro;
  // conectando/processando (loader pequeno) encosta no canto.
  useEffect(() => {
    if (recState === "recording") flyVoiceToCorner("core");
    else if (recState === "connecting" || recState === "processing")
      flyVoiceToCorner("loader");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState]);

  // core: acelera a rotação no carregar; ao fechar, acelera + implode pro centro
  useEffect(() => {
    if (closing) {
      setCoreSpin(10);
      setCoreCollapse(1);
    } else if (recState === "processing") {
      setCoreSpin(3);
      setCoreCollapse(0);
    } else {
      setCoreSpin(1);
      setCoreCollapse(0);
    }
    return () => {
      setCoreSpin(1);
      setCoreCollapse(0);
    };
  }, [recState, closing]);

  // some com o ícone de hábito enquanto a voz está ativa
  useEffect(() => {
    const el = orbitRef.current;
    if (!el) return;
    if (recState !== "idle") {
      habitOrbiting.current = false;
      el.style.pointerEvents = "none";
      gsap.to(el, { opacity: 0, duration: 0.3, ease: "power2.out" });
    } else if (!open) {
      el.style.pointerEvents = "";
      habitOrbiting.current = true; // o loop volta a posicionar e mostrar (opacity 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recState]);
  const flyVoiceBack = () => {
    const el = voiceRef.current;
    if (!el) return;
    const p = computePos(Math.PI);
    setFlyTransition(true);
    el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
    setTimeout(() => {
      setFlyTransition(false); // devolve o controle pro loop de órbita
      voiceOrbiting.current = true;
    }, 580);
  };

  const finishRecording = async (chunks, type) => {
    // clicar no core durante a gravação cancela (não cria nota)
    if (media.current?.cancelled) {
      media.current = null;
      setRecState("idle");
      flyVoiceBack();
      return;
    }
    setRecState("processing");
    try {
      const blob = new Blob(chunks, { type: type || "audio/webm" });
      const text = await transcribe(blob);
      if (!text) throw new Error(t("voice.notUnderstood"));
      const { content, title, emoji } = await generateNote(text, true);
      const note = await notesApi.create({
        content: content || text,
        title: title || t("home.voiceNote"),
        emoji: emoji || "🎙️",
      });
      onRefresh?.();
      media.current = null;
      // implode o core pro centro (~0.3s) e entra na nota
      setClosing(true);
      await new Promise((r) => setTimeout(r, 300));
      triggerStarSpin(); // giro lento das estrelas ao entrar na nova página
      navigate(`/note/${note.id}`);
    } catch (e) {
      setVoiceErr(e.message || t("home.audioProcessFail"));
      setRecState("idle");
      media.current = null;
      flyVoiceBack();
    }
  };

  const startRecording = async () => {
    setVoiceErr("");
    voiceOrbiting.current = false;
    setRecState("connecting"); // loader (CSS) gira enquanto conecta
    // dispara o voo pro canto via CSS e espera 2 frames pra a transição
    // ser commitada na composição ANTES da chamada que congela a thread.
    flyVoiceToCorner();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceErr(t("voice.micAccessFail"));
      setRecState("idle");
      flyVoiceBack();
      return;
    }
    const mime =
      ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"].find(
        (m) => window.MediaRecorder?.isTypeSupported?.(m),
      ) || "";
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    );
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => finishRecording(chunks, recorder.mimeType || mime);

    // analisador para alimentar a vibração das partículas
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    setVoiceActive(true);
    const SPEAK = 0.04; // limiar de fala
    const SILENCE_MS = 2000; // para sozinho após esse silêncio (depois de falar)
    const MAX_MS = 60000; // trava de segurança
    const tickAmp = () => {
      const m = media.current;
      if (!m) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setVoiceLevel(Math.min(1, rms * 6)); // mais sensível

      const now = performance.now();
      if (rms > SPEAK) {
        m.lastSound = now;
        m.spoke = true;
      }
      // para automaticamente: já falou e ficou em silêncio, ou estourou o tempo
      if (
        (m.spoke && now - m.lastSound > SILENCE_MS) ||
        now - m.started > MAX_MS
      ) {
        stopRecording();
        return;
      }
      m.ampRaf = requestAnimationFrame(tickAmp);
    };

    media.current = {
      stream,
      recorder,
      audioCtx,
      ampRaf: 0,
      started: performance.now(),
      lastSound: performance.now(),
      spoke: false,
    };
    tickAmp();
    recorder.start();
    setRecState("recording");
  };

  const stopRecording = () => {
    const m = media.current;
    if (!m) return;
    setVoiceActive(false);
    cancelAnimationFrame(m.ampRaf);
    try {
      m.recorder.state !== "inactive" && m.recorder.stop();
    } catch {}
    m.stream.getTracks().forEach((t) => t.stop());
    try {
      m.audioCtx.close();
    } catch {}
  };

  // clicar no core enquanto grava CANCELA (a parada por silêncio é que cria a nota)
  const cancelRecording = () => {
    const m = media.current;
    if (!m) return;
    m.cancelled = true;
    setVoiceActive(false);
    cancelAnimationFrame(m.ampRaf);
    try {
      m.recorder.state !== "inactive" && m.recorder.stop();
    } catch {}
    m.stream.getTracks().forEach((t) => t.stop());
    try {
      m.audioCtx.close();
    } catch {}
  };

  const onVoiceClick = () => {
    if (recState === "idle") startRecording();
    else if (recState === "recording") cancelRecording();
    // connecting / processing: ignora cliques
  };

  // atalho global (Cmd/Ctrl+J): App navega pra Home e sinaliza pra gravar
  useEffect(() => {
    if (pendingVoice) {
      onVoiceConsumed?.();
      if (recState === "idle") startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVoice]);

  // limpeza ao desmontar
  useEffect(() => {
    return () => {
      const m = media.current;
      if (m) {
        setVoiceActive(false);
        cancelAnimationFrame(m.ampRaf);
        try {
          m.recorder.state !== "inactive" && m.recorder.stop();
        } catch {}
        m.stream?.getTracks().forEach((t) => t.stop());
        try {
          m.audioCtx?.close();
        } catch {}
      }
    };
  }, []);

  return (
    <div
      className={
        "home" +
        (recState !== "idle" ? " voice-active" : "") +
        (recState === "processing" && !closing ? " home-loading" : "") +
        (closing ? " home-implode" : "")
      }
      ref={homeRef}
    >
      <JarvisCore />
      <div className="home-clock">{clock}</div>

      {open && <div className="orbit-backdrop" onClick={closeMenu} />}

      {/* ícone de hábitos do dia */}
      <div className={"habit-orbit" + (open ? " open" : "")} ref={orbitRef}>
        {!open ? (
          <button
            className="orbit-icon"
            onClick={openMenu}
            title={t("home.todayHabits")}
          >
            <CalendarCheck size={20} />
          </button>
        ) : (
          <div className="orbit-menu">
            <button className="orbit-menu-head" onClick={closeMenu}>
              <CalendarCheck size={15} /> {t("home.today")}
            </button>
            <div className="orbit-habits">
              {habits.length ? (
                habits.map((h) => (
                  <label className="orbit-habit" key={h.id}>
                    <span>{h.name}</span>
                    <input
                      type="checkbox"
                      checked={done(h)}
                      onChange={() => toggleToday(h)}
                    />
                  </label>
                ))
              ) : (
                <div className="orbit-empty">{t("home.noHabits")}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ícone de voz: grava e gera uma nota */}
      <div className="voice-orbit" ref={voiceRef}>
        <button
          className={"voice-btn " + recState}
          onClick={onVoiceClick}
          disabled={recState === "processing" || recState === "connecting"}
          title={
            recState === "recording"
              ? t("home.voiceRecording")
              : recState === "connecting"
                ? t("home.voiceConnecting")
                : recState === "processing"
                  ? t("home.voiceProcessing")
                  : t("home.voiceIdle")
          }
        >
          {recState === "recording" ? (
            <VoiceCore />
          ) : recState === "connecting" || recState === "processing" ? (
            <Loader2 size={20} className="voice-spin" />
          ) : (
            <Mic size={20} />
          )}
        </button>
      </div>

      {voiceErr && (
        <div className="voice-err">
          <span>{voiceErr}</span>
          <button onClick={() => setVoiceErr("")} aria-label={t("common.close")}>
            ×
          </button>
        </div>
      )}

      <div className="home-overlay" ref={overlay}>
        <div className="home-hello">
          {greeting(t)}
          {firstName ? `, ${firstName}` : ""}
        </div>
        <h1 className="home-title glitch" data-text="NOVA">NOVA</h1>
        <p className="home-sub">{t("home.sub")}</p>
        <div className="home-actions">
          <button className="btn-neon clear" onClick={() => navigate("/goals")}>
            <Target size={16} style={{ verticalAlign: "middle" }} />{" "}
            {t("home.myGoals")}
          </button>
          <button className="btn-neon outline" onClick={onNewNote}>
            {t("nav.newNote")}{" "}
            <ArrowRight size={16} style={{ verticalAlign: "middle" }} />
          </button>
        </div>
      </div>
    </div>
  );
}
