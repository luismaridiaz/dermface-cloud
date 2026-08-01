"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const VIEW_TYPES = [
  { value: "frontal", label: "Frontal" },
  { value: "lateral_izq", label: "Lateral izquierda" },
  { value: "lateral_der", label: "Lateral derecha" },
  { value: "oblicua_izq", label: "Oblicua izquierda" },
  { value: "oblicua_der", label: "Oblicua derecha" },
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
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
