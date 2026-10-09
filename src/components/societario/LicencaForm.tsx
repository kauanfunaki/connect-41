"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { salvarLicenca, type LicencaState } from "@/app/(app)/licencas/actions";
import { TIPOS_SUGERIDOS, MAX_TIPO, MAX_NUMERO, MAX_OBSERVACOES } from "@/lib/societario/licenca-form";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

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
        // Na edição a empresa é fixa: campo só de leitura, com o mesmo rótulo e
        // a mesma altura dos outros, em vez de um texto solto de outro tamanho.
        <CampoForm label="Empresa" htmlFor={`${prefixo}-empresa`}>
          <Input id={`${prefixo}-empresa`} value={licenca.empresaNome} readOnly />
          <input type="hidden" name="companyId" value={licenca.companyId} />
        </CampoForm>
      ) : (
        <CampoForm label="Empresa" htmlFor={`${prefixo}-empresa`} required>
          <SearchableSelect id={`${prefixo}-empresa`} name="companyId" options={empresas ?? []} placeholder="Buscar empresa…" avatar lembrarRecentes="empresas" />
        </CampoForm>
      )}

      <CampoForm
        label="Licença"
        htmlFor={`${prefixo}-tipo`}
        required
        helper="Escolha uma sugestão ou escreva como o órgão chama."
      >
        {/* Sugestões próprias (08/10/2026), no lugar do `<datalist>`: a lista
            do navegador vinha misturada ao histórico do Chrome e sem o tema. */}
        <CampoComSugestoes
          id={`${prefixo}-tipo`}
          name="kind"
          sugestoes={TIPOS_SUGERIDOS}
          maxLength={MAX_TIPO}
          defaultValue={licenca?.kind ?? ""}
          required
        />
      </CampoForm>

      {/* Número é curto: coluna estreita, e o órgão fica com o resto. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_11rem]">
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
      </FieldGrid>

      <FieldGrid>
        <CampoForm label="Emissão" htmlFor={`${prefixo}-emissao`}>
          <CampoData id={`${prefixo}-emissao`} name="issuedAt" defaultValue={licenca?.issuedAt ?? ""} />
        </CampoForm>
        <CampoForm
          label="Validade"
          htmlFor={`${prefixo}-validade`}
          helper="Em branco quando não vence — inscrição municipal, por exemplo."
        >
          <CampoData id={`${prefixo}-validade`} name="expiresAt" defaultValue={licenca?.expiresAt ?? ""} />
        </CampoForm>
      </FieldGrid>

      <CampoForm label="Observações" htmlFor={`${prefixo}-obs`}>
        <Textarea id={`${prefixo}-obs`} name="notes" rows={3} maxLength={MAX_OBSERVACOES} defaultValue={licenca?.notes ?? ""} />
      </CampoForm>

      {estado && "error" in estado && (
        <Aviso>{estado.error}</Aviso>
      )}

      <FormFooter
        pending={isPending}
        submitLabel={licenca ? "Salvar" : "Cadastrar"}
        onCancel={onClose}
      />
    </form>
  );
}

/** O botão de cadastrar, com o formulário. */
export function NovaLicenca({ empresas, orgaos }: { empresas: Opcao[]; orgaos: OrgaoDaLicenca[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setAberto(true)}>
        <Plus size={14} /> Nova licença
      </Button>
      <LicencaModal open={aberto} onClose={() => setAberto(false)} empresas={empresas} orgaos={orgaos} />
    </>
  );
}
