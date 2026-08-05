import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de administrador — usa la clave "service role"/"secret". Da acceso
// total a la base de datos y a la gestión de usuarios (crear, borrar,
// cambiar contraseñas), saltándose RLS. NUNCA debe importarse desde un
// componente cliente ni exponerse al navegador — solo desde archivos
// "use server" (server actions) o route handlers.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
