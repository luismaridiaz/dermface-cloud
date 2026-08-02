"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPatient(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, assigned_doctor_id")
    .eq("id", user.id)
    .single();

  // Si es médica, la paciente es suya. Si es auxiliar, es de la médica
  // a la que está emparejada ahora mismo (lo aplica también la policy
  // RLS "patients_insert_by_staff" como segunda barrera de seguridad).
  const ownerDoctorId =
    profile?.role === "doctor" ? user.id : profile?.assigned_doctor_id;

  if (!ownerDoctorId) return; // auxiliar sin médica asignada — no hay dónde crearla

  const full_name = formData.get("full_name") as string;
  const birth_date = (formData.get("birth_date") as string) || null;

  await supabase.from("patients").insert({
    owner_doctor_id: ownerDoctorId,
    full_name,
    birth_date,
  });

  revalidatePath("/dashboard");
}

export async function deletePatient(patientId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  // RLS (patients_write_own_doctor) ya bloquea el borrado si no eres la
  // médica dueña de la paciente — esto es una segunda barrera de UI.
  const { error } = await supabase.from("patients").delete().eq("id", patientId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { error: null };
}
