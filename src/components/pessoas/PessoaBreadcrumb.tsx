import { Breadcrumb } from "@/components/shared/Breadcrumb";

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
 */
export function PessoaBreadcrumb({
  isInternal,
  personId,
  personName,
  atual,
}: {
  isInternal: boolean;
  personId: string;
  personName: string;
  /** Nome da sub-página. Omitir na ficha, que é o último nível. */
  atual?: string;
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
          ? [{ label: personName, href: `/pessoas/${personId}`, truncate: true }, { label: atual }]
          : [{ label: personName, truncate: true }]),
      ]}
    />
  );
}
