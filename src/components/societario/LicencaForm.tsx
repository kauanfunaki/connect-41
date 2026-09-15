"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { salvarLicenca, type LicencaState } from "@/app/(app)/licencas/actions";
import { TIPOS_SUGERIDOS, MAX_TIPO, MAX_NUMERO, MAX_OBSERVACOES } from "@/lib/societario/licenca-form";

export type OrgaoDaLicenca = { id: string; nome: string };

/** Uma licença pronta para o formulário de edição — datas já como "AAAA-MM-DD". */
export type LicencaParaEditar = {
  id: string;
  companyId: string;
  empresaNome: string;
  kind: string;
  organId: string | null;
  number: string | null;
  issuedAt: string;
  expiresAt: string;
  notes: string | null;
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  orgaos: OrgaoDaLicenca[];
  /** Obrigatório para criar; na edição a empresa é fixa. */
  empresas?: Opcao[];
  licenca?: LicencaParaEditar;
};

export function LicencaModal({ open, onClose, orgaos, empresas, licenca }: ModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={licenca ? "Editar licença" : "Nova licença"} maxWidth="max-w-lg">
      {/* Montado só quando aberto: o estado da ação zera a cada abertura, e o
          "salvo" da vez anterior não reaparece num formulário novo. */}
      {open && <Formulario onClose={onClose} orgaos={orgaos} empresas={empresas} licenca={licenca} />}
    </Modal>
  );
}

function Formulario({ onClose, orgaos, empresas, licenca }: Omit<ModalProps, "open">) {
  const [estado, action, isPending] = useActionState(async (prev: LicencaState, form: FormData) => {
    const r = await salvarLicenca(prev, form);
    if (r && "success" in r) onClose();
    return r;
  }, null);

  const prefixo = licenca ? `lic-${licenca.id}` : "lic-nova";

  return (
    <form action={action} className="flex flex-col gap-4">
      {licenca && <input type="hidden" name="id" value={licenca.id} />}

      {licenca ? (
        <div className="flex flex-col gap-1">
          <span className="text-[length:var(--fs-label)] font-medium text-fg">Empresa</span>
          <span className="text-[13px] text-fg-secondary">{licenca.empresaNome}</span>
          <input type="hidden" name="companyId" value={licenca.companyId} />
        </div>
      ) : (
        <CampoForm label="Empresa" htmlFor={`${prefixo}-empresa`} required>
          <SearchableSelect id={`${prefixo}-empresa`} name="companyId" options={empresas ?? []} placeholder="Buscar empresa…" />
        </CampoForm>
      )}

      <CampoForm
        label="Licença"
        htmlFor={`${prefixo}-tipo`}
        required
        helper="Escolha uma sugestão ou escreva como o órgão chama."
      >
        <Input
          id={`${prefixo}-tipo`}
          name="kind"
          list={`${prefixo}-tipos`}
          maxLength={MAX_TIPO}
          defaultValue={licenca?.kind ?? ""}
          required
        />
        <datalist id={`${prefixo}-tipos`}>
          {TIPOS_SUGERIDOS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </CampoForm>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoForm label="Órgão" htmlFor={`${prefixo}-orgao`}>
          <Select id={`${prefixo}-orgao`} name="organId" defaultValue={licenca?.organId ?? ""}>
            <option value="">Sem órgão cadastrado</option>
            {orgaos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Número" htmlFor={`${prefixo}-numero`}>
          <Input id={`${prefixo}-numero`} name="number" maxLength={MAX_NUMERO} defaultValue={licenca?.number ?? ""} />
        </CampoForm>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoForm label="Emissão" htmlFor={`${prefixo}-emissao`}>
          <Input id={`${prefixo}-emissao`} name="issuedAt" type="date" defaultValue={licenca?.issuedAt ?? ""} />
        </CampoForm>
        <CampoForm
          label="Validade"
          htmlFor={`${prefixo}-validade`}
          helper="Em branco quando não vence — inscrição municipal, por exemplo."
        >
          <Input id={`${prefixo}-validade`} name="expiresAt" type="date" defaultValue={licenca?.expiresAt ?? ""} />
        </CampoForm>
      </div>

      <CampoForm label="Observações" htmlFor={`${prefixo}-obs`}>
        <Textarea id={`${prefixo}-obs`} name="notes" rows={3} maxLength={MAX_OBSERVACOES} defaultValue={licenca?.notes ?? ""} />
      </CampoForm>

      {estado && "error" in estado && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{estado.error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : licenca ? "Salvar" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}

/** O botão de cadastrar, com o formulário. */
export function NovaLicenca({ empresas, orgaos }: { empresas: Opcao[]; orgaos: OrgaoDaLicenca[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setAberto(true)}>
        <Plus size={14} /> Nova licença
      </Button>
      <LicencaModal open={aberto} onClose={() => setAberto(false)} empresas={empresas} orgaos={orgaos} />
    </>
  );
}
