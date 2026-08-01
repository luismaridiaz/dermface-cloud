import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { saveClinicalData } from "./actions";
import ClinicalForm from "./ClinicalForm";
import PhotoUploader from "./PhotoUploader";
import PhotoGallery from "./PhotoGallery";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error: saveError } = await searchParams;
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
    .eq("id", id)
    .single();

  if (!session) {
    return <div className="text-sm text-mid">Sesión no encontrada.</div>;
  }

  const { data: clinical } = await supabase
    .from("clinical_data")
    .select("*")
    .eq("session_id", id)
    .maybeSingle();

  const { data: photoRows } = await supabase
    .from("session_photos")
    .select(
      "id, storage_path, view_type, created_at, landmarks, cervicomental_angle, interpupilar_angle, asymmetry_pct, brow_izq_angle, brow_der_angle, manual_nasofacial_angle, manual_nasolabial_angle, manual_mentolabial_angle"
    )
    .eq("session_id", id)
    .order("created_at", { ascending: false });

  const photos = await Promise.all(
    (photoRows ?? []).map(async (p) => {
      const { data: signed } = await supabase.storage
        .from("session-photos")
        .createSignedUrl(p.storage_path, 3600);
      return { ...p, url: signed?.signedUrl ?? null };
    })
  );

  const canEdit = profile?.role === "doctor";
  const action = saveClinicalData.bind(null, id);
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

      {saved && (
        <div className="mb-5 text-sm bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3">
          ✓ Sesión guardada correctamente.
        </div>
      )}
      {saveError && (
        <div className="mb-5 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
          Error al guardar: {saveError}
        </div>
      )}

      <PhotoUploader patientId={session.patient_id} sessionId={id} />

      <PhotoGallery photos={photos} canDelete={canEdit} />

      <ClinicalForm action={action} initialData={clinical} readOnly={!canEdit} sessionId={id} />

      {!canEdit && (
        <p className="mt-4 text-xs text-mid">
          Solo la médica puede editar los datos clínicos de esta sesión.
        </p>
      )}
    </div>
  );
}
