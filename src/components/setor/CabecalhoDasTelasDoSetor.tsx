import { PageHeader } from "@/components/ui/PageHeader";

/**
 * O cabeçalho das telas do setor: o mesmo na aba "Tudo" (`/setor/bpo/telas`) e
 * nas abas de grupo (`/setor/bpo/grupo/contas`).
 *
 * Um componente só para as duas rotas (16/11/2026, melhoria-712): eram dois
 * cabeçalhos escritos à mão, e ao trocar de aba o título virava só o nome do
 * setor, mudava de cor e ganhava outro subtítulo e uma trilha — parecia outra
 * tela. Agora só a aba marcada muda. Sem subtítulo: o grupo aberto quem diz é a
 * aba, e o que o alfinete faz está na dica dele (`BotaoFixarTela`).
 */
export function CabecalhoDasTelasDoSetor({ setor }: { setor: string }) {
  return <PageHeader title={`Telas · ${setor}`} />;
}
