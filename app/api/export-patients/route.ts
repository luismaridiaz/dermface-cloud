import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select("patient_id, session_date")
    .order("session_date", { ascending: false });

  const { data: patientsWithId } = await supabase
    .from("patients")
    .select("id, patient_number, full_name, birth_date, created_at")
    .order("patient_number", { ascending: true });

  const statsByPatient = new Map<string, { count: number; lastVisit: string | null }>();
  (sessions ?? []).forEach((s) => {
    const cur = statsByPatient.get(s.patient_id) ?? { count: 0, lastVisit: null };
    cur.count += 1;
    if (!cur.lastVisit) cur.lastVisit = s.session_date;
    statsByPatient.set(s.patient_id, cur);
  });

  const rows = (patientsWithId ?? []).map((p) => ({
    "Nº": p.patient_number ?? "",
    Nombre: p.full_name,
    "Fecha de nacimiento": p.birth_date ?? "",
    "Nº sesiones": statsByPatient.get(p.id)?.count ?? 0,
    "Última visita": statsByPatient.get(p.id)?.lastVisit ?? "",
    "Fecha de alta": p.created_at ? new Date(p.created_at).toLocaleDateString("es-ES") : "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pacientes");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pacientes-dermface-${fecha}.xlsx"`,
    },
  });
}
