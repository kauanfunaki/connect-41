import { Banknote, FileSignature, FilePlus2, FileText, FolderTree } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import type { StatusAuditoria } from "@/lib/honorarios/servidor/auditSyncService";
import { SituacaoDaVarredura } from "./SituacaoDaVarredura";

export type AbaDosHonorarios = "honorarios" | "contratos" | "aditivos" | "termo" | "pastas";

const SUBTITULO: Record<AbaDosHonorarios, string> = {
  honorarios:
    "O honorário do documento mais recente de cada empresa — contrato ou termo aditivo —, lido pelo robô na pasta de rede e comparado com o Acessórias. Contrato digitalizado não tem texto: informe o valor à mão.",
  contratos:
    "O contrato de prestação de serviços de cada empresa ativa. Pela regra do Societário, “assinado” no nome do arquivo conta como assinado, separado da assinatura digital.",
  aditivos:
    "Se o termo aditivo anual está na pasta de cada empresa ativa, e em que estado. Conta como em dia o aditivo com assinatura digital ou com “assinado” no nome. O termo de 13º só existe para algumas empresas e, sozinho, não substitui o anual.",
  termo:
    "Gerar o termo aditivo em Word com o cadastro da empresa: endereço, o sócio administrador que assina e os contatos do contrato. O termo vai para os Arquivos da empresa e é baixado na hora.",
  pastas:
    "Cada pasta de cliente na rede precisa estar ligada a uma empresa para entrar na auditoria. Quando o nome bate (ou a filial bate com o CNPJ), o vínculo é automático; o resto aparece aqui para conferir.",
};

/** Título, faixa da varredura e as abas — o mesmo topo nas cinco telas. */
export function CabecalhoDosHonorarios({
  ativa,
  status,
  podeAgir,
  acao,
}: {
  ativa: AbaDosHonorarios;
  status: StatusAuditoria;
  podeAgir: boolean;
  acao?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Contratos e honorários" subtitle={SUBTITULO[ativa]} action={acao} />
      <SituacaoDaVarredura status={status} podeAgir={podeAgir} />
      <AbasDeLink
        ativa={ativa}
        aria-label="Telas de contratos e honorários"
        abas={[
          { chave: "honorarios", rotulo: "Honorários", href: "/honorarios", icone: <Banknote size={18} /> },
          { chave: "contratos", rotulo: "Contratos", href: "/honorarios/contratos", icone: <FileSignature size={18} /> },
          { chave: "aditivos", rotulo: "Aditivos", href: "/honorarios/aditivos", icone: <FilePlus2 size={18} /> },
          { chave: "termo", rotulo: "Termo aditivo", href: "/honorarios/termo", icone: <FileText size={18} /> },
          { chave: "pastas", rotulo: "Pastas", href: "/honorarios/pastas", icone: <FolderTree size={18} /> },
        ]}
      />
    </>
  );
}
