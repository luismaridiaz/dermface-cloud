# DermFace Cloud — Fase 1 (esqueleto)

✅ **Actualización**: a diferencia de la primera versión de este documento,
esta ya se ha probado de verdad — login funcionando en local contra un
proyecto Supabase real, con Next.js 16.2.10 (versión con las vulnerabilidades
críticas/altas conocidas ya corregidas). Sigue habiendo pasos manuales
(dar de alta usuarios) que solo se han probado por terminal (`curl`), no
desde la pantalla de Supabase — puede que la interfaz web tenga algún
campo distinto a lo descrito aquí.

## Qué incluye esta fase

- Login con Supabase Auth (correo + contraseña, sin autorregistro).
- Dos roles: `doctor` (médica) y `staff` (auxiliar).
- Cada auxiliar está emparejada con una médica (`assigned_doctor_id`).
- Lista de pacientes con alta de nueva paciente.
- Permisos aplicados a nivel de base de datos (Row Level Security), no solo
  en la interfaz — una médica solo ve sus pacientes; una auxiliar solo ve
  las de su médica asignada.

## Qué NO incluye todavía

Nada de lo clínico: fotos, Glogau/Fitzpatrick/Merz/NAU, biofísicos,
MediaPipe, informe, plan de tratamiento. Eso es la Fase 2 y 3.

## 1. Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → New Project.
2. Elige una región **en la UE** (por RGPD — datos de salud de pacientes).
3. Cuando esté listo, ve a **SQL Editor** → pega el contenido de
   `supabase/schema.sql` → Run.
4. Ve a **Project Settings → API** y copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Configurar el proyecto localmente

```bash
cp .env.local.example .env.local
# rellena .env.local con los valores del paso anterior
npm install
npm run dev
```

Abre `http://localhost:3000` — debería redirigirte a `/login`.

## 3. Dar de alta a las médicas y auxiliares

Fase 1 no tiene pantalla de administración todavía — se crean a mano desde
el panel de Supabase:

1. **Authentication → Users → Add user** (correo + contraseña).
2. En **User Metadata**, añade:
   ```json
   { "full_name": "Nombre de la persona", "role": "doctor" }
   ```
   (o `"role": "staff"` para una auxiliar). El trigger `handle_new_user`
   crea el perfil automáticamente con estos datos.
3. Si es auxiliar, hay que emparejarla con su médica manualmente por ahora:
   ve a **Table Editor → profiles**, busca su fila, y rellena
   `assigned_doctor_id` con el `id` de la médica correspondiente (cópialo
   de la fila de esa médica en la misma tabla).

   *(Esto es manual a propósito en la Fase 1 — en la Fase 2 se puede
   construir una pantalla de administración para hacerlo sin tocar
   Supabase directamente.)*

## 4. Subir a GitHub y desplegar en Vercel

```bash
git init
git add .
git commit -m "Fase 1: esqueleto con auth y roles"
git remote add origin <tu-repo-de-github>
git push -u origin main
```

En [vercel.com](https://vercel.com):
1. Import Project → selecciona el repo de GitHub.
2. En **Environment Variables**, añade `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (los mismos valores de tu `.env.local`).
3. Deploy.

## Problemas reales encontrados al probarlo (y su solución)

- **`Invalid path specified in request URL`** al hacer login → la
  `NEXT_PUBLIC_SUPABASE_URL` tenía `/rest/v1/` al final, copiado sin querer
  de la pantalla de Supabase. Debe ser solo `https://tuproyecto.supabase.co`.
- **Login dice "incorrectos" con la contraseña correcta** → revisa primero
  que la URL de arriba esté bien; el mensaje de error genérico no distingue
  ese problema de una contraseña real mal escrita.
- **`npm audit` con 1 vulnerabilidad "critical"** → Next.js 14.2.5 tenía
  varias vulnerabilidades conocidas (no la RCE crítica de v15/16, que no
  afecta a la serie 14.2.x, pero sí DoS y exposición de código). Solución
  aplicada: Next.js 16.2.10 + React 19.2.4 + @supabase/ssr 0.12.1 (API de
  cookies `getAll`/`setAll`, distinta a versiones anteriores) +
  @supabase/supabase-js 2.110.3.
- **Claves de Supabase**: proyectos nuevos ya no muestran la `anon key`
  clásica — usan `sb_publishable_...` (pública, para el navegador) y
  `sb_secret_...` (privada, solo para peticiones de administrador como
  `curl .../admin/users`). Nunca pongas la `secret` en variables
  `NEXT_PUBLIC_...`.

## Dar de alta un usuario por terminal (alternativa a la pantalla web)

Si la pantalla de "Add user" de Supabase no muestra un campo de metadata,
se puede crear directamente con la clave secreta (cuidado: no la compartas
ni la subas a ningún sitio):

```bash
SECRET_KEY="tu_clave_sb_secret"
curl -i -X POST 'https://tuproyecto.supabase.co/auth/v1/admin/users' \
  -H "apikey: $SECRET_KEY" -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"correo@ejemplo.com","password":"unaContraseña","email_confirm":true,"user_metadata":{"full_name":"Nombre","role":"doctor"}}'
```

Si el trigger no rellenó bien `full_name`/`role` en la tabla `profiles`,
corrígelo con SQL Editor:

```sql
update profiles set full_name = 'Nombre', role = 'doctor'
where id = (select id from auth.users where email = 'correo@ejemplo.com');
```

## Nota RGPD (pendiente de resolver en serio, no de trámite)

Esto ya no es "todo local, nada sale del dispositivo" como DermFace
original. En cuanto haya fotos y datos de salud de pacientes reales en
Supabase, hace falta: región del servidor en la UE (paso 1 ya lo cubre),
un acuerdo de encargado de tratamiento con Supabase, y probablemente
revisar esto con alguien que conozca RGPD sanitario en profundidad antes
de usarlo con pacientes reales — esto no lo resuelve el código por sí solo.
