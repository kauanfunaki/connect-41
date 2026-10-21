// As ferramentas da Ceci no portal do cliente — só leitura (21/10/2026, fase 2).
//
// ─── Quem pergunta é o cliente, não a equipe ────────────────────────────────
//
// As ferramentas da equipe veem o escritório inteiro e pedem `buscar_empresa`.
// Aqui não: a régua é o `EscopoDoAcesso` (src/lib/portal/escopoDoAcesso.ts), lido
// do banco **a cada chamada** pela conta que abriu o chat — o id da conta vem
// em `ctx.escopo.portalUserId`, posto pelo servidor a partir da sessão do
// portal, nunca pelo modelo. A empresa que o modelo pede só estreita esse
// escopo; empresa fora dele é "não encontrada".
//
// ─── O que a Ceci do portal pode dizer ──────────────────────────────────────
//
// O que o portal já mostra a este cliente, e nada além:
// - a tela tem de estar visível para ele (módulo ligado e não bloqueada pelo
//   escritório, `telasVisiveis`) — tela que o cliente não vê, a Ceci não lê;
// - as consultas são as das telas do portal (`contasDoEscopo`,
//   `listarPendencias`, `processosDoPortal`, `listarDoCliente`...), já
//   travadas pela fase 1 (`travaDasConsultas.test.ts`);
// - os campos que voltam são os que a tela mostra. Fica de fora o que é da
//   equipe: mensagem interna e responsável da solicitação, destino da nota no
//   financeiro (lançada/ignorada), setor que pediu, ids de lançamento.
//
// Nenhuma ferramenta daqui escreve. A solicitação pré-preenchida (fase 3,
// `portal_preparar_solicitacao`) é proposta, que o próprio cliente revisa e
// envia pela tela.

import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { getEnabledModuleCodes } from "@/lib/modules";
import { saoPauloParts } from "@/lib/agenda";
import { lerTelasBloqueadas } from "@/lib/portal/telasBloqueadas";
import { telasVisiveis } from "@/lib/portal/telas";
import {
  acessoVeEmpresa,
  alcanceFiscalDoAcesso,
  escopoDePendenciasDoAcesso,
  escopoDoClienteDoAcesso,
  escopoFinanceiroDoAcesso,
  naEmpresa,
  type EscopoDoAcesso,
} from "@/lib/portal/escopoDoAcesso";
import { lerEscopoDaCeci } from "@/lib/portal/ceci";
import { contasDoEscopo, empresasDoSeletor, totaisDoEscopo } from "@/lib/financeiro/consultas";
import { carregarPendencia, listarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO } from "@/lib/financeiro/pendencias/regras";
import { ROTULO_DA_APROVACAO } from "@/lib/financeiro/aprovacao/regras";
import { contarDocumentos, listarDocumentos } from "@/lib/fiscal/data";
import { TIPO_LABEL } from "@/lib/fiscal/rotulos";
import { carregarSolicitacao, listarDoCliente, type RecorteDoCliente } from "@/lib/solicitacoes/consultas";
import { ROTULO_PARA_CLIENTE } from "@/lib/solicitacoes/regras";
import { assuntosAtivos } from "@/lib/solicitacoes/assuntos";
import { processoDoPortal, processosDoPortal, type ProcessoNoPortal } from "@/lib/societario/portal-data";
import { SITUACAO_PARA_CLIENTE, STATUS_DA_ETAPA_PARA_CLIENTE } from "@/lib/societario/portal";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { nomeExibicao } from "@/lib/companyName";
import { linkDaTela, mesLegivel, situacaoLegivel } from "@/lib/ia/legivel";
import { competenciaOpcional, link, reais } from "@/lib/ia/ferramentas-bpo";

/** O prefixo de toda ferramenta daqui — e só daqui (`ferramentas-portal.test.ts`). */
export const PREFIXO_DO_PORTAL = "portal_";

/** A ferramenta que prepara a solicitação (vira proposta, nunca grava). */
export const SOLICITACAO_PREPARADA = "portal_preparar_solicitacao";

/** Linhas mostradas por lista; o total vem à parte. */
const LINHAS = 20;

/** Mensagens da conversa de uma pendência ou solicitação que vão ao modelo: as últimas. */
const MENSAGENS = 10;

/** Corte de cada texto livre (mensagem, descrição) — o modelo não precisa do e-mail inteiro colado. */
const CARACTERES = 1_500;

/** O que a ferramenta do portal tem na mão: o escopo do acesso e as telas que ele vê. */
export type PortalDaFerramenta = { acesso: EscopoDoAcesso; telas: ReadonlySet<string> };

/**
 * Abre o portal para a ferramenta: confere que quem chama é um acesso do
 * portal e lê do banco as empresas e as telas dele. As empresas são as do
 * acesso com a Ceci ligada pelo escritório (fase 3, `src/lib/portal/ceci.ts`):
 * empresa fora do piloto não existe para a Ceci, mesmo sendo do acesso.
 *
 * Recusa a conversa da equipe (`userId` preenchido): um agente da equipe com
 * esta ferramenta na allowlist por engano leria pelo escopo de um cliente que
 * ele não escolheu — o catálogo também impede, e o teste confere os dois.
 */
export async function abrirPortal(ctx: ContextoDaFerramenta): Promise<PortalDaFerramenta> {
  const portalUserId = ctx.escopo.portalUserId;
  if (ctx.userId !== null || !portalUserId) throw new Error("Esta consulta é só do portal do cliente.");
  const [acesso, modulos, bloqueadas] = await Promise.all([
    lerEscopoDaCeci(ctx.tenantId, portalUserId),
    getEnabledModuleCodes(ctx.tenantId),
    lerTelasBloqueadas(ctx.tenantId),
  ]);
  return { acesso, telas: new Set(telasVisiveis(modulos, bloqueadas.bloqueadas).map((t) => t.href)) };
}

/** A tela tem de estar no portal deste cliente — a Ceci não lê o que ele não vê. */
export function exigirTela(p: PortalDaFerramenta, href: string): void {
  if (!p.telas.has(href)) throw new Error("Esta informação não está disponível no seu portal. Fale com o escritório.");
}

function textoOpcional(argumentos: Record<string, unknown>, campo: string): string | undefined {
  const v = argumentos[campo];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function textoObrigatorio(argumentos: Record<string, unknown>, campo: string): string {
  const v = textoOpcional(argumentos, campo);
  if (!v) throw new Error(`Informe ${campo}.`);
  return v;
}

/** O escopo na empresa pedida — empresa fora do acesso é "não encontrada", nunca "todas". */
export function escopoDaEmpresaPedida(acesso: EscopoDoAcesso, argumentos: Record<string, unknown>): EscopoDoAcesso {
  const id = textoOpcional(argumentos, "empresaId");
  if (id && !acessoVeEmpresa(acesso, id)) throw new Error("Empresa não encontrada entre as suas. Use portal_empresas para ver as empresas do seu acesso.");
  return naEmpresa(acesso, id);
}

/** Corta texto livre, avisando que cortou. */
export function cortar(texto: string | null | undefined, limite = CARACTERES): string | null {
  if (!texto) return null;
  return texto.length > limite ? `${texto.slice(0, limite)}… (continua na tela)` : texto;
}

/** Data como o portal escreve (dd/mm/aaaa, em São Paulo). */
export function dia(d: Date | null | undefined): string | null {
  if (!d) return null;
  const { dateKey } = saoPauloParts(d);
  const [a, m, di] = dateKey.split("-");
  return `${di}/${m}/${a}`;
}

const EMPRESA_OPCIONAL = { type: "string", description: "O id de portal_empresas, ou \"\" para todas as suas empresas" } as const;

/** A situação da conta como o portal escreve. */
const SITUACAO_DA_CONTA: Readonly<Record<string, string>> = {
  VENCIDA: "vencida",
  VENCE_HOJE: "vence hoje",
  A_VENCER: "a vencer",
  PAGA: "paga",
  CANCELADA: "cancelada",
};

/** O status da pendência como o portal escreve (`rotuloDoStatus` da tela). */
const STATUS_DA_PENDENCIA: Readonly<Record<string, string>> = {
  ABERTA: "aguardando você",
  RESPONDIDA: "com a equipe",
  RESOLVIDA: "resolvida",
  CANCELADA: "cancelada",
};

const PROCESSO_ENCERRADO = ["CONCLUIDO", "CANCELADO", "INDEFERIDO"];

/** Uma mensagem de conversa como o cliente a vê na tela: quem, quando, o quê. */
function mensagemParaOModelo(m: { lado: string; autorNome: string; corpo: string; criadaEm: Date; anexos: { fileName: string }[] }) {
  return {
    de: m.lado === "CLIENTE" ? `${m.autorNome} (cliente)` : `${m.autorNome} (escritório)`,
    em: dia(m.criadaEm),
    texto: cortar(m.corpo),
    anexos: m.anexos.map((a) => a.fileName),
  };
}

function resumoDoProcesso(p: ProcessoNoPortal) {
  return {
    id: p.id,
    processo: p.titulo || p.tipoNome,
    tipo: p.tipoNome,
    empresa: p.empresaNome,
    situacao: SITUACAO_PARA_CLIENTE[p.situacao].rotulo,
    explicacao: SITUACAO_PARA_CLIENTE[p.situacao].explicacao,
    motivo: p.motivo,
    previsao: p.previsao,
    iniciadoEm: dia(p.iniciadoEm),
    concluidoEm: dia(p.concluidoEm),
    etapas: `${p.progresso.feitas} de ${p.progresso.total} concluídas`,
    exigenciasAbertas: p.exigenciasAbertas,
  };
}

export const FERRAMENTAS_DO_PORTAL: Record<string, FerramentaRegistrada> = {
  portal_empresas: {
    def: {
      nome: "portal_empresas",
      descricao:
        "As empresas desta pessoa sobre as quais você pode responder (com as filiais), com o id que as outras ferramentas aceitam para filtrar. Só estas empresas existem para você.",
      parametros: { type: "object", properties: {}, additionalProperties: false },
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const { acesso } = await abrirPortal(ctx);
      const empresas = await empresasDoSeletor(acesso.tenantId, [...acesso.companyIds]);
      return { empresas: empresas.map((e) => ({ id: e.id, nome: e.nome, cnpj: e.cnpj ?? null })) };
    },
  },

  portal_pendencias: {
    def: {
      nome: "portal_pendencias",
      descricao:
        "As pendências que o escritório pediu às empresas desta pessoa (documento, informação ou confirmação), com prazo e situação, como na tela Pendências. Recorte: em andamento, aguardando a pessoa, ou encerradas.",
      parametros: {
        type: "object",
        properties: {
          recorte: { type: "string", enum: ["andamento", "aguardando", "encerradas"] },
          empresaId: EMPRESA_OPCIONAL,
        },
        required: ["recorte", "empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/pendencias");
      const escopo = escopoDaEmpresaPedida(p.acesso, args);
      const recorte = args.recorte === "aguardando" || args.recorte === "encerradas" ? args.recorte : "andamento";
      const { linhas, contadores } = await listarPendencias(escopoDePendenciasDoAcesso(escopo), { recorte }, new Date());
      return {
        recorte,
        aguardandoVoce: contadores.aguardando,
        comAEquipe: contadores.respondidas,
        vencidas: contadores.vencidas,
        total: linhas.length,
        mostrando: Math.min(linhas.length, LINHAS),
        link: linkDaTela("Abrir as pendências", link("/portal/pendencias", { recorte })),
        pendencias: linhas.slice(0, LINHAS).map((l) => ({
          id: l.id,
          titulo: l.titulo,
          tipo: situacaoLegivel(l.tipo, ROTULO_DO_TIPO),
          situacao: situacaoLegivel(l.status, STATUS_DA_PENDENCIA),
          prazo: dia(l.prazo),
          empresa: l.empresaNome,
          link: linkDaTela(l.titulo, `/portal/pendencias/${l.id}`),
        })),
      };
    },
  },

  portal_pendencia: {
    def: {
      nome: "portal_pendencia",
      descricao: "Uma pendência por id (de portal_pendencias): o que o escritório pediu, o prazo e a conversa, como na tela da pendência.",
      parametros: {
        type: "object",
        properties: { id: { type: "string", description: "O id que veio de portal_pendencias" } },
        required: ["id"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/pendencias");
      const d = await carregarPendencia(escopoDePendenciasDoAcesso(p.acesso), textoObrigatorio(args, "id"), new Date());
      if (!d) throw new Error("Pendência não encontrada entre as suas.");
      return {
        titulo: d.titulo,
        tipo: situacaoLegivel(d.tipo, ROTULO_DO_TIPO),
        situacao: situacaoLegivel(d.status, STATUS_DA_PENDENCIA),
        empresa: d.empresaNome,
        prazo: dia(d.prazo),
        pedidaEm: dia(d.abertaEm),
        resolvidaEm: dia(d.resolvidaEm),
        oQueFoiPedido: cortar(d.descricao),
        // A conta ligada aparece na tela como contraparte, valor e vencimento — o id fica de fora.
        conta: d.lancamento
          ? { contraparte: d.lancamento.contraparteNome, valor: Number(d.lancamento.valor), vencimento: dia(d.lancamento.vencimento) }
          : null,
        anexosDoPedido: d.anexosDaAbertura.map((a) => a.fileName),
        mensagensAnteriores: Math.max(0, d.mensagens.length - MENSAGENS),
        mensagens: d.mensagens.slice(-MENSAGENS).map(mensagemParaOModelo),
        link: linkDaTela("Abrir a pendência", `/portal/pendencias/${d.id}`),
      };
    },
  },

  portal_contas: {
    def: {
      nome: "portal_contas",
      descricao:
        "Contas a pagar ou a receber das empresas desta pessoa, com os totais (vencido, vence hoje, a vencer, pago, em aberto) e até 20 contas. Situação: abertas, vencidas ou todas.",
      parametros: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["PAGAR", "RECEBER"] },
          situacao: { type: "string", enum: ["abertas", "vencidas", "todas"] },
          empresaId: EMPRESA_OPCIONAL,
        },
        required: ["tipo", "situacao", "empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      const tipo = args.tipo === "RECEBER" ? "RECEBER" : "PAGAR";
      const tela = tipo === "PAGAR" ? "/portal/pagar" : "/portal/receber";
      exigirTela(p, tela);
      const escopo = escopoFinanceiroDoAcesso(escopoDaEmpresaPedida(p.acesso, args));
      const hojeKey = saoPauloParts(new Date()).dateKey;
      const [contas, totais] = await Promise.all([contasDoEscopo(escopo, tipo, hojeKey), totaisDoEscopo(escopo, tipo, hojeKey)]);
      const situacao = args.situacao === "vencidas" || args.situacao === "todas" ? args.situacao : "abertas";
      const doRecorte = contas.filter((c) =>
        situacao === "vencidas" ? c.situacao === "VENCIDA" : situacao === "abertas" ? c.situacao !== "PAGA" && c.situacao !== "CANCELADA" : true
      );
      // Abertas e vencidas: o vencimento mais próximo primeiro, que é a ordem de quem paga.
      if (situacao !== "todas") doRecorte.sort((a, b) => a.vencimentoKey.localeCompare(b.vencimentoKey));
      return {
        tipo: tipo === "PAGAR" ? "a pagar" : "a receber",
        totais: {
          vencido: reais(totais.vencido),
          venceHoje: reais(totais.venceHoje),
          aVencer: reais(totais.aVencer),
          pago: reais(totais.pago),
          emAberto: reais(totais.emAberto),
        },
        contasNoRecorte: doRecorte.length,
        mostrando: Math.min(doRecorte.length, LINHAS),
        link: linkDaTela(`Abrir as contas ${tipo === "PAGAR" ? "a pagar" : "a receber"}`, tela),
        contas: doRecorte.slice(0, LINHAS).map((c) => ({
          empresa: c.empresaNome,
          contraparte: c.contraparteNome,
          descricao: c.descricao,
          categoria: c.categoriaNome,
          valor: reais(c.valorCentavos),
          vencimento: dia(c.vencimento),
          pagaEm: dia(c.pagoEm),
          situacao: situacaoLegivel(c.situacao, SITUACAO_DA_CONTA),
          aprovacao: c.aprovacao ? situacaoLegivel(c.aprovacao, ROTULO_DA_APROVACAO) : null,
        })),
      };
    },
  },

  portal_notas: {
    def: {
      nome: "portal_notas",
      descricao:
        "As notas fiscais emitidas e recebidas pelas empresas desta pessoa, como na tela Documentos fiscais: as 20 mais recentes do filtro e o total. Filtra por empresa, competência (AAAA-MM) e busca (número da nota ou nome do emitente/destinatário).",
      parametros: {
        type: "object",
        properties: {
          empresaId: EMPRESA_OPCIONAL,
          competencia: { type: "string", description: "AAAA-MM, ou \"\" para todas" },
          busca: { type: "string", description: "Número da nota ou nome da contraparte, ou \"\"" },
        },
        required: ["empresaId", "competencia", "busca"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/documentos");
      // O alcance é o do acesso inteiro e a empresa vai no filtro: a consulta
      // cruza os dois (fase 1). `escopoDaEmpresaPedida` só recusa antes a
      // empresa de fora, para o modelo saber que o pedido não valia.
      escopoDaEmpresaPedida(p.acesso, args);
      const competencia = competenciaOpcional(args);
      const busca = textoOpcional(args, "busca")?.slice(0, 100);
      const alcance = alcanceFiscalDoAcesso(p.acesso);
      const filtro = { companyId: textoOpcional(args, "empresaId"), competencia, busca };
      const [{ documentos }, contagem] = await Promise.all([listarDocumentos(alcance, filtro), contarDocumentos(alcance, filtro)]);
      return {
        total: contagem.total,
        totalLimitado: contagem.limitado ? "há mais do que isso; filtre por empresa e competência" : undefined,
        competencia: competencia ? mesLegivel(competencia) : "todas",
        mostrando: Math.min(documentos.length, LINHAS),
        link: linkDaTela("Abrir os documentos fiscais", link("/portal/documentos", { empresa: filtro.companyId, competencia })),
        notas: documentos.slice(0, LINHAS).map((d) => ({
          tipo: TIPO_LABEL[d.type] ?? d.type,
          numero: d.number,
          serie: d.series,
          empresa: nomeExibicao(d.company),
          emitente: d.issuerName,
          destinatario: d.recipientName,
          valor: Number(d.amount),
          emitidaEm: dia(d.issuedAt),
          competencia: mesLegivel(d.competence),
        })),
      };
    },
  },

  portal_processos: {
    def: {
      nome: "portal_processos",
      descricao:
        "Os processos societários das empresas desta pessoa (abertura, alteração, baixa, licenças), com situação, previsão e exigências abertas, como na tela Processos. Recorte: em andamento, aguardando a pessoa, ou encerrados.",
      parametros: {
        type: "object",
        properties: {
          recorte: { type: "string", enum: ["abertos", "aguardando", "encerrados"] },
          empresaId: EMPRESA_OPCIONAL,
        },
        required: ["recorte", "empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/processos");
      const escopo = escopoDoClienteDoAcesso(escopoDaEmpresaPedida(p.acesso, args));
      const todos = await processosDoPortal(escopo.tenantId, escopo.companyIds, new Date(), await feriadosDoTenant(escopo.tenantId));
      const encerrado = (x: ProcessoNoPortal) => PROCESSO_ENCERRADO.includes(x.situacao);
      const recorte = args.recorte === "aguardando" || args.recorte === "encerrados" ? args.recorte : "abertos";
      const linhas =
        recorte === "encerrados"
          ? todos.filter(encerrado)
          : todos.filter((x) => !encerrado(x) && (recorte === "abertos" || x.situacao === "AGUARDANDO_CLIENTE"));
      return {
        recorte,
        total: linhas.length,
        mostrando: Math.min(linhas.length, LINHAS),
        link: linkDaTela("Abrir os processos", link("/portal/processos", { recorte })),
        processos: linhas.slice(0, LINHAS).map((x) => ({ ...resumoDoProcesso(x), link: linkDaTela(x.titulo || x.tipoNome, `/portal/processos/${x.id}`) })),
      };
    },
  },

  portal_processo: {
    def: {
      nome: "portal_processo",
      descricao: "Um processo por id (de portal_processos): etapas, exigências do órgão e taxas, como na tela do processo.",
      parametros: {
        type: "object",
        properties: { id: { type: "string", description: "O id que veio de portal_processos" } },
        required: ["id"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/processos");
      const escopo = escopoDoClienteDoAcesso(p.acesso);
      const d = await processoDoPortal(escopo.tenantId, escopo.companyIds, textoObrigatorio(args, "id"), new Date(), await feriadosDoTenant(escopo.tenantId));
      if (!d) throw new Error("Processo não encontrado entre os seus.");
      return {
        ...resumoDoProcesso(d),
        etapas: d.etapas.map((e) => ({
          etapa: e.rotulo,
          orgao: e.orgao,
          situacao: e.status === "DISPENSADA" ? null : STATUS_DA_ETAPA_PARA_CLIENTE[e.status],
        })),
        exigencias: d.exigencias.map((e) => ({
          orgao: e.orgao,
          oQueFoiPedido: cortar(e.descricao),
          abertaEm: dia(e.abertaEm),
          prazo: dia(e.prazo),
          resolvidaEm: dia(e.resolvidaEm),
        })),
        taxas: d.taxas.map((t) => ({ descricao: t.descricao, valor: reais(t.centavos), vencimento: dia(t.vencimento), pagaEm: dia(t.pagaEm) })),
        link: linkDaTela("Abrir o processo", `/portal/processos/${d.id}`),
      };
    },
  },

  portal_solicitacoes: {
    def: {
      nome: "portal_solicitacoes",
      descricao:
        "As solicitações que esta pessoa abriu para o escritório, com número, assunto, situação e prazo de resposta, como na tela Solicitações. Recorte: abertas, aguardando a pessoa, ou encerradas.",
      parametros: {
        type: "object",
        properties: {
          recorte: { type: "string", enum: ["abertas", "aguardando", "encerradas"] },
          empresaId: EMPRESA_OPCIONAL,
        },
        required: ["recorte", "empresaId"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/solicitacoes");
      const escopo = escopoDoClienteDoAcesso(escopoDaEmpresaPedida(p.acesso, args));
      const recorte: RecorteDoCliente = args.recorte === "aguardando" || args.recorte === "encerradas" ? args.recorte : "abertas";
      const linhas = await listarDoCliente(escopo, recorte);
      return {
        recorte,
        total: linhas.length,
        mostrando: Math.min(linhas.length, LINHAS),
        link: linkDaTela("Abrir as solicitações", link("/portal/solicitacoes", { recorte })),
        solicitacoes: linhas.slice(0, LINHAS).map((s) => ({
          id: s.id,
          numero: s.numero,
          assunto: s.assunto,
          empresa: s.empresaNome,
          situacao: situacaoLegivel(s.status, ROTULO_PARA_CLIENTE),
          respostaAte: dia(s.prazo),
          respondidaEm: dia(s.respondidaEm),
          link: linkDaTela(`Solicitação nº ${s.numero}`, `/portal/solicitacoes/${s.id}`),
        })),
      };
    },
  },

  portal_solicitacao: {
    def: {
      nome: "portal_solicitacao",
      descricao: "Uma solicitação por id (de portal_solicitacoes): o que foi pedido, a situação e a conversa com o escritório, como na tela da solicitação.",
      parametros: {
        type: "object",
        properties: { id: { type: "string", description: "O id que veio de portal_solicitacoes" } },
        required: ["id"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/solicitacoes");
      const s = await carregarSolicitacao({ lado: "CLIENTE", escopo: escopoDoClienteDoAcesso(p.acesso) }, textoObrigatorio(args, "id"), new Date());
      if (!s) throw new Error("Solicitação não encontrada entre as suas.");
      // A consulta do lado do cliente já tira a mensagem interna; tira de novo
      // aqui, porque o que vai ao modelo pode virar texto na tela do cliente.
      const mensagens = s.mensagens.filter((m) => !m.interna);
      return {
        numero: s.numero,
        assunto: s.assunto,
        empresa: s.empresaNome,
        situacao: situacaoLegivel(s.status, ROTULO_PARA_CLIENTE),
        respostaAte: dia(s.prazo),
        abertaPor: s.abertaPor,
        abertaEm: dia(s.abertaEm),
        encerradaEm: dia(s.encerradaEm),
        oQueFoiPedido: cortar(s.descricao),
        anexosDoPedido: s.anexosDaAbertura.map((a) => a.fileName),
        mensagensAnteriores: Math.max(0, mensagens.length - MENSAGENS),
        mensagens: mensagens.slice(-MENSAGENS).map(mensagemParaOModelo),
        link: linkDaTela(`Abrir a solicitação nº ${s.numero}`, `/portal/solicitacoes/${s.id}`),
      };
    },
  },

  portal_assuntos: {
    def: {
      nome: "portal_assuntos",
      descricao:
        "Os assuntos que esta pessoa pode escolher ao abrir uma solicitação para o escritório, com o prazo de resposta de cada um. Use antes de sugerir uma solicitação.",
      parametros: { type: "object", properties: {}, additionalProperties: false },
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const p = await abrirPortal(ctx);
      exigirTela(p, "/portal/solicitacoes");
      const assuntos = await assuntosAtivos(p.acesso.tenantId);
      return {
        assuntos: assuntos.map((a) => ({ id: a.id, assunto: a.label, quando: a.description, respostaEmDiasUteis: a.responseDays })),
      };
    },
  },

  // A única que não é leitura, e ela não grava nada: é `escrita` sem
  // `executar`, então o laço a transforma em proposta (`viraProposta`). Quem
  // responde (`src/lib/ia/portal/responder.ts`) confere a empresa e o assunto
  // e devolve ao chat um link para a tela de nova solicitação já preenchida —
  // o cliente revisa, muda o que quiser e envia ele mesmo, pela action de
  // sempre. (21/10/2026, fase 3.)
  [SOLICITACAO_PREPARADA]: {
    def: {
      nome: SOLICITACAO_PREPARADA,
      descricao:
        "Prepara uma solicitação para a pessoa abrir no escritório — ela revisa e envia ela mesma na tela de nova solicitação. NADA é enviado por você. Use quando o que a pessoa precisa é com a equipe (pedir um documento, uma correção, uma dúvida que os dados não respondem), depois de portal_assuntos. A descrição é em primeira pessoa, como se a pessoa tivesse escrito, com os detalhes que ela deu.",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id de portal_empresas" },
          assuntoId: { type: "string", description: "O id de portal_assuntos" },
          descricao: { type: "string", description: "O que a pessoa precisa, com período, nomes e números que ela disse" },
        },
        required: ["empresaId", "assuntoId", "descricao"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
