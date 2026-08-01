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
};

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
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
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

      // Todos los ángulos siguientes se calculan igual que en DermFace HTML,
      // en píxeles reales de la foto (no en fracciones normalizadas).
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

      // Cervicomental: eje nariz-mentón frente a la horizontal
      const cervDx = chin.x - nose.x;
      const cervDy = chin.y - nose.y;
      const cerv = Number(
        ((Math.atan2(Math.abs(cervDy), Math.abs(cervDx)) * 180) / Math.PI).toFixed(1)
      );

      // Asimetría: diferencia horizontal entre hemicaras
      const asimPct = Number(
        ((Math.abs(lJaw.x - midX - (midX - rJaw.x)) / W) * 100).toFixed(1)
      );

      // Interpupilar: inclinación de la línea entre ojos
      const eyeDx = rEye.x - lEye.x;
      const eyeDy = rEye.y - lEye.y;
      const interpDeg = Number(
        ((Math.atan2(Math.abs(eyeDy), Math.abs(eyeDx)) * 180) / Math.PI).toFixed(1)
      );

      // Inclinación de cejas: extremo a extremo del contorno oficial
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
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs text-mid">
          {VIEW_LABELS[photo.view_type ?? ""] ?? photo.view_type}
        </p>
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
            <p>Cervicomental: {angle}° <span className="text-mid">(normal 80–95°)</span></p>
            {interpupilar !== null && <p>Interpupilar: {interpupilar}° <span className="text-mid">(ideal 0°)</span></p>}
            {asymmetry !== null && <p>Asimetría: {asymmetry}%</p>}
            {browIzq !== null && browDer !== null && (
              <p>Cejas: izq. {browIzq}° / dcha. {browDer}° <span className="text-mid">(normal 10–20°)</span></p>
            )}
          </div>
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
