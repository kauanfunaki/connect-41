// Os cartões coringa do topo do Início (10/11/2026, pedido do Kauan — Controle
// interno melhoria-588). Saíram a faixa "Destaques" em degradê (a cor não
// conversava com o resto do Connect) e os "Indicadores" de baixo dos painéis;
// no lugar, quatro cartões no topo, com o desenho do MetricCard, que mudam com
// o setor e que cada pessoa pode trocar pelo lápis ("B · Número com a
// tendência" + "A · Lápis no cartão", na página de opções).
//
// Este arquivo é só regra, sem banco: o catálogo (o que cada cartão é, de que
// setor, quem pode ver, para onde leva, quando fica âmbar ou vermelho), o
// padrão de cada setor e a resolução dos quatro de cada pessoa. Quem conta os
// números é `cartoesServidor.ts`; quem desenha é `components/home/FaixaDeCartoes`.
//
// A chave de cada cartão é a métrica do histórico (`metricas.ts`): é por ela
// que a linha dos últimos dias e o "+2 desde ontem" saem das fotos diárias.

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, canViewSector, isFullAccess, isFullWrite } from "@/lib/auth/papeis";
import { sectorScope } from "@/lib/auth/activeSector";
import { TODAS_AS_EMPRESAS } from "@/lib/empresas/escolhaDaEmpresa";
import { moeda } from "@/lib/financeiro/formato";
import { DEFAULT_SECTOR_LABELS } from "@/lib/sector-constants";
import { METRICAS, type MetricaDaHome } from "./metricas";
import { JANELA_DO_CARTAO_DIAS, pontosDaLinha, variacaoDesdeOntem, type Foto, type Variacao } from "./tendencia";

export const QUANTOS_CARTOES = 4;

/** O grupo dos cartões que valem para qualquer setor (a Home de "Todos os setores"). */
export const TODOS = "todos";

/** Quem olha — o que as regras do catálogo leem do AuthContext. */
export type QuemVeOsCartoes = Pick<AuthContext, "userId" | "role" | "sectors" | "activeSector" | "subscriptionReadOnly">;

/**
 * O escritório, do jeito que as regras precisam: os módulos ligados (com os
 * setores que operam cada um — um tenant pode mover ou compartilhar módulo),
 * os setores ativos e o módulo de chamados resolvido (`configDoHelpdesk`).
 */
export type AmbienteDosCartoes = {
  modulos: ReadonlyMap<string, { ligado: boolean; setores: readonly string[] }>;
  setores: ReadonlySet<string>;
  helpdesk: { ligado: boolean; setor: string };
};

/** O número de um cartão, como a consulta devolve. */
export type NumeroDoCartao = {
  /** O número grande. Moeda em centavos; contagem em unidades. */
  valor: number;
  /** Na fração ("18 de 42"), o total. */
  total?: number;
  /**
   * Uma parte do número que pede mais atenção — as atrasadas dentro de
   * "atrasadas e de hoje", as vencidas das pendências. Decide o tom.
   */
  alerta?: number;
  /** O texto ao lado do número no lugar da fração ("dias seguidos"). */
  apoio?: string;
  /** Uma linha embaixo do número (o desafio de hoje e o campeão do mês, na Academia). */
  detalhe?: string;
};

/** Os tons do MetricCard que o cartão usa: a cor só no que pede atenção. */
export type TomDoCartao = "critico" | "atencao";

/** O ícone de cada cartão, pelo nome — o mapa para o lucide fica no componente. */
export type IconeDoCartao =
  | "relogio"
  | "transferencia"
  | "enviada"
  | "solicitacao"
  | "empresa"
  | "chamado"
  | "dinheiro"
  | "calendario"
  | "pendencia"
  | "aprovacao"
  | "banco"
  | "alerta"
  | "guia"
  | "chave"
  | "arquivo"
  | "processo"
  | "exigencia"
  | "licenca"
  | "protocolo"
  | "ferias"
  | "admissao"
  | "rescisao"
  | "exame"
  | "vaga"
  | "candidato"
  | "entrevista"
  | "funil"
  | "certificado"
  | "validacao"
  | "lead"
  | "contato"
  | "caixa"
  | "minhas"
  | "academia";

export type DefinicaoDoCartao = {
  chave: MetricaDaHome;
  /** O nome do cartão — e da linha na lista "Trocar este cartão". */
  rotulo: string;
  /** O setor do catálogo (código), ou `TODOS`. Agrupa a lista e decide o padrão. */
  setor: string;
  icone: IconeDoCartao;
  /** "18 de 42": o total vai ao lado do número. */
  fracao?: boolean;
  /** Quem vê: a mesma regra da tela para onde o cartão leva. */
  pode: (quem: QuemVeOsCartoes, amb: AmbienteDosCartoes) => boolean;
  /** Quando o cartão fica âmbar (atenção) ou vermelho (crítico). */
  tom: (n: NumeroDoCartao) => TomDoCartao | null;
  /** A tela, já no recorte do número quando ela tem um. */
  href: (quem: QuemVeOsCartoes, amb: AmbienteDosCartoes) => string;
};

// ─── Quem vê ───────────────────────────────────────────────────────────────

type RegraDeModulo = { modulo: string; acesso: "ver" | "agir" };

/**
 * O gate das telas de módulo: ligado no escritório e a pessoa alcança um dos
 * setores dele — `canActOnSector` para as telas que pedem "agir" (/pagar,
 * /processos, /licencas), `canViewSector` para as outras. Como em
 * `acessoDosPaineis`, sem olhar o setor ativo: o setor ativo escolhe o padrão
 * dos quatro, mas a lista do lápis mostra tudo o que a pessoa enxerga.
 */
function porModulo(...regras: RegraDeModulo[]): DefinicaoDoCartao["pode"] {
  return (quem, amb) =>
    regras.some((r) => {
      const m = amb.modulos.get(r.modulo);
      if (!m?.ligado || m.setores.length === 0) return false;
      return r.acesso === "agir" ? canActOnSector(quem, m.setores) : canViewSector(quem, m.setores);
    });
}

/** Cartão de setor sem módulo (tarefas, obrigações, transferências): o setor existe e a pessoa o vê. */
function doSetor(setor: string): DefinicaoDoCartao["pode"] {
  return (quem, amb) => amb.setores.has(setor) && canViewSector(quem, setor);
}

const sempre: DefinicaoDoCartao["pode"] = () => true;

/** A aba "Para o meu setor" das Transferências só existe para quem tem caixa de setor (`abasVisiveis`). */
const temCaixaDeSetor: DefinicaoDoCartao["pode"] = (quem) => {
  const setores = sectorScope(quem.activeSector, quem.sectors, isFullAccess(quem.role));
  return setores === null || setores.length > 0;
};

/** A fila de solicitações: a tela só pede o canal do portal ligado; o recorte é da consulta. */
const comSolicitacoes: DefinicaoDoCartao["pode"] = (_quem, amb) => !!amb.modulos.get("portal_solicitacoes")?.ligado;

const comChamados: DefinicaoDoCartao["pode"] = (_quem, amb) => amb.helpdesk.ligado;

/**
 * A Academia (Fase 2, 11/11/2026) é de toda a equipe, de qualquer setor,
 * inclusive o Somente leitura (`MODULOS_DE_TODA_A_EQUIPE`): basta o módulo
 * ligado. O setor do catálogo (Tech) só liga e desliga.
 */
const comAcademia: DefinicaoDoCartao["pode"] = (_quem, amb) => !!amb.modulos.get("academia")?.ligado;

/** A fila inteira dos chamados: a equipe do setor responsável e o administrador (`podeVerInterno`). */
const equipeDosChamados: DefinicaoDoCartao["pode"] = (quem, amb) =>
  amb.helpdesk.ligado && (quem.sectors.includes(amb.helpdesk.setor) || isFullWrite(quem.role));

// ─── Tom ───────────────────────────────────────────────────────────────────
// A cor só onde pede ação (decisão do Kauan): vermelho para o que já passou do
// prazo, âmbar para o que espera alguém. O resto fica no texto normal.

export const TOM = {
  nenhum: (): TomDoCartao | null => null,
  criticoSePositivo: (n: NumeroDoCartao): TomDoCartao | null => (n.valor > 0 ? "critico" : null),
  atencaoSePositivo: (n: NumeroDoCartao): TomDoCartao | null => (n.valor > 0 ? "atencao" : null),
  criticoSeAlerta: (n: NumeroDoCartao): TomDoCartao | null => ((n.alerta ?? 0) > 0 ? "critico" : null),
  atencaoSeAlerta: (n: NumeroDoCartao): TomDoCartao | null => ((n.alerta ?? 0) > 0 ? "atencao" : null),
  /** Vermelho com alguma atrasada dentro do número; âmbar quando só há o que vence hoje. */
  criticoSeAlertaSenaoAtencao: (n: NumeroDoCartao): TomDoCartao | null =>
    (n.alerta ?? 0) > 0 ? "critico" : n.valor > 0 ? "atencao" : null,
  /** Vermelho quando o número já é o estourado; âmbar quando só há o que está no limite. */
  criticoSePositivoSenaoAtencaoSeAlerta: (n: NumeroDoCartao): TomDoCartao | null =>
    n.valor > 0 ? "critico" : (n.alerta ?? 0) > 0 ? "atencao" : null,
} as const;

// ─── Endereços ─────────────────────────────────────────────────────────────

/** A fila de solicitações no recorte, e no setor ativo quando há um (a tela só aceita setor da fila). */
function naFila(recorte: string): DefinicaoDoCartao["href"] {
  return (quem) => {
    const q = new URLSearchParams();
    if (quem.activeSector) q.set("setor", quem.activeSector);
    if (recorte === "atrasadas") q.set("atrasadas", "1");
    else q.set("recorte", recorte);
    return `/solicitacoes?${q.toString()}`;
  };
}

const fixo = (href: string): DefinicaoDoCartao["href"] => () => href;

// ─── O catálogo ────────────────────────────────────────────────────────────
// O "Catálogo inicial de cartões por setor" da página de opções, com o que tem
// contagem barata no banco. Ficaram de fora (sem fonte barata ou sem tela para
// abrir): Fechamentos do mês e Revisões em aberto (o Connect não guarda
// "fechado" nem "revisão concluída"), Certidões vencendo (depende da última
// certidão de cada empresa e tipo: varre o acervo), Taxas a pagar e
// Experiência vencendo (sem tela que liste), Propostas em aberto (não há
// proposta no Comercial) e Robôs sem sinal (o batimento de 3 minutos marca
// como fora do ar o robô que roda por agenda).

export const CATALOGO_DE_CARTOES: readonly DefinicaoDoCartao[] = [
  // Todos os setores
  {
    chave: "tarefas_atrasadas_hoje",
    rotulo: "Tarefas atrasadas e de hoje",
    setor: TODOS,
    icone: "relogio",
    pode: sempre,
    // Vermelho com atrasada; âmbar quando só há as de hoje — como o painel.
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/kanban"),
  },
  {
    chave: "transferencias_setor",
    rotulo: "Transferências para o meu setor",
    setor: TODOS,
    icone: "transferencia",
    pode: temCaixaDeSetor,
    // Transferência em aberto espera alguém — âmbar (15/10/2026).
    tom: TOM.atencaoSePositivo,
    href: fixo("/transferencias?aba=setor"),
  },
  {
    chave: "solicitacoes_atrasadas",
    rotulo: "Solicitações com resposta atrasada",
    setor: TODOS,
    icone: "solicitacao",
    pode: comSolicitacoes,
    tom: TOM.criticoSePositivo,
    href: naFila("atrasadas"),
  },
  {
    chave: "empresas_ativas",
    rotulo: "Empresas ativas",
    setor: TODOS,
    icone: "empresa",
    pode: sempre,
    tom: TOM.nenhum,
    href: fixo("/empresas?status=ACTIVE"),
  },
  {
    chave: "chamados_que_abri",
    rotulo: "Chamados que abri",
    setor: TODOS,
    icone: "chamado",
    pode: comChamados,
    // Âmbar quando algum espera resposta de quem abriu.
    tom: TOM.atencaoSeAlerta,
    // A equipe não tem a aba "Abertos por mim": abre a fila dela.
    href: (quem, amb) => (equipeDosChamados(quem, amb) ? "/chamados" : "/chamados?aba=abertos"),
  },
  {
    chave: "transferencias_enviadas",
    rotulo: "Transferências enviadas",
    setor: TODOS,
    icone: "enviada",
    pode: sempre,
    tom: TOM.nenhum,
    href: fixo("/transferencias?aba=enviadas"),
  },

  // BPO
  {
    chave: "contas_pagar_vencidas",
    rotulo: "Contas a pagar vencidas",
    setor: "bpo",
    icone: "dinheiro",
    pode: porModulo({ modulo: "bpo_contas_pagar", acesso: "agir" }),
    tom: TOM.criticoSePositivo,
    href: fixo(`/pagar?recorte=vencidas&empresa=${TODAS_AS_EMPRESAS}`),
  },
  {
    chave: "contas_pagar_semana",
    rotulo: "A pagar nesta semana",
    setor: "bpo",
    icone: "calendario",
    pode: porModulo({ modulo: "bpo_contas_pagar", acesso: "agir" }),
    tom: TOM.nenhum,
    // A tela não tem o recorte "até domingo"; "a vencer" é o mais perto.
    href: fixo(`/pagar?recorte=avencer&empresa=${TODAS_AS_EMPRESAS}`),
  },
  {
    chave: "pendencias_cliente",
    rotulo: "Pendências com o cliente",
    setor: "bpo",
    icone: "pendencia",
    pode: porModulo({ modulo: "bpo_pendencias", acesso: "ver" }),
    // Vermelho com alguma vencida dentro do número.
    tom: TOM.criticoSeAlerta,
    href: fixo("/pendencias"),
  },
  {
    chave: "aprovacoes_aguardando",
    rotulo: "Aprovações aguardando",
    setor: "bpo",
    icone: "aprovacao",
    pode: porModulo({ modulo: "bpo_aprovacoes", acesso: "ver" }),
    // Vermelho com reprovada (trava a baixa); âmbar com as que esperam.
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo(`/aprovacoes?situacao=aguardando&empresa=${TODAS_AS_EMPRESAS}`),
  },
  {
    chave: "linhas_a_conciliar",
    rotulo: "Linhas a conciliar",
    setor: "bpo",
    icone: "banco",
    pode: porModulo({ modulo: "bpo_conciliacao", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    // A conciliação é por conta; a carteira lista todas, das que mais têm a conciliar.
    href: fixo("/carteira-bpo?ordem=conciliar"),
  },
  {
    chave: "contas_receber_vencidas",
    rotulo: "A receber vencidas",
    setor: "bpo",
    icone: "dinheiro",
    pode: porModulo({ modulo: "bpo_contas_receber", acesso: "agir" }),
    tom: TOM.criticoSePositivo,
    href: fixo(`/receber?recorte=vencidas&empresa=${TODAS_AS_EMPRESAS}`),
  },

  // Fiscal
  {
    chave: "obrigacoes_risco_fiscal",
    rotulo: "Obrigações em risco de multa",
    setor: "fiscal",
    icone: "alerta",
    pode: doSetor("fiscal"),
    // Vermelho quando a data legal é hoje ou já passou; âmbar quando está a dois dias úteis.
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/setor/fiscal"),
  },
  {
    chave: "guias_vencem_semana",
    rotulo: "Guias que vencem na semana",
    setor: "fiscal",
    icone: "guia",
    pode: porModulo({ modulo: "fiscal_autorizacoes", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/autorizacoes/guias"),
  },
  {
    chave: "autorizacoes_a_validar",
    rotulo: "Autorizações a validar",
    setor: "fiscal",
    icone: "chave",
    pode: porModulo({ modulo: "fiscal_autorizacoes", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/autorizacoes?situacao=validar"),
  },
  {
    // "Notas recusadas" no catálogo; é o nome da tela: o XML que o leitor não
    // conseguiu ler. Recusa da SEFAZ o Connect não recebe.
    chave: "xml_recusados",
    rotulo: "XML recusados",
    setor: "fiscal",
    icone: "arquivo",
    pode: porModulo({ modulo: "fiscal_documentos", acesso: "agir" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/documentos-fiscais/recusados"),
  },
  {
    chave: "tarefas_atrasadas_fiscal",
    rotulo: "Tarefas atrasadas",
    setor: "fiscal",
    icone: "relogio",
    pode: doSetor("fiscal"),
    tom: TOM.criticoSePositivo,
    href: fixo("/setor/fiscal"),
  },

  // Contábil
  {
    chave: "obrigacoes_risco_contabil",
    rotulo: "Obrigações em risco de multa",
    setor: "contabil",
    icone: "alerta",
    pode: doSetor("contabil"),
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/setor/contabil"),
  },
  {
    chave: "transferencias_contabil",
    rotulo: "Transferências para o Contábil",
    setor: "contabil",
    icone: "transferencia",
    pode: doSetor("contabil"),
    tom: TOM.atencaoSePositivo,
    href: fixo("/transferencias?aba=setor&setor=contabil"),
  },
  {
    chave: "tarefas_atrasadas_contabil",
    rotulo: "Tarefas atrasadas",
    setor: "contabil",
    icone: "relogio",
    pode: doSetor("contabil"),
    tom: TOM.criticoSePositivo,
    href: fixo("/setor/contabil"),
  },

  // Societário
  {
    chave: "processos_estourados",
    rotulo: "Processos estourados",
    setor: "societario",
    icone: "processo",
    pode: porModulo({ modulo: "societario_processos", acesso: "agir" }),
    // Vermelho com prazo estourado; âmbar quando só há os no limite.
    tom: TOM.criticoSePositivoSenaoAtencaoSeAlerta,
    href: fixo("/processos"),
  },
  {
    chave: "exigencias_abertas",
    rotulo: "Exigências abertas",
    setor: "societario",
    icone: "exigencia",
    pode: porModulo({ modulo: "societario_prazos", acesso: "ver" }),
    // Vermelho com alguma de prazo vencido; âmbar com as abertas.
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/exigencias"),
  },
  {
    chave: "licencas_a_renovar",
    rotulo: "Licenças a renovar",
    setor: "societario",
    icone: "licenca",
    pode: porModulo({ modulo: "societario_licencas", acesso: "agir" }),
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/licencas"),
  },
  {
    chave: "protocolos_parados",
    rotulo: "Protocolos parados",
    setor: "societario",
    icone: "protocolo",
    pode: porModulo({ modulo: "societario_prazos", acesso: "ver" }),
    // Vermelho com o parado há o dobro do prazo de cobrança (a regra da tela).
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/exigencias?aba=parados"),
  },

  // DP — as telas do DP pedem o setor do módulo de colaboradores.
  {
    chave: "ferias_vencidas",
    rotulo: "Férias vencidas",
    setor: "dp",
    icone: "ferias",
    pode: porModulo({ modulo: "dp_colaboradores", acesso: "ver" }),
    tom: TOM.criticoSePositivo,
    href: fixo("/ferias"),
  },
  {
    chave: "ferias_a_vencer",
    rotulo: "Férias a vencer em 60 dias",
    setor: "dp",
    icone: "calendario",
    pode: porModulo({ modulo: "dp_colaboradores", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/ferias"),
  },
  {
    chave: "admissoes_andamento",
    rotulo: "Admissões em andamento",
    setor: "dp",
    icone: "admissao",
    pode: porModulo({ modulo: "dp_colaboradores", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/admissoes"),
  },
  {
    // "Rescisões no prazo" no catálogo: o número são as rescisões em
    // andamento, e o vermelho marca a que passou dos 10 dias para pagar
    // (CLT, art. 477 §6º) — o prazo que a tela de desligamentos acompanha.
    chave: "rescisoes_andamento",
    rotulo: "Rescisões em andamento",
    setor: "dp",
    icone: "rescisao",
    pode: porModulo({ modulo: "dp_colaboradores", acesso: "ver" }),
    tom: TOM.criticoSeAlerta,
    href: fixo("/desligamentos"),
  },
  {
    chave: "exames_pendentes",
    rotulo: "Exames pendentes",
    setor: "dp",
    icone: "exame",
    pode: porModulo({ modulo: "dp_colaboradores", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/admissoes"),
  },

  // Recrutamento — pelo escopo de /vagas.
  {
    chave: "vagas_abertas",
    rotulo: "Vagas abertas",
    setor: "recrutamento",
    icone: "vaga",
    pode: porModulo({ modulo: "recrutamento_vagas", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/vagas"),
  },
  {
    // "Candidaturas novas": a candidatura não tem situação "nova"; nova é a
    // que ainda está na triagem, a primeira etapa do funil.
    chave: "candidaturas_triagem",
    rotulo: "Candidaturas novas",
    setor: "recrutamento",
    icone: "candidato",
    pode: porModulo({ modulo: "recrutamento_vagas", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/vagas"),
  },
  {
    chave: "entrevistas_semana",
    rotulo: "Entrevistas da semana",
    setor: "recrutamento",
    icone: "entrevista",
    pode: porModulo({ modulo: "recrutamento_vagas", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/agenda?view=semana"),
  },
  {
    // "12 de 32": as candidaturas das vagas abertas que passaram da triagem.
    chave: "conversao_funil",
    rotulo: "Conversão do funil",
    setor: "recrutamento",
    icone: "funil",
    fracao: true,
    pode: porModulo({ modulo: "recrutamento_vagas", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/vagas"),
  },

  // Tech
  {
    chave: "chamados_na_fila",
    rotulo: "Chamados na fila",
    setor: "tech",
    icone: "chamado",
    pode: equipeDosChamados,
    tom: TOM.atencaoSePositivo,
    href: fixo("/chamados?aba=fila"),
  },
  {
    chave: "chamados_atrasados",
    rotulo: "Chamados atrasados",
    setor: "tech",
    icone: "relogio",
    pode: equipeDosChamados,
    tom: TOM.criticoSePositivo,
    // A lista não tem o recorte "fora do SLA": a fila mostra o atraso de cada um.
    href: fixo("/chamados?aba=fila"),
  },
  {
    chave: "certificados_renovar",
    rotulo: "Certificados a renovar",
    setor: "tech",
    icone: "certificado",
    pode: porModulo({ modulo: "tech_certificados", acesso: "ver" }),
    // A aba "Renovar" soma vencidos e a vencer em 60 dias; vermelho com vencido.
    tom: TOM.criticoSeAlertaSenaoAtencao,
    href: fixo("/certificados?aba=renovar"),
  },
  {
    chave: "itens_em_validacao",
    rotulo: "Itens em validação",
    setor: "tech",
    icone: "validacao",
    pode: porModulo({ modulo: "tech_controle_interno", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/controle-interno?situacao=VALIDATION"),
  },

  // Comercial
  {
    chave: "leads_novos",
    rotulo: "Leads novos",
    setor: "comercial",
    icone: "lead",
    pode: porModulo({ modulo: "comercial_leads", acesso: "ver" }),
    tom: TOM.atencaoSePositivo,
    href: fixo("/leads?situacao=novos"),
  },
  {
    chave: "leads_em_contato",
    rotulo: "Leads em contato",
    setor: "comercial",
    icone: "contato",
    pode: porModulo({ modulo: "comercial_leads", acesso: "ver" }),
    tom: TOM.nenhum,
    href: fixo("/leads?situacao=em-contato"),
  },

  // Controladoria — a fila de solicitações dos clientes.
  {
    chave: "solicitacoes_novas",
    rotulo: "Solicitações novas",
    setor: "controladoria",
    icone: "caixa",
    pode: comSolicitacoes,
    tom: TOM.atencaoSePositivo,
    href: naFila("novas"),
  },
  {
    chave: "solicitacoes_aguardando_cliente",
    rotulo: "Aguardando cliente",
    setor: "controladoria",
    icone: "contato",
    pode: comSolicitacoes,
    tom: TOM.nenhum,
    href: naFila("aguardando"),
  },
  {
    chave: "solicitacoes_minhas",
    rotulo: "Minhas solicitações",
    setor: "controladoria",
    icone: "minhas",
    pode: comSolicitacoes,
    tom: TOM.nenhum,
    href: naFila("minhas"),
  },
  // A Academia (Fase 2, 11/11/2026, Controle interno funcionalidade-594): um
  // cartão discreto, em "Todos os setores" e fora de todo padrão — entra pelo
  // lápis. O número é a sequência de dias do desafio do dia; embaixo, o
  // desafio de hoje e quem está na frente no mês. Sem cor: não pede ação.
  {
    chave: "academia_desafio_do_dia",
    rotulo: "Desafio do dia da Academia",
    setor: TODOS,
    icone: "academia",
    pode: comAcademia,
    tom: TOM.nenhum,
    href: fixo("/academia/desafio"),
  },
];

const POR_CHAVE = new Map<string, DefinicaoDoCartao>(CATALOGO_DE_CARTOES.map((d) => [d.chave, d]));

export function definicaoDoCartao(chave: string): DefinicaoDoCartao | null {
  return POR_CHAVE.get(chave) ?? null;
}

export function ehChaveDeCartao(chave: unknown): chave is MetricaDaHome {
  return typeof chave === "string" && POR_CHAVE.has(chave);
}

/** Os cartões que esta pessoa pode ver, na ordem do catálogo. */
export function cartoesDisponiveis(quem: QuemVeOsCartoes, amb: AmbienteDosCartoes): DefinicaoDoCartao[] {
  return CATALOGO_DE_CARTOES.filter((d) => d.pode(quem, amb));
}

// ─── O padrão de cada setor ────────────────────────────────────────────────
// Os quatro "em azul" do catálogo da página de opções, até o coordenador
// mudar. Onde o catálogo marcava um cartão que ficou de fora, entrou o mais
// perto que existe (anotado ao lado).

export const PADRAO_DE_TODOS: readonly MetricaDaHome[] = [
  "tarefas_atrasadas_hoje",
  "transferencias_setor",
  "solicitacoes_atrasadas",
  "empresas_ativas",
];

export const PADRAO_POR_SETOR: Readonly<Record<string, readonly MetricaDaHome[]>> = {
  bpo: ["contas_pagar_vencidas", "contas_pagar_semana", "pendencias_cliente", "aprovacoes_aguardando"],
  fiscal: ["obrigacoes_risco_fiscal", "guias_vencem_semana", "autorizacoes_a_validar", "tarefas_atrasadas_fiscal"],
  // "Fechamentos do mês" ficou de fora: a resposta atrasada ao cliente no lugar.
  contabil: ["obrigacoes_risco_contabil", "transferencias_contabil", "tarefas_atrasadas_contabil", "solicitacoes_atrasadas"],
  societario: ["processos_estourados", "exigencias_abertas", "licencas_a_renovar", "protocolos_parados"],
  dp: ["ferias_vencidas", "ferias_a_vencer", "admissoes_andamento", "rescisoes_andamento"],
  recrutamento: ["vagas_abertas", "candidaturas_triagem", "entrevistas_semana", "conversao_funil"],
  tech: ["chamados_na_fila", "chamados_atrasados", "certificados_renovar", "itens_em_validacao"],
  // "Propostas em aberto" ficou de fora: as tarefas no lugar.
  comercial: ["leads_novos", "leads_em_contato", "transferencias_enviadas", "tarefas_atrasadas_hoje"],
  controladoria: ["solicitacoes_novas", "solicitacoes_atrasadas", "solicitacoes_aguardando_cliente", "solicitacoes_minhas"],
};

/** O padrão do código para o setor ativo; sem setor (ou setor sem padrão próprio), o de todos. */
export function padraoDoCodigo(setorAtivo: string | null): readonly MetricaDaHome[] {
  return (setorAtivo && PADRAO_POR_SETOR[setorAtivo]) || PADRAO_DE_TODOS;
}

// ─── As escolhas gravadas ──────────────────────────────────────────────────
// A da pessoa (`user_home_cards`) e a do setor (`sector_home_cards`) guardam
// as quatro posições, cada uma com a chave escolhida ou `null` ("vale o de
// cima"). Assim a pessoa troca um cartão só, e os outros três continuam
// seguindo o padrão do setor quando o coordenador mudar.

export type Escolhas = readonly (MetricaDaHome | null)[];

/** Lê o JSON gravado. Chave que saiu do catálogo vira `null` na mesma posição — os outros não andam. */
export function lerEscolhas(raw: string | null | undefined): Escolhas | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(v)) return null;
  const lidas = Array.from({ length: QUANTOS_CARTOES }, (_, i) => (ehChaveDeCartao(v[i]) ? v[i] : null));
  return lidas.some((c) => c !== null) ? lidas : null;
}

/** O JSON para gravar, ou `null` quando não sobrou escolha nenhuma (apaga a linha). */
export function gravarEscolhas(escolhas: Escolhas): string | null {
  const limpas = Array.from({ length: QUANTOS_CARTOES }, (_, i) => (ehChaveDeCartao(escolhas[i]) ? escolhas[i] : null));
  return limpas.some((c) => c !== null) ? JSON.stringify(limpas) : null;
}

// ─── A resolução ───────────────────────────────────────────────────────────

/** De onde veio o cartão de cada posição. */
export type OrigemDoCartao = "pessoa" | "setor" | "padrao";

export type CartaoResolvido = {
  chave: MetricaDaHome;
  origem: OrigemDoCartao;
  /** A pessoa tem escolha própria nesta posição (mostra "Voltar ao do setor"). */
  daPessoa: boolean;
};

/**
 * Os quatro cartões de quem olha: pessoa > padrão do setor ativo > padrão do
 * código, posição por posição.
 *
 * Cartão que a pessoa não pode ver (ou que já saiu do catálogo) não aparece:
 * a posição cai para o de baixo (setor, código) e, se nenhum servir, para o
 * próximo padrão que ela vê — o do setor, o do código do setor, o de todos e,
 * por fim, qualquer outro do catálogo. Sempre quatro; menos só para quem
 * enxerga menos de quatro indicadores.
 *
 * O mesmo cartão não aparece duas vezes. Na disputa, ganha a escolha da
 * pessoa, depois a do setor, depois a do código — a escolha explícita nunca é
 * a que some.
 */
export function resolverCartoes({
  pessoa,
  setor,
  setorAtivo,
  disponiveis,
}: {
  pessoa: Escolhas | null;
  setor: Escolhas | null;
  setorAtivo: string | null;
  /** Os cartões que esta pessoa vê, na ordem do catálogo (`cartoesDisponiveis`). */
  disponiveis: readonly MetricaDaHome[];
}): (CartaoResolvido | null)[] {
  const pode = new Set(disponiveis);
  const codigo = padraoDoCodigo(setorAtivo);
  const posicoes: (CartaoResolvido | null)[] = Array.from({ length: QUANTOS_CARTOES }, () => null);
  const usados = new Set<MetricaDaHome>();
  const daPessoa = (i: number) => pessoa?.[i] != null;

  const niveis: [OrigemDoCartao, readonly (MetricaDaHome | null)[] | null][] = [
    ["pessoa", pessoa],
    ["setor", setor],
    ["padrao", codigo],
  ];
  for (const [origem, lista] of niveis) {
    if (!lista) continue;
    for (let i = 0; i < QUANTOS_CARTOES; i++) {
      const chave = lista[i];
      if (posicoes[i] || !chave || !pode.has(chave) || usados.has(chave)) continue;
      posicoes[i] = { chave, origem, daPessoa: daPessoa(i) };
      usados.add(chave);
    }
  }

  // O que sobrou vazio: o próximo padrão que a pessoa vê.
  const reserva: (MetricaDaHome | null)[] = [
    ...(setor ?? []),
    ...codigo,
    ...PADRAO_DE_TODOS,
    ...disponiveis.filter((c) => definicaoDoCartao(c)?.setor === setorAtivo),
    ...disponiveis,
  ];
  for (let i = 0; i < QUANTOS_CARTOES; i++) {
    if (posicoes[i]) continue;
    const chave = reserva.find((c): c is MetricaDaHome => !!c && pode.has(c) && !usados.has(c));
    if (!chave) continue;
    posicoes[i] = { chave, origem: "padrao", daPessoa: daPessoa(i) };
    usados.add(chave);
  }
  return posicoes;
}

/**
 * As escolhas depois de pôr `chave` na `posicao`. Se a chave já está em outra
 * posição do que se vê (`mostrados`), as duas trocam de lugar — o cartão não
 * aparece duas vezes, e o que estava na posição não some.
 */
export function trocarNaPosicao(
  escolhas: Escolhas | null,
  posicao: number,
  chave: MetricaDaHome,
  mostrados: readonly (MetricaDaHome | null)[]
): (MetricaDaHome | null)[] {
  const novas = Array.from({ length: QUANTOS_CARTOES }, (_, i) => escolhas?.[i] ?? null);
  const outra = mostrados.findIndex((c, i) => c === chave && i !== posicao);
  if (outra >= 0) novas[outra] = mostrados[posicao] ?? null;
  novas[posicao] = chave;
  return novas;
}

/** Quem pode gravar o padrão do setor ativo: quem o coordena (SECTOR_ADMIN dele), o admin e o super admin. */
export function podeDefinirPadraoDoSetor(quem: QuemVeOsCartoes): boolean {
  return !!quem.activeSector && canManageSector(quem, quem.activeSector);
}

/**
 * A ordem dos grupos na lista "Trocar este cartão": o setor ativo primeiro,
 * depois os outros setores (na ordem do escritório) e, por último, "Todos os
 * setores" — como no desenho aprovado.
 */
export function ordemDosGrupos(setorAtivo: string | null, ordemDoEscritorio: readonly string[]): string[] {
  const setores = [...new Set([...(setorAtivo ? [setorAtivo] : []), ...ordemDoEscritorio])].filter((s) => s !== TODOS);
  return [...setores, TODOS];
}

// ─── O cartão pronto para a tela ───────────────────────────────────────────
// O que vai do servidor para o componente (serializável): o número já
// formatado, o tom, a variação desde ontem e os pontos da linha.

export type CartaoPronto = {
  chave: MetricaDaHome;
  rotulo: string;
  icone: IconeDoCartao;
  href: string;
  /** `null`: a consulta falhou — o cartão diz "Não deu para carregar" e oferece tentar de novo. */
  numero: {
    /** "1.234", "R$ 12.300,00". */
    texto: string;
    /** "de 42", na fração; ou o apoio que o número trouxe ("dias seguidos"). */
    apoio?: string;
    /** A linha embaixo do número, quando o cartão tem uma. */
    detalhe?: string;
    tom: TomDoCartao | null;
  } | null;
  /** "+2 desde ontem"; `null` sem foto de ontem (ou dos últimos dias). */
  variacao: Variacao | null;
  /** Os pontos da linha (x e y de 0 a 1); `null` com menos de três dias de foto. */
  linha: { x: number; y: number }[] | null;
};

/** Uma linha da lista "Trocar este cartão". */
export type OpcaoDoCartao = {
  chave: MetricaDaHome;
  rotulo: string;
  /** O código do setor do grupo, ou `TODOS`. */
  grupo: string;
  grupoRotulo: string;
  /** Para o cartão entrar na hora, antes de o número chegar. */
  icone: IconeDoCartao;
  href: string;
};

const NUMERO = new Intl.NumberFormat("pt-BR");

/** Junta definição, número e fotos no cartão que a tela desenha. */
export function montarCartaoPronto({
  def,
  numero,
  fotos,
  hojeKey,
  quem,
  amb,
}: {
  def: DefinicaoDoCartao;
  numero: NumeroDoCartao | null;
  /** As fotos dos dias anteriores; `null` sem histórico disponível. */
  fotos: readonly Foto[] | null;
  hojeKey: string;
  quem: QuemVeOsCartoes;
  amb: AmbienteDosCartoes;
}): CartaoPronto {
  const base = { chave: def.chave, rotulo: def.rotulo, icone: def.icone, href: def.href(quem, amb) };
  if (!numero || !Number.isFinite(numero.valor)) return { ...base, numero: null, variacao: null, linha: null };
  const metrica = METRICAS[def.chave];
  const texto = metrica.formato === "moeda" ? moeda(numero.valor) : NUMERO.format(numero.valor);
  const apoio = def.fracao && numero.total !== undefined ? `de ${NUMERO.format(numero.total)}` : numero.apoio;
  const linha = fotos ? pontosDaLinha(fotos, hojeKey, numero.valor, JANELA_DO_CARTAO_DIAS) : null;
  return {
    ...base,
    numero: { texto, ...(apoio ? { apoio } : {}), ...(numero.detalhe ? { detalhe: numero.detalhe } : {}), tom: def.tom(numero) },
    variacao: fotos ? variacaoDesdeOntem(fotos, hojeKey, numero.valor, metrica) : null,
    linha: linha ? linha.map((p) => ({ x: p.x, y: p.y })) : null,
  };
}

/**
 * As linhas da lista "Trocar este cartão": os cartões que a pessoa vê,
 * agrupados por setor na ordem de `ordemDosGrupos`, e dentro do grupo na
 * ordem do catálogo.
 */
export function opcoesDosCartoes(
  disponiveis: readonly DefinicaoDoCartao[],
  quem: QuemVeOsCartoes,
  amb: AmbienteDosCartoes,
  setoresDoEscritorio: readonly { code: string; label: string }[]
): OpcaoDoCartao[] {
  const rotulo = new Map(setoresDoEscritorio.map((s) => [s.code, s.label]));
  const ordem = ordemDosGrupos(
    quem.activeSector,
    setoresDoEscritorio.map((s) => s.code)
  );
  // Setor fora da lista (desativado no cadastro, com o módulo ainda ligado):
  // depois dos outros setores e antes de "Todos os setores".
  const peso = (grupo: string) => {
    const i = ordem.indexOf(grupo);
    return i < 0 ? ordem.length - 1.5 : i;
  };
  return disponiveis
    .map((d, i) => ({ d, i }))
    .sort((a, b) => peso(a.d.setor) - peso(b.d.setor) || a.i - b.i)
    .map(({ d }) => ({
      chave: d.chave,
      rotulo: d.rotulo,
      grupo: d.setor,
      grupoRotulo: d.setor === TODOS ? "Todos os setores" : (rotulo.get(d.setor) ?? DEFAULT_SECTOR_LABELS[d.setor] ?? d.setor),
      icone: d.icone,
      href: d.href(quem, amb),
    }));
}
