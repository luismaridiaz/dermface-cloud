import { createClient } from "@/lib/supabase/server";
import { createPatient } from "./actions";
import PatientsList from "./PatientsList";

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
    .select("id, full_name, patient_number, created_at")
    .order("patient_number", { ascending: true });

  const { data: sessions } = await supabase
    .from("sessions")
    .select("patient_id, session_date")
    .order("session_date", { ascending: false });

  const statsByPatient = new Map<string, { count: number; lastVisit: string | null }>();
  (sessions ?? []).forEach((s) => {
    const cur = statsByPatient.get(s.patient_id) ?? { count: 0, lastVisit: null };
    cur.count += 1;
    if (!cur.lastVisit) cur.lastVisit = s.session_date; // ya viene ordenado desc
    statsByPatient.set(s.patient_id, cur);
  });

  const patientRows = (patients ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    patient_number: p.patient_number,
    sessionCount: statsByPatient.get(p.id)?.count ?? 0,
    lastVisit: statsByPatient.get(p.id)?.lastVisit ?? null,
  }));

  const canDelete = profile?.role === "doctor";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-ink">Pacientes</h1>
        <a
          href="/api/export-patients"
          className="text-xs bg-white border border-rule text-ink rounded-full px-4 py-2 hover:border-accent/50 transition"
        >
          ⬇ Exportar a Excel
        </a>
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
          <button
            type="submit"
            className="bg-accent2 text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition whitespace-nowrap"
          >
            + Añadir
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-700">
          Error al cargar pacientes: {error.message}
        </div>
      )}

      <PatientsList patients={patientRows} canDelete={canDelete} />
    </div>
  );
}
