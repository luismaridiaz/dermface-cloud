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
};

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

      // Ángulo cervicomental: eje nariz(1)-mentón(152) frente a la horizontal,
      // en píxeles reales de la foto — igual cálculo que en DermFace HTML.
      const nose = {
        x: lm[1].x * img.naturalWidth,
        y: lm[1].y * img.naturalHeight,
      };
      const chin = {
        x: lm[152].x * img.naturalWidth,
        y: lm[152].y * img.naturalHeight,
      };
      const dx = chin.x - nose.x;
      const dy = chin.y - nose.y;
      const cerv = Number(
        ((Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI).toFixed(1)
      );

      drawLandmarks(lm);
      setAngle(cerv);
      setStatus("done");

      const supabase = createClient();
      const { error } = await supabase
        .from("session_photos")
        .update({ landmarks: lm, cervicomental_angle: cerv })
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
          <p className="text-xs text-ink mt-1">Cervicomental: {angle}°</p>
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
