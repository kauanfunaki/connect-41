import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";
import type { CadastrosTab } from "@/lib/cadastrosNav";

const ABAS: AbaDeLink[] = [
  { chave: "empresas", rotulo: "Empresas", href: "/empresas" },
  { chave: "pessoas", rotulo: "Pessoas", href: "/pessoas" },
];

// Barra de abas do topo de /empresas e /pessoas — troca de aba navega para a
// listagem correspondente (rotas continuam as mesmas de sempre).
//
// A aba Clientes saiu em 15/10/2026 (etapa 3 da saída do Cliente): o cadastro
// é por empresa, e /clientes leva para cá.
//
// Abas por link (`AbasDeLink`) desde 07/10/2026: era o `Tabs` com
// `role="tab"` e `router.push`, o erro que o `SegmentedControl` descreve —
// aba que navega é link com `aria-current`, e abre em nova guia com o meio do
// mouse.
export function CadastrosTabsBar({ active }: { active: CadastrosTab }) {
  return (
    <div className="mb-5">
      <p className="c41-rotulo mb-2">Cadastros</p>
      <AbasDeLink abas={ABAS} ativa={active} className="" />
    </div>
  );
}
