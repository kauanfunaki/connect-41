import type { AuthContext } from "@/lib/auth/context";
import { cartoesDisponiveis, opcoesDosCartoes, podeDefinirPadraoDoSetor, resolverCartoes } from "@/lib/home/cartoes";
import { ambienteDosCartoes, cartoesProntos, escolhasDosCartoes, type NumerosJaCalculados } from "@/lib/home/cartoesServidor";
import { carregarCartoes, trocarCartaoDoInicio, voltarCartaoAoDoSetor } from "@/app/(app)/home/cartoes-actions";
import { FaixaDeCartoes, type PosicaoDoCartao } from "./FaixaDeCartoes";

/**
 * Os quatro cartões coringa do topo do Início (10/11/2026, pedido do Kauan),
 * dentro de um <Suspense> na Home: resolve quais são os quatro desta pessoa
 * (a escolha dela > o padrão do setor ativo > o padrão do código, só entre os
 * que ela vê), conta só esses quatro e entrega ao componente do lápis. A lista
 * inteira do lápis é contada depois, quando ela abrir.
 */
export async function CartoesDoTopo({
  ctx,
  previos,
  setores,
  setorAtivoRotulo,
}: {
  ctx: AuthContext;
  /** Os números que a Home já calculou (as tarefas), para não contar de novo. */
  previos: NumerosJaCalculados;
  /** Os setores ativos do escritório, na ordem do cadastro — os grupos da lista. */
  setores: readonly { code: string; label: string }[];
  setorAtivoRotulo: string | null;
}) {
  if (!ctx.tenantId) return null;
  const amb = await ambienteDosCartoes(ctx.tenantId);
  const disponiveis = cartoesDisponiveis(ctx, amb);
  const escolhas = await escolhasDosCartoes(ctx.tenantId, ctx.userId, ctx.activeSector);
  const resolvidos = resolverCartoes({
    pessoa: escolhas.pessoa,
    setor: escolhas.setor,
    setorAtivo: ctx.activeSector,
    disponiveis: disponiveis.map((d) => d.chave),
  });
  const prontos = await cartoesProntos(
    ctx,
    resolvidos.flatMap((r) => (r ? [r.chave] : [])),
    { previos }
  );
  const porChave = new Map(prontos.map((c) => [c.chave, c]));
  const posicoes: PosicaoDoCartao[] = resolvidos.map((r) => ({
    cartao: r ? (porChave.get(r.chave) ?? null) : null,
    daPessoa: r?.daPessoa ?? false,
  }));

  return (
    <FaixaDeCartoes
      // Remonta quando o servidor devolve outro arranjo (depois de trocar um
      // cartão, o Início recarrega): o estado otimista dá lugar ao gravado.
      key={JSON.stringify(posicoes.map((p) => [p.cartao?.chave ?? null, p.daPessoa, p.cartao?.numero?.texto ?? null]))}
      posicoes={posicoes}
      opcoes={opcoesDosCartoes(disponiveis, ctx, amb, setores)}
      setorAtivoRotulo={setorAtivoRotulo}
      podeDefinirDoSetor={podeDefinirPadraoDoSetor(ctx)}
      carregar={carregarCartoes}
      trocar={trocarCartaoDoInicio}
      voltar={voltarCartaoAoDoSetor}
    />
  );
}
