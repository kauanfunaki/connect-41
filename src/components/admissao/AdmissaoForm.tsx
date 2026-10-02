"use client";

import { useState } from "react";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

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
      {/* Revisão de alinhamento (30/09): cada seção era uma grade de 2
          colunas iguais — UF, número e série da CTPS ocupavam meia tela, e o
          campo que sobrava (Escolaridade, UF) ficava sozinho na linha. Agora
          as seções usam uma grade de 6 trilhos: campo curto ocupa pouco,
          campo de texto ocupa o resto, e as bordas das colunas caem umas sob
          as outras de uma linha para a seguinte. */}
      <Card as="section" className="p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Dados pessoais</h2>
        <FieldGrid columns="sm:grid-cols-6">
          <CampoForm label="CPF" htmlFor="cpf" className="sm:col-span-2">
            <Input id="cpf" name="cpf" type="text" defaultValue={defaults.cpf} placeholder="000.000.000-00" maxLength={14} />
          </CampoForm>
          <CampoForm label="RG" htmlFor="rg" className="sm:col-span-2">
            <Input id="rg" name="rg" type="text" defaultValue={defaults.rg} maxLength={20} />
          </CampoForm>
          <CampoForm label="Data de nascimento" htmlFor="birthDate" className="sm:col-span-2">
            <CampoData id="birthDate" name="birthDate" defaultValue={defaults.birthDate} />
          </CampoForm>
          <CampoForm label="PIS / PASEP" htmlFor="pis" className="sm:col-span-2">
            <Input id="pis" name="pis" type="text" defaultValue={defaults.pis} maxLength={20} />
          </CampoForm>
          <CampoForm label="CTPS (número)" htmlFor="ctps" className="sm:col-span-2">
            <Input id="ctps" name="ctps" type="text" defaultValue={defaults.ctps} maxLength={20} />
          </CampoForm>
          <CampoForm label="CTPS (série)" htmlFor="ctpsSerie" className="sm:col-span-2">
            <Input id="ctpsSerie" name="ctpsSerie" type="text" defaultValue={defaults.ctpsSerie} maxLength={10} />
          </CampoForm>
          <CampoForm label="Escolaridade" htmlFor="education" className="sm:col-span-6">
            <Input id="education" name="education" type="text" defaultValue={defaults.education} maxLength={80} />
          </CampoForm>
        </FieldGrid>
      </Card>

      <Card as="section" className="p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Endereço</h2>
        <FieldGrid columns="sm:grid-cols-6">
          <CampoForm label="CEP" htmlFor="zipCode" className="sm:col-span-2">
            <Input id="zipCode" name="zipCode" type="text" defaultValue={defaults.zipCode} placeholder="00000-000" maxLength={9} onBlur={handleCepBlur} />
          </CampoForm>
          <CampoForm label="Logradouro" htmlFor="addressStreet" className="sm:col-span-3">
            <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaults.addressStreet} maxLength={180} />
          </CampoForm>
          <CampoForm label="Número" htmlFor="addressNumber" className="sm:col-span-1">
            <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaults.addressNumber} maxLength={20} />
          </CampoForm>
          <CampoForm label="Complemento" htmlFor="addressComplement" className="sm:col-span-3">
            <Input id="addressComplement" name="addressComplement" type="text" defaultValue={defaults.addressComplement} maxLength={80} />
          </CampoForm>
          <CampoForm label="Bairro" htmlFor="neighborhood" className="sm:col-span-3">
            <Input id="neighborhood" name="neighborhood" type="text" defaultValue={defaults.neighborhood} maxLength={80} />
          </CampoForm>
          <CampoForm label="Cidade" htmlFor="city" className="sm:col-span-5">
            <Input id="city" name="city" type="text" defaultValue={defaults.city} maxLength={80} />
          </CampoForm>
          <CampoForm label="UF" htmlFor="stateCode" className="sm:col-span-1">
            <Input id="stateCode" name="stateCode" type="text" defaultValue={defaults.stateCode} placeholder="SC" maxLength={2} />
          </CampoForm>
        </FieldGrid>
      </Card>

      <Card as="section" className="p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-4">Dados bancários</h2>
        <FieldGrid columns="sm:grid-cols-6">
          <CampoForm label="Banco" htmlFor="bankName" className="sm:col-span-4">
            <Input id="bankName" name="bankName" type="text" defaultValue={defaults.bankName} maxLength={80} />
          </CampoForm>
          <CampoForm label="Tipo de conta" htmlFor="bankAccountType" className="sm:col-span-2">
            <Select id="bankAccountType" name="bankAccountType" defaultValue={defaults.bankAccountType}>
              <option value="">Selecione</option>
              <option value="Corrente">Corrente</option>
              <option value="Poupança">Poupança</option>
              <option value="Salário">Salário</option>
            </Select>
          </CampoForm>
          <CampoForm label="Agência" htmlFor="bankAgency" className="sm:col-span-2">
            <Input id="bankAgency" name="bankAgency" type="text" defaultValue={defaults.bankAgency} maxLength={20} />
          </CampoForm>
          <CampoForm label="Conta (com dígito)" htmlFor="bankAccount" className="sm:col-span-4">
            <Input id="bankAccount" name="bankAccount" type="text" defaultValue={defaults.bankAccount} maxLength={30} />
          </CampoForm>
        </FieldGrid>
      </Card>

      <Card as="section" className="p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-1">Dependentes</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">Filhos, cônjuge ou outros dependentes (imposto de renda / salário-família). Opcional.</p>

        {deps.length > 0 && (
          <div className="space-y-4 mb-4">
            {deps.map((d, i) => (
              <div key={i} className="border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-fg">Dependente {i + 1}</span>
                  {/* Era texto vermelho sublinhado (até 30/09): botão. */}
                  <Button variant="danger" size="xs" onClick={() => removeDep(i)}>
                    Remover
                  </Button>
                </div>
                <FieldGrid columns="sm:grid-cols-6">
                  <CampoForm label="Nome completo" htmlFor={`dep-name-${i}`} className="sm:col-span-4">
                    <Input id={`dep-name-${i}`} type="text" value={d.name} onChange={(e) => updateDep(i, { name: e.target.value })} maxLength={180} />
                  </CampoForm>
                  <CampoForm label="Parentesco" htmlFor={`dep-rel-${i}`} className="sm:col-span-2">
                    <Select id={`dep-rel-${i}`} value={d.relationship} onChange={(e) => updateDep(i, { relationship: e.target.value })}>
                      {RELATIONSHIP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </CampoForm>
                  <CampoForm label="CPF" htmlFor={`dep-cpf-${i}`} className="sm:col-span-3">
                    <Input id={`dep-cpf-${i}`} type="text" value={d.cpf} onChange={(e) => updateDep(i, { cpf: e.target.value })} placeholder="000.000.000-00" maxLength={14} />
                  </CampoForm>
                  <CampoForm label="Data de nascimento" htmlFor={`dep-birth-${i}`} className="sm:col-span-3">
                    <CampoData id={`dep-birth-${i}`} value={d.birthDate} onChange={(v) => updateDep(i, { birthDate: v })} />
                  </CampoForm>
                </FieldGrid>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Checkbox checked={d.isIR} onChange={(e) => updateDep(i, { isIR: e.target.checked })} label="Dependente de IR" />
                  <Checkbox checked={d.isSF} onChange={(e) => updateDep(i, { isSF: e.target.checked })} label="Salário-família" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tinha fundo e borda próprios por cima do secondary (até 30/09). */}
        <Button variant="secondary" onClick={addDep}>
          <Plus size={14} />
          Adicionar dependente
        </Button>
      </Card>

      <Card as="section" className="p-5">
        <h2 className="text-[15px] font-semibold text-fg mb-1">Documentos</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">PDF, JPG, PNG ou WEBP, até 10MB cada. Envie o que tiver em mãos — o RH confirma o restante depois.</p>
        <div className="space-y-4">
          {DOC_FIELDS.map((d) => (
            <CampoForm key={d.field} label={d.label} htmlFor={d.field}>
              <FileDropzoneField
                id={d.field}
                name={d.field}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                maxSizeMb={10}
                compacto
              />
            </CampoForm>
          ))}
        </div>
      </Card>

      <Checkbox
        name="consent"
        value="true"
        label="Confirmo que as informações são verdadeiras e autorizo o uso dos meus dados pessoais para a minha admissão (LGPD)."
      />

      {/* O erro ia depois do botão, fora da vista de quem acabou de clicar
          no fim da página; agora fica logo acima dele. */}
      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Enviando…" : "Enviar admissão"}
      </Button>
    </form>
  );
}
