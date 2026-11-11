import { Award, Download, Gift, Trophy } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { FiltrosDoRanking } from "@/components/academia/FiltrosDoRanking";
import { PreferenciaDoRanking } from "@/components/academia/PreferenciaDoRanking";
import { TabelaDoRanking } from "@/components/academia/TabelaDoRanking";
import { TabelaDaEvolucao } from "@/components/academia/TabelaDaEvolucao";
import { PlacarPorSetor } from "@/components/academia/PlacarPorSetor";
import { abrirAcademia, premiosDoMes, rankingDoMes, rankingParaTela } from "@/lib/academia/servidor";
import { evolucaoParaTela, parabensDeQuemOlha, placarParaTela } from "@/lib/academia/hallServidor";
import { CATEGORIA_DA_EVOLUCAO } from "@/lib/academia/hall";
import {
  ROTULO_CURTO_DO_TESTE, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, ehMes, ehNivel, ehTeste, mesDoInstante, mesFechado, mesPorExtensoLongo,
  mesesParaEscolher,
} from "@/lib/academia/regras";
import { resultadoEmTexto, temCertificado } from "@/lib/academia/ranking";
import { getSectorMaps } from "@/lib/sectors";

/**
 * O ranking do mês (10/11/2026, pedido do Kauan): um teste por aba, com mês,
 * nível e setor; o top 10 e a linha de quem olha — nunca o fim da lista. O
 * pódio de um mês encerrado baixa o certificado de destaque.
 */
type Visao = "mes" | "evolucao" | "setores";
const VISOES: { key: Visao; label: string }[] = [
  { key: "mes", label: "Ranking do mês" },
  { key: "evolucao", label: "Evolução" },
  { key: "setores", label: "Por setor" },
];

export default async function RankingDaAcademiaPage({
  searchParams,
}: {
  searchParams: Promise<{ teste?: string; mes?: string; nivel?: string; setor?: string; visao?: string }>;
}) {
  const sp = await searchParams;
  const { ctx, podeAdministrar } = await abrirAcademia();
  const atual = mesDoInstante();
  const teste = ehTeste(sp.teste) ? sp.teste : "digitacao";
  const mes = ehMes(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  // Fase 2 (11/11/2026): a evolução e o placar por setor são outras visões do mesmo mês.
  const visao: Visao = sp.visao === "evolucao" || sp.visao === "setores" ? sp.visao : "mes";
  const nivel = visao === "mes" && ehNivel(sp.nivel) ? sp.nivel : null;
  const { options: setores } = await getSectorMaps(ctx.tenantId);
  const setor = visao === "mes" && sp.setor && setores.some((s) => s.value === sp.setor) ? sp.setor : null;
  const encerrado = mesFechado(mes);

  const [ranking, premios, geral, evolucao, placar, parabens] = await Promise.all([
    rankingParaTela(ctx, { teste, mes, nivel, setor }),
    premiosDoMes(ctx.tenantId, mes),
    // O certificado é do pódio do ranking geral do mês (todos os níveis, todos os setores).
    encerrado && visao === "mes" ? rankingDoMes(ctx.tenantId, { teste, mes, nivel: null, setor: null }) : Promise.resolve(null),
    visao === "evolucao" ? evolucaoParaTela(ctx, teste, mes) : Promise.resolve(null),
    visao === "setores" ? placarParaTela(ctx, teste, mes) : Promise.resolve(null),
    parabensDeQuemOlha(ctx, [mes]),
  ]);
  const premio = premios.podio;
  const meuPodio = geral && !ranking.foraDoRanking ? temCertificado(geral.ranking, ctx.userId, encerrado) : null;
  const meses = mesesParaEscolher(atual, 12);
  if (!meses.includes(mes)) meses.push(mes);
  const busca = (t: string, v: Visao = visao) => {
    const p = new URLSearchParams({ teste: t, mes });
    if (v !== "mes") p.set("visao", v);
    if (nivel && v === "mes") p.set("nivel", nivel);
    if (setor && v === "mes") p.set("setor", setor);
    return `/academia/ranking?${p.toString()}`;
  };
  const rotuloDoRecorte = `Ranking de ${ROTULO_DO_TESTE[teste]} em ${mesPorExtensoLongo(mes)}${nivel ? `, nível ${ROTULO_DO_NIVEL[nivel]}` : ""}`;
  // O "Parabéns" vale no ranking geral do mês (sem nível nem setor) e na evolução.
  const parabensDo = (tipo: string) => ({ mes, tipo, podeMandar: parabens.podeMandar, enviados: parabens.enviados[`${mes}:${tipo}`] ?? [] });

  const vistaDoMes = (
    <>
      {meuPodio && (
        <Aviso tom="sucesso" icone={<Award size={16} />} className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>
            Você ficou em {meuPodio.posicao}º lugar em {ROTULO_DO_TESTE[teste]} em {mesPorExtensoLongo(mes)}. Parabéns!
          </span>
          <Button href={`/api/academia/certificado?${new URLSearchParams({ teste, mes }).toString()}`} nativo download size="sm" variant="secondary" className="min-h-11 sm:min-h-0">
            <Download size={14} aria-hidden /> Baixar o certificado
          </Button>
        </Aviso>
      )}

      {ranking.foraDoRanking ? (
        <section aria-labelledby="meus-numeros-titulo" className="rounded-lg border border-border bg-surface p-4 shadow-xs">
          <h2 id="meus-numeros-titulo" className="text-body font-semibold text-fg">Seus números</h2>
          <p className="mt-1 text-ui text-fg-secondary">
            {ranking.meusNumeros
              ? `Seu melhor neste recorte: ${resultadoEmTexto(teste, ranking.meusNumeros)}.`
              : "Você ainda não tem resultado valendo neste recorte."}
          </p>
          <p className="mt-2 text-helper text-fg-muted">
            Você escolheu não aparecer no ranking, e por isso também não vê o dos colegas. Ligue “Aparecer no ranking” para participar.
          </p>
        </section>
      ) : ranking.topo.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="Ninguém no ranking ainda"
          description={`Ninguém fez ${ROTULO_DO_TESTE[teste].toLowerCase()} valendo neste recorte. Os resultados de treino livre não entram.`}
          action={
            mes === atual ? (
              <Button href={`/academia/testes/${teste}?modo=valendo`} className="min-h-11 sm:min-h-0">
                Fazer valendo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-2 text-ui text-fg-secondary">
            <span className="font-semibold text-fg">{ranking.participantes}</span> {ranking.participantes === 1 ? "pessoa" : "pessoas"} no ranking ·{" "}
            {teste === "logica"
              ? nivel ? "ordem pela precisão, depois menos tentativas e menor tempo" : "ordem pela soma ponderada dos níveis (fácil 1, médio 2, difícil 3)"
              : teste === "atalhos"
                ? nivel ? "ordem pelos acertos em 60 segundos, depois a precisão" : "ordem pela média dos acertos ponderada pelo nível"
                : nivel ? "ordem pelo PPM líquido (PPM × precisão)" : "ordem pela média do PPM ponderada pelo nível"}
          </p>
          <TabelaDoRanking
            teste={teste}
            topo={ranking.topo}
            eu={ranking.eu}
            rotulo={rotuloDoRecorte}
            parabens={!nivel && !setor ? parabensDo(teste) : undefined}
          />
        </>
      )}
    </>
  );

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="ranking" podeAdministrar={podeAdministrar} />

      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Teste do ranking"
            active={teste}
            tocavel
            items={TESTES.map((t) => ({ key: t, label: ROTULO_CURTO_DO_TESTE[t], href: busca(t) }))}
          />
          <SegmentedControl
            label="O que ver"
            active={visao}
            tocavel
            tone="brand"
            items={VISOES.map((v) => ({ key: v.key, label: v.label, href: busca(teste, v.key) }))}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <FiltrosDoRanking teste={teste} mes={mes} nivel={nivel} setor={setor} meses={meses} setores={setores} visao={visao} />
          <div className="flex flex-col gap-1">
            <PreferenciaDoRanking aparece={!ranking.foraDoRanking} />
            <p id="preferencia-do-ranking-ajuda" className="max-w-xs text-helper text-fg-muted">
              Desligado, você some da lista dos colegas e do post do ranking, e vê só os seus números.
            </p>
          </div>
        </div>
      </div>

      {(premio || premios.evolucao) && (
        <Aviso tom="marca" icone={<Gift size={16} />} className="mb-4">
          {premio && (
            <span className="block">
              <span className="font-medium">Prêmio de {mesPorExtensoLongo(mes)}:</span> {premio}
            </span>
          )}
          {premios.evolucao && (
            <span className="block">
              <span className="font-medium">Maior evolução:</span> {premios.evolucao}
            </span>
          )}
        </Aviso>
      )}

      {evolucao ? (
        <TabelaDaEvolucao evolucao={evolucao} parabens={parabensDo(CATEGORIA_DA_EVOLUCAO)} />
      ) : placar ? (
        <PlacarPorSetor placar={placar} />
      ) : (
        vistaDoMes
      )}
    </PageContainer>
  );
}
