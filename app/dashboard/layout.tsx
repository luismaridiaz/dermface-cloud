import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const roleLabel = profile?.role === "doctor" ? "Médica" : "Auxiliar";

  return (
    <div className="min-h-screen">
      <header className="bg-ink text-paper px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="font-bold tracking-wide">
            DermFace Cloud
          </Link>
          {profile?.role === "doctor" && (
            <Link href="/dashboard/team" className="text-sm text-mid hover:text-paper transition">
              Equipo
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-mid">
            {profile?.full_name ?? user.email} · <span className="text-accent">{roleLabel}</span>
          </span>
          <form action={logout}>
            <button className="text-mid hover:text-paper transition">Salir</button>
          </form>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
