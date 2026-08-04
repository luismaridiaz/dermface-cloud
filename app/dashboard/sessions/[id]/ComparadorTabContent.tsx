"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  renderTriangleWarp,
  computeWarpDst,
  computeWarpDstFromPlan,
  applyNeckTreatment,
  applySkinSmoothing,
  detectLandmarksFrac,
  type PlanSimParams,
} from "./warpEngine";
import BeforeAfterComparator from "./BeforeAfterComparator";

type Photo = { url: string | null; view_type: string | null };

type ClinicalForSim = {
  glogau: number | null;
  nau_lax: number | null;
  nau_fore: number | null;
  nau_perio: number | null;
  nau_malar: number | null;
  nau_naso: number | null;
  nau_ment: number | null;
  nau_neck: number | null;
  merz: Record<string, { rest: number | null; dyn: number | null }> | null;
} | null;

function getSimulationParamsFromPlan(c: ClinicalForSim): {
  params: PlanSimParams;
  suggestedIntensity: number;
} {
  const lax = c?.nau_lax ?? 0;
  const nauVals = [c?.nau_fore, c?.nau_perio, c?.nau_malar, c?.nau_naso, c?.nau_ment, c?.nau_neck].filter(
    (v): v is number => typeof v === "number"
  );
  const nau = nauVals.length ? nauVals.reduce((a, b) => a + b, 0) / nauVals.length : 0;
  const merzObj = c?.merz ?? {};
  const dynVals = Object.values(merzObj)
    .map((s) => s?.dyn)
    .filter((v): v is number => typeof v === "number");
  const merz = dynVals.length ? dynVals.reduce((a, b) => a + b, 0) / dynVals.length : 0;
  const glog = c?.glogau ?? 0;

  const laxFactor = Math.min(lax / 4, 1);
  const nauFactor = Math.min(nau / 3, 1);
  const merzFactor = Math.min(merz / 4, 1);

  const tieneToxina = merz >= 2;
  const tieneRellenos = nau >= 1;
  const tieneHifu = lax >= 2;

  const params: PlanSimParams = {
    liftBrow: Math.min(1, 0.4 * merzFactor + (tieneToxina ? 0.3 : 0)),
    liftCheeks: Math.min(1, 0.3 * laxFactor + 0.2 * nauFactor),
    jawline: Math.min(1, 0.5 * laxFactor + (tieneHifu ? 0.3 : 0)),
    volumeMalar: Math.min(1, 0.4 * nauFactor + (tieneRellenos ? 0.3 : 0)),
    volumeMenton: Math.min(1, 0.2 * nauFactor + (tieneRellenos ? 0.2 : 0)),
    skinSmooth: Math.min(1, 0.2 * (glog / 4) + 0.1 * (1 - nau / 3)),
  };

  const suggestedIntensity = Math.round(
    Math.min(85, Math.max(20, 25 + laxFactor * 25 + merzFactor * 20 + nauFactor * 15))
  );

  return { params, suggestedIntensity };
}

export default function ComparadorTabContent({
  photos,
  clinical,
  sessionId,
}: {
  photos: Photo[];
  clinical?: ClinicalForSim;
  sessionId: string;
}) {
  const frontal = photos.find((p) => p.view_type === "frontal" && p.url);

  const [intensity, setIntensity] = useState(0);
  const [includeNeck, setIncludeNeck] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simulatedDataUrl, setSimulatedDataUrl] = useState<string | undefined>(undefined);
  const [lastMode, setLastMode] = useState<"manual" | "plan" | null>(null);

  async function handleSimulate(usePlan = false) {
    if (!frontal?.url) return;
    setSimulating(true);
    setSimError(null);
    let effectiveIntensity = intensity;
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
        z: p.z,
      }));

      const canvas = document.createElement("canvas");
      let dst;
      let skinSmoothWeight = 0;
      if (usePlan) {
        const { params, suggestedIntensity } = getSimulationParamsFromPlan(clinical ?? null);
        effectiveIntensity = suggestedIntensity;
        skinSmoothWeight = params.skinSmooth;
        setIntensity(suggestedIntensity);
        dst = computeWarpDstFromPlan(landmarksPx, img.naturalHeight, suggestedIntensity, params);
      } else {
        dst = computeWarpDst(landmarksPx, img.naturalHeight, intensity);
      }
      renderTriangleWarp(canvas, img, landmarksPx, dst);
      if (skinSmoothWeight > 0) applySkinSmoothing(canvas, landmarksPx, skinSmoothWeight);
      if (includeNeck) applyNeckTreatment(canvas, landmarksPx);

      setSimulatedDataUrl(canvas.toDataURL("image/jpeg", 0.92));
      setLastMode(usePlan ? "plan" : "manual");

      const supabase = createClient();
      await supabase.from("clinical_data").upsert(
        {
          session_id: sessionId,
          sim_aplicada: true,
          sim_intensidad: effectiveIntensity,
          sim_modo: usePlan ? "plan" : "manual",
        },
        { onConflict: "session_id" }
      );
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
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleSimulate(false)}
                disabled={simulating}
                className="text-xs bg-accent text-white rounded-full px-4 py-2 font-semibold hover:opacity-90 transition disabled:opacity-60"
              >
                {simulating ? "Simulando…" : "✨ Aplicar simulación (manual)"}
              </button>
              <button
                type="button"
                onClick={() => handleSimulate(true)}
                disabled={simulating || !clinical}
                title={!clinical ? "Rellena primero Merz, NAU y Laxitud en el formulario" : ""}
                className="text-xs bg-accent2 text-white rounded-full px-4 py-2 font-semibold hover:opacity-90 transition disabled:opacity-60"
              >
                {simulating ? "Simulando…" : "📋 Previsualizar según el plan"}
              </button>
            </div>
            {!clinical && (
              <p className="text-[10px] text-mid mt-1">
                "Previsualizar según el plan" necesita Merz, NAU y Laxitud rellenos en el formulario clínico.
              </p>
            )}
            {simError && <p className="text-xs text-red-700 mt-1">{simError}</p>}
            {simulatedDataUrl && (
              <p className="text-xs text-green-700 mt-1">
                {lastMode === "plan"
                  ? `✓ Simulación según diagnóstico (intensidad sugerida ${intensity}%, por zona) — cargada abajo en el comparador. NO es una predicción médica del resultado real.`
                  : `✓ Simulación manual al ${intensity}% — cargada abajo en el comparador. NO es una predicción médica del resultado real.`}
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
