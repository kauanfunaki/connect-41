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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="testes-titulo">
            <h2 id="testes-titulo" className="mb-3 text-body font-semibold text-fg">
              Testes
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {TESTES.map((t) => (
                <CartaoDoTeste key={t} resumo={resumo.testes[t]} podeFazer={podeFazer} />
              ))}
            </div>
            <p className="mt-3 text-helper text-fg-muted">
              Valendo: uma tentativa por dia em cada nível de cada teste, e ela conta assim que o texto ou as questões aparecem. No treino livre não há limite, e nada vai para o ranking.
            </p>
          </section>
          <ConquistasDaPessoa conquistas={conquistas.conquistas} parabensNoMes={conquistas.parabensNoMes} mes={resumo.mes} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <MetaPessoal
            key={resumo.meta ? `${resumo.meta.teste}-${resumo.meta.nivel}-${resumo.meta.alvo}-${resumo.meta.prazo}` : "sem-meta"}
            meta={resumo.meta}
            hoje={diaDoInstante()}
            podeGravar={!ctx.subscriptionReadOnly}
          />
          <RankingDoInicio resumo={resumo} />
        </div>
      </div>
    </PageContainer>
  );
}
