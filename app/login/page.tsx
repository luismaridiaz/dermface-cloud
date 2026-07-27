import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-rule rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-ink mb-1">DermFace Cloud</h1>
        <p className="text-sm text-mid mb-6">Acceso para médicas y auxiliares</p>

        {params?.error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {params.error}
          </div>
        )}

        <form action={login} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-mid mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              name="email"
              required
              className="w-full border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-mid mb-1">
              Contraseña
            </label>
            <input
              type="password"
              name="password"
              required
              className="w-full border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="mt-2 bg-accent text-white rounded-full py-2.5 text-sm font-semibold hover:opacity-90 transition"
          >
            Entrar
          </button>
        </form>

        <p className="text-xs text-mid mt-6">
          Las cuentas las crea la administradora del sistema — no hay
          autorregistro. Contacta con tu médica responsable si no tienes acceso.
        </p>
      </div>
    </div>
  );
}
