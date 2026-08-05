"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireDoctor() {
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

  if (profile?.role !== "doctor") return null;
  return user;
}

export async function createTeamMember(formData: FormData) {
  const doctor = await requireDoctor();
  if (!doctor) return { error: "Solo la médica puede añadir miembros al equipo." };

  const email = (formData.get("email") as string || "").trim();
  const password = formData.get("password") as string;
  const full_name = (formData.get("full_name") as string || "").trim();
  const role = (formData.get("role") as string) || "staff";

  if (!email || !password || password.length < 6) {
    return { error: "Correo y contraseña (mínimo 6 caracteres) son obligatorios." };
  }

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? "Error al crear el usuario." };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: full_name || null,
    role,
    assigned_doctor_id: role === "staff" ? doctor.id : null,
  });
  if (profileError) {
    return { error: `Usuario creado, pero falló el perfil: ${profileError.message}` };
  }

  revalidatePath("/dashboard/team");
  return { error: null };
}

export async function deleteTeamMember(userId: string) {
  const doctor = await requireDoctor();
  if (!doctor) return { error: "No autorizado." };
  if (userId === doctor.id) return { error: "No puedes borrarte a ti misma." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/team");
  return { error: null };
}

export async function resetTeamMemberPassword(userId: string, newPassword: string) {
  const doctor = await requireDoctor();
  if (!doctor) return { error: "No autorizado." };
  if (!newPassword || newPassword.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { error: error.message };
  return { error: null };
}
