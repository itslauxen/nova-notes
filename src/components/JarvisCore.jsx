import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { hexToHsl } from "../theme/palette";
import { getVoiceLevel } from "../lib/voiceLevel";
import { getCoreSpin, getCoreCollapse } from "../lib/coreSpin";

// Campo de partículas em <canvas> 2D, mas com matemática pseudo-3D.
// As formas são geradas no espaço 3D (centradas na origem) e ficam num disco.
// A cada frame: rotacionam no próprio eixo, recebem uma inclinação fixa (tilt)
// e são projetadas em perspectiva — então os pontos da frente ficam maiores e
// mais brilhantes, e os de trás menores e mais apagados, dando a sensação de
// uma galáxia inclinada girando pra dentro/fora da tela.
// O texto branco fica por cima, na camada da Home.

const COUNT = 3000;
const SWAP_MS = 8000;
const TAU = Math.PI * 2;
const INCL = 0.35; // inclinação do disco (~75°): quase de frente, com leve profundidade
const ROLL = 0; // leve rotação no plano da tela (eixo Z)

// Desempenho: cada fill() no canvas vira uma mensagem pro processo de GPU do
// navegador. Em vez de 3000 fills por frame, os pontos são agrupados por
// brilho (fixo por partícula) e opacidade (muda por frame) e cada grupo vira um
// único fill — ~100 por frame, com diferença de tom imperceptível.
const LUM_MIN = 55;
const LUM_RANGE = 28;
const LUM_STEPS = 8;
const ALPHA_STEPS = 24;
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const BASE_MS = 1000 / 60; // as constantes de movimento foram afinadas a 60 fps

/* ---------- geradores de formas 3D (origem no centro) ---------- */

function buildGalaxy(R) {
  const arms = 4;
  const pts = [];
  for (let i = 0; i < COUNT; i++) {
    const bulge = Math.random() < 0.18;
    const r = bulge
      ? Math.pow(Math.random(), 2) * R * 0.28
      : Math.sqrt(Math.random()) * R;
    const base = ((i % arms) / arms) * TAU;
    const twist = (r / R) * 3.2;
    const spread = (Math.random() - 0.5) * (bulge ? 1.6 : 0.5);
    const a = base + twist + spread;
    const thick = (Math.random() - 0.5) * (bulge ? R * 0.18 : R * 0.04);
    pts.push({ x: Math.cos(a) * r, y: thick, z: Math.sin(a) * r });
  }
  return pts;
}

function buildPlanetRings(R) {
  const Rp = R * 0.34;
  const pts = [];
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * 0.4) {
      // esfera (planeta)
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      const rr = Rp * Math.cbrt(Math.random());
      pts.push({
        x: rr * Math.sin(v) * Math.cos(u),
        y: rr * Math.cos(v),
        z: rr * Math.sin(v) * Math.sin(u),
      });
    } else {
      // anel no plano do disco
      const a = Math.random() * TAU;
      const rr = Rp * 1.55 + Math.random() * Rp * 1.1;
      pts.push({
        x: Math.cos(a) * rr,
        y: (Math.random() - 0.5) * R * 0.02,
        z: Math.sin(a) * rr,
      });
    }
  }
  return pts;
}

function buildAtom(R) {
  const pts = [];
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * 0.16) {
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      const rr = R * 0.12 * Math.cbrt(Math.random());
      pts.push({
        x: rr * Math.sin(v) * Math.cos(u),
        y: rr * Math.cos(v),
        z: rr * Math.sin(v) * Math.sin(u),
      });
    } else {
      // 3 órbitas circulares em planos diferentes
      const k = i % 3;
      const a = Math.random() * TAU;
      let x = Math.cos(a) * R,
        y = Math.sin(a) * R,
        z = 0;
      const phi = (k * Math.PI) / 3;
      const cy = Math.cos(phi),
        sy = Math.sin(phi);
      const ny = y * cy - z * sy;
      const nz = y * sy + z * cy;
      pts.push({ x, y: ny, z: nz });
    }
  }
  return pts;
}

// sistema solar: núcleo + órbitas concêntricas no plano do disco
function buildSolarSystem(R) {
  const radii = [0.28, 0.44, 0.6, 0.76, 0.9, 1.0].map((f) => f * R);
  const pts = [];
  for (let i = 0; i < COUNT; i++) {
    if (i < COUNT * 0.12) {
      const u = Math.random() * TAU;
      const v = Math.acos(2 * Math.random() - 1);
      const rr = R * 0.11 * Math.cbrt(Math.random());
      pts.push({
        x: rr * Math.sin(v) * Math.cos(u),
        y: rr * Math.cos(v),
        z: rr * Math.sin(v) * Math.sin(u),
      });
    } else {
      const ring = radii[i % radii.length];
      const a = Math.random() * TAU;
      const rr = ring + (Math.random() - 0.5) * R * 0.03;
      pts.push({
        x: Math.cos(a) * rr,
        y: (Math.random() - 0.5) * R * 0.02,
        z: Math.sin(a) * rr,
      });
    }
  }
  return pts;
}

// toroide (anel/donut 3D) deitado no plano do disco
function buildTorus(R) {
  const Rmaj = R * 0.66;
  const Rmin = R * 0.3;
  const pts = [];
  for (let i = 0; i < COUNT; i++) {
    const u = Math.random() * TAU;
    const v = Math.random() * TAU;
    const rr = Rmaj + Rmin * Math.cos(v);
    pts.push({
      x: rr * Math.cos(u),
      y: Rmin * Math.sin(v),
      z: rr * Math.sin(u),
    });
  }
  return pts;
}

const SCENES = [
  { gen: buildGalaxy, diff: true, speed: 0.13 },
  { gen: buildPlanetRings, diff: false, speed: 0.06 },
  { gen: buildSolarSystem, diff: true, speed: 0.14 },
  { gen: buildTorus, diff: false, speed: 0.18 },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function JarvisCore() {
  const canvasRef = useRef(null);
  const { settings } = useTheme();
  const themeRef = useRef(settings);
  useEffect(() => {
    themeRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = 0,
      H = 0,
      maxR = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: 0,
        y: 0,
        bx: 0,
        by: 0,
        bz: 0,
        phase: Math.random() * TAU,
        orbitR: 1.2 + Math.random() * 3,
        orbitSpeed: 0.4 + Math.random() * 1.1,
        size: 0.9 + Math.random() * 1.6,
        lumStep: Math.floor(Math.random() * LUM_STEPS),
        tw: Math.random() * TAU,
      });
    }

    // um balde de índices por combinação brilho × opacidade, reaproveitado a cada frame
    const buckets = Array.from({ length: LUM_STEPS * ALPHA_STEPS }, () => []);
    let styles = [];
    let stylesKey = "";


    let sceneIndex = 0;
    const applyScene = (idx, initial = false) => {
      const pts = SCENES[idx].gen(maxR);
      for (let i = 0; i < COUNT; i++) {
        particles[i].bx = pts[i].x;
        particles[i].by = pts[i].y;
        particles[i].bz = pts[i].z;
        if (initial) {
          particles[i].x = Math.random() * W;
          particles[i].y = Math.random() * H;
        }
      }
    };

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      maxR = Math.min(W, H) * 0.45; // margem lateral (a perspectiva joga pontos pra fora)
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyScene(sceneIndex);
    };

    const mouse = { x: -9999, y: -9999 };
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let userRot = 0; // rotação manual (arrasto horizontal)
    let userTilt = 0; // inclinação manual (arrasto vertical)

    // arrastar o dedo/mouse na cena gira a galáxia (e inclina no vertical)
    const onDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onMove = (e) => {
      // sempre repele perto do cursor/dedo
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      // e, se estiver arrastando, também gira/inclina a cena
      if (dragging) {
        userRot += (e.clientX - lastX) * 0.006;
        userTilt = Math.max(
          -0.5,
          Math.min(1.45, userTilt + (e.clientY - lastY) * 0.004),
        );
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const onLeave = () => {
      dragging = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    // pointerdown só na cena (não nos botões); move/up no window pra seguir o dedo
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerup", onLeave);
    window.addEventListener("pointercancel", onLeave);
    window.addEventListener("resize", resize);

    resize();
    applyScene(0, true);

    const swap = setInterval(() => {
      sceneIndex = (sceneIndex + 1) % SCENES.length;
      applyScene(sceneIndex);
    }, SWAP_MS);

    let raf = null,
      last = performance.now() - FRAME_MS,
      t = 0,
      spinMul = 1, // multiplicador da rotação natural (acelera no carregar/fechar)
      collapseCur = 0; // 0..1: puxa as partículas pro centro (implosão)
    const cosR = Math.cos(ROLL),
      sinR = Math.sin(ROLL);

    // aba escondida ou canvas fora da tela: para de desenhar
    let onScreen = true;
    const active = () => !document.hidden && onScreen;
    const wake = () => {
      if (!active() || raf !== null) return;
      last = performance.now() - FRAME_MS;
      raf = requestAnimationFrame(render);
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      wake();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", wake);

    const render = (now = performance.now()) => {
      if (!active()) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(render);
      if (now - last < FRAME_MS - 2) return;
      // k = quantos frames de 60 fps se passaram: mantém a velocidade igual a 30 fps
      const k = Math.min(3, (now - last) / BASE_MS);
      last = now;
      const follow = 1 - Math.pow(0.9, k);

      // acelera a rotação natural quando pedido (carregar/fechar holograma)
      spinMul += (getCoreSpin() - spinMul) * (1 - Math.pow(0.92, k));
      // colapso: ease rápido em direção ao alvo (implosão pro centro)
      collapseCur += (getCoreCollapse() - collapseCur) * (1 - Math.pow(0.84, k));
      if (!dragging) t += 0.016 * spinMul * k; // pausa o giro automático enquanto o dedo controla
      ctx.clearRect(0, 0, W, H);
      // amplitude da voz (0..1) -> faz a galáxia reagir como uma onda sonora
      const amp = getVoiceLevel();
      const pulse = 1 + amp * 0.2; // leve expansão radial conforme o volume
      // inclinação = base + ajuste manual (arrasto vertical)
      const cosI = Math.cos(INCL + userTilt);
      const sinI = Math.sin(INCL + userTilt);

      const { color, mode } = themeRef.current;
      const { h, s } = hexToHsl(color);
      const sat = Math.min(95, Math.max(45, s));
      const cx = W / 2,
        // no mobile sobe o centro da cena junto com o texto/órbita
        cy = H / 2 - 20 - (W <= 760 ? H * 0.06 : 0);
      const scene = SCENES[sceneIndex];
      const focal = maxR * 2.4;

      const key = `${h}|${sat}|${mode}`;
      if (key !== stylesKey) {
        stylesKey = key;
        styles = buckets.map((_, b) => {
          const step = Math.floor(b / ALPHA_STEPS);
          const lum = LUM_MIN + (step / (LUM_STEPS - 1)) * LUM_RANGE - (mode === "light" ? 18 : 0);
          const alpha = (b % ALPHA_STEPS) / (ALPHA_STEPS - 1);
          return `hsl(${h} ${sat}% ${lum}% / ${alpha})`;
        });
      }
      for (const bucket of buckets) bucket.length = 0;

      for (let i = 0; i < COUNT; i++) {
        const p = particles[i];

        // rotação em torno do eixo Y (eixo do disco)
        const rad = Math.hypot(p.bx, p.bz);
        const spin =
          (scene.diff
            ? (scene.speed * t) / Math.max(0.4, rad / (maxR * 0.5))
            : scene.speed * t) + userRot;
        const cs = Math.cos(spin),
          sn = Math.sin(spin);
        // a voz expande o disco radialmente (respiração)
        const rx = (p.bx * cs + p.bz * sn) * pulse;
        const rz = (-p.bx * sn + p.bz * cs) * pulse;
        const ry = p.by * pulse;

        // inclinação do disco (tilt em torno de X)
        const y2 = ry * cosI - rz * sinI;
        const z2 = ry * sinI + rz * cosI;

        // leve roll no plano da tela (inclinação no eixo Z)
        const px = rx * cosR - y2 * sinR;
        const py = rx * sinR + y2 * cosR;

        // projeção em perspectiva
        const scale = focal / (focal + z2);
        const sx = cx + px * scale;
        const sy = cy + py * scale;

        // easing até o alvo projetado (dá o movimento fluido)
        p.x += (sx - p.x) * follow;
        p.y += (sy - p.y) * follow;

        // repulsão do mouse
        const mdx = p.x - mouse.x,
          mdy = p.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < 9000) {
          const f = (9000 - md2) / 9000;
          const d = Math.sqrt(md2) || 1;
          p.x += (mdx / d) * f * 6 * k;
          p.y += (mdy / d) * f * 6 * k;
        }

        // órbita local (nunca fica 100% parado)
        const ox = Math.cos(t * p.orbitSpeed + p.phase) * p.orbitR;
        let oy = Math.sin(t * p.orbitSpeed + p.phase) * p.orbitR;

        // onda sonora: ondulação VERTICAL grande e suave conforme a voz.
        // baseada na posição x -> pontos vizinhos sobem/descem juntos
        // (uns pra cima, outros pra baixo); baixa frequência = movimento fluido.
        if (amp) {
          const A = maxR * 0.32; // amplitude grande/perceptível
          // centro se move mais que as bordas (rad = distância do centro do disco)
          const centerW = 1 - 0.6 * Math.min(1, rad / maxR);
          const waveY =
            A *
            amp *
            centerW *
            (0.62 * Math.sin(p.x * 0.009 + t * 1.2) +
              0.38 * Math.sin(p.x * 0.02 - t * 0.8 + p.phase * 0.5));
          oy += waveY;
        }

        // profundidade -> tamanho e brilho (frente brilha, trás apaga)
        const depth = clamp((scale - 0.7) / 1.0, 0, 1);
        const size = p.size * (0.5 + depth * 1.1) * (1 + amp * 1.2);
        const alpha =
          (0.28 + depth * 0.62) *
          (0.75 + Math.sin(t * 1.6 + p.tw) * 0.25) *
          (1 + amp * 0.6);
        // colapso: puxa o ponto pro centro e some (implosão)
        let drawX = p.x + ox,
          drawY = p.y + oy;
        let aMul = 1;
        if (collapseCur > 0.001) {
          const posC = Math.min(1, collapseCur * 1.6); // posição vai mais rápido
          drawX += (cx - drawX) * posC;
          drawY += (cy - drawY) * posC;
          // opacidade some rápido: chega a 0 lá pela metade do colapso
          aMul = Math.max(0, 1 - collapseCur * 1.9);
        }
        const alphaStep = Math.round(clamp(alpha * aMul, 0, 1) * (ALPHA_STEPS - 1));
        if (alphaStep === 0) continue;
        p.drawX = drawX;
        p.drawY = drawY;
        p.drawR = Math.max(0.4, size);
        buckets[p.lumStep * ALPHA_STEPS + alphaStep].push(i);
      }

      for (let b = 0; b < buckets.length; b++) {
        const bucket = buckets[b];
        if (!bucket.length) continue;
        ctx.fillStyle = styles[b];
        ctx.beginPath();
        for (const i of bucket) {
          const p = particles[i];
          ctx.moveTo(p.drawX + p.drawR, p.drawY);
          ctx.arc(p.drawX, p.drawY, p.drawR, 0, TAU);
        }
        ctx.fill();
      }
    };
    render();

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
      clearInterval(swap);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerup", onLeave);
      window.removeEventListener("pointercancel", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, display: "block" }}
    />
  );
}
