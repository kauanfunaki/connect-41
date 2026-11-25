import { Award, Download, Gift, Trophy } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { FiltrosDoRanking } from "@/components/academia/FiltrosDoRanking";
import { PodioDoRanking } from "@/components/academia/PodioDoRanking";
import { PreferenciaDoRanking } from "@/components/academia/PreferenciaDoRanking";
import { TabelaDoRanking } from "@/components/academia/TabelaDoRanking";
import { TabelaDaMedia, testesEmTexto } from "@/components/academia/TabelaDaMedia";
import { TabelaDaEvolucao } from "@/components/academia/TabelaDaEvolucao";
import { PlacarPorSetor } from "@/components/academia/PlacarPorSetor";
import { abrirAcademia, mediaParaTela, premiosDoMes, rankingDoMes, rankingParaTela } from "@/lib/academia/servidor";
import { evolucaoParaTela, parabensDeQuemOlha, placarParaTela } from "@/lib/academia/hallServidor";
import { CATEGORIA_DA_EVOLUCAO } from "@/lib/academia/hall";
import {
  RANKING_DA_MEDIA, ROTULO_CURTO_DO_TESTE, ROTULO_DA_MEDIA, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, ehMes, ehNivel, ehTeste, mesDoInstante,
  mesFechado, mesPorExtensoLongo, mesesParaEscolher,
} from "@/lib/academia/regras";
import { formatarPrecisao, mediaEmTexto, numeroEmTexto, resultadoEmTexto, temCertificado } from "@/lib/academia/ranking";
import { getSectorMaps } from "@/lib/sectors";

/**
 * O ranking do mês (10/11/2026, pedido do Kauan): um teste por aba, com mês,
 * nível e setor; o top 10 e a linha de quem olha — nunca o fim da lista. O
 * pódio de um mês encerrado baixa o certificado de destaque.
 *
 * Melhoria-823 (25/11/2026): a aba "Média geral" (a média de todos os testes,
 * um pódio só no mês), o top 3 num pódio acima da tabela e os filtros no
 * painel do botão Filtros.
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
  // A média não é um teste: `teste` segue valendo (para as abas e o certificado), e `media` liga a outra vista.
  const media = sp.teste === RANKING_DA_MEDIA;
  const teste = ehTeste(sp.teste) ? sp.teste : "digitacao";
  const mes = ehMes(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  // Fase 2 (11/11/2026): a evolução e o placar por setor são outras visões do mesmo mês. A média só tem a do mês.
  const visao: Visao = !media && (sp.visao === "evolucao" || sp.visao === "setores") ? sp.visao : "mes";
  const nivel = visao === "mes" && !media && ehNivel(sp.nivel) ? sp.nivel : null;
  const { options: setores } = await getSectorMaps(ctx.tenantId);
  const setor = visao === "mes" && !media && sp.setor && setores.some((s) => s.value === sp.setor) ? sp.setor : null;
  const encerrado = mesFechado(mes);

  const [ranking, daMedia, premios, geral, evolucao, placar, parabens] = await Promise.all([
    media ? Promise.resolve(null) : rankingParaTela(ctx, { teste, mes, nivel, setor }),
    media ? mediaParaTela(ctx, mes) : Promise.resolve(null),
    premiosDoMes(ctx.tenantId, mes),
    // O certificado é do pódio do ranking geral do mês (todos os níveis, todos os setores).
    encerrado && visao === "mes" && !media ? rankingDoMes(ctx.tenantId, { teste, mes, nivel: null, setor: null }) : Promise.resolve(null),
    visao === "evolucao" ? evolucaoParaTela(ctx, teste, mes) : Promise.resolve(null),
    visao === "setores" ? placarParaTela(ctx, teste, mes) : Promise.resolve(null),
    parabensDeQuemOlha(ctx, [mes]),
  ]);
  const foraDoRanking = (daMedia ?? ranking)?.foraDoRanking ?? false;
  const premio = premios.podio;
  const meuPodio = geral && !foraDoRanking ? temCertificado(geral.ranking, ctx.userId, encerrado) : null;
  const meses = mesesParaEscolher(atual, 12);
  if (!meses.includes(mes)) meses.push(mes);
  const busca = (t: string, v: Visao = visao) => {
    const p = new URLSearchParams({ teste: t, mes });
    const daMediaAgora = t === RANKING_DA_MEDIA;
    if (v !== "mes" && !daMediaAgora) p.set("visao", v);
    if (nivel && v === "mes" && !daMediaAgora) p.set("nivel", nivel);
    if (setor && v === "mes" && !daMediaAgora) p.set("setor", setor);
    return `/academia/ranking?${p.toString()}`;
  };
  const rotuloDoRecorte = `Ranking de ${ROTULO_DO_TESTE[teste]} em ${mesPorExtensoLongo(mes)}${nivel ? `, nível ${ROTULO_DO_NIVEL[nivel]}` : ""}`;
  const tituloDoPodio = (de: string) => `${encerrado ? "Pódio" : "Pódio até agora"} · ${de} · ${mesPorExtensoLongo(mes)}`;
  // O "Parabéns" vale no ranking geral do mês (sem nível nem setor) e na evolução.
  const parabensDo = (tipo: string) => ({ mes, tipo, podeMandar: parabens.podeMandar, enviados: parabens.enviados[`${mes}:${tipo}`] ?? [] });

  const foraDoRankingAviso = (numeros: string | null) => (
    <section aria-labelledby="meus-numeros-titulo" className="rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h2 id="meus-numeros-titulo" className="text-body font-semibold text-fg">Seus números</h2>
      <p className="mt-1 text-ui text-fg-secondary">{numeros ?? "Você ainda não tem resultado valendo neste recorte."}</p>
      <p className="mt-2 text-helper text-fg-muted">
        Você escolheu não aparecer no ranking, e por isso também não vê o dos colegas. Ligue “Aparecer no ranking” para participar.
      </p>
    </section>
  );
  const fazerValendo = (href: string) =>
    mes === atual ? (
      <Button href={href} className="min-h-11 sm:min-h-0">
        Fazer valendo
      </Button>
    ) : undefined;

  const vistaDoMes = ranking && (
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
        foraDoRankingAviso(ranking.meusNumeros ? `Seu melhor neste recorte: ${resultadoEmTexto(teste, ranking.meusNumeros)}.` : null)
      ) : ranking.topo.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="Ninguém no ranking ainda"
          description={`Ninguém fez ${ROTULO_DO_TESTE[teste].toLowerCase()} valendo neste recorte. Os resultados de treino livre não entram.`}
          action={fazerValendo(`/academia/testes/${teste}?modo=valendo`)}
        />
      ) : (
        <>
          <PodioDoRanking
            titulo={tituloDoPodio(`${ROTULO_DO_TESTE[teste]}${nivel ? `, ${ROTULO_DO_NIVEL[nivel]}` : ""}`)}
            lugares={ranking.topo.slice(0, 3).map((l) => ({ ...l, valor: numeroEmTexto(teste, l), detalhe: `${formatarPrecisao(l.precisao)}% de precisão` }))}
          />
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

  // A média de todos os testes (melhoria-823): sem nível, setor nem certificado próprio.
  const vistaDaMedia = daMedia && (
    daMedia.foraDoRanking ? (
      foraDoRankingAviso(daMedia.meusNumeros ? `Sua média em ${mesPorExtensoLongo(mes)}: ${mediaEmTexto(daMedia.meusNumeros.media)} (${testesEmTexto(daMedia.meusNumeros)}).` : null)
    ) : daMedia.topo.length === 0 ? (
      <EmptyState
        icon={<Trophy />}
        title="Ninguém no ranking ainda"
        description={`Ninguém fez teste valendo em ${mesPorExtensoLongo(mes)}. Os resultados de treino livre não entram.`}
        action={fazerValendo("/academia/testes")}
      />
    ) : (
      <>
        <PodioDoRanking
          titulo={tituloDoPodio(ROTULO_DA_MEDIA)}
          lugares={daMedia.topo.slice(0, 3).map((l) => ({ ...l, valor: mediaEmTexto(l.media), detalhe: testesEmTexto(l) }))}
        />
        <p className="mb-2 text-ui text-fg-secondary">
          <span className="font-semibold text-fg">{daMedia.participantes}</span> {daMedia.participantes === 1 ? "pessoa" : "pessoas"} no ranking ·
          em cada teste, o quanto a pessoa chegou do 1º lugar do mês (100% é empatar com ele); o teste que ela não fez vale 0
        </p>
        <TabelaDaMedia topo={daMedia.topo} eu={daMedia.eu} rotulo={`${ROTULO_DA_MEDIA} em ${mesPorExtensoLongo(mes)}`} />
      </>
    )
  );

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="ranking" podeAdministrar={podeAdministrar} />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="scroll-x max-w-full overflow-x-auto">
            <SegmentedControl
              label="Teste do ranking"
              active={media ? RANKING_DA_MEDIA : teste}
              tocavel
              items={[
                ...TESTES.map((t) => ({ key: t as string, label: ROTULO_CURTO_DO_TESTE[t], href: busca(t) })),
                { key: RANKING_DA_MEDIA, label: "Média geral", title: ROTULO_DA_MEDIA, href: busca(RANKING_DA_MEDIA, "mes") },
              ]}
            />
          </div>
          {!media && (
            <SegmentedControl
              label="O que ver"
              active={visao}
              tocavel
              items={VISOES.map((v) => ({ key: v.key, label: v.label, href: busca(teste, v.key) }))}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FiltrosDoRanking
            teste={media ? RANKING_DA_MEDIA : teste}
            mes={mes}
            mesAtual={atual}
            nivel={nivel}
            setor={setor}
            meses={meses}
            setores={setores}
            visao={visao}
          />
          <PreferenciaDoRanking aparece={!foraDoRanking} />
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

      {/* A chave é o recorte: o filtro troca a página sem remontar, e o
          "Parabéns enviado" de uma linha não pode passar para o mês seguinte. */}
      <div key={`${media ? RANKING_DA_MEDIA : teste}-${mes}-${visao}-${nivel ?? ""}-${setor ?? ""}`}>
        {evolucao ? (
          <TabelaDaEvolucao evolucao={evolucao} parabens={parabensDo(CATEGORIA_DA_EVOLUCAO)} />
        ) : placar ? (
          <PlacarPorSetor placar={placar} />
        ) : media ? (
          vistaDaMedia
        ) : (
          vistaDoMes
        )}
      </div>
    </PageContainer>
  );
}
