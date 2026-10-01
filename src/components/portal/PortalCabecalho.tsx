import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Título e descrição — o topo de toda tela do portal.
 *
 * A navegação, o nome do grupo e o sair moravam aqui, repetidos em cada tela, e
 * foram para a sidebar (`PortalShell`) em 18/09.
 *
 * A descrição vai no `subtitle` do PageHeader, como nas telas internas e no
 * detalhe da pendência e do processo. Era um parágrafo solto depois dele: caía
 * 28px abaixo do título (o `mb-7` do PageHeader) e só 16px acima do conteúdo —
 * mais perto do que descrevia de baixo do que do próprio título.
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
    <PageHeader
      title={titulo}
      subtitle={
        <>
          {descricao}
          {somenteLeitura && " Só leitura."}
        </>
      }
    />
  );
}
