"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildReport } from "./reportEngine";
import { buildDetailedPlan } from "./planEngine";

const MERZ_REGION_IDS = [
  "frontales",
  "glabela",
  "crow",
  "suborbital",
  "cejas",
  "naso",
  "malar",
  "nariz",
  "perioral",
  "mentolabial",
  "menton",
  "mandib",
  "marioneta",
  "platisma",
  "cervical",
];

export async function saveClinicalData(sessionId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const num = (name: string): number | null => {
    const v = formData.get(name);
    if (v === null || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const str = (name: string): string | null => {
    const v = formData.get(name) as string;
    return v ? v : null;
  };

  const peso = num("peso");
  const talla = num("talla");
  const imc =
    peso && talla ? Number((peso / Math.pow(talla / 100, 2)).toFixed(1)) : null;

  const merz: Record<string, { rest: number | null; dyn: number | null }> = {};
  MERZ_REGION_IDS.forEach((id) => {
    merz[id] = { rest: num(`merz_${id}_rest`), dyn: num(`merz_${id}_dyn`) };
  });

  const { error } = await supabase.from("clinical_data").upsert(
    {
      session_id: sessionId,
      edad: num("edad"),
      sexo: str("sexo"),
      motivo: str("motivo"),
      previos: str("previos"),
      peso,
      talla,
      imc,
      sol: num("sol"),
      tabaco: num("tabaco"),
      estres: num("estres"),
      glogau: num("glogau"),
      fitzpatrick: str("fitzpatrick"),
      merz,
      nau_fore: num("nau_fore"),
      nau_perio: num("nau_perio"),
      nau_malar: num("nau_malar"),
      nau_naso: num("nau_naso"),
      nau_ment: num("nau_ment"),
      nau_neck: num("nau_neck"),
      nau_lax: num("nau_lax"),
      nau_skin: num("nau_skin"),
      nau_asym: num("nau_asym"),
      hidra: num("hidra"),
      elastic: num("elastic"),
      pigment: num("pigment"),
      sebo: num("sebo"),
      eritema: num("eritema"),
      tewl: num("tewl"),
      consent_sig: str("consent_sig"),
      consent_prof: str("consent_prof"),
      consent_ok: formData.get("consent_ok") === "on",
      informe: str("informe"),
      plan_tratamiento: str("plan_tratamiento"),
      presupuesto: str("presupuesto"),
      downtime: str("downtime"),
      embarazo: str("embarazo"),
      anticoagulantes: str("anticoagulantes"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );

  if (error) {
    console.error("Error guardando clinical_data:", error.message);
    redirect(
      `/dashboard/sessions/${sessionId}?error=${encodeURIComponent(error.message)}`
    );
  }

  redirect(`/dashboard/sessions/${sessionId}?saved=1`);
}

export async function generateReport(sessionId: string) {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, patients(full_name, birth_date)")
    .eq("id", sessionId)
    .single();

  const { data: clinical } = await supabase
    .from("clinical_data")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: photos } = await supabase
    .from("session_photos")
    .select(
      "view_type, cervicomental_angle, interpupilar_angle, asymmetry_pct, brow_izq_angle, brow_der_angle, manual_nasofacial_angle, manual_nasolabial_angle, manual_mentolabial_angle"
    )
    .eq("session_id", sessionId);

  const frontal = photos?.find((p) => p.view_type === "frontal") ?? null;
  const lateral =
    photos?.find(
      (p) => p.view_type === "lateral_izq" || p.view_type === "lateral_der"
    ) ?? null;

  const patient = (session as any)?.patients;
  let age: number | null = (clinical as any)?.edad ?? null;
  if (age === null && patient?.birth_date) {
    const birth = new Date(patient.birth_date);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  }

  const ctx = {
    patientName: patient?.full_name ?? "Paciente",
    age,
    sexo: (clinical as any)?.sexo ?? null,
    sessionDate: session?.session_date ?? new Date().toISOString(),
    clinical: clinical as any,
    frontal: frontal as any,
    lateral: lateral as any,
  };

  const informe = buildReport(ctx, "full");
  const plan = buildDetailedPlan(ctx);

  return { informe, plan };
}
