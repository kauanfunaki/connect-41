import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { enderecoDe } from "@/lib/enderecoCurto";

/**
 * Trilha "Cadastros / Pessoas / Fulano" no topo da ficha e das sub-páginas.
 *
 * Existe porque a lista de origem deixou de ser sempre `/pessoas`: em
 * 2026-09-02 os colaboradores das empresas clientes foram para
 * `/colaboradores-clientes`, no módulo de Recrutamento. Sem isto, o link da
 * trilha levava metade das fichas para uma lista onde elas não aparecem — o
 * tipo de erro que só se descobre clicando.
 *
 * Monta só os itens; quem desenha é o `Breadcrumb` compartilhado (07/10/2026),
 * como nas outras 35 telas — era a trilha escrita à mão.
 *
 * Desde 08/10/2026 a trilha é o caminho de volta (o "Voltar" saiu das telas
 * com hierarquia fixa): o nome da pessoa abre a ficha na aba de onde a
 * sub-página é (`aba`), como o `router.back()` do Voltar fazia.
 *
 * Com o número da pessoa, a ficha vai pelo endereço curto, /pessoas/pessoa-12
 * (10/11/2026, pedido do Kauan).
 */
export function PessoaBreadcrumb({
  isInternal,
  personId,
  numero,
  personName,
  atual,
  aba,
}: {
  isInternal: boolean;
  personId: string;
  numero?: number;
  personName: string;
  /** Nome da sub-página. Omitir na ficha, que é o último nível. */
  atual?: string;
  /** A aba da ficha a que a sub-página pertence. */
  aba?: "vinculo" | "trabalhista";
}) {
  const origem = isInternal
    ? { href: "/pessoas", raiz: "Cadastros", label: "Pessoas" }
    : { href: "/colaboradores-clientes", raiz: "Recrutamento", label: "Colaboradores de clientes" };

  return (
    <Breadcrumb
      items={[
        { label: origem.raiz, href: origem.href },
        { label: origem.label, href: origem.href },
        ...(atual
          ? [{ label: personName, href: `${enderecoDe("pessoa", { id: personId, number: numero })}${aba ? `?tab=${aba}` : ""}`, truncate: true }, { label: atual }]
          : [{ label: personName, truncate: true }]),
      ]}
    />
  );
}
