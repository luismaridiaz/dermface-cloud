// Motor de reglas — puerto fiel del motor() de DermFace HTML v30 a los campos
// que existen en la versión cloud. Es 100% local (sin llamadas a ninguna IA
// externa): son reglas fijas basadas en los valores clínicos introducidos.
//
// Simplificaciones respecto al HTML original, por datos que aún no existen
// en la versión cloud:
// - No hay campo de sexo del paciente → se omite del encabezado.
// - "Rellenos previos" se detecta buscando palabras clave en el texto libre
//   de Antecedentes, en vez de un desplegable con valores fijos.
// - No existe el índice de flacidez calibrado en mm (medición avanzada de
//   la lateral) → esa alerta concreta no se genera todavía.

export type ClinicalInput = {
  motivo: string | null;
  previos: string | null;
  peso: number | null;
  talla: number | null;
  imc: number | null;
  sol: number | null;
  tabaco: number | null;
  estres: number | null;
  glogau: number | null;
  fitzpatrick: string | null;
  merz: Record<string, { rest: number | null; dyn: number | null }> | null;
  nau_fore: number | null;
  nau_perio: number | null;
  nau_malar: number | null;
  nau_naso: number | null;
  nau_ment: number | null;
  nau_neck: number | null;
  nau_lax: number | null;
  nau_skin: number | null;
  nau_asym: number | null;
  hidra: number | null;
  elastic: number | null;
  pigment: number | null;
  sebo: number | null;
  eritema: number | null;
  tewl: number | null;
};

export type FrontalPhoto = {
  cervicomental_angle?: number | null;
  interpupilar_angle?: number | null;
  asymmetry_pct?: number | null;
  brow_izq_angle?: number | null;
  brow_der_angle?: number | null;
};

export type LateralPhoto = {
  manual_nasofacial_angle?: number | null;
  manual_nasolabial_angle?: number | null;
  manual_mentolabial_angle?: number | null;
  cervicomental_angle?: number | null; // versión manual, en foto lateral
};

export type ReportContext = {
  patientName: string;
  age: number | null;
  sessionDate: string;
  clinical: ClinicalInput | null;
  frontal: FrontalPhoto | null;
  lateral: LateralPhoto | null;
};

const MERZ_REGION_IDS = [
  "frontales", "glabela", "crow", "suborbital", "cejas",
  "naso", "malar", "nariz", "perioral",
  "mentolabial", "menton", "mandib", "marioneta",
  "platisma", "cervical",
];

function n(v: number | null | undefined): number {
  return typeof v === "number" && !isNaN(v) ? v : 0;
}

export function buildReport(
  ctx: ReportContext,
  mode: "full" | "plan"
): string {
  const c = ctx.clinical ?? ({} as ClinicalInput);
  const fecha = new Date(ctx.sessionDate).toLocaleDateString("es-ES");

  const fitz = c.fitzpatrick || "III";
  const fitzClaro = fitz === "I" || fitz === "II" || fitz === "III";

  const smoke = n(c.tabaco);
  const sun = n(c.sol);
  const stress = n(c.estres);
  const asym = n(c.nau_asym);
  const imc = c.imc ?? null;
  const hidra = n(c.hidra);
  const elastic = n(c.elastic);
  const eritema = n(c.eritema);
  const pigment = n(c.pigment);
  const sebo = n(c.sebo);
  const glogau = c.glogau ?? 0;
  const skin = n(c.nau_skin);
  const lax = n(c.nau_lax);

  const cervicomental =
    ctx.frontal?.cervicomental_angle ?? ctx.lateral?.cervicomental_angle ?? null;
  const mpAsim = ctx.frontal?.asymmetry_pct ?? null;
  const browIzq = ctx.frontal?.brow_izq_angle ?? null;
  const browDer = ctx.frontal?.brow_der_angle ?? null;

  const nauZonas = {
    fore: n(c.nau_fore),
    perio: n(c.nau_perio),
    malar: n(c.nau_malar),
    naso: n(c.nau_naso),
    ment: n(c.nau_ment),
    neck: n(c.nau_neck),
  };
  const nauVals = Object.values(nauZonas);
  const nauA = nauVals.length
    ? nauVals.reduce((a, b) => a + b, 0) / nauVals.length
    : 0;

  const merz = c.merz ?? {};
  const dynVals = MERZ_REGION_IDS.map((id) => merz[id]?.dyn)
    .filter((v): v is number => typeof v === "number");
  const mDA = dynVals.length
    ? dynVals.reduce((a, b) => a + b, 0) / dynVals.length
    : 0;
  const mPeak: Record<string, number> = {};
  MERZ_REGION_IDS.forEach((id) => {
    mPeak[id] = n(merz[id]?.dyn);
  });

  const previosLower = (c.previos || "").toLowerCase();
  const rellenosPrevios =
    previosLower.includes("hialurón") ||
    previosLower.includes("hialuron") ||
    previosLower.includes("combinad");

  // ── Alertas ──
  const al: string[] = [];
  if (smoke >= 2) al.push("TABACO ACTIVO — eficacia bioestimuladores reducida ~20-30%.");
  if (sun >= 3) al.push("EXPOSICIÓN SOLAR ALTA — SPF50+ físico obligatorio. Riesgo hiperpigmentación post-procedimiento.");
  if (asym > 20) al.push(`ASIMETRÍA ${asym}% — planificación diferencial obligatoria. Nunca mismas dosis en ambas hemicaras.`);
  if (rellenosPrevios) al.push("RELLENOS PREVIOS — ecografía Doppler antes de inyección. Descartar migración o granuloma.");
  if (!fitzClaro) al.push(`FITZPATRICK ${fitz} — precaución con láseres ablativos. Riesgo PIH y queloides. Despigmentación tópica 8 semanas previa.`);
  if (imc !== null && imc < 20) al.push(`IMC BAJO (${imc.toFixed(1)}) — adelgazamiento facial acelerado. Mayor volumen y menor intervalo mantenimiento.`);
  if (hidra >= 3) al.push(`HIDRATACIÓN REDUCIDA (snap test ${hidra}) — restaurar barrera antes de procedimientos ablativos.`);
  if (elastic > 3) al.push(`ELASTICIDAD MUY REDUCIDA (${elastic}s) — correlacionar con laxitud SMAS.`);
  if (eritema >= 3) al.push("ERITEMA INTENSO — descartar rosácea activa. Tratar antes de procedimientos irritantes.");
  if (stress >= 2) al.push("ESTRÉS CRÓNICO — cortisol elevado degrada colágeno. Impacto en resultado de bioestimuladores.");
  if (cervicomental !== null && cervicomental > 110)
    al.push(`ÁNGULO CERVICOMENTAL ${cervicomental}° — superior al normal (80-95°). Valorar tratamiento submentoniano (HIFU, lipolisis o lifting).`);
  if (mpAsim !== null && mpAsim > 15)
    al.push(`ASIMETRÍA FACIAL MEDIAPIPE ${mpAsim}% — asimetría significativa detectada automáticamente.`);

  // ── Patrón de envejecimiento ──
  let perfil: string;
  if (nauA > 1.8 && lax > 2)
    perfil = "Predominio ESTRUCTURAL AVANZADO: pérdida multicompartimental severa con ptosis ligamentosa.";
  else if (nauA > 1.2 && mDA > 2)
    perfil = "Patrón MIXTO: déficit volumétrico + hiperquinesia muscular. Abordaje secuenciado por planos.";
  else if (mDA > 2.5 && nauA <= 1.2)
    perfil = "Predominio DINÁMICO: hiperquinesia con escasa pérdida de volumen. Primera línea: neuromoduladores.";
  else if (glogau >= 3 && skin < 60)
    perfil = "Predominio DÉRMICO: fotoenvejecimiento avanzado. Primera línea: calidad cutánea.";
  else if (hidra >= 2 && elastic > 2)
    perfil = "Predominio BARRERA: compromiso dérmico funcional. Restaurar barrera primero.";
  else perfil = "Envejecimiento LEVE o incipiente. Fase preventiva-mantenimiento.";

  // ── Biofísicos ──
  const hidraLabels = ["óptima", "leve reducción", "moderada", "reducida", "severa"];
  const bioH =
    `BIOFÍSICOS:\n• Hidratación snap test: ${hidraLabels[Math.min(hidra, 4)]} (${hidra}/4)\n` +
    `• Elasticidad pellizco: ${elastic}s — ${elastic < 1 ? "excelente" : elastic < 2 ? "buena" : elastic < 3 ? "moderada" : "reducida"}\n` +
    `• Pigmentación: ${pigment}/4\n• Sebo/Brillo: ${sebo}/4\n• Eritema: ${eritema}/4` +
    (c.tewl ? `\n• Barrera (TEWL): ${c.tewl}` : "");

  // ── Ángulos ──
  let angH = "ÁNGULOS ANATÓMICOS:\n";
  if (cervicomental !== null)
    angH += `• Cervicomental: ${cervicomental}° (normal 80-95°)${cervicomental > 110 ? " ⚠ Elevado" : ""}\n`;
  if (mpAsim !== null)
    angH += `• Asimetría facial (MediaPipe): ${mpAsim}%${mpAsim > 15 ? " ⚠ Significativa" : ""}\n`;
  if (browIzq !== null && browDer !== null)
    angH += `• Inclinación cejas: izq. ${browIzq}° / dcha. ${browDer}° (normal 10-20°)\n`;
  if (ctx.lateral?.manual_nasofacial_angle != null)
    angH += `• Nasofacial: ${ctx.lateral.manual_nasofacial_angle}°\n`;
  if (ctx.lateral?.manual_nasolabial_angle != null)
    angH += `• Nasolabial: ${ctx.lateral.manual_nasolabial_angle}° (normal 90-110°)\n`;
  if (ctx.lateral?.manual_mentolabial_angle != null)
    angH += `• Mentolabial: ${ctx.lateral.manual_mentolabial_angle}° (normal 120-135°)\n`;
  if (imc !== null) angH += `• IMC: ${imc.toFixed(1)} kg/m²`;

  // ── Plan de tratamiento ──
  const plan: string[] = [];
  const barreraComp =
    hidra >= 3 ||
    elastic > 3 ||
    (c.tewl != null && c.tewl > 15);
  if (barreraComp)
    plan.push(
      "0. RESTAURACIÓN BARRERA (prerrequisito)\n   Ceramidas, colesterol, ácidos grasos. Niacinamida 10%. 4-8 semanas previas a cualquier procedimiento ablativo."
    );

  if (glogau >= 3 || skin < 50 || pigment >= 3) {
    const p1l = fitzClaro
      ? "Er:YAG 2940nm fraccionado o CO2."
      : `Nd:YAG 1064nm no ablativo (Fitzpatrick ${fitz} excluye ablativos).`;
    const p1p = fitzClaro
      ? "TCA 15-20%."
      : `AHA superficial — Fitzpatrick ${fitz} excluye TCA profundo.`;
    plan.push(
      `1. CALIDAD CUTÁNEA\n   Peeling: ${p1p}\n   Láser: ${p1l}\n   Bioestimulación: PDRN/polinucleótidos 3 sesiones.` +
        (pigment >= 2 ? "\n   Despigmentantes tópicos 8 semanas previas." : "")
    );
  } else if (skin < 70) {
    plan.push(
      "1. REVITALIZACIÓN DÉRMICA\n   Skinboosters AH no reticulado 3 sesiones cada 4-6 semanas.\n   PDRN para mejora de textura."
    );
  } else {
    plan.push("1. MANTENIMIENTO DÉRMICO\n   Skinbooster semestral. SPF50+ físico diario.");
  }

  if (lax >= 3 || (cervicomental !== null && cervicomental > 110)) {
    plan.push(
      `2. SOPORTE ESTRUCTURAL (Laxitud ${lax}/4${cervicomental !== null ? `, cervicomental ${cervicomental}°` : ""})\n   HIFU/Ultherapy SMAS 4.5mm + dermis 3mm. Hilos PDO/PLLA malar-mandibular.`
    );
  } else if (lax >= 1.5) {
    plan.push("2. SOPORTE MODERADO\n   HIFU + RF fraccionada. 2-3 sesiones con intervalo 6-8 semanas.");
  } else {
    plan.push("2. SOPORTE PREVENTIVO\n   RF mantenimiento semestral.");
  }

  const volZ: string[] = [];
  if (nauZonas.malar >= 1) volZ.push(`malares ${nauZonas.malar >= 2 ? "1.0-1.5ml/lado" : "0.5-1.0ml/lado"}`);
  if (nauZonas.naso >= 1) volZ.push(`nasogenianos ${nauZonas.naso >= 2 ? "0.8-1.0ml/lado" : "0.3-0.5ml/lado"}`);
  if (nauZonas.perio >= 1.5) volZ.push("infraorbitario 0.3-0.5ml/lado (cánula)");
  if (nauZonas.fore >= 1.5) volZ.push(`temporal ${nauZonas.fore >= 2 ? "1.0-1.5ml/lado" : "0.5-0.8ml/lado"}`);
  if (volZ.length)
    plan.push(`3. VOLUMEN\n   AH alta cohesividad en ${volZ.join(", ")}. Secuencia: temporal→malar→perioral.`);
  else plan.push("3. VOLUMEN\n   No requerido. Reevaluar en 6 meses.");

  if (mDA > 2.5) {
    let neuro = `4. NEUROMODULACIÓN (Merz dyn medio ${mDA.toFixed(1)}/4)\n   Toxina alta pureza (Xeomin/Bocouture).`;
    if (mPeak["frontales"] >= 2) neuro += "\n   Frontalis: 8-12U.";
    if (mPeak["glabela"] >= 2) neuro += "\n   Glabela: 20-25U.";
    if (mPeak["crow"] >= 2) neuro += "\n   Pericantales: 8-12U/lado.";
    if (mPeak["platisma"] >= 2) neuro += "\n   Platisma: 10-20U/banda.";
    plan.push(neuro);
  } else if (mDA > 1.5) {
    plan.push("4. NEUROMODULACIÓN SELECTIVA\n   Toxina en zonas Merz dyn≥2. Dosis preventivas 60-70%.");
  } else {
    plan.push(`4. NEUROMODULACIÓN\n   No prioritaria (Merz dyn ${mDA.toFixed(1)}/4). Valorar en revisión.`);
  }

  if (eritema >= 2)
    plan.push(
      `5. CONTROL ERITEMA/ROSÁCEA\n   ${eritema >= 3 ? "Metronidazol 0.75% + azelaico 15%. Láser vascular Nd:YAG 1064nm." : "Niacinamida 10% tópica. Identificar desencadenantes."}`
    );

  if (asym > 15 || (mpAsim !== null && mpAsim > 15))
    plan.push("6. ASIMETRÍA\n   Corrección progresiva diferencial. Máx. 10-15% por sesión. Fotometría basal obligatoria.");

  // ── GAIS ──
  const gaisB =
    `Glogau ${glogau || "—"}, Merz dyn ${mDA.toFixed(1)}/4, NAU ${nauA.toFixed(1)}/3, elastic ${elastic}s, hidra snap ${hidra}/4` +
    (cervicomental !== null ? `, cervico ${cervicomental}°` : "") +
    (imc !== null ? `, IMC ${imc.toFixed(1)}` : "");
  const gais30 = mDA > 2 ? "GAIS +2: reducción Merz dyn ≥1pt. Valorar asimetría residual." : "GAIS +1: mejora textura. Reevaluar dinámica.";
  const gais90 = nauA > 1 ? "GAIS +2 a +3: apreciación volumétrica. FACE-Q >70/100." : "GAIS +1 a +2: consolidación bioestimulación.";

  const cab =
    `INFORME CLÍNICO — DermFace Cloud\n` +
    `Fecha: ${fecha}\n` +
    `Paciente: ${ctx.patientName}${ctx.age !== null ? `, ${ctx.age} años` : ""}\n` +
    `Motivo: ${c.motivo || "—"} · Previos: ${c.previos || "—"}\n` +
    `──────────────────────────────\n\n`;

  const alt = al.length ? `ALERTAS CLÍNICAS:\n${al.map((a) => "• " + a).join("\n")}\n\n` : "";

  if (mode === "plan") {
    return cab + alt + "PLAN (barrera→piel→soporte→volumen→dinámica):\n\n" + plan.join("\n\n");
  }

  return (
    cab +
    alt +
    "I. PATRÓN DE ENVEJECIMIENTO\n" + perfil + "\n\n" +
    "II. " + bioH + "\n\n" +
    "III. " + angH + "\n\n" +
    `IV. DIAGNÓSTICO\nGlogau ${glogau || "—"} · Fitzpatrick ${fitz} · NAU ${nauA.toFixed(1)}/3 · Laxitud ${lax}/4 · Merz ${mDA.toFixed(1)}/4\n\n` +
    "V. PLAN (barrera→piel→soporte→volumen→dinámica)\n" + plan.join("\n\n") + "\n\n" +
    "VI. SEGUIMIENTO GAIS\n" +
    `Basal: ${gaisB}\n30 días: ${gais30}\n90 días: ${gais90}\nRetratamiento: retorno a basal o >50% pérdida de efecto.\n\n` +
    "──────────────────────────────\n" +
    "Motor de reglas DermFace Cloud (local, sin IA externa). El juicio clínico prevalece siempre."
  );
}
