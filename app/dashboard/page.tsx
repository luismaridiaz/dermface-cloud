import { createClient } from "@/lib/supabase/server";
import { createPatient } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, assigned_doctor_id, full_name")
    .eq("id", user!.id)
    .single();

  // RLS ya filtra esto automáticamente: una médica ve las suyas, una
  // auxiliar ve las de su médica asignada. No hace falta filtrar aquí.
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, full_name, birth_date, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-ink">Pacientes</h1>
      </div>

      {profile?.role === "staff" && !profile?.assigned_doctor_id && (
        <div className="mb-6 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3">
          No tienes ninguna médica asignada todavía. Pide a tu administradora
          que te empareje con una médica para poder ver pacientes.
        </div>
      )}

      <div className="bg-white border border-rule rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-mid uppercase tracking-wide mb-3">
          Nueva paciente
        </h2>
        <form action={createPatient} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            name="full_name"
            placeholder="Nombre completo"
            required
            className="flex-1 border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <input
            type="date"
            name="birth_date"
            className="border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="bg-accent2 text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition whitespace-nowrap"
          >
            + Añadir
          </button>
        </form>
      </div>

      <div className="bg-white border border-rule rounded-2xl divide-y divide-rule">
        {error && (
          <div className="p-4 text-sm text-red-700">
            Error al cargar pacientes: {error.message}
          </div>
        )}
        {patients && patients.length === 0 && (
          <div className="p-6 text-sm text-mid text-center">
            Todavía no hay pacientes. Añade la primera arriba.
          </div>
        )}
        {patients?.map((p) => (
          <div key={p.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-ink">{p.full_name}</div>
              <div className="text-xs text-mid">
                {p.birth_date ? `Nacimiento: ${p.birth_date}` : "Sin fecha de nacimiento"}
              </div>
            </div>
            <div className="text-xs text-mid">
              Alta: {new Date(p.created_at).toLocaleDateString("es-ES")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
