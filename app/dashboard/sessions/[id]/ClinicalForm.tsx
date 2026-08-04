"use client";

import { useRef, useState } from "react";
import { generateReport } from "./actions";
import ComparadorTabContent from "./ComparadorTabContent";

const MERZ_GROUPS = [
  {
    label: "Tercio superior",
    regions: [
      { id: "frontales", label: "Líneas frontales" },
      { id: "glabela", label: "Entrecejo / glabela" },
      { id: "crow", label: "Patas de gallo" },
      { id: "suborbital", label: "Líneas suborbitarias" },
      { id: "cejas", label: "Ptosis de cejas" },
    ],
  },
  {
    label: "Tercio medio",
    regions: [
      { id: "naso", label: "Surco nasogeniano" },
      { id: "malar", label: "Volumen malar" },
      { id: "nariz", label: "Dorso / punta nasal" },
      { id: "perioral", label: "Arrugas periorales" },
    ],
  },
  {
    label: "Tercio inferior",
    regions: [
      { id: "mentolabial", label: "Surco mentolabial" },
      { id: "menton", label: "Proyección mentón" },
      { id: "mandib", label: "Contorno mandibular" },
      { id: "marioneta", label: "Líneas marioneta" },
    ],
  },
  {
    label: "Cuello",
    regions: [
      { id: "platisma", label: "Bandas platismales" },
      { id: "cervical", label: "Laxitud cervical" },
    ],
  },
];

const TABS = ["Clasificación", "Merz", "NAU", "Comparador", "Informe"] as const;
type Tab = (typeof TABS)[number];

type MerzScore = { rest: number | null; dyn: number | null };

type ClinicalRow = {
  edad: number | null;
  sexo: string | null;
  motivo: string | null;
  previos: string | null;
  peso: number | null;
  talla: number | null;
  sol: number | null;
  tabaco: number | null;
  estres: number | null;
  glogau: number | null;
  fitzpatrick: string | null;
  merz: Record<string, MerzScore> | null;
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
  consent_sig: string | null;
  consent_prof: string | null;
  consent_ok: boolean | null;
  informe: string | null;
  plan_tratamiento: string | null;
  presupuesto: string | null;
  downtime: string | null;
  embarazo: string | null;
  anticoagulantes: string | null;
} | null;

const inputCls =
  "w-full border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-60";
const labelCls = "text-sm font-semibold text-mid uppercase tracking-wide mb-2";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-mid mb-1">{label}</span>
      {children}
    </label>
  );
}

function Scale0to3({
  name,
  label,
  value,
  labels,
}: {
  name: string;
  label: string;
  value?: number | null;
  labels: [string, string, string, string];
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} className={inputCls}>
        <option value="">—</option>
        {[0, 1, 2, 3].map((v) => (
          <option key={v} value={v}>
            {v} — {labels[v]}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ScaleSelect({
  name,
  placeholder,
  value,
}: {
  name: string;
  placeholder: string;
  value?: number | null;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      className="border border-rule rounded-lg px-2 py-1 text-xs w-24"
    >
      <option value="">{placeholder}</option>
      {[0, 1, 2, 3, 4].map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function NauField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value?: number | null;
}) {
  return (
    <Field label={`${label} (0–3)`}>
      <input
        name={name}
        type="number"
        step="0.5"
        min="0"
        max="3"
        defaultValue={value ?? ""}
        className={inputCls}
      />
    </Field>
  );
}

export default function ClinicalForm({
  action,
  initialData,
  readOnly,
  sessionId,
  patientName,
  sessionDate,
  photos,
}: {
  action: (formData: FormData) => void;
  initialData: ClinicalRow;
  readOnly: boolean;
  sessionId: string;
  patientName: string;
  sessionDate: string;
  photos: { url: string | null; view_type: string | null }[];
}) {
  const [tab, setTab] = useState<Tab>("Clasificación");
  const d = initialData;
  const informeRef = useRef<HTMLTextAreaElement>(null);
  const planRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  function getFormNumber(name: string): number {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | undefined;
    const v = parseFloat(el?.value ?? "");
    return isNaN(v) ? 0 : v;
  }
  function getFormValue(name: string): string {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | HTMLSelectElement
      | undefined;
    return el?.value ?? "";
  }
  function setSelectValue(name: string, value: number) {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLSelectElement
      | undefined;
    if (el) el.value = String(value);
  }
  function setInputValue(name: string, value: number) {
    const el = formRef.current?.elements.namedItem(name) as
      | HTMLInputElement
      | undefined;
    if (el) el.value = String(value);
  }

  function handleSuggestMerz() {
    const edad = getFormNumber("edad");
    if (!edad || edad < 18) {
      alert("Introduce la edad de la paciente primero, en la pestaña Clasificación.");
      return;
    }
    const hasManual = MERZ_GROUPS.some((g) =>
      g.regions.some((r) => {
        const rest = getFormValue(`merz_${r.id}_rest`);
        const dyn = getFormValue(`merz_${r.id}_dyn`);
        return rest !== "" || dyn !== "";
      })
    );
    if (hasManual && !confirm("Ya hay valores Merz introducidos. ¿Sobreescribir con la estimación automática?")) {
      return;
    }
    const smoke = getFormNumber("tabaco");
    const b = edad < 35 ? 0.5 : edad < 45 ? 1 : edad < 55 ? 2 : edad < 65 ? 2.5 : 3;
    MERZ_GROUPS.forEach((g) =>
      g.regions.forEach((r) => {
        let base = b;
        if (r.id === "platisma" || r.id === "cervical")
          base = edad < 50 ? 0.5 : edad < 60 ? 1.5 : 2.5;
        if (r.id === "crow") base = Math.min(4, b + 0.5);
        if ((r.id === "naso" || r.id === "marioneta") && smoke >= 2)
          base = Math.min(4, base + 0.5);
        const rv = Math.round(Math.max(0, base - 0.5));
        const dv = Math.round(Math.min(4, base + 0.5));
        setSelectValue(`merz_${r.id}_rest`, rv);
        setSelectValue(`merz_${r.id}_dyn`, dv);
      })
    );
  }

  function handleSuggestNAU() {
    const edad = getFormNumber("edad");
    if (!edad) {
      alert("Introduce la edad de la paciente primero, en la pestaña Clasificación.");
      return;
    }
    const sexo = getFormValue("sexo");
    const smoke = getFormNumber("tabaco");
    const peso = getFormNumber("peso");
    const talla = getFormNumber("talla");
    const bmi = peso && talla ? peso / Math.pow(talla / 100, 2) : 23;

    const b = edad < 35 ? 0 : edad < 45 ? 0.5 : edad < 55 ? 1 : edad < 65 ? 1.5 : 2;
    const sexM = sexo === "Mujer" ? 0.3 : 0;
    const bmiM = bmi < 20 ? 0.5 : bmi < 22 ? 0.2 : 0;
    const smokeM = smoke >= 2 ? 0.3 : 0;
    const cl = (v: number) => Number(Math.min(3, Math.max(0, v)).toFixed(1));

    setInputValue("nau_fore", cl(b - 0.5 + bmiM));
    setInputValue("nau_perio", cl(b + 0.5 + sexM + bmiM));
    setInputValue("nau_malar", cl(b + sexM + bmiM));
    setInputValue("nau_naso", cl(b + 0.5 + smokeM));
    setInputValue("nau_ment", cl(b - 0.3));
    setInputValue(
      "nau_neck",
      edad < 50 ? 0 : edad < 60 ? 0.5 : edad < 70 ? 1.5 : 2.5
    );
    const lax = Number(
      Math.min(4, Math.max(0, edad < 40 ? 0 : edad < 55 ? 1 : edad < 65 ? 2 : 3)).toFixed(1)
    );
    setInputValue("nau_lax", lax);
    const skin = Math.round(Math.max(10, 100 - (edad - 25) * 1.3 - smokeM * 10));
    setInputValue("nau_skin", skin);
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { informe, plan } = await generateReport(sessionId);
      if (informeRef.current) informeRef.current.value = informe;
      if (planRef.current) planRef.current.value = plan;
    } finally {
      setGenerating(false);
    }
  }

  function buildSummaryLines(): string[] {
    const lines: string[] = [];
    const edad = getFormValue("edad");
    const sexo = getFormValue("sexo");
    const motivo = getFormValue("motivo");
    const previos = getFormValue("previos");
    const peso = getFormValue("peso");
    const talla = getFormValue("talla");
    const glogauV = getFormValue("glogau");
    const fitzV = getFormValue("fitzpatrick");

    lines.push(`Edad / sexo: ${edad || "—"} años / ${sexo || "—"}`);
    lines.push(`Motivo de consulta: ${motivo || "—"}`);
    lines.push(`Antecedentes: ${previos || "—"}`);
    lines.push(`Peso / talla: ${peso || "—"} kg / ${talla || "—"} cm`);
    lines.push(`Glogau: ${glogauV || "—"}  ·  Fitzpatrick: ${fitzV || "—"}`);
    lines.push("");
    lines.push("NAU (0–3): " +
      ["fore", "perio", "malar", "naso", "ment", "neck"]
        .map((k) => `${k}=${getFormValue(`nau_${k}`) || "—"}`)
        .join("  "));
    lines.push(`Laxitud: ${getFormValue("nau_lax") || "—"}/4  ·  Calidad de piel: ${getFormValue("nau_skin") || "—"}%  ·  Asimetría: ${getFormValue("nau_asym") || "—"}%`);
    lines.push("");
    lines.push(
      `Biofísicos — Hidratación: ${getFormValue("hidra") || "—"}/4  ·  Elasticidad: ${getFormValue("elastic") || "—"}s  ·  Pigmentación: ${getFormValue("pigment") || "—"}/4  ·  Sebo: ${getFormValue("sebo") || "—"}/4  ·  Eritema: ${getFormValue("eritema") || "—"}/4  ·  TEWL: ${getFormValue("tewl") || "—"}`
    );
    lines.push("");
    lines.push("Merz (reposo/dinámica):");
    MERZ_GROUPS.forEach((g) => {
      const parts = g.regions.map((r) => {
        const rest = getFormValue(`merz_${r.id}_rest`) || "—";
        const dyn = getFormValue(`merz_${r.id}_dyn`) || "—";
        return `${r.label} ${rest}/${dyn}`;
      });
      lines.push(`  ${g.label}: ${parts.join("  ·  ")}`);
    });
    return lines;
  }

  async function loadImageAsDataURL(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = dataUrl;
      });
      return { dataUrl, ...dims };
    } catch {
      return null;
    }
  }

  async function handleDownloadPDF() {
    setDownloading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const marginX = 15;
      const pageWidth = 210 - marginX * 2;
      let y = 20;

      function checkPageBreak(needed: number) {
        if (y + needed > 285) {
          doc.addPage();
          y = 20;
        }
      }
      function addTitle(text: string) {
        doc.setFontSize(15);
        doc.setFont("helvetica", "bold");
        doc.text(text, marginX, y);
        y += 8;
      }
      function addSubtitle(text: string) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110);
        doc.text(text, marginX, y);
        doc.setTextColor(0);
        y += 9;
      }
      function addSectionHeader(text: string) {
        checkPageBreak(10);
        doc.setFontSize(11.5);
        doc.setFont("helvetica", "bold");
        doc.text(text, marginX, y);
        y += 6;
      }
      function addBodyText(text: string) {
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(text || "—", pageWidth);
        lines.forEach((line: string) => {
          checkPageBreak(5);
          doc.text(line, marginX, y);
          y += 5;
        });
        y += 4;
      }

      const fechaTxt = new Date(sessionDate).toLocaleDateString("es-ES");
      addTitle("DermFace Cloud — Informe clínico");
      addSubtitle(`${patientName} · Sesión del ${fechaTxt}`);

      addSectionHeader("Resumen clínico");
      addBodyText(buildSummaryLines().join("\n"));

      // Fotos (frontal y lateral si existen)
      const photosToInclude = photos.filter((p) => p.url).slice(0, 4);
      if (photosToInclude.length > 0) {
        addSectionHeader("Fotografías");
        const imgW = (pageWidth - 6) / 2;
        let colX = marginX;
        let rowMaxH = 0;
        for (let i = 0; i < photosToInclude.length; i++) {
          const loaded = await loadImageAsDataURL(photosToInclude[i].url as string);
          if (!loaded) continue;
          const imgH = (loaded.h / loaded.w) * imgW;
          checkPageBreak(imgH + 6);
          doc.addImage(loaded.dataUrl, "JPEG", colX, y, imgW, imgH);
          rowMaxH = Math.max(rowMaxH, imgH);
          if (colX === marginX) {
            colX = marginX + imgW + 6;
          } else {
            colX = marginX;
            y += rowMaxH + 6;
            rowMaxH = 0;
          }
        }
        if (colX !== marginX) y += rowMaxH + 6;
        y += 4;
      }

      addSectionHeader("Informe");
      addBodyText(informeRef.current?.value || "");

      addSectionHeader("Plan de tratamiento");
      addBodyText(planRef.current?.value || "");

      checkPageBreak(10);
      doc.setFontSize(7.5);
      doc.setTextColor(150);
      doc.text(
        "Generado por DermFace Cloud. Documento orientativo — el juicio clínico prevalece siempre.",
        marginX,
        y
      );

      const safeName = patientName.replace(/[^a-zA-Z0-9]+/g, "_");
      const safeDate = new Date(sessionDate).toISOString().slice(0, 10);
      doc.save(`informe-${safeName}-${safeDate}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadWord() {
    setDownloadingWord(true);
    try {
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
      } = await import("docx");

      const fechaTxt = new Date(sessionDate).toLocaleDateString("es-ES");
      const summaryLines = buildSummaryLines();

      function textBlock(text: string) {
        return text.split("\n").map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line || " ", size: 20 })],
            })
        );
      }

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: "DermFace Cloud — Informe clínico",
                heading: HeadingLevel.HEADING_1,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${patientName} · Sesión del ${fechaTxt}`,
                    italics: true,
                    color: "666666",
                  }),
                ],
              }),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "Resumen clínico", heading: HeadingLevel.HEADING_2 }),
              ...textBlock(summaryLines.join("\n")),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "Informe", heading: HeadingLevel.HEADING_2 }),
              ...textBlock(informeRef.current?.value || "—"),
              new Paragraph({ text: "" }),
              new Paragraph({ text: "Plan de tratamiento", heading: HeadingLevel.HEADING_2 }),
              ...textBlock(planRef.current?.value || "—"),
              new Paragraph({ text: "" }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Generado por DermFace Cloud. Documento orientativo — el juicio clínico prevalece siempre.",
                    size: 16,
                    color: "999999",
                  }),
                ],
              }),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const safeName = patientName.replace(/[^a-zA-Z0-9]+/g, "_");
      const safeDate = new Date(sessionDate).toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe-${safeName}-${safeDate}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingWord(false);
    }
  }

  const [glogau, setGlogau] = useState(d?.glogau ? String(d.glogau) : "");
  const [mpaCorne, setMpaCorne] = useState(62);
  const [mpaCuto, setMpaCuto] = useState(0.68);
  const [mpaTewl, setMpaTewl] = useState(18);
  const [mpaMel, setMpaMel] = useState(220);
  const [mpaEry, setMpaEry] = useState(185);
  const [mpaSebo, setMpaSebo] = useState(80);

  function mpaCorneInterp(v: number) {
    return v < 30 ? "Muy seca" : v < 45 ? "Seca" : v < 70 ? "Normohumectada" : v < 91 ? "Hidratada" : "Muy hidratada";
  }
  function mpaCutoInterp(v: number) {
    return v < 0.5 ? "Laxitud severa" : v < 0.65 ? "Reducida" : v < 0.8 ? "Normal" : "Óptima";
  }
  function mpaTewlInterp(v: number) {
    return v <= 10 ? "Óptima" : v <= 15 ? "Normal" : v <= 25 ? "Ligera alteración" : v <= 35 ? "Moderada" : "Barrera dañada";
  }
  function mpaMelInterp(v: number) {
    return v < 200 ? "Fototipo I-II" : v < 350 ? "Fototipo III-IV" : "Hiperpigmentación";
  }
  function mpaEryInterp(v: number) {
    return v < 150 ? "Sin eritema" : v < 300 ? "Leve-moderado" : "Intenso / rosácea";
  }
  function mpaSeboInterp(v: number) {
    return v < 30 ? "Asébacea / seca" : v < 100 ? "Normal" : v < 200 ? "Tendencia grasa" : "Hipersecreción";
  }

  function handleApplyMPA() {
    setInputValue("hidra", mpaCorne < 30 ? 4 : mpaCorne < 45 ? 3 : mpaCorne < 60 ? 2 : mpaCorne < 70 ? 1 : 0);
    setInputValue("elastic", mpaCuto < 0.5 ? 4.0 : mpaCuto < 0.65 ? 2.8 : mpaCuto < 0.8 ? 1.5 : 0.5);
    setInputValue("tewl", mpaTewl);
    setInputValue("pigment", mpaMel < 150 ? 0 : mpaMel < 200 ? 1 : mpaMel < 280 ? 2 : mpaMel < 350 ? 3 : 4);
    setInputValue("eritema", mpaEry < 150 ? 0 : mpaEry < 230 ? 1 : mpaEry < 300 ? 2 : 3);
    setInputValue("sebo", mpaSebo < 30 ? 0 : mpaSebo < 100 ? 1 : mpaSebo < 150 ? 2 : mpaSebo < 220 ? 3 : 4);
  }

  const [fitzpatrick, setFitzpatrick] = useState(d?.fitzpatrick ?? "");
  const merz = d?.merz ?? {};

  return (
    <form action={action} ref={formRef}>
      <div className="flex gap-1 mb-5 border-b border-rule overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition whitespace-nowrap ${
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-mid hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <fieldset disabled={readOnly} className="space-y-6">
        {/* ── Clasificación ── */}
        <div className={tab === "Clasificación" ? "space-y-5" : "hidden"}>
          <div className="bg-warm border border-rule rounded-xl p-4">
            <p className={labelCls}>Consentimiento informado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Firma paciente">
                <input
                  name="consent_sig"
                  defaultValue={d?.consent_sig ?? ""}
                  className={inputCls}
                />
              </Field>
              <Field label="Profesional">
                <input
                  name="consent_prof"
                  defaultValue={d?.consent_prof ?? ""}
                  className={inputCls}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="consent_ok"
                defaultChecked={!!d?.consent_ok}
              />
              Consentimiento firmado y archivado
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Edad">
              <input
                name="edad"
                type="number"
                min="0"
                max="120"
                defaultValue={d?.edad ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Sexo">
              <select name="sexo" defaultValue={d?.sexo ?? ""} className={inputCls}>
                <option value="">—</option>
                <option value="Mujer">Mujer</option>
                <option value="Hombre">Hombre</option>
              </select>
            </Field>
            <Field label="Motivo de consulta">
              <input
                name="motivo"
                defaultValue={d?.motivo ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Antecedentes previos">
              <input
                name="previos"
                defaultValue={d?.previos ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Peso (kg)">
              <input
                name="peso"
                type="number"
                step="0.1"
                defaultValue={d?.peso ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Talla (cm)">
              <input
                name="talla"
                type="number"
                step="0.1"
                defaultValue={d?.talla ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Scale0to3
              name="sol"
              label="Exposición solar"
              value={d?.sol}
              labels={["Nula / mínima", "Moderada", "Alta", "Muy alta"]}
            />
            <Scale0to3
              name="tabaco"
              label="Tabaco"
              value={d?.tabaco}
              labels={["No fumador", "Ex-fumador", "Fumador leve", "Fumador activo"]}
            />
            <Scale0to3
              name="estres"
              label="Estrés"
              value={d?.estres}
              labels={["Ninguno", "Leve", "Moderado", "Alto"]}
            />
          </div>

          <div>
            <p className={labelCls}>Glogau</p>
            <p className="text-[11px] text-mid mb-2">
              Fotoenvejecimiento según arrugas, discromías y queratosis. Explora con luz tangencial y palpa mejillas (queratosis palpables = Tipo II).<br />
              <strong>I</strong> Sin arrugas en reposo, sin queratosis (25-35a). <strong>II</strong> Arrugas en movimiento, queratosis palpables (35-50a). <strong>III</strong> Arrugas en reposo, discromías evidentes (50-65a). <strong>IV</strong> Arrugas en toda la superficie, laxitud grave, queratosis actínicas múltiples.
            </p>
            <div className="flex gap-2 flex-wrap">
              {["1", "2", "3", "4"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setGlogau(v)}
                  className={`border rounded-lg px-3 py-2 text-sm transition ${
                    glogau === v
                      ? "border-accent bg-accent/10 text-accent font-semibold"
                      : "border-rule text-ink hover:border-accent/50"
                  }`}
                >
                  Tipo {v}
                </button>
              ))}
            </div>
            <input type="hidden" name="glogau" value={glogau} />
          </div>

          <div>
            <p className={labelCls}>Fitzpatrick</p>
            <p className="text-[11px] text-mid mb-2">
              Respuesta constitucional a UV — clave para láseres, peelings e hiperpigmentación. Pregunta: a) ¿se quema fácilmente? b) ¿se broncea? c) color de la cara interna del brazo.<br />
              <strong>IV-VI</strong>: precaución máxima con energías ablativas — despigmentación tópica 8 semanas previa obligatoria.
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: "I", color: "#f8d5c2" },
                { v: "II", color: "#eec8a0" },
                { v: "III", color: "#d1a17a" },
                { v: "IV", color: "#a97452" },
                { v: "V", color: "#6f4a35" },
                { v: "VI", color: "#3b2219" },
              ].map(({ v, color }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFitzpatrick(v)}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm transition ${
                    fitzpatrick === v
                      ? "border-accent bg-accent/10 text-accent font-semibold"
                      : "border-rule text-ink hover:border-accent/50"
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full border border-black/10 inline-block"
                    style={{ backgroundColor: color }}
                  />
                  {v}
                </button>
              ))}
            </div>
            <input type="hidden" name="fitzpatrick" value={fitzpatrick} />
          </div>
        </div>

        {/* ── Merz ── */}
        <div className={tab === "Merz" ? "space-y-5" : "hidden"}>
          <div className="flex items-center justify-between -mt-1">
            <p className="text-xs text-mid">
              0 (ausencia) a 4 (máxima severidad). Reposo y dinámica por
              separado.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={handleSuggestMerz}
                className="text-xs bg-accent2 text-white rounded-full px-3 py-1 whitespace-nowrap"
              >
                ⚡ Sugerir por edad
              </button>
            )}
          </div>
          {MERZ_GROUPS.map((group) => (
            <div key={group.label}>
              <p className={labelCls}>{group.label}</p>
              <div className="space-y-2">
                {group.regions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-ink">{r.label}</span>
                    <ScaleSelect
                      name={`merz_${r.id}_rest`}
                      placeholder="Reposo"
                      value={merz[r.id]?.rest}
                    />
                    <ScaleSelect
                      name={`merz_${r.id}_dyn`}
                      placeholder="Dinámica"
                      value={merz[r.id]?.dyn}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── NAU ── */}
        <div className={tab === "NAU" ? "space-y-5" : "hidden"}>
          <div>
            <div className="flex items-center justify-between">
              <p className={labelCls}>NAU — déficit volumétrico</p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={handleSuggestNAU}
                  className="text-xs bg-accent2 text-white rounded-full px-3 py-1 whitespace-nowrap -mt-2"
                >
                  ↺ Recalcular por edad
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <NauField name="nau_fore" label="Frente" value={d?.nau_fore} />
              <NauField
                name="nau_perio"
                label="Periorbital"
                value={d?.nau_perio}
              />
              <NauField name="nau_malar" label="Malar" value={d?.nau_malar} />
              <NauField
                name="nau_naso"
                label="Nasogeniano"
                value={d?.nau_naso}
              />
              <NauField name="nau_ment" label="Mentón" value={d?.nau_ment} />
              <NauField name="nau_neck" label="Cuello" value={d?.nau_neck} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Laxitud (0–4)">
              <input
                name="nau_lax"
                type="number"
                step="0.5"
                min="0"
                max="4"
                defaultValue={d?.nau_lax ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Calidad de piel (%)">
              <input
                name="nau_skin"
                type="number"
                min="0"
                max="100"
                defaultValue={d?.nau_skin ?? ""}
                className={inputCls}
              />
            </Field>
            <Field label="Asimetría (%)">
              <input
                name="nau_asym"
                type="number"
                min="0"
                max="100"
                defaultValue={d?.nau_asym ?? ""}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="bg-warm border border-rule rounded-xl p-4">
            <p className={labelCls}>Simulador MPA (Courage+Khazaka)</p>
            <p className="text-[11px] text-mid mb-3">
              Practica con valores simulados de aparato real y conviértelos a la escala 0–4 de "Biofísicos manuales" con un clic. No sustituye una medición real.
            </p>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>💧 Corneómetro (hidratación)</span>
                  <span>{mpaCorne} u.a. — {mpaCorneInterp(mpaCorne)}</span>
                </div>
                <input type="range" min={0} max={120} value={mpaCorne} onChange={(e) => setMpaCorne(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>🔄 Cutómetro R2 (elasticidad)</span>
                  <span>{mpaCuto.toFixed(2)} — {mpaCutoInterp(mpaCuto)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.01} value={mpaCuto} onChange={(e) => setMpaCuto(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>🌊 Tewámetro (TEWL)</span>
                  <span>{mpaTewl} g/h/m² — {mpaTewlInterp(mpaTewl)}</span>
                </div>
                <input type="range" min={0} max={60} step={0.5} value={mpaTewl} onChange={(e) => setMpaTewl(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>🌑 Mexámetro — Melanina</span>
                  <span>{mpaMel} — {mpaMelInterp(mpaMel)}</span>
                </div>
                <input type="range" min={0} max={999} value={mpaMel} onChange={(e) => setMpaMel(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>🔴 Mexámetro — Eritema</span>
                  <span>{mpaEry} — {mpaEryInterp(mpaEry)}</span>
                </div>
                <input type="range" min={0} max={999} value={mpaEry} onChange={(e) => setMpaEry(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-ink">
                  <span>✨ Sebúmetro</span>
                  <span>{mpaSebo} — {mpaSeboInterp(mpaSebo)}</span>
                </div>
                <input type="range" min={0} max={220} value={mpaSebo} onChange={(e) => setMpaSebo(Number(e.target.value))} className="w-full" />
              </div>
            </div>

            {!readOnly && (
              <button
                type="button"
                onClick={handleApplyMPA}
                className="mt-3 text-xs bg-accent2 text-white rounded-full px-4 py-2 font-semibold hover:opacity-90 transition"
              >
                Usar estos valores en Biofísicos manuales
              </button>
            )}
          </div>

          <div>
            <p className={labelCls}>Biofísicos manuales</p>
            <p className="text-[11px] text-mid mb-2">
              Estimación clínica manual (sin aparato). Preparado para importar en el futuro los aparatos reales de la suite MPA (Corneómetro/Cutómetro/Tewámetro/Mexámetro/Sebúmetro, Courage+Khazaka) — de momento, usa las escalas de abajo con criterio clínico.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Hidratación (0–4)">
                <input
                  name="hidra"
                  type="number"
                  min="0"
                  max="4"
                  defaultValue={d?.hidra ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Snap test: pellizca y suelta la piel, mide el tiempo en volver. 0 óptima · 1 leve reducción · 2 moderada · 3 reducida · 4 severa. (Ref. Corneómetro: &gt;70 hidratada, 45-69 normal, 30-44 seca, &lt;30 muy seca.)
                </p>
              </Field>
              <Field label="Elasticidad (segundos, decimales)">
                <input
                  name="elastic"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  defaultValue={d?.elastic ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Pinch test: pellizca 5s y cronometra cuánto tarda en volver a su sitio. Admite decimales (ej. 1.5). &lt;1s excelente · 1-2s buena · 2-3s moderada · &gt;3s reducida (laxitud severa).
                </p>
              </Field>
              <Field label="Pigmentación (0–4)">
                <input
                  name="pigment"
                  type="number"
                  min="0"
                  max="4"
                  defaultValue={d?.pigment ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Manchas/discromías a simple vista. 0 ninguna · 1-2 leve-moderada · 3-4 marcada/generalizada. (Ref. Mexámetro melanina: &lt;200 Fototipo I-II, 200-350 III-IV, &gt;350 hiperpigmentación.)
                </p>
              </Field>
              <Field label="Sebo (0–4)">
                <input
                  name="sebo"
                  type="number"
                  min="0"
                  max="4"
                  defaultValue={d?.sebo ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Brillo/grasa visible en zona T tras 2-3h sin lavar. 0 asébacea/seca · 1-2 normal · 3 tendencia grasa · 4 hipersecreción evidente.
                </p>
              </Field>
              <Field label="Eritema (0–4)">
                <input
                  name="eritema"
                  type="number"
                  min="0"
                  max="4"
                  defaultValue={d?.eritema ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Rojez visible en reposo (no confundir con rubor pasajero). 0 sin eritema · 1-2 leve-moderado · 3-4 intenso/rosácea. (Ref. Mexámetro eritema: &lt;150 sin eritema, 150-300 leve-mod., &gt;300 intenso.)
                </p>
              </Field>
              <Field label="TEWL (g/h/m², decimales)">
                <input
                  name="tewl"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  defaultValue={d?.tewl ?? ""}
                  className={inputCls}
                />
                <p className="text-[10px] text-mid mt-1">
                  Pérdida transepidérmica de agua. Admite decimales (ej. 12.5). Sin aparato, déjalo vacío o estima por sensación de tirantez/descamación. (Ref. Tewámetro: 0-10 óptima, 10-15 normal, 15-25 ligera alteración, 25-35 moderada, &gt;35 barrera dañada.)
                </p>
              </Field>
            </div>
          </div>
        </div>

        {/* ── Comparador ── */}
        <div className={tab === "Comparador" ? "space-y-5" : "hidden"}>
          <ComparadorTabContent photos={photos} clinical={d} sessionId={sessionId} />
        </div>

        {/* ── Informe ── */}
        <div className={tab === "Informe" ? "space-y-5" : "hidden"}>
          <div className="bg-warm border border-rule rounded-xl p-4">
            <p className={labelCls}>Preferencias para el plan de tratamiento</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Presupuesto">
                <select name="presupuesto" defaultValue={d?.presupuesto ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="< 500€">&lt; 500€</option>
                  <option value="500-1.000€">500-1.000€</option>
                  <option value="1.000-3.000€">1.000-3.000€</option>
                  <option value="3.000-5.000€">3.000-5.000€</option>
                  <option value="> 5.000€">&gt; 5.000€</option>
                  <option value="Sin límite">Sin límite</option>
                </select>
              </Field>
              <Field label="Downtime aceptado">
                <select name="downtime" defaultValue={d?.downtime ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="Sin downtime">Sin downtime</option>
                  <option value="1-3 días">1-3 días</option>
                  <option value="Hasta 1 semana">Hasta 1 semana</option>
                  <option value="Sin restricción">Sin restricción</option>
                </select>
                <p className="text-[10px] text-mid mt-1">
                  "Downtime" = tiempo de recuperación visible tras el procedimiento (enrojecimiento, hinchazón, costras, moratones) durante el cual la paciente prefiere no exponerse socialmente o laboralmente. HIFU y algunos rellenos pueden dejar hinchazón unos días; peelings profundos y láseres ablativos, más.
                </p>
              </Field>
              <Field label="Embarazo/lactancia">
                <select name="embarazo" defaultValue={d?.embarazo ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </select>
              </Field>
              <Field label="Anticoagulantes">
                <select name="anticoagulantes" defaultValue={d?.anticoagulantes ?? ""} className={inputCls}>
                  <option value="">—</option>
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </select>
              </Field>
            </div>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-accent text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              {generating ? "Generando…" : "Generar informe y plan automáticamente"}
            </button>
          )}
          <p className="text-xs text-mid -mt-3">
            A partir de Glogau, Merz, NAU, biofísicos, los ángulos medidos y las preferencias de arriba. Puedes editar el resultado antes de guardar.
          </p>

          <Field label="Informe">
            <textarea
              ref={informeRef}
              name="informe"
              rows={6}
              defaultValue={d?.informe ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Plan de tratamiento">
            <textarea
              ref={planRef}
              name="plan_tratamiento"
              rows={6}
              defaultValue={d?.plan_tratamiento ?? ""}
              className={inputCls}
            />
          </Field>

          <div className="flex gap-3 flex-wrap">
            {!readOnly && (
              <button
                type="submit"
                className="bg-accent2 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition"
              >
                Guardar sesión
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="bg-white border border-rule text-ink rounded-full px-6 py-2.5 text-sm font-semibold hover:border-accent/50 transition disabled:opacity-60"
            >
              {downloading ? "Generando PDF…" : "⬇ Descargar PDF"}
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              disabled={downloadingWord}
              className="bg-white border border-rule text-ink rounded-full px-6 py-2.5 text-sm font-semibold hover:border-accent/50 transition disabled:opacity-60"
            >
              {downloadingWord ? "Generando Word…" : "⬇ Descargar Word"}
            </button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
