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
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

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
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={viewType}
          onChange={(e) => setViewType(e.target.value)}
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
      <p className="text-xs text-mid mt-2 whitespace-pre-line">
        {VIEW_TYPES.find((v) => v.value === viewType)?.tips}
      </p>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
