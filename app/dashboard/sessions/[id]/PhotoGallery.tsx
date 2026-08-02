"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { renderTriangleWarp, computeWarpDst, applyNeckTreatment, getFaceLandmarker } from "./warpEngine";

type Photo = {
  id: string;
  url: string | null;
  view_type: string | null;
  storage_path: string;
  landmarks?: unknown;
  cervicomental_angle?: number | null;
  interpupilar_angle?: number | null;
  asymmetry_pct?: number | null;
  brow_izq_angle?: number | null;
  brow_der_angle?: number | null;
  manual_nasofacial_angle?: number | null;
  manual_nasolabial_angle?: number | null;
  manual_mentolabial_angle?: number | null;
  flacidez_index?: number | null;
  ptosis_px?: number | null;
  simetria_pct?: number | null;
  rugosidad_contraste?: number | null;
};

const LATERAL_VIEWS = ["lateral_izq", "lateral_der"];

// Índices de los contornos oficiales de ceja (topología MediaPipe de 468 puntos)
const LEFT_BROW = [276, 283, 282, 295, 285, 293, 334, 296, 336];
const RIGHT_BROW = [46, 53, 52, 65, 55, 63, 105, 66, 107];

const VIEW_LABELS: Record<string, string> = {
  frontal: "Frontal",
  lateral_izq: "Lateral izquierda",
  lateral_der: "Lateral derecha",
  oblicua_izq: "Oblicua izquierda",
  oblicua_der: "Oblicua derecha",
};

type ManualAngleKey =
  | "nasofacial"
  | "nasolabial"
  | "mentolabial"
  | "cervicomental";

const MANUAL_ANGLE_TYPES: {
  value: ManualAngleKey;
  label: string;
  column: string;
  hint: string;
}[] = [
  {
    value: "nasofacial",
    label: "Nasofacial",
    column: "manual_nasofacial_angle",
    hint: "Clic 1: glabela — el punto más prominente entre las cejas, en la línea media de la frente, justo encima de la raíz nasal. Clic 2: punta nasal — el punto más proyectado hacia delante de la nariz.",
  },
  {
    value: "nasolabial",
    label: "Nasolabial",
    column: "manual_nasolabial_angle",
    hint: "Clic 1: base de la columela — el punto donde la columela (la tira de piel entre las fosas nasales) se une al labio superior. Clic 2: borde del bermellón superior — el borde donde termina la piel y empieza la parte roja/mucosa del labio superior.",
  },
  {
    value: "mentolabial",
    label: "Mentolabial",
    column: "manual_mentolabial_angle",
    hint: "Clic 1: punto más profundo del labio inferior (el surco entre el labio inferior y el mentón, en su parte más hundida). Clic 2: pogonion — el punto más anterior (más hacia delante) del mentón.",
  },
  {
    value: "cervicomental",
    label: "Cervicomental",
    column: "cervicomental_angle",
    hint: "Clic 1: punto submentoniano — justo debajo del mentón, donde empieza a curvarse hacia el cuello. Clic 2: punto cervical anterior — el punto más hundido de la unión entre la papada/cuello y la garganta.",
  },
];

const MANUAL_LIMITATION_NOTE =
  "⚠ Limitación: estos 2 clics calculan el ángulo agudo entre la línea trazada y la horizontal, no el ángulo anatómico clásico de la literatura (que a veces necesita 3 puntos). Úsalo como guía comparativa entre sesiones, no como medida cefalométrica de precisión.";

type IndexMode =
  | "flac-mand"
  | "flac-comis"
  | "ptosis"
  | "sim-left"
  | "sim-right"
  | "frontal-cerv"
  | "frontal-ceja"
  | "frontal-pupil"
  | null;

type Pt = { x: number; y: number };


// ── GLCM (rugosidad) — puerto fiel de computeGLCMFeatures() del HTML original ──
function computeGLCMFeatures(imageData: ImageData, levels = 16, distance = 1) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const grayVal = Math.floor(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[i / 4] = Math.floor((grayVal * (levels - 1)) / 255);
  }
  const glcm: number[][] = [];
  for (let gi = 0; gi < levels; gi++) glcm.push(new Array(levels).fill(0));
  let totalPairs = 0;
  const DIRS = [
    { dx: distance, dy: 0 },
    { dx: distance, dy: distance },
    { dx: 0, dy: distance },
    { dx: -distance, dy: distance },
  ];
  for (const { dx, dy } of DIRS) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x2 = x + dx;
        const y2 = y + dy;
        if (x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
          const g1 = gray[y * width + x];
          const g2 = gray[y2 * width + x2];
          glcm[g1][g2]++;
          glcm[g2][g1]++;
          totalPairs += 2;
        }
      }
    }
  }
  for (let a = 0; a < levels; a++)
    for (let b = 0; b < levels; b++) glcm[a][b] /= totalPairs;

  let contrast = 0, entropy = 0, energy = 0, homogeneity = 0;
  for (let a = 0; a < levels; a++) {
    for (let b = 0; b < levels; b++) {
      const p = glcm[a][b];
      const diff = a - b;
      contrast += diff * diff * p;
      homogeneity += p / (1 + Math.abs(diff));
      if (p > 0) entropy -= p * Math.log2(p);
      energy += p * p;
    }
  }
  return {
    contrast: Number(contrast.toFixed(2)),
    homogeneity: Number(homogeneity.toFixed(3)),
    entropy: Number(entropy.toFixed(3)),
    energy: Number(energy.toFixed(4)),
  };
}

function PhotoCard({
  photo,
  canDelete,
}: {
  photo: Photo;
  canDelete: boolean;
}) {
  const isLateral = LATERAL_VIEWS.includes(photo.view_type ?? "");
  const isFrontal = photo.view_type === "frontal";

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uvCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const idxWrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [uvApplied, setUvApplied] = useState(false);
  const warpCanvasRef = useRef<HTMLCanvasElement>(null);
  const [warpApplied, setWarpApplied] = useState(false);
  const [warpIntensity, setWarpIntensity] = useState(0);
  const [warpNeck, setWarpNeck] = useState(false);
  const [warpError, setWarpError] = useState<string | null>(null);

  // ── MediaPipe (frontal) ──
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(
    (photo.landmarks as { x: number; y: number }[] | undefined) ?? null
  );
  const [frankfurtOn, setFrankfurtOn] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    photo.landmarks ? "done" : "idle"
  );
  const [angle, setAngle] = useState<number | null>(
    photo.cervicomental_angle ?? null
  );
  const [interpupilar, setInterpupilar] = useState<number | null>(
    photo.interpupilar_angle ?? null
  );
  const [asymmetry, setAsymmetry] = useState<number | null>(
    photo.asymmetry_pct ?? null
  );
  const [browIzq, setBrowIzq] = useState<number | null>(
    photo.brow_izq_angle ?? null
  );
  const [browDer, setBrowDer] = useState<number | null>(
    photo.brow_der_angle ?? null
  );

  // ── Medición manual (lateral) ──
  const [angleType, setAngleType] = useState<ManualAngleKey>("nasofacial");
  const [points, setPoints] = useState<Pt[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualValues, setManualValues] = useState<
    Record<ManualAngleKey, number | null>
  >({
    nasofacial: photo.manual_nasofacial_angle ?? null,
    nasolabial: photo.manual_nasolabial_angle ?? null,
    mentolabial: photo.manual_mentolabial_angle ?? null,
    cervicomental: photo.cervicomental_angle ?? null,
  });

  // ── Índices avanzados (frontal): flacidez, ptosis, simetría, rugosidad ──
  const [indexMode, setIndexMode] = useState<IndexMode>(null);
  const [flacPts, setFlacPts] = useState<{ mand: Pt[]; comis: Pt[] }>({ mand: [], comis: [] });
  const [frontalAnglePts, setFrontalAnglePts] = useState<Pt[]>([]);
  const [frontalAngleHistory, setFrontalAngleHistory] = useState<Record<"cerv" | "ceja" | "pupil", number[]>>({
    cerv: [],
    ceja: [],
    pupil: [],
  });
  const [ptosisPts, setPtosisPts] = useState<Pt[]>([]);
  const [simPts, setSimPts] = useState<{ l: Pt[]; r: Pt[] }>({ l: [], r: [] });
  const [flacRes, setFlacRes] = useState<{ idx: number; label: string } | null>(
    photo.flacidez_index != null
      ? { idx: photo.flacidez_index, label: photo.flacidez_index >= 1.2 ? "Normal (>1.2)" : "Flacidez (<1.2)" }
      : null
  );
  const [ptosisRes, setPtosisRes] = useState<{ px: number; label: string } | null>(
    photo.ptosis_px != null
      ? {
          px: photo.ptosis_px,
          label:
            photo.ptosis_px < 30
              ? "Compatible con ptosis (MRD1 reducido)"
              : photo.ptosis_px < 80
              ? "Dentro de rango normal"
              : "Posible retracción palpebral",
        }
      : null
  );
  const [simRes, setSimRes] = useState<{ pct: number; label: string } | null>(
    photo.simetria_pct != null
      ? {
          pct: photo.simetria_pct,
          label:
            photo.simetria_pct >= 85
              ? "Aceptable"
              : photo.simetria_pct >= 75
              ? "Leve asimetría"
              : "Asimetría significativa",
        }
      : null
  );
  const [rugoRes, setRugoRes] = useState<{
    contrast: number;
    homogeneity: number;
    entropy: number;
    energy: number;
    label: string;
  } | null>(
    photo.rugosidad_contraste != null
      ? {
          contrast: photo.rugosidad_contraste,
          homogeneity: 0,
          entropy: 0,
          energy: 0,
          label:
            photo.rugosidad_contraste > 180
              ? "Alta rugosidad / textura irregular"
              : photo.rugosidad_contraste > 90
              ? "Rugosidad moderada"
              : "Textura suave / baja rugosidad",
        }
      : null
  );
  const [rugoLoading, setRugoLoading] = useState(false);
  const [indexSaving, setIndexSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (landmarksRef.current) drawLandmarks(landmarksRef.current, frankfurtOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frankfurtOn]);

  async function handleDelete() {
    if (!confirm("¿Borrar esta foto? No se puede deshacer.")) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      await supabase.storage.from("session-photos").remove([photo.storage_path]);
      const { error } = await supabase
        .from("session_photos")
        .delete()
        .eq("id", photo.id);
      if (error) throw error;
      router.refresh();
    } catch (e: any) {
      setErrorMsg(e.message ?? "Error al borrar.");
      setDeleting(false);
    }
  }

  function handleApplyUV() {
    const img = imgRef.current;
    const canvas = uvCanvasRef.current;
    if (!img || !canvas) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let nr, nb;
      if (lum < 140) {
        nr = r * 1.8;
        nb = b * 1.8;
      } else {
        nr = r * 0.7;
        nb = b * 0.7;
      }
      if (r > 180 && g > 160 && b < 100) nr = nr * 1.5;
      const ng = g * 0.4;
      d[i] = nr > 255 ? 255 : nr;
      d[i + 1] = ng > 255 ? 255 : ng;
      d[i + 2] = nb > 255 ? 255 : nb;
    }
    ctx.putImageData(imgData, 0, 0);
    setUvApplied(true);
  }

  function handleResetUV() {
    setUvApplied(false);
  }

  async function handleApplyWarp() {
    setWarpError(null);
    const lm = landmarksRef.current;
    if (!lm) {
      setWarpError("Detecta primero con MediaPipe (arriba) — sin los 468 puntos no hay malla que deformar.");
      return;
    }
    const canvas = warpCanvasRef.current;
    if (!canvas || !photo.url) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo cargar la foto."));
      img.src = photo.url as string;
    });

    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const landmarksPx = lm.map((p) => ({ x: p.x * W, y: p.y * H }));

    const dst = computeWarpDst(landmarksPx, H, warpIntensity);
    renderTriangleWarp(canvas, img, landmarksPx, dst);
    if (warpNeck) applyNeckTreatment(canvas, landmarksPx);
    setWarpApplied(true);
  }

  function handleResetWarp() {
    setWarpApplied(false);
    setWarpIntensity(0);
  }

  function drawLandmarks(landmarks: { x: number; y: number }[], showFrankfurt = false) {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;
    canvas.width = displayW;
    canvas.height = displayH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.fillStyle = "#22c55e";
    landmarks.forEach((lm) => {
      const x = lm.x * displayW;
      const y = lm.y * displayH;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
    if (showFrankfurt) {
      // Aproximación: borde orbital inferior (145/374) → zona del trago (234/454).
      // No hay landmark oficial de "trago" en la malla de 468 puntos.
      const pt = (i: number) => ({ x: landmarks[i].x * displayW, y: landmarks[i].y * displayH });
      const rOrb = pt(145), rEar = pt(234);
      const lOrb = pt(374), lEar = pt(454);
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(rOrb.x, rOrb.y);
      ctx.lineTo(rEar.x, rEar.y);
      ctx.moveTo(lOrb.x, lOrb.y);
      ctx.lineTo(lEar.x, lEar.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  async function handleDetect() {
    if (!photo.url) return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const landmarker = await getFaceLandmarker();

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo cargar la foto."));
        img.src = photo.url as string;
      });

      const result = landmarker.detect(img);
      const lm = result.faceLandmarks?.[0];
      if (!lm) {
        setStatus("error");
        setErrorMsg("No se detectó ninguna cara en la foto.");
        return;
      }

      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const pt = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });

      const nose = pt(1);
      const chin = pt(152);
      const lEye = pt(33);
      const rEye = pt(263);
      const lJaw = pt(172);
      const rJaw = pt(397);
      const midX = (lEye.x + rEye.x) / 2;

      const cervDx = chin.x - nose.x;
      const cervDy = chin.y - nose.y;
      const cerv = Number(
        ((Math.atan2(Math.abs(cervDy), Math.abs(cervDx)) * 180) / Math.PI).toFixed(1)
      );

      const asimPct = Number(
        ((Math.abs(lJaw.x - midX - (midX - rJaw.x)) / W) * 100).toFixed(1)
      );

      const eyeDx = rEye.x - lEye.x;
      const eyeDy = rEye.y - lEye.y;
      const interpDeg = Number(
        ((Math.atan2(Math.abs(eyeDy), Math.abs(eyeDx)) * 180) / Math.PI).toFixed(1)
      );

      function browTilt(idxArr: number[]) {
        const p0 = pt(idxArr[0]);
        const p1 = pt(idxArr[idxArr.length - 1]);
        return (Math.atan2(-(p1.y - p0.y), Math.abs(p1.x - p0.x)) * 180) / Math.PI;
      }
      const browA = browTilt(LEFT_BROW);
      const browB = browTilt(RIGHT_BROW);
      const lBrowX = pt(LEFT_BROW[0]).x;
      const rBrowX = pt(RIGHT_BROW[0]).x;
      const bIzq = Number((lBrowX < rBrowX ? browA : browB).toFixed(1));
      const bDer = Number((lBrowX < rBrowX ? browB : browA).toFixed(1));

      landmarksRef.current = lm;
      drawLandmarks(lm, frankfurtOn);
      setAngle(cerv);
      setInterpupilar(interpDeg);
      setAsymmetry(asimPct);
      setBrowIzq(bIzq);
      setBrowDer(bDer);
      setStatus("done");

      const supabase = createClient();
      const { error } = await supabase
        .from("session_photos")
        .update({
          landmarks: lm,
          cervicomental_angle: cerv,
          interpupilar_angle: interpDeg,
          asymmetry_pct: asimPct,
          brow_izq_angle: bIzq,
          brow_der_angle: bDer,
        })
        .eq("id", photo.id);
      if (error) throw error;
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message ?? "Error al detectar.");
    }
  }

  function resetPoints() {
    setPoints([]);
  }

  async function handleManualClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const next = [...points, { x, y }];
    setPoints(next);

    if (next.length === 2) {
      const dx = next[1].x - next[0].x;
      const dy = next[1].y - next[0].y;
      const deg = Number(
        ((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI).toFixed(1)
      );
      const def = MANUAL_ANGLE_TYPES.find((a) => a.value === angleType)!;
      setManualValues((prev) => ({ ...prev, [angleType]: deg }));
      setManualSaving(true);
      const supabase = createClient();
      await supabase
        .from("session_photos")
        .update({ [def.column]: deg })
        .eq("id", photo.id);
      setManualSaving(false);
    }
  }

  async function saveIndex(fields: Record<string, number>) {
    setIndexSaving(true);
    const supabase = createClient();
    await supabase.from("session_photos").update(fields).eq("id", photo.id);
    setIndexSaving(false);
  }

  function startIndexMode(mode: IndexMode) {
    setIndexMode(mode);
    if (mode === "flac-mand") setFlacPts({ mand: [], comis: [] });
    if (mode === "flac-comis") setFlacPts((p) => ({ ...p, comis: [] }));
    if (mode === "ptosis") setPtosisPts([]);
    if (mode === "sim-left") setSimPts((p) => ({ ...p, l: [] }));
    if (mode === "sim-right") setSimPts((p) => ({ ...p, r: [] }));
    if (mode === "frontal-cerv" || mode === "frontal-ceja" || mode === "frontal-pupil")
      setFrontalAnglePts([]);
  }

  function handleIndexClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!indexMode) return;
    const rect = idxWrapRef.current!.getBoundingClientRect();
    const p: Pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (indexMode === "flac-mand") {
      const next = [...flacPts.mand, p];
      setFlacPts((s) => ({ ...s, mand: next }));
      if (next.length === 2) setIndexMode(null);
    } else if (indexMode === "flac-comis") {
      const next = [...flacPts.comis, p];
      const updated = { ...flacPts, comis: next };
      setFlacPts(updated);
      if (next.length === 2) {
        setIndexMode(null);
        if (updated.mand.length === 2) {
          const dm = Math.hypot(
            updated.mand[1].x - updated.mand[0].x,
            updated.mand[1].y - updated.mand[0].y
          );
          const dc = Math.hypot(
            updated.comis[1].x - updated.comis[0].x,
            updated.comis[1].y - updated.comis[0].y
          );
          if (dc) {
            const idx = Number((dm / dc).toFixed(2));
            const label = idx >= 1.2 ? "Normal (>1.2)" : "Flacidez (<1.2)";
            setFlacRes({ idx, label });
            saveIndex({ flacidez_index: idx });
          }
        }
      }
    } else if (indexMode === "ptosis") {
      const next = [...ptosisPts, p];
      setPtosisPts(next);
      if (next.length === 2) {
        setIndexMode(null);
        const px = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
        const label =
          px < 30
            ? "Compatible con ptosis (MRD1 reducido)"
            : px < 80
            ? "Dentro de rango normal"
            : "Posible retracción palpebral";
        setPtosisRes({ px: Number(px.toFixed(0)), label });
        saveIndex({ ptosis_px: Number(px.toFixed(0)) });
      }
    } else if (indexMode === "sim-left") {
      const next = [...simPts.l, p];
      const updated = { ...simPts, l: next };
      setSimPts(updated);
      if (next.length === 2) {
        setIndexMode(null);
        if (updated.r.length === 2) computeSim(updated);
      }
    } else if (indexMode === "sim-right") {
      const next = [...simPts.r, p];
      const updated = { ...simPts, r: next };
      setSimPts(updated);
      if (next.length === 2) {
        setIndexMode(null);
        if (updated.l.length === 2) computeSim(updated);
      }
    } else if (
      indexMode === "frontal-cerv" ||
      indexMode === "frontal-ceja" ||
      indexMode === "frontal-pupil"
    ) {
      const next = [...frontalAnglePts, p];
      setFrontalAnglePts(next);
      if (next.length === 2) {
        setIndexMode(null);
        const dx = next[1].x - next[0].x;
        const dy = next[1].y - next[0].y;
        const deg = Number(
          ((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI).toFixed(1)
        );
        const key = indexMode === "frontal-cerv" ? "cerv" : indexMode === "frontal-ceja" ? "ceja" : "pupil";
        setFrontalAngleHistory((prev) => ({
          ...prev,
          [key]: [...prev[key], deg].slice(-3),
        }));
      }
    }
  }

  function computeSim(pts: { l: Pt[]; r: Pt[] }) {
    const dL = Math.hypot(pts.l[1].x - pts.l[0].x, pts.l[1].y - pts.l[0].y);
    const dR = Math.hypot(pts.r[1].x - pts.r[0].x, pts.r[1].y - pts.r[0].y);
    if (!Math.max(dL, dR)) return;
    const s = Number(((Math.min(dL, dR) / Math.max(dL, dR)) * 100).toFixed(1));
    const label = s >= 85 ? "Aceptable" : s >= 75 ? "Leve asimetría" : "Asimetría significativa";
    setSimRes({ pct: s, label });
    saveIndex({ simetria_pct: s });
  }

  async function handleRugosidad() {
    if (!photo.url) return;
    setRugoLoading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo cargar la foto."));
        img.src = photo.url as string;
      });
      const tmp = document.createElement("canvas");
      tmp.width = 120;
      tmp.height = 120;
      const tc = tmp.getContext("2d", { willReadFrequently: true })!;
      tc.drawImage(img, 0, 0, 120, 120);
      const gl = computeGLCMFeatures(tc.getImageData(0, 0, 120, 120), 16, 1);
      const label =
        gl.contrast > 180
          ? "Alta rugosidad / textura irregular"
          : gl.contrast > 90
          ? "Rugosidad moderada"
          : "Textura suave / baja rugosidad";
      setRugoRes({ ...gl, label });
      await saveIndex({ rugosidad_contraste: gl.contrast });
    } catch (e: any) {
      setErrorMsg(e.message ?? "Error al calcular rugosidad.");
    } finally {
      setRugoLoading(false);
    }
  }

  const currentType = MANUAL_ANGLE_TYPES.find((a) => a.value === angleType)!;

  const idxBtnCls = (active: boolean) =>
    `text-[10px] rounded-full px-2 py-1 transition ${
      active ? "bg-accent text-white" : "bg-white border border-rule text-ink hover:border-accent/50"
    }`;

  return (
    <div className="bg-white border border-rule rounded-xl overflow-hidden">
      <div className="relative">
        {photo.url && (
          <img
            ref={imgRef}
            src={photo.url}
            alt={VIEW_LABELS[photo.view_type ?? ""] ?? "Foto"}
            className="w-full h-auto block"
            crossOrigin="anonymous"
          />
        )}
        {!isLateral && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        )}
        {isFrontal && (
          <canvas
            ref={uvCanvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none ${uvApplied ? "" : "hidden"}`}
          />
        )}
        {isFrontal && (
          <canvas
            ref={warpCanvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none ${warpApplied ? "" : "hidden"}`}
          />
        )}
        {isFrontal && (
          <div
            ref={idxWrapRef}
            onClick={handleIndexClick}
            className={`absolute inset-0 ${indexMode ? "cursor-crosshair" : "pointer-events-none"}`}
          >
            {flacPts.mand.map((p, i) => (
              <span key={"fm" + i} className="absolute w-2.5 h-2.5 bg-blue-600 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
            {flacPts.comis.map((p, i) => (
              <span key={"fc" + i} className="absolute w-2.5 h-2.5 bg-purple-600 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
            {ptosisPts.map((p, i) => (
              <span key={"pt" + i} className="absolute w-2.5 h-2.5 bg-amber-500 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
            {simPts.l.map((p, i) => (
              <span key={"sl" + i} className="absolute w-2.5 h-2.5 bg-teal-600 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
            {simPts.r.map((p, i) => (
              <span key={"sr" + i} className="absolute w-2.5 h-2.5 bg-pink-600 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
            {frontalAnglePts.map((p, i) => (
              <span key={"fa" + i} className="absolute w-2.5 h-2.5 bg-orange-500 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }} />
            ))}
          </div>
        )}
        {isLateral && (
          <div
            ref={wrapRef}
            onClick={handleManualClick}
            className="absolute inset-0 cursor-crosshair"
          >
            {points.map((p, i) => (
              <span
                key={i}
                className="absolute w-2.5 h-2.5 bg-red-600 border border-white rounded-full -translate-x-1/2 -translate-y-1/2"
                style={{ left: p.x, top: p.y }}
              />
            ))}
            {points.length === 2 && (
              <svg className="absolute inset-0 w-full h-full">
                <line
                  x1={points[0].x}
                  y1={points[0].y}
                  x2={points[1].x}
                  y2={points[1].y}
                  stroke="#dc2626"
                  strokeWidth={2}
                />
              </svg>
            )}
          </div>
        )}
      </div>

      <div className="px-2 py-1.5">
        <p className="text-xs text-mid">
          {VIEW_LABELS[photo.view_type ?? ""] ?? photo.view_type}
        </p>

        {!isLateral && (
          <>
            <button
              type="button"
              onClick={handleDetect}
              disabled={status === "loading"}
              className="mt-1 text-xs bg-accent text-white rounded-full px-3 py-1 disabled:opacity-60"
            >
              {status === "loading"
                ? "Detectando…"
                : status === "done"
                ? "Volver a detectar"
                : "Detectar (MediaPipe)"}
            </button>
            {isFrontal && status === "done" && (
              <button
                type="button"
                onClick={() => setFrankfurtOn((v) => !v)}
                className={`mt-1 ml-1 text-xs rounded-full px-3 py-1 ${
                  frankfurtOn ? "bg-amber-500 text-white" : "bg-white border border-rule text-ink"
                }`}
              >
                📐 Plano de Frankfurt (aprox.)
              </button>
            )}
            {angle !== null && (
              <div className="text-xs text-ink mt-1 space-y-0.5">
                <p>
                  Cervicomental: {angle}°{" "}
                  <span className="text-mid">(normal 80–95°)</span>
                </p>
                {interpupilar !== null && (
                  <p>
                    Interpupilar: {interpupilar}°{" "}
                    <span className="text-mid">(ideal 0°)</span>
                  </p>
                )}
                {asymmetry !== null && <p>Asimetría: {asymmetry}%</p>}
                {browIzq !== null && browDer !== null && (
                  <p>
                    Cejas: izq. {browIzq}° / dcha. {browDer}°{" "}
                    <span className="text-mid">(normal 10–20°)</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {isFrontal && (
          <div className="mt-3 border-t border-rule pt-2">
            <p className="text-[11px] font-semibold text-mid uppercase tracking-wide mb-1">
              🔦 Filtro UV simulado
            </p>
            <p className="text-[10px] text-mid mb-1">
              Manipulación visual educativa de la foto (no es luz UV real, no detecta porfirinas reales) — solo para ilustrar el concepto de fotoenvejecimiento al paciente.
            </p>
            <div className="flex gap-1 flex-wrap mb-1">
              <button
                type="button"
                onClick={handleApplyUV}
                className="text-[10px] rounded-full px-2 py-1 bg-white border border-rule text-ink hover:border-accent/50"
              >
                Aplicar filtro UV simulado
              </button>
              {uvApplied && (
                <button
                  type="button"
                  onClick={handleResetUV}
                  className="text-[10px] rounded-full px-2 py-1 bg-white border border-rule text-ink hover:border-accent/50"
                >
                  ↺ Ver foto original
                </button>
              )}
            </div>
            {uvApplied && (
              <p className="text-[10px] text-amber-700">
                ⚠ Filtro simulado activo — no es un diagnóstico ni una medición real.
              </p>
            )}
          </div>
        )}

        {isFrontal && (
          <div className="mt-3 border-t border-rule pt-2">
            <p className="text-[11px] font-semibold text-mid uppercase tracking-wide mb-1">
              🧪 Simulación de resultado (cejas · mejillas · mandíbula)
            </p>
            <p className="text-[10px] text-mid mb-1">
              Desplaza píxeles de la propia foto usando la malla de 468 puntos — no simula tejido, músculo ni piel. Empieza en 0% y sube poco a poco; para en cuanto se vea artificial. Necesita haber detectado con MediaPipe antes (arriba).
            </p>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-mid min-w-[55px]">Intensidad</span>
              <input
                type="range"
                min={0}
                max={100}
                value={warpIntensity}
                onChange={(e) => setWarpIntensity(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-[10px] text-ink min-w-[30px] text-right">{warpIntensity}%</span>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-ink mb-1">
              <input type="checkbox" checked={warpNeck} onChange={(e) => setWarpNeck(e.target.checked)} />
              Incluir cuello (solo luz/suavizado, sin desplazar geometría)
            </label>
            <div className="flex gap-1 flex-wrap mb-1">
              <button
                type="button"
                onClick={handleApplyWarp}
                className="text-[10px] rounded-full px-2 py-1 bg-accent text-white hover:opacity-90"
              >
                ✨ Aplicar simulación
              </button>
              {warpApplied && (
                <button
                  type="button"
                  onClick={handleResetWarp}
                  className="text-[10px] rounded-full px-2 py-1 bg-white border border-rule text-ink hover:border-accent/50"
                >
                  ↺ Ver original
                </button>
              )}
            </div>
            {warpApplied && (
              <p className="text-[10px] text-amber-700">
                ⚠ Simulación visual educativa al {warpIntensity}% — NO es una predicción médica del resultado real.
              </p>
            )}
            {warpError && <p className="text-[10px] text-red-700">{warpError}</p>}
          </div>
        )}

        {isFrontal && (
          <div className="mt-3 border-t border-rule pt-2">
            <p className="text-[11px] font-semibold text-mid uppercase tracking-wide mb-1">
              Medición manual de ángulos (2 clics)
            </p>
            <p className="text-[10px] text-mid mb-1">
              Alternativa manual a MediaPipe. Cervicomental: clic en punto submentoniano → clic en punto cervical anterior (80–95°). Inclin. ceja: clic en inicio de la ceja → clic en la cola (10–20°). Interpupilar: clic en centro pupila derecha → clic en centro pupila izquierda (ideal 0°).
            </p>
            <div className="flex gap-1 flex-wrap mb-1">
              <button type="button" className={idxBtnCls(indexMode === "frontal-cerv")} onClick={() => startIndexMode("frontal-cerv")}>
                📐 Cervicomental
              </button>
              <button type="button" className={idxBtnCls(indexMode === "frontal-ceja")} onClick={() => startIndexMode("frontal-ceja")}>
                📐 Inclin. ceja
              </button>
              <button type="button" className={idxBtnCls(indexMode === "frontal-pupil")} onClick={() => startIndexMode("frontal-pupil")}>
                👁 Interpupilar
              </button>
            </div>
            <div className="text-xs text-ink space-y-0.5">
              {(["cerv", "ceja", "pupil"] as const).map((key) => {
                const hist = frontalAngleHistory[key];
                if (hist.length === 0) return null;
                const label = key === "cerv" ? "Cervicomental" : key === "ceja" ? "Inclin. ceja" : "Interpupilar";
                const last = hist[hist.length - 1];
                const avg = (hist.reduce((a, b) => a + b, 0) / hist.length).toFixed(1);
                return (
                  <p key={key}>
                    {label}: {last}°{hist.length >= 2 ? ` (media ${hist.length}m: ${avg}°)` : ""}
                  </p>
                );
              })}
            </div>
          </div>
        )}

        {isFrontal && (
          <div className="mt-3 border-t border-rule pt-2">
            <p className="text-[11px] font-semibold text-mid uppercase tracking-wide mb-1">
              Índices avanzados (clics)
            </p>

            <p className="text-[10px] text-mid mb-1">
              📏 Flacidez mandibular — ratio ancho mandíbula / ancho comisuras. &gt;1.2 normal, &lt;1.2 flacidez.
            </p>
            <div className="flex gap-1 flex-wrap mb-2">
              <button type="button" className={idxBtnCls(indexMode === "flac-mand")} onClick={() => startIndexMode("flac-mand")}>
                1. Mandíbula (2 clics: izq→dcha)
              </button>
              <button type="button" className={idxBtnCls(indexMode === "flac-comis")} onClick={() => startIndexMode("flac-comis")}>
                2. Comisuras (2 clics: izq→dcha)
              </button>
            </div>
            {flacRes && (
              <p className="text-xs text-ink mb-2">Índice: {flacRes.idx} — {flacRes.label}</p>
            )}

            <p className="text-[10px] text-mid mb-1">
              👁 Ptosis palpebral (MRD1 aprox.) — clic 1: margen palpebral superior · clic 2: centro de la pupila.
            </p>
            <div className="flex gap-1 flex-wrap mb-2">
              <button type="button" className={idxBtnCls(indexMode === "ptosis")} onClick={() => startIndexMode("ptosis")}>
                1. Margen → 2. Pupila
              </button>
            </div>
            {ptosisRes && (
              <p className="text-xs text-ink mb-2">{ptosisRes.px}px — {ptosisRes.label} <span className="text-mid">(sin calibrar a mm)</span></p>
            )}

            <p className="text-[10px] text-mid mb-1">
              ⚖️ Simetría facial — marca 2 puntos equivalentes en cada hemicara (ej. canto externo del ojo + comisura). &gt;85% aceptable.
            </p>
            <div className="flex gap-1 flex-wrap mb-2">
              <button type="button" className={idxBtnCls(indexMode === "sim-left")} onClick={() => startIndexMode("sim-left")}>
                Hemicara IZQ (2 clics)
              </button>
              <button type="button" className={idxBtnCls(indexMode === "sim-right")} onClick={() => startIndexMode("sim-right")}>
                Hemicara DCHA (2 clics)
              </button>
            </div>
            {simRes && (
              <p className="text-xs text-ink mb-2">Simetría: {simRes.pct}% — {simRes.label}</p>
            )}

            <p className="text-[10px] text-mid mb-1">
              🔳 Rugosidad cutánea — análisis de textura automático (GLCM) sobre la foto completa, sin clics.
            </p>
            <button
              type="button"
              onClick={handleRugosidad}
              disabled={rugoLoading}
              className="text-[10px] rounded-full px-2 py-1 bg-white border border-rule text-ink hover:border-accent/50 disabled:opacity-60"
            >
              {rugoLoading ? "Calculando…" : "Calcular rugosidad"}
            </button>
            {rugoRes && (
              <p className="text-xs text-ink mt-1">
                Contraste: {rugoRes.contrast} — {rugoRes.label}
              </p>
            )}

            {indexSaving && <p className="text-[10px] text-mid mt-1">Guardando…</p>}
          </div>
        )}

        {isLateral && (
          <>
            <select
              value={angleType}
              onChange={(e) => {
                setAngleType(e.target.value as ManualAngleKey);
                resetPoints();
              }}
              className="mt-1 text-xs border border-rule rounded px-2 py-1 w-full"
            >
              {MANUAL_ANGLE_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-mid mt-1 whitespace-pre-line">{currentType.hint}</p>
            <p className="text-[10px] text-amber-700 mt-1">{MANUAL_LIMITATION_NOTE}</p>
            <div className="flex items-center justify-between mt-1">
              <button
                type="button"
                onClick={resetPoints}
                className="text-xs text-mid underline"
              >
                Reiniciar clics
              </button>
              {manualSaving && (
                <span className="text-[10px] text-mid">Guardando…</span>
              )}
            </div>
            <div className="text-xs text-ink mt-1 space-y-0.5">
              {MANUAL_ANGLE_TYPES.map(
                (a) =>
                  manualValues[a.value] !== null && (
                    <p key={a.value}>
                      {a.label}: {manualValues[a.value]}°
                    </p>
                  )
              )}
            </div>
          </>
        )}

        {errorMsg && <p className="text-xs text-red-700 mt-1">{errorMsg}</p>}
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="mt-1 ml-2 text-xs text-red-700 underline disabled:opacity-60"
          >
            {deleting ? "Borrando…" : "Borrar"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PhotoGallery({
  photos,
  canDelete,
}: {
  photos: Photo[];
  canDelete: boolean;
}) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {photos.map((p) => (
        <PhotoCard key={p.id} photo={p} canDelete={canDelete} />
      ))}
    </div>
  );
}
