// Plan de tratamiento detallado — puerto fiel de genPlanFromDiagnosis()
// (motor "AestPlan" adaptado) del HTML original. 100% local, sin IA externa.
// Genera texto plano (no las tarjetas visuales del HTML) porque el campo
// "Plan de tratamiento" de la app es un textarea.

import type { ClinicalInput, FrontalPhoto } from "./reportEngine";

const SMOKE_LABELS4 = ["No fumador", "Ex-fumador", "Fumador leve", "Fumador activo"];
const FITZ_NUM: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

function bucket4pt(v: number | null | undefined, max: number): string {
  if (v == null || isNaN(v) || v <= 0) return "Sin indicación";
  const p = v / max;
  if (p <= 0.3) return "Leve";
  if (p <= 0.65) return "Moderada";
  return "Marcada";
}

export type PlanContext = {
  patientName: string;
  age: number | null;
  sexo: string | null;
  sessionDate: string;
  clinical: ClinicalInput | null;
  frontal: FrontalPhoto | null;
};

type Step = {
  titulo: string;
  icono: string;
  contenido: string;
  timing: string;
  warning: string | null;
};

export function buildDetailedPlan(ctx: PlanContext): string {
  const c = (ctx.clinical ?? {}) as ClinicalInput & {
    presupuesto?: string | null;
    downtime?: string | null;
    embarazo?: string | null;
    anticoagulantes?: string | null;
  };

  const edad = ctx.age ?? 40;
  const sexo = ctx.sexo === "Mujer" || ctx.sexo === "Hombre" ? ctx.sexo : "Mujer";
  const fitz = c.fitzpatrick || "III";
  const tabacoIdx = c.tabaco ?? 0;
  const tabaco = SMOKE_LABELS4[tabacoIdx] || "No fumador";
  const lax = Math.round(c.nau_lax ?? 0);

  const nauRegs = [c.nau_fore, c.nau_perio, c.nau_malar, c.nau_naso, c.nau_ment, c.nau_neck]
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  const nau = nauRegs.length
    ? Math.round(nauRegs.reduce((a, b) => a + b, 0) / nauRegs.length)
    : 0;

  const merzObj = c.merz ?? {};
  const dynVals = Object.values(merzObj)
    .map((s) => s?.dyn)
    .filter((v): v is number => typeof v === "number" && !isNaN(v));
  const merz = dynVals.length
    ? Math.round(dynVals.reduce((a, b) => a + b, 0) / dynVals.length)
    : 0;

  const glog = c.glogau ?? 2;

  const frontal = bucket4pt(merzObj.frontales?.dyn, 4);
  const crow = bucket4pt(merzObj.crow?.dyn, 4);
  const naso = bucket4pt(c.nau_naso, 3);

  const neckV = c.nau_neck ?? 0;
  const cervDyn = merzObj.cervical?.dyn ?? 0;
  const platDyn = merzObj.platisma?.dyn ?? 0;
  const neckScore = Math.max(neckV / 3, cervDyn / 4, platDyn / 4);
  const cuello =
    neckScore <= 0 ? "Sin indicación" : neckScore <= 0.35 ? "Laxitud leve" : "Laxitud moderada";

  const labios = "Sin indicación"; // no medido en la versión cloud todavía
  const manos = "Sin indicación"; // no medido en la versión cloud todavía

  const budget = c.presupuesto || "Sin límite";
  const downtime = c.downtime || "Sin restricción";
  const emb = c.embarazo || "No";
  const anticoag = c.anticoagulantes || "No";

  const fitzNum = FITZ_NUM[fitz] || 3;
  const fitzClaro = fitzNum <= 3;
  const tabAct = tabaco === "Fumador activo" || tabaco === "Fumador leve";
  const budgetLow = budget === "< 500€" || budget === "500-1.000€";
  const noDT = downtime === "Sin downtime";

  const alertas: string[] = [];
  if (emb === "Sí") alertas.push("EMBARAZO/LACTANCIA: solo procedimientos tópicos. Suspender todo lo demás.");
  if (anticoag === "Sí")
    alertas.push("ANTICOAGULANTES: usar cánula roma en todos los inyectables. Frío y presión post-inyección. HIFU sin restricción.");
  if (!fitzClaro)
    alertas.push(`FITZPATRICK ${fitz}: despigmentación tópica 8 semanas antes de cualquier ablativo. Reducir fluencias. Mayor riesgo PIH con inyectables superficiales.`);
  if (tabAct) alertas.push("TABAQUISMO ACTIVO: reducción de eficacia bioestimuladores ~25%. Mayor catabolismo colágeno. Informar al paciente.");

  let patron: string;
  if (lax >= 3 && nau >= 2)
    patron = "ESTRUCTURAL AVANZADO — predominan laxitud y pérdida volumétrica. Soporte SMAS primero, volumen después.";
  else if (lax >= 2 && merz >= 2)
    patron = "MIXTO — laxitud moderada + hiperquinesia muscular. Abordaje secuenciado por planos.";
  else if (merz >= 3 && lax <= 1)
    patron = "DINÁMICO — hiperquinesia muscular predominante con mínima laxitud. Primera línea: neuromodulador.";
  else if (glog >= 3) patron = "DÉRMICO — fotoenvejecimiento avanzado. Primera línea: calidad cutánea (peeling/láser/skin booster).";
  else patron = "LEVE/PREVENTIVO — cambios incipientes. Mantenimiento y prevención. Periodización anual.";

  const steps: Step[] = [];
  let cosMin = 0;
  let cosMax = 0;

  const hifu = lax >= 2 && !noDT && emb !== "Sí";
  if (hifu) {
    let hifuDesc: string;
    if (lax >= 3) {
      hifuDesc =
        "Rostro completo + cuello (300-600 líneas, transductores 4.5mm SMAS + 3.0mm dermis). Resultado máximo a 90-180 días. Mantenimiento anual.";
      cosMin += 1800;
      cosMax += 3300;
    } else {
      hifuDesc =
        "Tratamiento localizado mandíbula + cuello (150-250 líneas, 4.5mm + 3.0mm). Indicado en laxitud moderada.";
      cosMin += 800;
      cosMax += 1500;
    }
    if (cuello === "Laxitud moderada" || cuello === "Laxitud leve")
      hifuDesc += " Protocolo submentoniano adicional.";
    if (!budgetLow)
      steps.push({
        titulo: "1. HIFU / Ultrasonido microfocalizado",
        icono: "🔊",
        contenido: hifuDesc,
        timing: "Mes 1",
        warning: lax < 2 ? "Laxitud leve: valorar si HIFU está justificado." : null,
      });
  }

  const toxina = merz >= 2 && emb !== "Sí";
  if (toxina) {
    const toxZonas: string[] = [];
    let toxU = 0;
    if (frontal !== "Sin indicación") {
      const u = frontal === "Marcada" ? 20 : frontal === "Moderada" ? 14 : 8;
      toxU += u;
      toxZonas.push(`Frente/frontalis ${u}U`);
    }
    if (frontal !== "Sin indicación" || merz >= 2) {
      toxU += 20;
      toxZonas.push("Glabela (procero + corrugadores) 20U");
    }
    if (crow !== "Sin indicación") {
      const u2 = crow === "Marcada" ? 20 : crow === "Moderada" ? 14 : 10;
      toxU += u2;
      toxZonas.push(`Patas de gallo ${u2}U bilateral`);
    }
    if (cuello === "Laxitud moderada" && lax >= 2) {
      toxU += 25;
      toxZonas.push("Platisma (técnica Nefertiti) 20-30U");
    }
    const toxProd = tabAct
      ? "Xeomin® o Bocouture® (toxina pura, menor riesgo anticuerpos con uso frecuente)"
      : "Xeomin®/Bocouture® o Botox®";
    steps.push({
      titulo: "2. Toxina botulínica tipo A",
      icono: "💉",
      contenido: `Producto: ${toxProd}.\nZonas: ${toxZonas.join(", ")}.\nDosis total estimada: ${toxU} U.\nRevisión a 14 días para retoque. Intervalo: 3-5 meses.`,
      timing: hifu ? "Mes 2 (4 semanas post-HIFU)" : "Mes 1",
      warning:
        edad < 25
          ? "Paciente joven: dosis preventivas (60-70% dosis estándar). Informar sobre naturalidad."
          : null,
    });
    cosMin += 250;
    cosMax += 500;
  }

  const rellenos = nau >= 1 && emb !== "Sí";
  if (rellenos) {
    const relZonas: string[] = [];
    if (nau >= 2) {
      relZonas.push("Malares bilaterales: 1.0-2.0ml/lado AH alta cohesividad (Belotero Volume, Juvederm Voluma) o CaHA supraperióstico");
      cosMin += 500;
      cosMax += 1200;
    } else if (nau >= 1) {
      relZonas.push("Malares bilaterales: 0.5-1.0ml/lado AH cohesividad media");
      cosMin += 300;
      cosMax += 800;
    }
    if (naso !== "Sin indicación") {
      const v = naso === "Marcada" ? "1.0-1.5ml" : "0.5-1.0ml";
      relZonas.push(`Surcos nasogenianos: ${v}/lado — AH (Belotero Balance/Intense) o CaHA dilución 1:1`);
      cosMin += 300;
      cosMax += 600;
    }
    if (relZonas.length > 0) {
      const secuencia = hifu ? "Mes 2-3 (2-4 semanas post-HIFU, 1-2 semanas post-toxina)" : "Mes 1-2";
      const advancedNote =
        anticoag === "Sí"
          ? "\n⚠ Anticoagulantes: usar SIEMPRE cánula roma. Hialuronidasa disponible (150 UI mínimo)."
          : "\nHialuronidasa disponible obligatorio en sala.";
      steps.push({
        titulo: "3. Rellenos dérmicos / Restauración volumétrica",
        icono: "✨",
        contenido: `Zonas:\n• ${relZonas.join("\n• ")}\nDoppler previo en todas las zonas de riesgo vascular.${advancedNote}\nSecuencia: temporal → malar → perioral → mentón.`,
        timing: secuencia,
        warning: fitzNum >= 4 ? `Fitzpatrick ${fitz}: planos superficiales con cánula. Riesgo PIH con técnica traumática.` : null,
      });
    }
  }

  const bioEstim = nau <= 1 && glog >= 2 && emb !== "Sí" && !budgetLow;
  if (bioEstim) {
    steps.push({
      titulo: "4. Bioestimulación dérmica (CaHA hiperdilución)",
      icono: "💎",
      contenido:
        "Indicación: calidad cutánea deteriorada con déficit volumétrico mínimo.\nProducto: CaHA (Radiesse) diluido 1:2 a 1:3 con SSF ± lidocaína 2%.\nZonas: cuello, escote, rostro completo.\nProtocolo: 2-3 sesiones con intervalo 4-6 semanas.\n\nAlternativas con evidencia similar:\n• PLLA (Sculptra) 3 sesiones: similar eficacia bioestimuladora, inicio más lento.\n• Polinucleótidos (PDRN/Rejuran): sesiones semanales x3, regeneración dérmica.\n• Skinboosters AH (Restylane Vital, Belotero Revive): hidratación + leve bioestimulación.",
      timing: hifu ? "Mes 3-5" : "Mes 1-3",
      warning: null,
    });
    cosMin += 400;
    cosMax += 900;
  }

  if (glog >= 2 || nau >= 1) {
    steps.push({
      titulo: "5. Revitalización cutánea (skin booster)",
      icono: "💧",
      contenido:
        "AH no reticulado (Belotero Revive, Restylane Vital, Juvederm Hydrate).\n3 sesiones mensuales → mantenimiento semestral.\nMejora de hidratación, elasticidad y uniformidad de tono.\n\nComplementario: retinol tópico progresivo (0.025% → 0.05% → 0.1%), niacinamida 10%, SPF50+ físico diario (obligatorio Fitzpatrick IV-VI).",
      timing: "Mes 4-6 o inicio independiente",
      warning: null,
    });
    cosMin += 200;
    cosMax += 400;
  }

  let budgetNote = `Coste orientativo total del ciclo: ${cosMin.toLocaleString("es-ES")}€ – ${cosMax.toLocaleString("es-ES")}€ (honorarios incluidos, España).`;
  if (budget !== "Sin límite" && budget !== "> 5.000€" && cosMax > 5000) {
    budgetNote += `\n⚠ Presupuesto seleccionado (${budget}): considera priorizar HIFU o rellenos en primera fase y diferir el resto a 6-12 meses.`;
  }

  const gais =
    `SEGUIMIENTO GAIS:\n• Basal: Laxitud ${lax}/4, NAU ${nau}/3, Merz ${merz}/4, Glogau ${glog}\n` +
    `• 30 días: GAIS +1 a +2 esperado (efecto toxina + inicio rellenos)\n` +
    `• 90 días: GAIS +2 a +3 esperado (efecto máximo HIFU + rellenos integrados)\n` +
    `• 6 meses: evaluación global. Fotografía comparativa estandarizada.\n` +
    `• 12 meses: revisión de mantenimiento. Plan siguiente ciclo.`;

  const fecha = new Date(ctx.sessionDate).toLocaleDateString("es-ES");
  let cab =
    `PLAN TERAPÉUTICO PERSONALIZADO\nFecha: ${fecha}\n` +
    `Paciente: ${ctx.patientName}, ${edad} años, ${sexo}, Fitzpatrick ${fitz}${tabAct ? ", fumador activo" : ""}\n\n`;
  const alt = alertas.length ? `⚠ ALERTAS:\n${alertas.map((a) => "• " + a).join("\n")}\n\n` : "";
  cab += alt + `PATRÓN DE ENVEJECIMIENTO: ${patron}\n\n──────────────────────────────\n\n`;

  const stepsText = steps.length
    ? steps
        .map(
          (s) =>
            `${s.icono} ${s.titulo} — ${s.timing}\n${s.contenido}` +
            (s.warning ? `\n⚠ ${s.warning}` : "")
        )
        .join("\n\n")
    : "Sin indicaciones activas con los parámetros actuales. Considera tratamiento preventivo con skin booster semestral y retinol tópico.";

  return cab + stepsText + "\n\n──────────────────────────────\n\n" + budgetNote + "\n\n" + gais;
}
