import { Banknote, FileSignature, FilePlus2, FileText, FolderTree } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";

export type AbaDosHonorarios = "honorarios" | "contratos" | "aditivos" | "termo" | "pastas";

// A frase de cada aba, que explicava a regra embaixo do título, foi para o
// artigo de ajuda da tela, no "?" do topo (17/11/2026, melhoria-707).
//
// Desde 26/11/2026 (melhoria-813) a ordem é título, abas e a faixa de uma
// linha (`FaixaDaVarredura`, ou `FaixaDoModelo` no Termo aditivo), que chega
// como `children`. A faixa ficava acima das abas, em duas ou três linhas, e a
// ação de cada aba (planilha, modelo do termo) no topo: a planilha foi para a
// barra da lista, e o modelo do termo para a faixa da sua aba.

/** Título, abas e a faixa — o mesmo topo nas cinco telas. */
export function CabecalhoDosHonorarios({ ativa, children }: { ativa: AbaDosHonorarios; children?: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Contratos e honorários" />
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
      {children}
    </>
  );
}
