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
import { abrirAcademia, premioDoMes, rankingDoMes, rankingParaTela } from "@/lib/academia/servidor";
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
export default async function RankingDaAcademiaPage({ searchParams }: { searchParams: Promise<{ teste?: string; mes?: string; nivel?: string; setor?: string }> }) {
  const sp = await searchParams;
  const { ctx, podeAdministrar } = await abrirAcademia();
  const atual = mesDoInstante();
  const teste = ehTeste(sp.teste) ? sp.teste : "digitacao";
  const mes = ehMes(sp.mes) && sp.mes <= atual ? sp.mes : atual;
  const nivel = ehNivel(sp.nivel) ? sp.nivel : null;
  const { options: setores } = await getSectorMaps(ctx.tenantId);
  const setor = sp.setor && setores.some((s) => s.value === sp.setor) ? sp.setor : null;
  const encerrado = mesFechado(mes);

  const [ranking, premio, geral] = await Promise.all([
    rankingParaTela(ctx, { teste, mes, nivel, setor }),
    premioDoMes(ctx.tenantId, mes),
    // O certificado é do pódio do ranking geral do mês (todos os níveis, todos os setores).
    encerrado ? rankingDoMes(ctx.tenantId, { teste, mes, nivel: null, setor: null }) : Promise.resolve(null),
  ]);
  const meuPodio = geral && !ranking.foraDoRanking ? temCertificado(geral.ranking, ctx.userId, encerrado) : null;
  const meses = mesesParaEscolher(atual, 12);
  if (!meses.includes(mes)) meses.push(mes);
  const busca = (t: string) => {
    const p = new URLSearchParams({ teste: t, mes });
    if (nivel) p.set("nivel", nivel);
    if (setor) p.set("setor", setor);
    return `/academia/ranking?${p.toString()}`;
  };
  const rotuloDoRecorte = `Ranking de ${ROTULO_DO_TESTE[teste]} em ${mesPorExtensoLongo(mes)}${nivel ? `, nível ${ROTULO_DO_NIVEL[nivel]}` : ""}`;

  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="ranking" podeAdministrar={podeAdministrar} />

      <div className="mb-4 flex flex-col gap-4">
        <SegmentedControl
          label="Teste do ranking"
          active={teste}
          tocavel
          items={TESTES.map((t) => ({ key: t, label: ROTULO_CURTO_DO_TESTE[t], href: busca(t) }))}
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <FiltrosDoRanking teste={teste} mes={mes} nivel={nivel} setor={setor} meses={meses} setores={setores} />
          <div className="flex flex-col gap-1">
            <PreferenciaDoRanking aparece={!ranking.foraDoRanking} />
            <p id="preferencia-do-ranking-ajuda" className="max-w-xs text-helper text-fg-muted">
              Desligado, você some da lista dos colegas e do post do ranking, e vê só os seus números.
            </p>
          </div>
        </div>
      </div>

      {premio && (
        <Aviso tom="marca" icone={<Gift size={16} />} className="mb-4">
          <span className="font-medium">Prêmio de {mesPorExtensoLongo(mes)}:</span> {premio}
        </Aviso>
      )}

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
              : nivel ? "ordem pelo PPM líquido (PPM × precisão)" : "ordem pela média do PPM ponderada pelo nível"}
          </p>
          <TabelaDoRanking teste={teste} topo={ranking.topo} eu={ranking.eu} rotulo={rotuloDoRecorte} />
        </>
      )}
    </PageContainer>
  );
}
