-- ═══════════════════════════════════════════════════════════════════════
-- DermFace Cloud · Esquema inicial (Fase 1: solo estructura y permisos)
-- Ejecutar en el SQL Editor de tu proyecto Supabase.
-- ═══════════════════════════════════════════════════════════════════════

-- Perfiles de usuario. Se crea automáticamente al registrar un usuario en
-- Supabase Auth (ver trigger al final). role = 'doctor' | 'staff'.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('doctor', 'staff')),
  -- Solo aplica si role = 'staff': a qué médica está emparejada ahora mismo.
  assigned_doctor_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Pacientes. Cada paciente pertenece a una médica (owner_doctor_id).
create table patients (
  id uuid primary key default gen_random_uuid(),
  owner_doctor_id uuid not null references profiles(id) on delete cascade,
  full_name text not null,
  birth_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sesiones clínicas (una por visita). Fase 1: solo el registro básico —
-- las fotos y datos clínicos completos (Glogau/Fitz/Merz/NAU/biofísicos/
-- informe/plan) se añaden en la Fase 2 y 3, ampliando esta tabla o con
-- tablas relacionadas.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  created_by uuid not null references profiles(id),
  session_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'complete')),
  created_at timestamptz default now()
);

-- ── Trigger: crear el perfil automáticamente al registrar un usuario ──────
-- El rol y nombre se pasan como metadata al crear el usuario (ver
-- lib/supabase/admin-notes.md para cómo dar de alta médicas/auxiliares).
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Sin nombre'),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — el corazón del modelo de permisos
-- ═══════════════════════════════════════════════════════════════════════
alter table profiles enable row level security;
alter table patients enable row level security;
alter table sessions enable row level security;

-- Cualquier usuario autenticado puede ver los perfiles (necesario para que
-- una auxiliar sepa a qué médica está emparejada, mostrar nombres, etc.)
create policy "profiles_select_all_authenticated"
  on profiles for select
  using (auth.role() = 'authenticated');

-- Una médica solo ve (y gestiona) SUS pacientes.
-- Una auxiliar solo ve las pacientes de la médica a la que está emparejada
-- ahora mismo (profiles.assigned_doctor_id).
create policy "patients_select_scoped"
  on patients for select
  using (
    owner_doctor_id = auth.uid()
    or owner_doctor_id = (select assigned_doctor_id from profiles where id = auth.uid())
  );

-- Solo la propia médica puede crear/editar/borrar sus pacientes.
create policy "patients_write_own_doctor"
  on patients for all
  using (owner_doctor_id = auth.uid())
  with check (owner_doctor_id = auth.uid());

-- Auxiliares también pueden DAR DE ALTA pacientes nuevas para su médica
-- asignada (p.ej. al recibir a una paciente nueva antes de la cita).
create policy "patients_insert_by_staff"
  on patients for insert
  with check (
    owner_doctor_id = (select assigned_doctor_id from profiles where id = auth.uid())
  );

-- Sesiones: mismo alcance que el paciente al que pertenecen.
create policy "sessions_select_scoped"
  on sessions for select
  using (
    patient_id in (
      select id from patients where
        owner_doctor_id = auth.uid()
        or owner_doctor_id = (select assigned_doctor_id from profiles where id = auth.uid())
    )
  );

create policy "sessions_write_scoped"
  on sessions for insert
  with check (
    patient_id in (
      select id from patients where
        owner_doctor_id = auth.uid()
        or owner_doctor_id = (select assigned_doctor_id from profiles where id = auth.uid())
    )
  );

-- NOTA IMPORTANTE (Fase 1, revisar en Fase 2):
-- Cuando añadamos los campos clínicos completos (Glogau, Fitzpatrick, Merz,
-- NAU, biofísicos, informe, plan de tratamiento) a `sessions`, habrá que
-- restringir qué columnas puede escribir una auxiliar (solo fotos/material)
-- frente a una médica (todo). Row Level Security protege FILAS, no columnas
-- por sí sola — para bloquear columnas concretas hace falta o bien separar
-- esos campos en una tabla aparte (p.ej. `clinical_data`) con su propia
-- policy, o usar una función/vista intermedia. Lo dejamos señalado aquí
-- para no olvidarlo al construir la Fase 2.
