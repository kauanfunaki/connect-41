"use client";

import { useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";

type Defaults = {
  cpf: string; rg: string; pis: string; ctps: string; ctpsSerie: string; education: string; birthDate: string;
  zipCode: string; addressStreet: string; addressNumber: string; addressComplement: string;
  neighborhood: string; city: string; stateCode: string;
  bankName: string; bankAgency: string; bankAccount: string; bankAccountType: string;
};

type Props = { token: string; defaults: Defaults };

const DOC_FIELDS: { field: string; label: string }[] = [
  { field: "doc_rg", label: "RG" },
  { field: "doc_cpf", label: "CPF" },
  { field: "doc_comprovante", label: "Comprovante de residência" },
  { field: "doc_foto", label: "Foto 3x4" },
  { field: "doc_ctps", label: "Carteira de Trabalho" },
  { field: "doc_aso", label: "ASO (exame admissional)" },
];

const fileInputClass =
  "text-[12px] text-fg file:mr-3 file:h-9 file:px-3 file:rounded-[10px] file:border file:border-border-strong file:bg-surface-hover file:text-fg file:text-[12px] file:font-medium file:cursor-pointer file:border-solid hover:file:border-brand file:transition-colors";

const RELATIONSHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "FILHO", label: "Filho(a)" },
  { value: "ENTEADO", label: "Enteado(a)" },
  { value: "CONJUGE", label: "Cônjuge" },
  { value: "COMPANHEIRO", label: "Companheiro(a)" },
  { value: "PAIS", label: "Pai / Mãe" },
  { value: "OUTRO", label: "Outro" },
];

type DependenteRow = {
  name: string; cpf: string; birthDate: string; relationship: string; isIR: boolean; isSF: boolean;
};

const emptyDependente: DependenteRow = { name: "", cpf: "", birthDate: "", relationship: "FILHO", isIR: false, isSF: false };

export function AdmissaoForm({ token, defaults }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deps, setDeps] = useState<DependenteRow[]>([]);

  function updateDep(index: number, patch: Partial<DependenteRow>) {
    setDeps((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  function addDep() {
    setDeps((prev) => [...prev, { ...emptyDependente }]);
  }
  function removeDep(index: number) {
    setDeps((prev) => prev.filter((_, i) => i !== index));
  }

  // Autocompletar endereço pelo CEP (brasilapi já liberada na CSP) — best-effort.
  async function handleCepBlur(e: React.FocusEvent<HTMLInputElement>) {
    const cep = e.target.value.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (!res.ok) return;
      const d = await res.json();
      const formEl = e.target.form;
      if (!formEl) return;
      const setVal = (name: string, value: string | undefined) => {
        const el = formEl.elements.namedItem(name) as HTMLInputElement | null;
        if (el && value && !el.value) el.value = value;
      };
      setVal("addressStreet", d.street);
      setVal("neighborhood", d.neighborhood);
      setVal("city", d.city);
      setVal("stateCode", d.state);
    } catch {
      // silencioso — preenchimento manual continua disponível
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    form.set("consent", form.get("consent") ? "true" : "false");

    // Dependentes são controlados por estado (sem name nos inputs) — serializa
    // com índices + contagem pra o submit reconstruir.
    const validDeps = deps.filter((d) => d.name.trim());
    form.set("dep_count", String(validDeps.length));
    validDeps.forEach((d, i) => {
      form.set(`dep_name_${i}`, d.name.trim());
      form.set(`dep_cpf_${i}`, d.cpf.trim());
      form.set(`dep_birthDate_${i}`, d.birthDate);
      form.set(`dep_relationship_${i}`, d.relationship);
      form.set(`dep_ir_${i}`, d.isIR ? "true" : "false");
      form.set(`dep_sf_${i}`, d.isSF ? "true" : "false");
    });

    try {
      const res = await fetch(`/api/admissao/${token}/submit`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erro ao enviar. Tente novamente.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro ao enviar. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-success/10 border border-success/25 rounded-lg p-6 text-center">
        <p className="text-[15px] font-semibold text-success">Admissão enviada!</p>
        <p className="text-[13px] text-fg-muted mt-1">
          Recebemos seus dados e documentos. A equipe de RH vai conferir as informações e dar sequência à sua admissão.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Dados pessoais */}
      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Dados pessoais</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="CPF" htmlFor="cpf">
            <Input id="cpf" name="cpf" type="text" defaultValue={defaults.cpf} placeholder="000.000.000-00" maxLength={14} />
          </CampoForm>
          <CampoForm label="Data de nascimento" htmlFor="birthDate">
            <Input id="birthDate" name="birthDate" type="date" defaultValue={defaults.birthDate} />
          </CampoForm>
          <CampoForm label="RG" htmlFor="rg">
            <Input id="rg" name="rg" type="text" defaultValue={defaults.rg} maxLength={20} />
          </CampoForm>
          <CampoForm label="PIS / PASEP" htmlFor="pis">
            <Input id="pis" name="pis" type="text" defaultValue={defaults.pis} maxLength={20} />
          </CampoForm>
          <CampoForm label="CTPS (número)" htmlFor="ctps">
            <Input id="ctps" name="ctps" type="text" defaultValue={defaults.ctps} maxLength={20} />
          </CampoForm>
          <CampoForm label="CTPS (série)" htmlFor="ctpsSerie">
            <Input id="ctpsSerie" name="ctpsSerie" type="text" defaultValue={defaults.ctpsSerie} maxLength={10} />
          </CampoForm>
          <CampoForm label="Escolaridade" htmlFor="education">
            <Input id="education" name="education" type="text" defaultValue={defaults.education} maxLength={80} />
          </CampoForm>
        </div>
      </section>

      {/* Endereço */}
      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Endereço</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="CEP" htmlFor="zipCode">
            <Input id="zipCode" name="zipCode" type="text" defaultValue={defaults.zipCode} placeholder="00000-000" maxLength={9} onBlur={handleCepBlur} />
          </CampoForm>
          <CampoForm label="Logradouro" htmlFor="addressStreet">
            <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaults.addressStreet} maxLength={180} />
          </CampoForm>
          <CampoForm label="Número" htmlFor="addressNumber">
            <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaults.addressNumber} maxLength={20} />
          </CampoForm>
          <CampoForm label="Complemento" htmlFor="addressComplement">
            <Input id="addressComplement" name="addressComplement" type="text" defaultValue={defaults.addressComplement} maxLength={80} />
          </CampoForm>
          <CampoForm label="Bairro" htmlFor="neighborhood">
            <Input id="neighborhood" name="neighborhood" type="text" defaultValue={defaults.neighborhood} maxLength={80} />
          </CampoForm>
          <CampoForm label="Cidade" htmlFor="city">
            <Input id="city" name="city" type="text" defaultValue={defaults.city} maxLength={80} />
          </CampoForm>
          <CampoForm label="UF" htmlFor="stateCode">
            <Input id="stateCode" name="stateCode" type="text" defaultValue={defaults.stateCode} placeholder="SC" maxLength={2} />
          </CampoForm>
        </div>
      </section>

      {/* Dados bancários */}
      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Dados bancários</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Banco" htmlFor="bankName">
            <Input id="bankName" name="bankName" type="text" defaultValue={defaults.bankName} maxLength={80} />
          </CampoForm>
          <CampoForm label="Tipo de conta" htmlFor="bankAccountType">
            <Select id="bankAccountType" name="bankAccountType" defaultValue={defaults.bankAccountType}>
              <option value="">Selecione</option>
              <option value="Corrente">Corrente</option>
              <option value="Poupança">Poupança</option>
              <option value="Salário">Salário</option>
            </Select>
          </CampoForm>
          <CampoForm label="Agência" htmlFor="bankAgency">
            <Input id="bankAgency" name="bankAgency" type="text" defaultValue={defaults.bankAgency} maxLength={20} />
          </CampoForm>
          <CampoForm label="Conta (com dígito)" htmlFor="bankAccount">
            <Input id="bankAccount" name="bankAccount" type="text" defaultValue={defaults.bankAccount} maxLength={30} />
          </CampoForm>
        </div>
      </section>

      {/* Dependentes */}
      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-1">Dependentes</h2>
        <p className="text-[12px] text-fg-muted mb-4">Filhos, cônjuge ou outros dependentes (imposto de renda / salário-família). Opcional.</p>

        {deps.length > 0 && (
          <div className="space-y-4 mb-4">
            {deps.map((d, i) => (
              <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-fg-muted">Dependente {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeDep(i)}
                    className="text-[12px] text-danger hover:underline"
                  >
                    Remover
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CampoForm label="Nome completo" htmlFor={`dep-name-${i}`}>
                    <Input id={`dep-name-${i}`} type="text" value={d.name} onChange={(e) => updateDep(i, { name: e.target.value })} maxLength={180} />
                  </CampoForm>
                  <CampoForm label="Parentesco" htmlFor={`dep-rel-${i}`}>
                    <Select id={`dep-rel-${i}`} value={d.relationship} onChange={(e) => updateDep(i, { relationship: e.target.value })}>
                      {RELATIONSHIP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="CPF" htmlFor={`dep-cpf-${i}`}>
                    <Input id={`dep-cpf-${i}`} type="text" value={d.cpf} onChange={(e) => updateDep(i, { cpf: e.target.value })} placeholder="000.000.000-00" maxLength={14} />
                  </CampoForm>
                  <CampoForm label="Data de nascimento" htmlFor={`dep-birth-${i}`}>
                    <Input id={`dep-birth-${i}`} type="date" value={d.birthDate} onChange={(e) => updateDep(i, { birthDate: e.target.value })} />
                  </CampoForm>
                </div>
                <div className="flex flex-wrap gap-4">
                  <Checkbox checked={d.isIR} onChange={(e) => updateDep(i, { isIR: e.target.checked })} label="Dependente de IR" />
                  <Checkbox checked={d.isSF} onChange={(e) => updateDep(i, { isSF: e.target.checked })} label="Salário-família" />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addDep}
          className="h-9 px-4 rounded-md border border-border-strong bg-surface-hover text-fg text-[13px] font-medium hover:border-brand transition-colors"
        >
          + Adicionar dependente
        </button>
      </section>

      {/* Documentos */}
      <section className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-1">Documentos</h2>
        <p className="text-[12px] text-fg-muted mb-4">PDF, JPG, PNG ou WEBP, até 10MB cada. Envie o que tiver em mãos — o RH confirma o restante depois.</p>
        <div className="space-y-3">
          {DOC_FIELDS.map((d) => (
            <div key={d.field} className="space-y-1.5">
              <label htmlFor={d.field} className="block text-[length:var(--fs-label)] font-medium text-fg">{d.label}</label>
              <input id={d.field} name={d.field} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className={fileInputClass} />
            </div>
          ))}
        </div>
      </section>

      <Checkbox
        name="consent"
        value="true"
        label="Confirmo que as informações são verdadeiras e autorizo o uso dos meus dados pessoais para a minha admissão (LGPD)."
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-10 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Enviando…" : "Enviar admissão"}
      </button>

      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>
      )}
    </form>
  );
}
