"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSession(patientId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: newSession, error } = await supabase
    .from("sessions")
    .insert({ patient_id: patientId, created_by: user.id })
    .select("id")
    .single();

  if (error || !newSession) {
    console.error("Error creando sesión:", error?.message);
    return;
  }

  redirect(`/dashboard/sessions/${newSession.id}`);
}
