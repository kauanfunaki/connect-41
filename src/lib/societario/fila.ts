// A fila de processos do setor: a consulta e a ordem.
//
// Separado de `processo.ts`, que é regra pura e testada. Aqui mora o que toca o
// banco — e a única decisão de peso é a ordem, explicada em `ordenarFila`.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import {
  etapasLiberadas,
  situacaoDoProcesso,
  prazoDoProcesso,
  totalDeVoltas,
  type SituacaoDoProcesso,
  type Prazo,
} from "./processo";

export type LinhaDaFila = {
  id: string;
  tipoNome: string;
  empresaId: string;
  empresaNome: string;
  responsavelNome: string | null;
  situacao: SituacaoDoProcesso;
  prazo: Prazo;
  voltas: number;
  /** Rótulos das etapas que podem ser trabalhadas agora. Vazio = nada liberado. */
  etapasAgora: string[];
  iniciadoEm: Date;
};

/**
 * Feriados do tenant, como chaves "AAAA-MM-DD".
 *
 * Carregados uma vez por página e passados adiante: a contagem de dias úteis é
 * função pura de propósito, e quem tem banco é quem busca.
 */
export async function feriadosDoTenant(tenantId: string): Promise<Set<string>> {
  const prisma = getPrisma();
  const feriados = await prisma.holiday.findMany({
    where: { tenantId },
    select: { date: true },
  });
  return new Set(feriados.map((f) => saoPauloParts(f.date).dateKey));
}

const PESO_DA_SITUACAO: Record<SituacaoDoProcesso, number> = {
  // Exigência primeiro: é trabalho parado esperando **gente**, e gente é quem
  // está olhando esta tela. Espera de órgão vem depois porque ninguém aqui
  // consegue apressá-la, e processo em andamento é o curso normal.
  EM_EXIGENCIA: 0,
  AGUARDANDO_ORGAO: 1,
  EM_ANDAMENTO: 2,
  CONCLUIDO: 3,
};

/**
 * A ordem da fila.
 *
 * Primeiro o que depende de nós, depois o que depende do órgão. Dentro de cada
 * grupo, o mais atrasado no topo — e "atrasado" é dia útil consumido contra o
 * prazo que o setor declarou, não idade do processo. O alvará, que não tem
 * previsão, cai para o fim do seu grupo em vez de disputar posição com uma
 * régua que não se aplica a ele.
 */
export function ordenarFila(linhas: LinhaDaFila[]): LinhaDaFila[] {
  // Sem previsão é comparado por presença, não por valor. A primeira versão
  // usava `-Infinity` como sentinela e a subtração devolvia `Infinity`, que o
  // guarda de finitude descartava — o alvará ficava onde estava, que era
  // justamente o topo em metade dos casos. Comparar os dois casos
  // explicitamente custa três linhas e não tem aritmética para errar.
  const semPrevisao = (l: LinhaDaFila): boolean =>
    l.prazo.situacao === "sem_previsao" || l.prazo.previstoMax === null;

  return [...linhas].sort((a, b) => {
    const peso = PESO_DA_SITUACAO[a.situacao] - PESO_DA_SITUACAO[b.situacao];
    if (peso !== 0) return peso;

    const aSem = semPrevisao(a);
    const bSem = semPrevisao(b);
    if (aSem !== bSem) return aSem ? 1 : -1;

    if (!aSem) {
      const atraso =
        b.prazo.dias - (b.prazo.previstoMax as number) -
        (a.prazo.dias - (a.prazo.previstoMax as number));
      if (atraso !== 0) return atraso;
    }

    // Empate, ou os dois sem previsão: o mais antigo primeiro, que é o que
    // está esperando há mais tempo.
    return a.iniciadoEm.getTime() - b.iniciadoEm.getTime();
  });
}

export type FiltroDaFila = {
  situacao?: SituacaoDoProcesso;
  empresaId?: string;
  tipoId?: string;
};

/**
 * Os processos abertos do tenant, já com situação, prazo e etapa atual.
 *
 * ─── Sobre `Process.status` ──────────────────────────────────────────────────
 *
 * A coluna guarda o ciclo **grosso** — aberto, concluído, cancelado — e é ela
 * que recorta a consulta, porque índice precisa de coluna. O estado **fino**
 * (exigência, espera de órgão) é derivado dos protocolos a cada leitura, e é ele
 * que a tela mostra.
 *
 * Os dois não brigam porque só um é fonte para cada coisa: estado fino que
 * alguém precisasse lembrar de atualizar seria estado que mente na primeira vez
 * que uma gravação falhasse no meio.
 */
export async function listarFila(
  tenantId: string,
  filtro: FiltroDaFila,
  feriados: Set<string>,
  agora: Date
): Promise<LinhaDaFila[]> {
  const prisma = getPrisma();

  const processos = await prisma.process.findMany({
    where: {
      tenantId,
      status: { notIn: ["CONCLUIDO", "CANCELADO"] },
      companyId: filtro.empresaId || undefined,
      typeId: filtro.tipoId || undefined,
    },
    select: {
      id: true,
      startedAt: true,
      concludedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      owner: { select: { name: true } },
      type: {
        select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true },
      },
      template: {
        select: {
          steps: {
            select: { id: true, position: true, parallelGroup: true, optional: true, label: true },
            orderBy: { position: "asc" },
          },
        },
      },
      steps: { select: { templateStepId: true, status: true } },
      protocols: { select: { organId: true, attempt: true, outcome: true } },
    },
    // Teto defensivo: a fila é para trabalhar, não para inventariar. Passando
    // disto, o setor precisa de filtro, não de mais linhas.
    take: 500,
  });

  const linhas: LinhaDaFila[] = processos.map((p) => {
    const rotuloPor = new Map(p.template.steps.map((s) => [s.id, s.label]));
    const liberadas = etapasLiberadas(
      p.template.steps.map((s) => ({
        templateStepId: s.id,
        position: s.position,
        parallelGroup: s.parallelGroup,
        optional: s.optional,
      })),
      p.steps.map((s) => ({ templateStepId: s.templateStepId, status: s.status }))
    );

    return {
      id: p.id,
      tipoNome: p.type.name,
      empresaId: p.company.id,
      empresaNome: nomeExibicao(p.company),
      responsavelNome: p.owner?.name ?? null,
      situacao: situacaoDoProcesso(p.protocols, p.concludedAt !== null),
      prazo: prazoDoProcesso(p.type, p, agora, feriados),
      voltas: totalDeVoltas(p.protocols),
      etapasAgora: liberadas.map((id) => rotuloPor.get(id) ?? "—"),
      iniciadoEm: p.startedAt,
    };
  });

  const recortadas = filtro.situacao
    ? linhas.filter((l) => l.situacao === filtro.situacao)
    : linhas;

  return ordenarFila(recortadas);
}

/** Quantos processos em cada situação — para os contadores do filtro. */
export function contarPorSituacao(linhas: LinhaDaFila[]): Record<SituacaoDoProcesso, number> {
  const contagem: Record<SituacaoDoProcesso, number> = {
    EM_EXIGENCIA: 0,
    AGUARDANDO_ORGAO: 0,
    EM_ANDAMENTO: 0,
    CONCLUIDO: 0,
  };
  for (const l of linhas) contagem[l.situacao] += 1;
  return contagem;
}
