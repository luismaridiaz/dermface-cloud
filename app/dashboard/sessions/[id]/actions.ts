"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MERZ_REGION_IDS = [
  "frontales",
  "glabela",
  "crow",
  "suborbital",
  "cejas",
  "naso",
  "malar",
  "nariz",
  "perioral",
  "mentolabial",
  "menton",
  "mandib",
  "marioneta",
  "platisma",
  "cervical",
];

export async function saveClinicalData(sessionId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const num = (name: string): number | null => {
    const v = formData.get(name);
    if (v === null || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const str = (name: string): string | null => {
    const v = formData.get(name) as string;
    return v ? v : null;
  };

  const peso = num("peso");
  const talla = num("talla");
  const imc =
    peso && talla ? Number((peso / Math.pow(talla / 100, 2)).toFixed(1)) : null;

  const merz: Record<string, { rest: number | null; dyn: number | null }> = {};
  MERZ_REGION_IDS.forEach((id) => {
    merz[id] = { rest: num(`merz_${id}_rest`), dyn: num(`merz_${id}_dyn`) };
  });

  const { error } = await supabase.from("clinical_data").upsert(
    {
      session_id: sessionId,
      motivo: str("motivo"),
      previos: str("previos"),
      peso,
      talla,
      imc,
      sol: num("sol"),
      tabaco: num("tabaco"),
      estres: num("estres"),
      glogau: num("glogau"),
      fitzpatrick: str("fitzpatrick"),
      merz,
      nau_fore: num("nau_fore"),
      nau_perio: num("nau_perio"),
      nau_malar: num("nau_malar"),
      nau_naso: num("nau_naso"),
      nau_ment: num("nau_ment"),
      nau_neck: num("nau_neck"),
      nau_lax: num("nau_lax"),
      nau_skin: num("nau_skin"),
      nau_asym: num("nau_asym"),
      hidra: num("hidra"),
      elastic: num("elastic"),
      pigment: num("pigment"),
      sebo: num("sebo"),
      eritema: num("eritema"),
      tewl: num("tewl"),
      consent_sig: str("consent_sig"),
      consent_prof: str("consent_prof"),
      consent_ok: formData.get("consent_ok") === "on",
      informe: str("informe"),
      plan_tratamiento: str("plan_tratamiento"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" }
  );

  if (error) {
    console.error("Error guardando clinical_data:", error.message);
    return;
  }

  revalidatePath(`/dashboard/sessions/${sessionId}`);
}
