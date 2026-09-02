import Link from "next/link";

/**
 * Trilha "Cadastros / Pessoas / Fulano" no topo da ficha e das sub-páginas.
 *
 * Existe porque a lista de origem deixou de ser sempre `/pessoas`: em
 * 2026-09-02 os colaboradores das empresas clientes foram para
 * `/colaboradores-clientes`, no módulo de Recrutamento. Sem isto, o link da
 * trilha levava metade das fichas para uma lista onde elas não aparecem — o
 * tipo de erro que só se descobre clicando.
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

  const link = "text-[13px] text-fg-muted hover:text-fg transition-colors";

  return (
    <div className="flex items-center gap-2 mb-6">
      <Link href={origem.href} className={link}>{origem.raiz}</Link>
      <span className="text-fg-muted">/</span>
      <Link href={origem.href} className={link}>{origem.label}</Link>
      <span className="text-fg-muted">/</span>
      {atual ? (
        <>
          <Link href={`/pessoas/${personId}`} className={`${link} truncate max-w-[200px]`}>
            {personName}
          </Link>
          <span className="text-fg-muted">/</span>
          <span className="text-[13px] text-fg">{atual}</span>
        </>
      ) : (
        <span className="text-[13px] text-fg truncate">{personName}</span>
      )}
    </div>
  );
}
