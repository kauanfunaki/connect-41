import { Hash, Keyboard, Medal, Puzzle } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
import { Aviso } from "@/components/ui/Aviso";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { CartaoDoTeste } from "@/components/academia/CartaoDoTeste";
import { RankingDoInicio } from "@/components/academia/RankingDoInicio";
import { abrirAcademia, resumoDaAcademia } from "@/lib/academia/servidor";
import { ROTULO_CURTO_DO_TESTE, ROTULO_DO_NIVEL, TESTES, motivoSemTeste, nomeDoMes, type Teste } from "@/lib/academia/regras";
import { formatarPrecisao } from "@/lib/academia/ranking";
import type { ResumoDoTeste } from "@/lib/academia/tipos";

export const metadata = { title: "Academia" };

const ICONE = { digitacao: <Keyboard />, numeros: <Hash />, logica: <Puzzle /> } as const;

function valorDoMelhor(teste: Teste, r: ResumoDoTeste): string {
  if (!r.melhor) return "—";
  return teste === "logica" ? `${r.melhor.acertos ?? 0} de ${r.melhor.total ?? 0}` : `${r.melhor.ppm ?? 0} PPM`;
}

/**
 * O Início da Academia (10/11/2026, pedido do Kauan): o painel pessoal — o
 * melhor do mês em cada teste e a posição, os cartões dos testes com a
 * tentativa de hoje e, ao lado, o ranking do mês com o prêmio.
 */
export default async function AcademiaPage() {
  const { ctx, podeAdministrar, podeFazer } = await abrirAcademia();
  const resumo = await resumoDaAcademia(ctx, { topo: 5 });
  const mes = nomeDoMes(resumo.mes);
  const pos = resumo.melhorPosicao;

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="inicio" podeAdministrar={podeAdministrar} />
      {!podeFazer && <Aviso tom="info" className="mb-4">{motivoSemTeste(ctx)}</Aviso>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <section aria-labelledby="testes-titulo">
          <h2 id="testes-titulo" className="mb-3 text-body font-semibold text-fg">
            Testes
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TESTES.map((t) => (
              <CartaoDoTeste key={t} resumo={resumo.testes[t]} podeFazer={podeFazer} />
            ))}
          </div>
          <p className="mt-3 text-helper text-fg-muted">
            Valendo: uma tentativa por dia em cada nível de cada teste, e ela conta assim que o texto ou as questões aparecem. No treino livre não há limite, e nada vai para o ranking.
          </p>
        </section>
        <RankingDoInicio resumo={resumo} />
      </div>
    </PageContainer>
  );
}
