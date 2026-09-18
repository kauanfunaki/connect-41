import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Título e descrição — o topo de toda tela do portal.
 *
 * A navegação, o nome do grupo e o sair moravam aqui, repetidos em cada tela, e
 * foram para a sidebar (`PortalShell`) em 18/09.
 */
export function PortalCabecalho({
  titulo,
  descricao,
  somenteLeitura = true,
}: {
  titulo: string;
  descricao: string;
  /** Pendências e aprovações são as telas em que o cliente escreve — lá o "Só leitura" mentiria. */
  somenteLeitura?: boolean;
}) {
  return (
    <div className="mb-4">
      <PageHeader title={titulo} />
      <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
        {descricao}
        {somenteLeitura && " Só leitura."}
      </p>
    </div>
  );
}
