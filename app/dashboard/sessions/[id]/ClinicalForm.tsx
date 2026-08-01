"use client";

import { useState } from "react";

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

const TABS = ["Clasificación", "Merz", "NAU", "Informe"] as const;
type Tab = (typeof TABS)[number];

type MerzScore = { rest: number | null; dyn: number | null };

type ClinicalRow = {
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
}: {
  name: string;
  label: string;
  value?: number | null;
}) {
  return (
    <Field label={`${label} (0–3)`}>
      <select name={name} defaultValue={value ?? ""} className={inputCls}>
        <option value="">—</option>
        {[0, 1, 2, 3].map((v) => (
          <option key={v} value={v}>
            {v}
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
}: {
  action: (formData: FormData) => void;
  initialData: ClinicalRow;
  readOnly: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Clasificación");
  const d = initialData;
  const merz = d?.merz ?? {};

  return (
    <form action={action}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Scale0to3 name="sol" label="Exposición solar" value={d?.sol} />
            <Scale0to3 name="tabaco" label="Tabaco" value={d?.tabaco} />
            <Scale0to3 name="estres" label="Estrés" value={d?.estres} />
          </div>

          <div>
            <p className={labelCls}>Glogau</p>
            <div className="flex gap-2 flex-wrap">
              {["1", "2", "3", "4"].map((v) => (
                <label key={v} className="cursor-pointer">
                  <input
                    type="radio"
                    name="glogau"
                    value={v}
                    defaultChecked={String(d?.glogau ?? "") === v}
                    className="sr-only peer"
                  />
                  <span className="peer-checked:border-accent peer-checked:bg-accent/10 border border-rule rounded-lg px-3 py-2 text-sm block">
                    Tipo {v}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className={labelCls}>Fitzpatrick</p>
            <div className="flex gap-2 flex-wrap">
              {["I", "II", "III", "IV", "V", "VI"].map((v) => (
                <label key={v} className="cursor-pointer">
                  <input
                    type="radio"
                    name="fitzpatrick"
                    value={v}
                    defaultChecked={d?.fitzpatrick === v}
                    className="sr-only peer"
                  />
                  <span className="peer-checked:border-accent peer-checked:bg-accent/10 border border-rule rounded-lg px-3 py-2 text-sm block">
                    {v}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Merz ── */}
        <div className={tab === "Merz" ? "space-y-5" : "hidden"}>
          <p className="text-xs text-mid -mt-1">
            0 (ausencia) a 4 (máxima severidad). Reposo y dinámica por
            separado.
          </p>
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
            <p className={labelCls}>NAU — déficit volumétrico</p>
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

          <div>
            <p className={labelCls}>Biofísicos manuales</p>
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
              </Field>
              <Field label="Elasticidad (s)">
                <input
                  name="elastic"
                  type="number"
                  step="0.1"
                  defaultValue={d?.elastic ?? ""}
                  className={inputCls}
                />
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
              </Field>
              <Field label="TEWL">
                <input
                  name="tewl"
                  type="number"
                  step="0.1"
                  defaultValue={d?.tewl ?? ""}
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* ── Informe ── */}
        <div className={tab === "Informe" ? "space-y-5" : "hidden"}>
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

          <Field label="Informe">
            <textarea
              name="informe"
              rows={6}
              defaultValue={d?.informe ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Plan de tratamiento">
            <textarea
              name="plan_tratamiento"
              rows={6}
              defaultValue={d?.plan_tratamiento ?? ""}
              className={inputCls}
            />
          </Field>

          {!readOnly && (
            <button
              type="submit"
              className="bg-accent2 text-white rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90 transition"
            >
              Guardar sesión
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
