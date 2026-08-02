"use client";

import { useState } from "react";
import Link from "next/link";
import { deletePatient } from "./actions";

type PatientRow = {
  id: string;
  full_name: string;
  patient_number: number | null;
  sessionCount: number;
  lastVisit: string | null;
};

export default function PatientsList({
  patients,
  canDelete,
}: {
  patients: PatientRow[];
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = patients.filter((p) =>
    p.full_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function handleDelete(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Borrar a ${name}? Se borran también todas sus sesiones, datos clínicos y fotos. No se puede deshacer.`)) {
      return;
    }
    setDeletingId(id);
    setErrorMsg(null);
    const { error } = await deletePatient(id);
    if (error) setErrorMsg(error);
    setDeletingId(null);
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre…"
        className="w-full border border-rule rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent"
      />

      {errorMsg && (
        <div className="mb-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2">
          {errorMsg}
        </div>
      )}

      <div className="bg-white border border-rule rounded-2xl divide-y divide-rule">
        {filtered.length === 0 && (
          <div className="p-6 text-sm text-mid text-center">
            {patients.length === 0
              ? "Todavía no hay pacientes. Añade la primera arriba."
              : "Ninguna paciente coincide con la búsqueda."}
          </div>
        )}
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/patients/${p.id}`}
            className="p-4 flex items-center justify-between hover:bg-warm transition"
          >
            <div>
              <div className="font-medium text-ink">
                <span className="text-mid font-normal">#{p.patient_number ?? "—"}</span> {p.full_name}
              </div>
              <div className="text-xs text-mid">
                {p.sessionCount} {p.sessionCount === 1 ? "sesión" : "sesiones"}
                {p.lastVisit && ` · última: ${new Date(p.lastVisit).toLocaleDateString("es-ES")}`}
              </div>
            </div>
            {canDelete && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, p.id, p.full_name)}
                disabled={deletingId === p.id}
                className="text-xs text-red-700 underline disabled:opacity-60"
              >
                {deletingId === p.id ? "Borrando…" : "Borrar"}
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
