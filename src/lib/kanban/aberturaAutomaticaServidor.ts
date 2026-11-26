// A tela "Abertura automática" do setor (27/11/2026, funcionalidade-872): o
// que ela lê. A regra mora em `aberturaAutomatica.ts`; a gravação, na action da
// tela (src/app/(app)/setor/[code]/abertura-automatica/actions.ts).

import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { listasDoSetorPorEspaco, type ListaParaOAssunto } from "@/lib/solicitacoes/cartao";
import { LISTA_DOS_PROCESSOS, destinoDaAbertura, type DestinoDaAbertura } from "./aberturaAutomatica";
import { MODULO_DOS_PROCESSOS } from "./cartaoDoProcessoServidor";

export type PainelDaAbertura = {
  processos: {
    /** O setor desta tela é o que opera os Processos — só nele a origem se configura. */
    doSetor: boolean;
    moduloLigado: boolean;
    setorDoModulo: string | null;
    destino: DestinoDaAbertura;
    /** A lista escolhida (id), ou null = a padrão. */
    pipelineId: string | null;
    /** As listas de empresas do setor que podem receber os cartões, por espaço. */
    grupos: { espaco: string; listas: ListaParaOAssunto[] }[];
    /** A lista padrão, se já foi criada. */
    listaPadrao: { id: string; nome: string } | null;
    /** O nome da lista escolhida, "Espaço › Lista". */
    nomeDaEscolhida: string | null;
    cartoes: number;
    atualizadoEm: Date | null;
    atualizadoPor: string | null;
  };
  solicitacoes: {
    moduloLigado: boolean;
    assuntos: { id: string; nome: string; ativo: boolean; lista: string | null }[];
  };
  recorrentes: { ativas: number; total: number };
  porRegime: { ativos: number; total: number };
};

export async function painelDaAbertura(tenantId: string, sectorCode: string): Promise<PainelDaAbertura> {
  const prisma = getPrisma();
  const [doModulo, processosLigados, solicitacoesLigadas] = await Promise.all([
    setorDoModulo(tenantId, MODULO_DOS_PROCESSOS),
    isModuleEnabled(tenantId, MODULO_DOS_PROCESSOS),
    isModuleEnabled(tenantId, "portal_solicitacoes"),
  ]);
  const doSetor = doModulo === sectorCode;

  const [config, listas, listaPadrao, cartoes, assuntos, recorrentes, recorrentesAtivas, modelos, modelosAtivos] = await Promise.all([
    prisma.aberturaAutomatica.findUnique({
      where: { tenantId_sectorCode_origem: { tenantId, sectorCode, origem: "PROCESSO_SOCIETARIO" } },
      select: { ativo: true, pipelineId: true, updatedAt: true, atualizadoPor: { select: { name: true } } },
    }),
    prisma.pipeline.findMany({
      where: { tenantId, sectorCode, active: true, entityType: "COMPANY" },
      orderBy: [{ space: { order: "asc" } }, { space: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, sectorCode: true, systemKey: true, space: { select: { name: true } }, folder: { select: { name: true } } },
    }),
    prisma.pipeline.findFirst({ where: { tenantId, sectorCode, systemKey: LISTA_DOS_PROCESSOS }, select: { id: true, name: true, space: { select: { name: true } } } }),
    prisma.pipelineItem.count({ where: { tenantId, processId: { not: null }, pipeline: { sectorCode } } }),
    prisma.serviceRequestSubject.findMany({
      where: { tenantId, sectorCode },
      orderBy: [{ active: "desc" }, { order: "asc" }, { label: "asc" }],
      select: { id: true, label: true, active: true, cardPipeline: { select: { name: true, space: { select: { name: true } } } } },
    }),
    prisma.recurringObligation.count({ where: { tenantId, sectorCode } }),
    prisma.recurringObligation.count({ where: { tenantId, sectorCode, active: true } }),
    prisma.modeloDeObrigacao.count({ where: { tenantId, sectorCode } }),
    prisma.modeloDeObrigacao.count({ where: { tenantId, sectorCode, active: true } }),
  ]);

  // A lista padrão fica fora do seletor das escolhidas: ela é a opção "padrão".
  const escolhiveis = listas
    .filter((l) => l.systemKey !== LISTA_DOS_PROCESSOS)
    .map((l) => ({ id: l.id, setor: l.sectorCode, espaco: l.space.name, nome: l.folder ? `${l.folder.name} › ${l.name}` : l.name }));
  const escolhida = config?.pipelineId ? listas.find((l) => l.id === config.pipelineId) : undefined;

  return {
    processos: {
      doSetor,
      moduloLigado: processosLigados,
      setorDoModulo: doModulo,
      destino: destinoDaAbertura(config ? { ativo: config.ativo, pipelineId: escolhida ? config.pipelineId : null } : null),
      pipelineId: escolhida ? escolhida.id : null,
      grupos: listasDoSetorPorEspaco(escolhiveis, sectorCode),
      listaPadrao: listaPadrao ? { id: listaPadrao.id, nome: `${listaPadrao.space.name} › ${listaPadrao.name}` } : null,
      nomeDaEscolhida: escolhida ? `${escolhida.space.name} › ${escolhida.name}` : null,
      cartoes,
      atualizadoEm: config?.updatedAt ?? null,
      atualizadoPor: config?.atualizadoPor?.name ?? null,
    },
    solicitacoes: {
      moduloLigado: solicitacoesLigadas,
      assuntos: assuntos.map((a) => ({
        id: a.id,
        nome: a.label,
        ativo: a.active,
        lista: a.cardPipeline ? `${a.cardPipeline.space.name} › ${a.cardPipeline.name}` : null,
      })),
    },
    recorrentes: { ativas: recorrentesAtivas, total: recorrentes },
    porRegime: { ativos: modelosAtivos, total: modelos },
  };
}
