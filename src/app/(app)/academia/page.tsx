import { Command, Hash, Keyboard, Medal, Puzzle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { CartaoDoTeste } from "@/components/academia/CartaoDoTeste";
import { CartaoDoDesafio } from "@/components/academia/CartaoDoDesafio";
import { ConquistasDaPessoa } from "@/components/academia/ConquistasDaPessoa";
import { MetaPessoal } from "@/components/academia/MetaPessoal";
import { RankingDoInicio } from "@/components/academia/RankingDoInicio";
import { abrirAcademia, resumoDaAcademia } from "@/lib/academia/servidor";
import { conquistasDaPessoa } from "@/lib/academia/hallServidor";
import { ROTULO_CURTO_DO_TESTE, ROTULO_DO_NIVEL, TESTES, diaDoInstante, motivoSemTeste, nomeDoMes, type Teste } from "@/lib/academia/regras";
import { formatarPrecisao, numeroEmTexto } from "@/lib/academia/ranking";
import type { ResumoDoTeste } from "@/lib/academia/tipos";

export const metadata = { title: "Academia" };

const ICONE = { digitacao: <Keyboard />, numeros: <Hash />, logica: <Puzzle />, atalhos: <Command /> } as const;

function valorDoMelhor(teste: Teste, r: ResumoDoTeste): string {
  return r.melhor ? numeroEmTexto(teste, r.melhor) : "—";
}

/**
 * O Início da Academia (10/11/2026, pedido do Kauan): o painel pessoal — o
 * melhor do mês em cada teste e a posição, os cartões dos testes com a
 * tentativa de hoje e, ao lado, o ranking do mês com o prêmio. Na Fase 2
 * (11/11/2026): o desafio do dia com a sequência, a meta pessoal e as
 * conquistas.
 */
export default async function AcademiaPage() {
  const { ctx, podeAdministrar, podeFazer } = await abrirAcademia();
  const [resumo, conquistas] = await Promise.all([resumoDaAcademia(ctx, { topo: 5 }), conquistasDaPessoa(ctx)]);
  const mes = nomeDoMes(resumo.mes);
  const pos = resumo.melhorPosicao;

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="inicio" podeAdministrar={podeAdministrar} />
      {!podeFazer && <Aviso tom="info" className="mb-4">{motivoSemTeste(ctx)}</Aviso>}

      <div className="mb-4">
        <CartaoDoDesafio desafio={resumo.desafio} podeFazer={podeFazer} />
      </div>

      {/* Melhoria-823 (25/11/2026): esta grade e a de baixo têm as mesmas
          colunas e o mesmo vão — 3 no lg, 5 no xl —, e o bloco da direita
          (meta e ranking) começa na borda de um cartão de cima, em vez dos
          360 px fixos que não casavam com nada. */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {TESTES.map((t) => {
          const r = resumo.testes[t];
          return (
            <MetricCard
              key={t}
              label={`Melhor em ${ROTULO_CURTO_DO_TESTE[t]}`}
              value={valorDoMelhor(t, r)}
              icon={ICONE[t]}
              detalhe={r.melhor ? `${formatarPrecisao(r.melhor.precisao)}% de precisão · ${ROTULO_DO_NIVEL[r.melhor.nivel]}` : `Sem resultado valendo em ${mes}`}
            />
          );
        })}
        <MetricCard
          label={`Posição em ${mes}`}
          value={pos ? `${pos.posicao}º` : "—"}
          icon={<Medal />}
          detalhe={
            !resumo.aparece
              ? "Você está fora do ranking"
              : pos
                ? `Em ${ROTULO_CURTO_DO_TESTE[pos.teste]}, entre ${pos.participantes}`
                : "Faça um teste valendo para entrar"
          }
        />
      </div>

      {/* As duas colunas terminam na mesma linha: os cartões dos testes
          dividem a altura por igual, e o ranking estica até o fim da coluna. */}
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <section aria-labelledby="testes-titulo" className="flex min-w-0 flex-col lg:col-span-2 xl:col-span-3">
          {/* Altura fixa (24 px + 12 px de margem): a coluna da direita desce
              os mesmos 36 px (`lg:pt-9`), e a meta começa na linha dos cartões. */}
          <h2 id="testes-titulo" className="mb-3 h-6 text-body leading-6 font-semibold text-fg">
            Testes
          </h2>
          <div className="grid flex-1 gap-4 md:grid-cols-2 md:auto-rows-fr">
            {TESTES.map((t) => (
              <CartaoDoTeste key={t} resumo={resumo.testes[t]} podeFazer={podeFazer} />
            ))}
          </div>
        </section>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-1 xl:col-span-2 lg:pt-9">
          <MetaPessoal
            key={resumo.meta ? `${resumo.meta.teste}-${resumo.meta.nivel}-${resumo.meta.alvo}-${resumo.meta.prazo}` : "sem-meta"}
            meta={resumo.meta}
            hoje={diaDoInstante()}
            podeGravar={!ctx.subscriptionReadOnly}
          />
          <RankingDoInicio resumo={resumo} />
        </div>
      </div>

      {/* As conquistas num bloco recolhível, com "4 de 12" na linha (melhoria-823). */}
      <ConquistasDaPessoa conquistas={conquistas.conquistas} parabensNoMes={conquistas.parabensNoMes} mes={resumo.mes} className="mt-4" />
    </PageContainer>
  );
}
