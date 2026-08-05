import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import TeamManager from "./TeamManager";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "doctor") {
    return (
      <div className="text-sm text-mid">
        Solo la médica puede gestionar el equipo.
      </div>
    );
  }

  const { data: teamProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, assigned_doctor_id")
    .or(`id.eq.${user.id},assigned_doctor_id.eq.${user.id}`);

  const admin = createAdminClient();
  const team = await Promise.all(
    (teamProfiles ?? [])
      .sort((a, b) => (a.role === "doctor" ? -1 : b.role === "doctor" ? 1 : 0))
      .map(async (p) => {
        const { data } = await admin.auth.admin.getUserById(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          role: p.role,
          email: data.user?.email ?? "—",
        };
      })
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-ink mb-6">Equipo</h1>
      <TeamManager team={team} currentUserId={user.id} />
    </div>
  );
}
