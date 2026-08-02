"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const VIEW_TYPES = [
  {
    value: "frontal",
    label: "Frontal",
    tips:
      "💡 Iluminación: luz frontal difusa y homogénea, sin sombras duras. Evita contraluz, ventana detrás del paciente o flash lateral directo. Si ves sombra bajo las cejas o en el surco nasogeniano, mueve la fuente de luz.\n" +
      "😐 Expresión neutra: ojos abiertos sin forzar, labios relajados (sin sonreír ni apretar), cejas en reposo. Pide: «mira al objetivo y relaja completamente la cara» y comprueba que no aprieta los dientes.\n" +
      "📐 Plano de Frankfurt horizontal: línea imaginaria entre el borde inferior de la órbita (bajo el ojo) y el trago (la pieza de cartílago justo delante del oído), paralela al suelo. Si el mentón está elevado, el plano sube; si está bajado, el plano baja — corrígelo antes de disparar.\n" +
      "🖼️ Encuadre: rostro completo desde arriba de la cabeza hasta la base del cuello, ocupando 70-80% del encuadre vertical. Fondo liso y neutro, sin texturas ni objetos detrás.",
  },
  {
    value: "lateral_izq",
    label: "Lateral izquierda",
    tips:
      "Perfil puro (90°) del lado izquierdo, oreja completa visible.\n" +
      "📐 Plano de Frankfurt: igual que en la frontal — borde orbital inferior y trago alineados con el suelo. En perfil el trago se ve con claridad. Pide que mire recto al frente, ni arriba ni abajo.\n" +
      "🖼️ Encuadre: perfil completo desde la frente hasta el mentón y hasta el cuello. Deja espacio delante de la nariz (importante para medir el ángulo nasofacial) y detrás del cráneo.",
  },
  {
    value: "lateral_der",
    label: "Lateral derecha",
    tips:
      "Perfil puro (90°) del lado derecho, oreja completa visible.\n" +
      "📐 Plano de Frankfurt: igual que en la frontal — borde orbital inferior y trago alineados con el suelo. En perfil el trago se ve con claridad. Pide que mire recto al frente, ni arriba ni abajo.\n" +
      "🖼️ Encuadre: perfil completo desde la frente hasta el mentón y hasta el cuello. Deja espacio delante de la nariz (importante para medir el ángulo nasofacial) y detrás del cráneo.",
  },
  {
    value: "oblicua_izq",
    label: "Oblicua izquierda",
    tips: "A 45° hacia el lado izquierdo, entre la frontal y la lateral. Misma luz e iluminación que la frontal. Útil para valorar pómulo y surco nasogeniano.",
  },
  {
    value: "oblicua_der",
    label: "Oblicua derecha",
    tips: "A 45° hacia el lado derecho, entre la frontal y la lateral. Misma luz e iluminación que la frontal. Útil para valorar pómulo y surco nasogeniano.",
  },
];

const CHECKLISTS: Record<string, string[]> = {
  frontal: [
    "Fondo neutro y liso — blanco, gris o azul claro, sin texturas ni objetos",
    "Iluminación frontal homogénea — sin sombras duras, sin contraluz",
    "Expresión neutra — ojos abiertos, labios relajados, cejas en reposo",
    "Plano de Frankfurt — borde orbital inferior y trago alineados horizontalmente",
    "Sin accesorios — gafas, pendientes y cabello apartados de la frente y los ojos",
  ],
  lateral_izq: [
    "Perfil estricto 90° — no se ve la mejilla contralateral ni el otro ojo",
    "Plano Frankfurt horizontal — trago y borde orbital alineados con el suelo",
    "Iluminación homogénea — contorno nasal y labial claramente visibles, sin sombras",
    "Encuadre correcto — frente + mentón + cuello visibles, espacio delante de la nariz",
    "Mismas condiciones que foto frontal — mismo dispositivo, misma sesión, sin retocar el cabello",
  ],
  lateral_der: [
    "Perfil estricto 90° — no se ve la mejilla contralateral ni el otro ojo",
    "Plano Frankfurt horizontal — trago y borde orbital alineados con el suelo",
    "Iluminación homogénea — contorno nasal y labial claramente visibles, sin sombras",
    "Encuadre correcto — frente + mentón + cuello visibles, espacio delante de la nariz",
    "Mismas condiciones que foto frontal — mismo dispositivo, misma sesión, sin retocar el cabello",
  ],
};

type TechCheck = {
  ok: boolean;
  resOk: boolean;
  fmtOk: boolean;
  lumOk: boolean;
  width: number;
  height: number;
  luminosity: number;
  messages: string[];
};

function validateImageFile(file: File): Promise<TechCheck> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const messages: string[] = [];

      const resOk = width >= 800 && height >= 600;
      if (!resOk) messages.push(`📐 Resolución ${width}×${height}px — mínimo recomendado 800×600px.`);

      const fmtOk = width <= height * 1.25;
      if (!fmtOk) messages.push("🖼️ Formato horizontal detectado — la foto facial debe ser vertical (retrato).");

      const tmp = document.createElement("canvas");
      tmp.width = 60;
      tmp.height = 60;
      const tc = tmp.getContext("2d")!;
      tc.drawImage(img, 0, 0, 60, 60);
      const d = tc.getImageData(0, 0, 60, 60).data;
      let lum = 0;
      for (let i = 0; i < d.length; i += 4) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lum /= 60 * 60;

      const lumOk = lum >= 60 && lum <= 220;
      if (lum < 60) messages.push(`💡 Luminosidad media ${Math.round(lum)}/255 — demasiado oscuro. Acerca una luz frontal difusa o mueve al paciente a una zona mejor iluminada.`);
      else if (lum > 220) messages.push(`💡 Luminosidad media ${Math.round(lum)}/255 — sobreexpuesta. Aleja la fuente de luz o reduce la exposición de la cámara.`);

      URL.revokeObjectURL(url);
      resolve({
        ok: resOk && fmtOk && lumOk,
        resOk,
        fmtOk,
        lumOk,
        width,
        height,
        luminosity: Math.round(lum),
        messages,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: true, resOk: true, fmtOk: true, lumOk: true, width: 0, height: 0, luminosity: 0, messages: [] });
    };
    img.src = url;
  });
}

export default function PhotoUploader({
  patientId,
  sessionId,
}: {
  patientId: string;
  sessionId: string;
}) {
  const [viewType, setViewType] = useState("frontal");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>([false, false, false, false, false]);
  const [techCheck, setTechCheck] = useState<TechCheck | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const checklist = CHECKLISTS[viewType];
  const doneCount = checked.filter(Boolean).length;

  function handleViewTypeChange(v: string) {
    setViewType(v);
    setChecked([false, false, false, false, false]);
    setTechCheck(null);
  }

  function toggleCheck(i: number) {
    setChecked((prev) => prev.map((c, idx) => (idx === i ? !c : c)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    if (files[0]) {
      const check = await validateImageFile(files[0]);
      setTechCheck(check);
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${patientId}/${sessionId}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("session-photos")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase
          .from("session_photos")
          .insert({
            session_id: sessionId,
            storage_path: path,
            view_type: viewType,
            created_by: user?.id ?? null,
          });
        if (insertError) throw insertError;
      }

      router.refresh();
    } catch (e: any) {
      setError(e.message ?? "Error al subir la foto.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="bg-white border border-rule rounded-2xl p-4 mb-6">
      <p className="text-sm font-semibold text-mid uppercase tracking-wide mb-3">
        Añadir fotos
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select
          value={viewType}
          onChange={(e) => handleViewTypeChange(e.target.value)}
          disabled={uploading}
          className="border border-rule rounded-lg px-3 py-2 text-sm"
        >
          {VIEW_TYPES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>

        <label className="bg-accent2 text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition cursor-pointer">
          {uploading ? "Subiendo…" : "Elegir fotos"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      <p className="text-xs text-mid mb-3 whitespace-pre-line">
        {VIEW_TYPES.find((v) => v.value === viewType)?.tips}
      </p>

      {checklist && (
        <div className="bg-warm border border-rule rounded-xl p-3 mb-3">
          <p className="text-xs font-semibold text-mid uppercase tracking-wide mb-2">
            Verificación antes de capturar
          </p>
          <div className="space-y-1.5 mb-2">
            {checklist.map((item, i) => (
              <label key={i} className="flex items-start gap-2 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => toggleCheck(i)}
                  className="mt-0.5"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className={`text-xs font-medium ${doneCount === 5 ? "text-green-700" : "text-amber-700"}`}>
            {doneCount === 5
              ? "✓ Todas las condiciones verificadas — puedes capturar"
              : `${doneCount} de 5 condiciones verificadas`}
          </p>
        </div>
      )}

      {techCheck && (
        <div
          className={`text-xs rounded-lg px-3 py-2 mb-2 border ${
            techCheck.ok
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {techCheck.ok ? (
            <p>✓ Condiciones técnicas correctas ({techCheck.width}×{techCheck.height}px, luminosidad {techCheck.luminosity})</p>
          ) : (
            <div className="space-y-1">
              {techCheck.messages.map((m, i) => (
                <p key={i}>⚠ {m}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
