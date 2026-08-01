import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveClinicalData } from "./actions";
import ClinicalForm from "./ClinicalForm";

export default async function SessionPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date, patient_id, patients(full_name)")
    .eq("id", params.id)
    .single();

  if (!session) {
    return <div className="text-sm text-mid">Sesión no encontrada.</div>;
  }

  const { data: clinical } = await supabase
    .from("clinical_data")
    .select("*")
    .eq("session_id", params.id)
    .maybeSingle();

  const canEdit = profile?.role === "doctor";
  const action = saveClinicalData.bind(null, params.id);
  const patientName = (session as any).patients?.full_name ?? "Paciente";

  return (
    <div>
      <Link
        href={`/dashboard/patients/${session.patient_id}`}
        className="text-xs text-mid hover:text-accent"
      >
        ← {patientName}
      </Link>

      <h1 className="text-xl font-bold text-ink mt-2 mb-1">{patientName}</h1>
      <p className="text-xs text-mid mb-6">
        Sesión del{" "}
        {new Date(session.session_date).toLocaleDateString("es-ES")}
      </p>

      <ClinicalForm action={action} initialData={clinical} readOnly={!canEdit} />

      {!canEdit && (
        <p className="mt-4 text-xs text-mid">
          Solo la médica puede editar los datos clínicos de esta sesión.
        </p>
      )}
    </div>
  );
}
