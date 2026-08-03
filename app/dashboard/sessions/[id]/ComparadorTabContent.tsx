"use client";

import { useState } from "react";
import {
  renderTriangleWarp,
  computeWarpDst,
  applyNeckTreatment,
  detectLandmarksFrac,
} from "./warpEngine";
import BeforeAfterComparator from "./BeforeAfterComparator";

type Photo = { url: string | null; view_type: string | null };

export default function ComparadorTabContent({ photos }: { photos: Photo[] }) {
  const frontal = photos.find((p) => p.view_type === "frontal" && p.url);

  const [intensity, setIntensity] = useState(0);
  const [includeNeck, setIncludeNeck] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simulatedDataUrl, setSimulatedDataUrl] = useState<string | undefined>(undefined);

  async function handleSimulate() {
    if (!frontal?.url) return;
    setSimulating(true);
    setSimError(null);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo cargar la foto."));
        img.src = frontal.url as string;
      });

      const lmFrac = await detectLandmarksFrac(img);
      if (!lmFrac) {
        setSimError("No se detectó ninguna cara en la foto frontal.");
        return;
      }
      const landmarksPx = lmFrac.map((p) => ({
        x: p.x * img.naturalWidth,
        y: p.y * img.naturalHeight,
      }));

      const canvas = document.createElement("canvas");
      const dst = computeWarpDst(landmarksPx, img.naturalHeight, intensity);
      renderTriangleWarp(canvas, img, landmarksPx, dst);
      if (includeNeck) applyNeckTreatment(canvas, landmarksPx);

      setSimulatedDataUrl(canvas.toDataURL("image/jpeg", 0.92));
    } catch (e: any) {
      setSimError(e.message ?? "Error al simular.");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-warm border border-rule rounded-xl p-4">
        <p className="text-sm font-semibold text-mid uppercase tracking-wide mb-1">
          🧪 Simulación de resultado (cejas · mejillas · mandíbula)
        </p>
        <p className="text-xs text-mid mb-2">
          Desplaza píxeles de la propia foto frontal usando la malla de 468 puntos — no simula tejido, músculo ni piel real. Empieza en 0% y sube poco a poco; para en cuanto se vea artificial.
        </p>

        {!frontal?.url ? (
          <p className="text-xs text-red-700">
            Sube una foto frontal primero, en "Añadir fotos" arriba de la sesión.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1 max-w-md">
              <span className="text-xs text-mid min-w-[55px]">Intensidad</span>
              <input
                type="range"
                min={0}
                max={100}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-ink min-w-[30px] text-right">{intensity}%</span>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-ink mb-2">
              <input
                type="checkbox"
                checked={includeNeck}
                onChange={(e) => setIncludeNeck(e.target.checked)}
              />
              Incluir cuello (solo luz/suavizado, sin desplazar geometría)
            </label>
            <button
              type="button"
              onClick={handleSimulate}
              disabled={simulating}
              className="text-xs bg-accent text-white rounded-full px-4 py-2 font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              {simulating ? "Simulando…" : "✨ Aplicar simulación"}
            </button>
            {simError && <p className="text-xs text-red-700 mt-1">{simError}</p>}
            {simulatedDataUrl && (
              <p className="text-xs text-green-700 mt-1">
                ✓ Simulación aplicada al {intensity}% — cargada abajo en el comparador (antes = foto original, después = simulación). NO es una predicción médica del resultado real.
              </p>
            )}
          </>
        )}
      </div>

      <BeforeAfterComparator
        autoBeforeUrl={frontal?.url ?? undefined}
        autoAfterDataUrl={simulatedDataUrl}
      />
    </div>
  );
}
