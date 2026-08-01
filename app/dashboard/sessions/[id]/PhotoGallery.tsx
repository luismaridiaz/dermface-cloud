"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    hint: "Clic 1: glabela → Clic 2: punta nasal",
  },
  {
    value: "nasolabial",
    label: "Nasolabial",
    column: "manual_nasolabial_angle",
    hint: "Clic 1: base columela → Clic 2: borde bermellón superior",
  },
  {
    value: "mentolabial",
    label: "Mentolabial",
    column: "manual_mentolabial_angle",
    hint: "Clic 1: labio inferior → Clic 2: punto más anterior del mentón",
  },
  {
    value: "cervicomental",
    label: "Cervicomental",
    column: "cervicomental_angle",
    hint: "Clic 1: punto submentoniano → Clic 2: punto cervical anterior",
  },
];

// Se carga una sola vez y se reutiliza para todas las fotos de la página.
let landmarkerPromise: Promise<any> | null = null;

async function getFaceLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

function PhotoCard({
  photo,
  canDelete,
}: {
  photo: Photo;
  canDelete: boolean;
}) {
  const isLateral = LATERAL_VIEWS.includes(photo.view_type ?? "");

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ── MediaPipe (frontal) ──
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
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualValues, setManualValues] = useState<
    Record<ManualAngleKey, number | null>
  >({
    nasofacial: photo.manual_nasofacial_angle ?? null,
    nasolabial: photo.manual_nasolabial_angle ?? null,
    mentolabial: photo.manual_mentolabial_angle ?? null,
    cervicomental: photo.cervicomental_angle ?? null,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function drawLandmarks(landmarks: { x: number; y: number }[]) {
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

      drawLandmarks(lm);
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

  const currentType = MANUAL_ANGLE_TYPES.find((a) => a.value === angleType)!;

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
            <p className="text-[10px] text-mid mt-1">{currentType.hint}</p>
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
