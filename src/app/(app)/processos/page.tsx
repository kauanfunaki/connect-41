import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Contador } from "@/components/ui/Contador";
import { Plus, Sparkles, Mail, Columns3, AlertTriangle, Landmark, Loader, UserRound, PauseCircle, ListOrdered } from "lucide-react";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { podeNoModulo } from "@/lib/auth/modulo";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { getAuthContext, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { listarFilaLeve, comEtapasAgora, contarPorSituacao, feriadosDoTenant, filtrarPelaBusca } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADES, PRIORIDADE_LABEL, ehPrioridade } from "@/lib/societario/prioridade";
import { ProcessosFila, SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { AssistenteDoSocietario } from "@/components/societario/AssistenteDoSocietario";
import { getSectorUsers } from "@/lib/sectorUsers";
import { contarAvisosPendentes } from "@/lib/societario/avisos";
import { contarPendentesDoSetor } from "@/lib/ia/propostas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Pagination } from "@/components/shared/Pagination";
import { formatarNumero } from "@/lib/format";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

/**
 * Processos por página (13/11/2026, melhoria-662): a fila ia inteira para a
 * tela, até 500 linhas. Os contadores seguem contando a fila toda do filtro.
 */
const POR_PAGINA = 50;

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
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  // Gate de módulo além do gate de setor: o módulo é vendido por plano, e quem
  // é do societário num tenant que não contratou não deve ver a tela.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.situacao) ?? RECORTES[0];

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const agora = new Date();
  const [responsaveis, avisosPendentes] = await Promise.all([
    getSectorUsers(ctx.tenantId, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR),
    contarAvisosPendentes(ctx.tenantId),
  ]);
  // A IA do Societário é da coordenação (decisão de 28/09): só ela vê o atalho.
  const setoresDoSocietario = (await setoresDoModulo(ctx.tenantId, MODULE)) ?? [SECTOR];
  const setorDoSocietario = setoresDoSocietario[0];
  const coordena = canManageSector(ctx, setoresDoSocietario);
  const propostasDaIa = coordena ? await contarPendentesDoSetor(ctx.tenantId, setorDoSocietario) : 0;
  // Os roteiros (09/11/2026) pedem o mesmo nível que a tela deles: "gerir".
  const editaRoteiros = await podeNoModulo(ctx, MODULE, "gerir");

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
    await listarFilaLeve(
      ctx.tenantId,
      { responsavelId: responsavelFiltro, prioridade: prioridadeFiltro },
      feriados,
      agora
    ),
    busca
  );
  const contagem = contarPorSituacao(todas);
  const linhas = recorte.situacao ? todas.filter((l) => l.situacao === recorte.situacao) : todas;
  // A página pedida, dentro do que existe; as etapas liberadas só dela.
  const totalDePaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1), totalDePaginas);
  const daPagina = await comEtapasAgora(ctx.tenantId, linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA));

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
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams(filtrosNaUrl);
    if (recorte.chave !== "todos") q.set("situacao", recorte.chave);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/processos?${s}` : "/processos";
  };
  // O kanban tem a mesma busca na barra desde 15/10/2026: o `q` vai junto.
  const filtrosDoKanban = new URLSearchParams(filtrosNaUrl);

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
          <Button href="/processos/ia" variant="secondary">
            <Sparkles size={14} />
            Ceci · Societário
            {/* As propostas no `Contador`, como o "Classificar" da DRE (15/10/2026):
                o número ia escrito no texto do botão. */}
            {propostasDaIa > 0 && (
              <>
                <span className="sr-only">: {propostasDaIa === 1 ? "1 proposta para revisar" : `${propostasDaIa} propostas para revisar`}</span>
                <span aria-hidden className="inline-flex">
                  <Contador valor={propostasDaIa} tom="marca" className="ml-0.5" />
                </span>
              </>
            )}
          </Button>
        )}
        <Button href={filtrosDoKanban.size > 0 ? `/processos/kanban?${filtrosDoKanban}` : "/processos/kanban"} variant="secondary">
          <Columns3 size={14} />
          Ver no kanban
        </Button>
        {/* A abertura em três passos (04/11/2026) é página própria: a janela
            não comportava o checklist nem o pedido ao cliente. */}
        <Button href="/processos/novo">
          <Plus size={14} />
          Abrir processo
        </Button>
        {/* Configuração de pouco uso, no "⋯" e não num quinto botão (09/11/2026):
            o cabeçalho já tem a fila do dia. 36px, na altura dos botões ao lado. */}
        {editaRoteiros && (
          <MenuDeMaisAcoes rotulo="Mais ações dos processos" size="md" width={300} sempreMenu classeDoGatilho="h-9! w-9!">
            <ItemDoMenu href="/processos/roteiros" icone={<ListOrdered />} descricao="Etapas, órgãos e checklist de cada tipo de processo.">
              Roteiros dos processos
            </ItemDoMenu>
          </MenuDeMaisAcoes>
        )}
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
          <FormularioDeFiltro action="/processos" className="max-w-full">
            {recorte.chave !== "todos" && <input type="hidden" name="situacao" value={recorte.chave} />}
            {responsavelFiltro && <input type="hidden" name="responsavel" value={responsavelFiltro} />}
            {prioridadeFiltro && <input type="hidden" name="prioridade" value={prioridadeFiltro} />}
            <CampoDeBusca
              compact
              name="q"
              defaultValue={busca}
              placeholder="Buscar por empresa, tipo, título ou responsável…"
              aria-label="Buscar processo"
              className="w-80 max-w-full"
            />
          </FormularioDeFiltro>
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
          linhas={daPagina}
          filtrado={linhas.length === 0 && (todas.length > 0 || filtroAtivo)}
          agora={agora}
        />
      </CascoDaTabela>
      <Pagination page={pagina} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={linhas.length} rotulo="processos" />

      <div className="mt-6">
        <AssistenteDoSocietario />
      </div>
    </PageContainer>
  );
}
