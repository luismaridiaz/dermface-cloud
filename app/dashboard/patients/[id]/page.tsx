import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createSession } from "./actions";

export default async function PatientPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, full_name, birth_date")
    .eq("id", params.id)
    .single();

  if (!patient) {
    return <div className="text-sm text-mid">Paciente no encontrada.</div>;
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, status")
    .eq("patient_id", params.id)
    .order("session_date", { ascending: false });

  const newSessionAction = createSession.bind(null, params.id);

  return (
    <div>
      <Link href="/dashboard" className="text-xs text-mid hover:text-accent">
        ← Pacientes
      </Link>

      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-xl font-bold text-ink">{patient.full_name}</h1>
        <form action={newSessionAction}>
          <button
            type="submit"
            className="bg-accent2 text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition"
          >
            + Nueva sesión
          </button>
        </form>
      </div>

      <div className="bg-white border border-rule rounded-2xl divide-y divide-rule">
        {sessions && sessions.length === 0 && (
          <div className="p-6 text-sm text-mid text-center">
            Todavía no hay sesiones. Crea la primera arriba.
          </div>
        )}
        {sessions?.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/sessions/${s.id}`}
            className="p-4 flex items-center justify-between hover:bg-warm transition"
          >
            <span className="text-ink">
              {new Date(s.session_date).toLocaleDateString("es-ES")}
            </span>
            <span className="text-xs text-mid">
              {s.status === "complete" ? "Completa" : "Borrador"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
