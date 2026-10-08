import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";
import type { CadastrosTab } from "@/lib/cadastrosNav";

const ABAS: AbaDeLink[] = [
  { chave: "empresas", rotulo: "Empresas", href: "/empresas" },
  // Clientes fica entre Empresas e Pessoas de propósito: é o nível ACIMA da
  // empresa, e a ordem da barra desenha essa hierarquia.
  { chave: "clientes", rotulo: "Clientes", href: "/clientes" },
  { chave: "pessoas", rotulo: "Pessoas", href: "/pessoas" },
];

// Barra de abas do topo de /empresas, /clientes e /pessoas — troca de aba navega para a
// listagem correspondente (rotas continuam as mesmas de sempre).
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
