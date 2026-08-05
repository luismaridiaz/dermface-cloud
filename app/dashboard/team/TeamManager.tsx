"use client";

import { useState } from "react";
import { createTeamMember, deleteTeamMember, resetTeamMemberPassword } from "./actions";

type Member = {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string;
};

export default function TeamManager({
  team,
  currentUserId,
}: {
  team: Member[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError(null);
    const res = await createTeamMember(formData);
    if (res?.error) setError(res.error);
    else {
      const formEl = document.getElementById("team-create-form") as HTMLFormElement | null;
      formEl?.reset();
    }
    setCreating(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Borrar a ${name}? Perderá el acceso a la app inmediatamente. No se puede deshacer.`)) {
      return;
    }
    setBusyId(id);
    const res = await deleteTeamMember(id);
    if (res?.error) alert(res.error);
    setBusyId(null);
  }

  async function handleResetSubmit(id: string) {
    if (!newPassword || newPassword.length < 6) {
      alert("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setBusyId(id);
    const res = await resetTeamMemberPassword(id, newPassword);
    if (res?.error) alert(res.error);
    else alert("Contraseña actualizada. Comunícasela por un canal seguro.");
    setBusyId(null);
    setResetId(null);
    setNewPassword("");
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-rule rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-mid uppercase tracking-wide mb-3">
          Añadir al equipo
        </h2>
        <form id="team-create-form" action={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            name="full_name"
            placeholder="Nombre completo"
            required
            className="border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <input
            name="email"
            type="email"
            placeholder="Correo electrónico"
            required
            className="border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <input
            name="password"
            type="text"
            placeholder="Contraseña temporal (mín. 6)"
            required
            minLength={6}
            className="border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <select
            name="role"
            className="border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          >
            <option value="staff">Auxiliar</option>
            <option value="doctor">Médica</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="sm:col-span-2 bg-accent2 text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
          >
            {creating ? "Creando…" : "+ Añadir"}
          </button>
        </form>
        {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
        <p className="text-xs text-mid mt-2">
          Comparte el correo y la contraseña temporal con la persona por un canal seguro — puede cambiarla al entrar.
        </p>
      </div>

      <div className="bg-white border border-rule rounded-2xl divide-y divide-rule">
        {team.map((m) => (
          <div key={m.id} className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-medium text-ink">
                  {m.full_name || "Sin nombre"}{" "}
                  {m.id === currentUserId && <span className="text-xs text-mid">(tú)</span>}
                </div>
                <div className="text-xs text-mid">
                  {m.email} · {m.role === "doctor" ? "Médica" : "Auxiliar"}
                </div>
              </div>
              {m.id !== currentUserId && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResetId(resetId === m.id ? null : m.id)}
                    className="text-xs text-accent underline"
                  >
                    Restablecer contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id, m.full_name || m.email)}
                    disabled={busyId === m.id}
                    className="text-xs text-red-700 underline disabled:opacity-60"
                  >
                    {busyId === m.id ? "Borrando…" : "Borrar"}
                  </button>
                </div>
              )}
            </div>
            {resetId === m.id && (
              <div className="mt-2 flex gap-2 items-center flex-wrap">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña (mín. 6)"
                  className="border border-rule rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[180px]"
                />
                <button
                  type="button"
                  onClick={() => handleResetSubmit(m.id)}
                  disabled={busyId === m.id}
                  className="text-xs bg-accent text-white rounded-full px-3 py-1.5 disabled:opacity-60"
                >
                  {busyId === m.id ? "Guardando…" : "Guardar"}
                </button>
              </div>
            )}
          </div>
        ))}
        {team.length === 0 && (
          <div className="p-6 text-sm text-mid text-center">Todavía no hay nadie en el equipo.</div>
        )}
      </div>
    </div>
  );
}
