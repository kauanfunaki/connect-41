// A lista de Administração › Portal do cliente › Telas liberadas (14/10/2026):
// cada tela do catálogo, por seção, com o interruptor "Liberada / Bloqueada".
// Funções puras — a tela lê os módulos e as bloqueadas e entrega aqui.

import { SECOES_DO_PORTAL, TELAS_DO_PORTAL, telaBloqueavel, telaPelosModulos, type TelaDoPortal } from "./telas";

export type TelaParaLiberar = {
  href: string;
  rotulo: string;
  descricao: string;
  /** O Início não se bloqueia: aparece na lista como "Sempre liberada". */
  bloqueavel: boolean;
  liberada: boolean;
  /**
   * Por que o cliente já não vê a tela, com ou sem bloqueio: o módulo dela
   * está desligado no escritório, ou outra tela tomou o lugar dela.
   */
  foraDoMenu: string | null;
  /**
   * O que segue levando o cliente a esta tela mesmo bloqueada — o trabalho da
   * equipe que gera e-mail ou aviso com link para ela. A lista mostra com a
   * tela bloqueada.
   */
  avisoAoBloquear: string | null;
};

export type GrupoDeTelas = { chave: string; titulo: string; telas: TelaParaLiberar[] };

/** Sem a tabela das bloqueadas: a migration desta versão ainda não rodou. */
export const FALTA_ATUALIZAR_O_BANCO =
  "Falta a atualização do banco desta versão do Connect. Até ela rodar, nenhuma tela fica bloqueada, e os interruptores não salvam.";

/**
 * O que a equipe ainda faz que leva o cliente a uma tela bloqueada. O link do
 * e-mail (e do aviso no celular) abre o "ainda não está disponível" — o
 * administrador lê isto antes de bloquear, e não descobre pelo cliente.
 */
const AVISO_AO_BLOQUEAR: Readonly<Record<string, string>> = {
  "/portal/pendencias":
    "A equipe continua podendo abrir pendências para o cliente. O e-mail e o aviso no celular levam a esta tela, e o cliente não consegue responder pelo portal.",
  "/portal/aprovacoes":
    "Contas que pedem a aprovação do cliente ficam paradas: ele não consegue aprovar enquanto a tela estiver bloqueada. O e-mail de aviso leva a esta tela.",
  "/portal/solicitacoes":
    "O cliente não consegue abrir solicitações pelo portal. Quando a equipe responde uma solicitação já aberta, o e-mail leva a esta tela.",
  "/portal/comunicados": "Comunicados publicados pela equipe continuam saindo por e-mail, e o link do e-mail leva a esta tela.",
  "/portal/envios":
    "Os documentos que a equipe envia continuam chegando por e-mail, com o link próprio do documento, que segue funcionando.",
  "/portal/arquivos": "Quando a equipe compartilha uma pasta com o cliente, o e-mail leva a esta tela.",
  "/portal/processos": "Mensagens e documentos novos num processo continuam gerando e-mail ao cliente, com link para esta tela.",
  "/portal/comunicacao": "Mensagens da equipe pela Conversa continuam gerando e-mail ao cliente, com link para esta tela.",
};

const TITULO_DAS_GERAIS = "Telas gerais";

/** Por que a tela já não aparece para o cliente, sem contar o bloqueio. */
function motivoForaDoMenu(t: TelaDoPortal, modulos: ReadonlySet<string>): string | null {
  if (telaPelosModulos(t, modulos)) return null;
  if (t.ocultaCom && modulos.has(t.ocultaCom)) {
    const substituta = TELAS_DO_PORTAL.find((x) => x.modulo === t.ocultaCom)?.rotulo;
    return substituta ? `A tela já não aparece: foi trocada por “${substituta}”.` : "A tela já não aparece no portal.";
  }
  return "O módulo está desligado — a tela já não aparece.";
}

/**
 * As telas do catálogo agrupadas como no menu do portal: primeiro as do topo
 * (Início e Documentos fiscais), depois Financeiro, Societário e Com a equipe.
 */
export function telasParaLiberar(modulos: ReadonlySet<string>, bloqueadas: ReadonlySet<string>): GrupoDeTelas[] {
  const linha = (t: TelaDoPortal): TelaParaLiberar => {
    const bloqueavel = telaBloqueavel(t.href);
    const liberada = !bloqueavel || !bloqueadas.has(t.href);
    return {
      href: t.href,
      rotulo: t.rotulo,
      descricao: t.descricao,
      bloqueavel,
      liberada,
      foraDoMenu: motivoForaDoMenu(t, modulos),
      avisoAoBloquear: bloqueavel ? (AVISO_AO_BLOQUEAR[t.href] ?? null) : null,
    };
  };
  const grupos: GrupoDeTelas[] = [
    { chave: "gerais", titulo: TITULO_DAS_GERAIS, telas: TELAS_DO_PORTAL.filter((t) => t.secao === null).map(linha) },
    ...SECOES_DO_PORTAL.map((secao) => ({
      chave: secao,
      titulo: secao,
      telas: TELAS_DO_PORTAL.filter((t) => t.secao === secao).map(linha),
    })),
  ];
  return grupos.filter((g) => g.telas.length > 0);
}

/** "12 de 16 telas liberadas" — só as que podem ser bloqueadas entram na conta. */
export function resumoDasLiberadas(grupos: GrupoDeTelas[]): { liberadas: number; total: number } {
  const bloqueaveis = grupos.flatMap((g) => g.telas).filter((t) => t.bloqueavel);
  return { liberadas: bloqueaveis.filter((t) => t.liberada).length, total: bloqueaveis.length };
}
