"use client";

import { useEffect, useRef, useState } from "react";
import { renderTriangleWarp, detectLandmarksFrac, type Pt } from "./warpEngine";

export default function BeforeAfterComparator({
  autoBeforeUrl,
  autoAfterDataUrl,
}: {
  autoBeforeUrl?: string;
  autoAfterDataUrl?: string;
} = {}) {
  const beforeImgRef = useRef<HTMLImageElement>(new Image());
  const afterImgRef = useRef<HTMLImageElement>(new Image());
  const beforePreviewRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warpTmpRef = useRef<HTMLCanvasElement>(
    typeof document !== "undefined" ? document.createElement("canvas") : (null as any)
  );

  const [beforeReady, setBeforeReady] = useState(false);
  const [afterReady, setAfterReady] = useState(false);
  const [pct, setPct] = useState(50);

  const [beforeLm, setBeforeLm] = useState<Pt[] | null>(null);
  const [afterLm, setAfterLm] = useState<Pt[] | null>(null);
  const [aligning, setAligning] = useState(false);

  function loadFile(file: File | null, which: "before" | "after") {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      loadFromSrc(ev.target?.result as string, which);
    };
    reader.readAsDataURL(file);
  }

  function loadFromSrc(src: string, which: "before" | "after") {
    if (which === "before") setBeforeLm(null);
    else setAfterLm(null);

    const img = which === "before" ? beforeImgRef.current : afterImgRef.current;
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      if (which === "before") {
        setBeforeReady(true);
        drawBeforePreview();
      } else {
        setAfterReady(true);
      }
      setAligning(true);
      try {
        const lm = await detectLandmarksFrac(img);
        if (which === "before") setBeforeLm(lm);
        else setAfterLm(lm);
      } finally {
        setAligning(false);
      }
    };
    img.src = src;
  }

  useEffect(() => {
    if (autoBeforeUrl) loadFromSrc(autoBeforeUrl, "before");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBeforeUrl]);

  useEffect(() => {
    if (autoAfterDataUrl) loadFromSrc(autoAfterDataUrl, "after");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAfterDataUrl]);

  function drawBeforePreview() {
    const c = beforePreviewRef.current;
    const img = beforeImgRef.current;
    if (!c || !img.naturalWidth) return;
    c.width = 150;
    c.height = img.naturalHeight * (150 / img.naturalWidth);
    const ctx = c.getContext("2d");
    ctx?.drawImage(img, 0, 0, c.width, c.height);
  }

  function draw() {
    const c = canvasRef.current;
    const before = beforeImgRef.current;
    const after = afterImgRef.current;
    if (!c || !beforeReady || !afterReady) return;
    const targetW = Math.min(before.naturalWidth, after.naturalWidth, 400);
    const targetH = before.naturalHeight * (targetW / before.naturalWidth);
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = pct / 100;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.globalAlpha = 1 - p;
    ctx.drawImage(before, 0, 0, targetW, targetH);

    if (beforeLm && afterLm && warpTmpRef.current) {
      // Alineación: se deforma la foto "después" para que su malla de 468
      // puntos coincida con la geometría de la foto "antes", antes de
      // mezclar — así no se nota el salto de encuadre/pose entre las dos.
      const afterNative = afterLm.map((pt) => ({
        x: pt.x * after.naturalWidth,
        y: pt.y * after.naturalHeight,
      }));
      const beforeToAfterNative = beforeLm.map((pt) => ({
        x: pt.x * after.naturalWidth,
        y: pt.y * after.naturalHeight,
      }));
      renderTriangleWarp(warpTmpRef.current, after, afterNative, beforeToAfterNative);
      ctx.globalAlpha = p;
      ctx.drawImage(
        warpTmpRef.current,
        0,
        0,
        warpTmpRef.current.width,
        warpTmpRef.current.height,
        0,
        0,
        targetW,
        targetH
      );
    } else {
      ctx.globalAlpha = p;
      ctx.drawImage(after, 0, 0, targetW, targetH);
    }
    ctx.globalAlpha = 1;
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeReady, afterReady, pct, beforeLm, afterLm]);

  const aligned = !!(beforeLm && afterLm);

  return (
    <div className="bg-white border border-rule rounded-2xl p-5 mb-6">
      <p className="text-sm font-semibold text-mid uppercase tracking-wide mb-1">
        🔀 Comparador antes / después
      </p>
      <p className="text-xs text-mid mb-3">
        Mezcla por opacidad entre dos fotos (p. ej. dos sesiones distintas de la misma paciente). Si detecta cara en ambas, alinea la geometría con la malla de 468 puntos antes de mezclar — mejora propia de esta versión cloud, el HTML original no lo hacía. No es una medición, solo apoyo visual.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="block">
          <span className="block text-xs text-mid mb-1">Foto "antes"</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => loadFile(e.target.files?.[0] ?? null, "before")}
            className="w-full text-xs border border-rule rounded-lg px-2 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-mid mb-1">Foto "después"</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => loadFile(e.target.files?.[0] ?? null, "after")}
            className="w-full text-xs border border-rule rounded-lg px-2 py-2"
          />
        </label>
      </div>

      {(beforeReady || afterReady) && (
        <p className="text-xs mb-3">
          {aligning
            ? "Detectando cara para alinear…"
            : aligned
            ? "✓ Alineado por malla facial"
            : beforeReady && afterReady
            ? "⚠ No se detectó cara en una o ambas fotos — mezcla sin alinear."
            : ""}
        </p>
      )}

      <div className="flex gap-4 flex-wrap mb-3">
        <div>
          <p className="text-[10px] text-mid text-center mb-1">Antes (referencia fija)</p>
          <canvas
            ref={beforePreviewRef}
            className={`rounded-lg max-w-[150px] ${beforeReady ? "" : "hidden"}`}
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <p className="text-[10px] text-mid text-center mb-1">Mezcla interactiva</p>
          <div className="bg-warm border border-rule rounded-lg min-h-[120px] flex items-center justify-center overflow-hidden">
            {!(beforeReady && afterReady) && (
              <p className="text-xs text-mid p-4 text-center">
                Carga las dos fotos para comparar.
              </p>
            )}
            <canvas ref={canvasRef} className={beforeReady && afterReady ? "max-w-full" : "hidden"} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 max-w-md">
        <span className="text-xs text-mid min-w-[45px]">Antes</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-mid min-w-[55px] text-right">Después</span>
      </div>
      <p className="text-xs text-ink text-center mt-1">
        {Math.round(100 - pct)}% antes / {Math.round(pct)}% después
      </p>
    </div>
  );
}
