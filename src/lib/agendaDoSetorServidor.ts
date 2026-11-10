// A leitura da Agenda de cada setor e de cada pessoa (10/11/2026) — as regras
// estão em agendaDoSetor.ts.
//
// Nunca derruba a tela: sem as tabelas (deploy antes da migration
// 20261110200000_agenda_e_meu_dia_por_setor) ou com o banco recusando, vale o
// padrão do código — a Agenda e o Meu dia de antes —, e `disponivel` diz à tela
// de configuração que ainda não dá para gravar.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { scopedSectors, type AuthContext } from "@/lib/auth/context";
import { lerVisaoDaAgenda, type AgendaView } from "@/lib/agenda";
import { FONTES_DA_AGENDA, lerFontesOcultas, type FonteDaAgenda } from "@/lib/fontesDaAgenda";
import { getTenantModuleStates } from "@/lib/modules";
import {
  fontesLigadas,
  fontesOcultasDaPessoa,
  usaReunioes,
  visaoInicial,
  type AgendaDaPessoa,
  type AgendaDoSetor,
  type FontesDaPessoa,
} from "@/lib/agendaDoSetor";
import { acessoAsFontes } from "@/lib/prazosDaAgenda";

/**
 * O padrão de cada setor que já foi configurado, pelo código. Setor fora do
 * mapa: o padrão do código. Uma vez por requisição — a Agenda e a resolução da
 * pessoa perguntam as duas.
 */
export const agendaDosSetores = cache(async (tenantId: string): Promise<{ porSetor: Record<string, AgendaDoSetor>; disponivel: boolean }> => {
  if (!tenantId) return { porSetor: {}, disponivel: true };
  try {
    const linhas = await getPrisma().sectorAgendaView.findMany({
      where: { tenantId },
      select: { sectorCode: true, usaReunioes: true, fontesOcultas: true },
    });
    return {
      porSetor: Object.fromEntries(
        linhas.map((l) => [l.sectorCode, { usaReunioes: l.usaReunioes, fontesOcultas: lerFontesOcultas(l.fontesOcultas) }]),
      ),
      disponivel: true,
    };
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[agendaDosSetores]", err);
    return { porSetor: {}, disponivel: false };
  }
});

/** O que a pessoa escolheu na Agenda; `null` quando nunca escolheu nada. */
export async function agendaDaPessoa(tenantId: string, userId: string): Promise<AgendaDaPessoa | null> {
  if (!tenantId || !userId) return null;
  try {
    const linha = await getPrisma().userAgendaView.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { fontesOcultas: true, visao: true },
    });
    return linha ? { fontesOcultas: lerFontesOcultas(linha.fontesOcultas), visao: lerVisaoDaAgenda(linha.visao) } : null;
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[agendaDaPessoa]", err);
    return null;
  }
}

export type AgendaResolvida = {
  /** Algum setor da pessoa usa reuniões (sem setor: sim). */
  usaReunioes: boolean;
  /** A visão em que a Agenda abre sem `?view=`. */
  visaoInicial: AgendaView;
  /** As fontes que a pessoa alcança — os botões. */
  acessiveis: FonteDaAgenda[];
  /** As escondidas e de onde veio a escolha. */
  fontes: FontesDaPessoa;
  /** As que ficam ligadas: as buscadas. */
  ligadas: FonteDaAgenda[];
};

/**
 * A Agenda desta pessoa, já resolvida pessoa > setor > código. Os setores são
 * os do recorte (o setor ativo, quando há; senão os dela), como no Meu dia.
 */
export async function agendaResolvida(ctx: AuthContext): Promise<AgendaResolvida> {
  const setores = scopedSectors(ctx) ?? ctx.sectors;
  const [{ porSetor }, pessoa, acesso] = await Promise.all([
    agendaDosSetores(ctx.tenantId),
    agendaDaPessoa(ctx.tenantId, ctx.userId),
    acessoAsFontes(ctx),
  ]);
  const usa = usaReunioes(setores, porSetor);
  const fontes = fontesOcultasDaPessoa(pessoa, setores, porSetor);
  return {
    usaReunioes: usa,
    visaoInicial: visaoInicial(pessoa, usa),
    acessiveis: acesso.fontes,
    fontes,
    ligadas: fontesLigadas(acesso.fontes, fontes.ocultas),
  };
}

/**
 * As fontes que existem no escritório: módulo ligado (as atividades dos
 * Quadros sempre; as obrigações quando há modelo ativo). É a lista da
 * configuração do setor — quem vê cada uma continua sendo decidido por pessoa.
 */
export async function fontesDoEscritorio(tenantId: string): Promise<FonteDaAgenda[]> {
  if (!tenantId) return [];
  const [estados, modelo] = await Promise.all([
    getTenantModuleStates(tenantId),
    getPrisma().modeloDeObrigacao.findFirst({ where: { tenantId, active: true }, select: { id: true } }),
  ]);
  const ligados = new Set(estados.filter((e) => e.enabled).map((e) => e.code));
  return FONTES_DA_AGENDA.filter((f) =>
    f.chave === "obrigacoes" ? modelo !== null : f.modulos.length === 0 || f.modulos.some((m) => ligados.has(m)),
  ).map((f) => f.chave);
}
