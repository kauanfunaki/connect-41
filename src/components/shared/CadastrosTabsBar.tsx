import { Building2, Handshake, Users } from "lucide-react";
import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMINHO_DOS_FORNECEDORES, type CadastrosTab } from "@/lib/cadastrosNav";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";

const ABAS: AbaDeLink[] = [
  { chave: "empresas", rotulo: "Empresas", href: "/empresas", icone: <Building2 /> },
  { chave: "pessoas", rotulo: "Pessoas", href: "/pessoas", icone: <Users /> },
];

// O cabeçalho de Cadastros: o título "Cadastros", o subtítulo e a ação da aba
// aberta, e as abas embaixo (05/11/2026, pedido do Kauan) — o padrão das outras
// telas com abas (Produtividade, Gestão). Eram as abas em cima, com "Cadastros"
// em versalete, e o título de cada aba ("Empresas") embaixo delas. A troca de
// aba navega para a listagem correspondente (rotas continuam as mesmas).
//
// A aba Clientes saiu em 15/10/2026 (etapa 3 da saída do Cliente): o cadastro
// é por empresa, e /clientes leva para cá.
//
// Abas por link (`AbasDeLink`) desde 07/10/2026: era o `Tabs` com
// `role="tab"` e `router.push`, o erro que o `SegmentedControl` descreve —
// aba que navega é link com `aria-current`, e abre em nova guia com o meio do
// mouse.
export async function CadastrosTabsBar({ active, subtitulo, acao }: { active: CadastrosTab | "fornecedores"; subtitulo: string; acao?: React.ReactNode }) {
  const abas = (await podeNoModulo(await getAuthContext(), "bpo_cadastros", "ver")) ? [...ABAS, ABA_DOS_FORNECEDORES] : ABAS;
  return (
    <>
      <PageHeader title="Cadastros" subtitle={subtitulo} action={acao} />
      <AbasDeLink className="mb-6" aria-label="Cadastros" abas={abas} ativa={active} />
    </>
  );
}

// Fornecedores e sacados (21/10/2026): saiu do menu do BPO e virou aba daqui,
// só para quem vê o BPO (e o administrador). A mesma porta da tela
// (`podeNoModulo`): setor que opera o módulo neste escritório e módulo ligado.
// Para os outros a aba nem aparece, e o endereço dá 404.
const ABA_DOS_FORNECEDORES: AbaDeLink = { chave: "fornecedores", rotulo: "Fornecedores e sacados", href: CAMINHO_DOS_FORNECEDORES, icone: <Handshake /> };
