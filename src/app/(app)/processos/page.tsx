import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Sparkles, Mail, Columns3, AlertTriangle, Landmark, Loader, UserRound, PauseCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { listarFila, contarPorSituacao, feriadosDoTenant, filtrarPelaBusca } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADES, PRIORIDADE_LABEL, ehPrioridade } from "@/lib/societario/prioridade";
import { ProcessosFila, SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { NovoProcessoForm } from "@/components/societario/NovoProcessoForm";
import { AssistenteDoSocietario } from "@/components/societario/AssistenteDoSocietario";
import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { nomeExibicao } from "@/lib/companyName";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { abrirProcesso } from "./actions";
import { contarAvisosPendentes } from "@/lib/societario/avisos";
import { contarPendentesDoSetor } from "@/lib/ia/propostas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { formatarNumero } from "@/lib/format";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

// A ordem do recorte é a da fila: o que depende de gente primeiro.
const RECORTES: { chave: string; situacao?: SituacaoDoProcesso }[] = [
  { chave: "todos" },
  { chave: "exigencia", situacao: "EM_EXIGENCIA" },
  { chave: "orgao", situacao: "AGUARDANDO_ORGAO" },
  { chave: "andamento", situacao: "EM_ANDAMENTO" },
  { chave: "cliente", situacao: "AGUARDANDO_CLIENTE" },
  { chave: "suspensos", situacao: "SUSPENSO" },
];

const ICONE_DA_SITUACAO: Record<SituacaoDoProcesso, React.ReactNode> = {
  EM_EXIGENCIA: <AlertTriangle />,
  AGUARDANDO_ORGAO: <Landmark />,
  EM_ANDAMENTO: <Loader />,
  AGUARDANDO_CLIENTE: <UserRound />,
  SUSPENSO: <PauseCircle />,
  CONCLUIDO: <PauseCircle />,
};

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  // Gate de módulo além do gate de setor: o módulo é vendido por plano, e quem
  // é do societário num tenant que não contratou não deve ver a tela.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.situacao) ?? RECORTES[0];

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const agora = new Date();
  const prisma = getPrisma();

  const [empresas, tipos, responsaveis, avisosPendentes] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: CAMPOS_DA_EMPRESA_NO_SELETOR,
    }),
    prisma.processType.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true },
    }),
    getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR),
    contarAvisosPendentes(ctx.tenantId),
  ]);
  // A IA do Societário é da coordenação (decisão de 28/09): só ela vê o atalho.
  const setorDoSocietario = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  const coordena = canManageSector(ctx, setorDoSocietario);
  const propostasDaIa = coordena ? await contarPendentesDoSetor(ctx.tenantId, setorDoSocietario) : 0;

  // Os filtros da URL só valem quando são valores conhecidos: o parâmetro é
  // texto do usuário, e um id desconhecido viraria uma fila vazia sem motivo.
  const responsavelFiltro =
    params.responsavel === "nenhum" || responsaveis.some((r) => r.id === params.responsavel)
      ? params.responsavel
      : undefined;
  const prioridadeFiltro = ehPrioridade(params.prioridade) ? params.prioridade : undefined;
  // A busca é texto livre: só aparada e com teto, para a URL não carregar um
  // parágrafo colado por engano.
  const busca = (params.q ?? "").trim().slice(0, 100);
  const filtroAtivo = Boolean(responsavelFiltro || prioridadeFiltro || busca);

  // A fila inteira do filtro vem sempre: os contadores do recorte precisam do
  // total, e uma segunda consulta só para contar discordaria da primeira no
  // instante em que alguém gravasse algo entre as duas.
  // A busca entra antes dos contadores, como os outros filtros: o cartão
  // "Em exigência" diz quantos da busca estão em exigência.
  const todas = filtrarPelaBusca(
    await listarFila(
      ctx.tenantId,
      { responsavelId: responsavelFiltro, prioridade: prioridadeFiltro },
      feriados,
      agora
    ),
    busca
  );
  const contagem = contarPorSituacao(todas);
  const linhas = recorte.situacao ? todas.filter((l) => l.situacao === recorte.situacao) : todas;

  const filtrosNaUrl = new URLSearchParams();
  if (responsavelFiltro) filtrosNaUrl.set("responsavel", responsavelFiltro);
  if (prioridadeFiltro) filtrosNaUrl.set("prioridade", prioridadeFiltro);
  if (busca) filtrosNaUrl.set("q", busca);
  const hrefDoRecorte = (chave: string) => {
    const q = new URLSearchParams(filtrosNaUrl);
    if (chave !== "todos") q.set("situacao", chave);
    const s = q.toString();
    return s ? `/processos?${s}` : "/processos";
  };
  // O kanban não tem caixa de busca: levar o `q` para lá filtraria o quadro
  // sem mostrar o porquê. Vão só os filtros que ele também tem.
  const filtrosDoKanban = new URLSearchParams(filtrosNaUrl);
  filtrosDoKanban.delete("q");

  return (
    <PageContainer>
      {/* Sem "Voltar": é a página principal do setor, e o menu é o caminho de volta. */}
      <PageHeader
        title="Processos"
        subtitle="Constituição, alteração contratual, baixa e alvarás — com protocolo, exigência e prazo."
        action={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Eram três links de texto (30/09): botão não é link. O aviso da Junta
            mantém a cor de atenção — é trabalho esperando conferência. */}
        {avisosPendentes > 0 && (
          <Button href="/processos/avisos" variant="secondary" className="text-warning-fg! border-warning/40! hover:bg-warning-bg!">
            <Mail size={14} />
            {avisosPendentes} {avisosPendentes === 1 ? "aviso da Junta" : "avisos da Junta"}
          </Button>
        )}
        {coordena && (
          <Button href="/societario/ia" variant="secondary">
            <Sparkles size={14} />
            IA do Societário{propostasDaIa > 0 ? ` · ${propostasDaIa}` : ""}
          </Button>
        )}
        <Button href={filtrosDoKanban.size > 0 ? `/processos/kanban?${filtrosDoKanban}` : "/processos/kanban"} variant="secondary">
          <Columns3 size={14} />
          Ver no kanban
        </Button>
        <NovoProcessoForm
          empresas={opcoesDeEmpresa(empresas.map((e) => ({ ...e, nome: nomeExibicao(e) })))}
          tipos={tipos.map((t) => ({
            id: t.id,
            name: t.name,
            // O prazo entra no rótulo porque é o que diferencia Constituição de
            // Alteração na hora de escolher — as duas têm o mesmo roteiro.
            prazo: t.variableFlow
              ? "fluxo variável"
              : t.expectedDaysMin === t.expectedDaysMax
                ? `${t.expectedDaysMax} dias úteis`
                : `${t.expectedDaysMin}–${t.expectedDaysMax} dias úteis`,
          }))}
          responsaveis={responsaveis}
          responsavelPadrao={responsaveis.some((r) => r.id === ctx.userId) ? (ctx.userId ?? "") : ""}
          abrirAction={abrirProcesso}
        />
        </div>
        }
      />

      {/* As cinco situações em cartão, com a contagem, e cada uma abre o seu
          recorte — eram pílulas (conferência de 30/09). A ordem é a da fila:
          o que depende de gente primeiro. */}
      <FaixaDeTotais
        itens={RECORTES.filter((r) => r.situacao).map((r) => {
          const situacao = r.situacao!;
          return {
            rotulo: SITUACAO_LABEL[situacao],
            valor: formatarNumero(contagem[situacao], 0),
            icone: ICONE_DA_SITUACAO[situacao],
            tom: situacao === "EM_EXIGENCIA" && contagem[situacao] > 0 ? "text-warning-fg" : situacao === "SUSPENSO" && contagem[situacao] > 0 ? "text-danger" : undefined,
            detalhe: r.chave === recorte.chave ? "mostrando agora" : undefined,
            ativo: r.chave === recorte.chave,
            href: hrefDoRecorte(r.chave === recorte.chave ? "todos" : r.chave),
          };
        })}
      />

      {/* Situação, responsável e prioridade no botão "Filtros" — eram pílulas e
          um formulário com "Filtrar". Continua por GET: a URL guarda o recorte,
          e quem manda o link manda a mesma fila. */}
      <CascoDaTabela
        contagem={contarItens(linhas.length, "processo", "processos")}
        busca={
          // A busca no desenho de Certificados e do acervo fiscal (07/10/2026):
          // GET, para o link copiado levar a mesma fila. Os filtros escolhidos
          // vão junto nos campos escondidos — sem eles, buscar os apagaria.
          <form method="get" action="/processos" className="max-w-full">
            {recorte.chave !== "todos" && <input type="hidden" name="situacao" value={recorte.chave} />}
            {responsavelFiltro && <input type="hidden" name="responsavel" value={responsavelFiltro} />}
            {prioridadeFiltro && <input type="hidden" name="prioridade" value={prioridadeFiltro} />}
            <Input
              compact
              type="search"
              name="q"
              icon={<Search />}
              defaultValue={busca}
              placeholder="Buscar por empresa, tipo, título ou responsável…"
              aria-label="Buscar processo"
              className="w-80 max-w-full"
            />
          </form>
        }
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "situacao",
                rotulo: "Situação",
                vazioLabel: `Todos (${todas.length})`,
                opcoes: RECORTES.filter((r) => r.situacao).map((r) => ({
                  value: r.chave,
                  label: `${SITUACAO_LABEL[r.situacao!]} (${contagem[r.situacao!]})`,
                })),
              },
              {
                chave: "responsavel",
                rotulo: "Responsável",
                vazioLabel: "Todos",
                opcoes: [{ value: "nenhum", label: "Sem responsável" }, ...responsaveis.map((r) => ({ value: r.id, label: r.name }))],
              },
              {
                chave: "prioridade",
                rotulo: "Prioridade",
                vazioLabel: "Todas",
                opcoes: PRIORIDADES.map((p) => ({ value: p, label: PRIORIDADE_LABEL[p] })),
              },
            ]}
          />
        }
      >
        <ProcessosFila
          linhas={linhas}
          filtrado={linhas.length === 0 && (todas.length > 0 || filtroAtivo)}
          agora={agora}
        />
      </CascoDaTabela>

      <div className="mt-6">
        <AssistenteDoSocietario />
      </div>
    </PageContainer>
  );
}
