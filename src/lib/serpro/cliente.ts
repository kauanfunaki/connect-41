// O cliente do Integra Contador: configuração, token, chamada, teto e registro.
//
// Toda chamada passa por `chamarSerpro`, que é o único caminho: confere se a
// ligação está pronta, se cabe no teto do mês, chama, e grava a linha em
// `serpro_calls` — inclusive quando deu erro, porque o 403 também é cobrado.
//
// Desde 20/10/2026 (Fase 0 do Integra Contador, estudo em
// connect-41/estudos/2026-10-20/integra-contador.md, fora do git):
// - o modo demonstração, que fala com o trial do Serpro sem contrato;
// - o serviço tem de estar no catálogo (servicos.ts), e a chamada paga passa
//   antes pelo portão da Autorização de Acesso (portao.ts);
// - o 304 é sucesso, o 204 traz o novo tempo de espera no ETag, e cada
//   chamada leva e grava o X-Request-Tag.

import { getPrisma } from "@/lib/prisma";
import { executar, lerConfig } from "@/lib/integracoes/data";
import { camposFaltando, integracaoDoCatalogo } from "@/lib/integracoes/catalogo";
import { hojeIso } from "@/lib/datas/calendario";
import { formatCnpj } from "@/lib/format";
import { lerCertificado, TAMANHO_MAXIMO_DO_CERTIFICADO, type CertificadoLido } from "./certificado";
import { transporteHttps, type CabecalhosDaResposta, type RespostaHttps, type Transporte } from "./transporte";
import { podeChamar } from "./portao";
import { EXEMPLO_DA_DEMONSTRACAO, servicoDoCatalogo } from "./servicos";
import {
  cabeNoTeto,
  CODIGO_DA_INTEGRACAO,
  codigosDasMensagens,
  CONTAGEM_VAZIA,
  corpoDoPedido,
  custoDoMes,
  explicarErro,
  foiCobrada,
  lerAmbiente,
  lerResposta,
  lerTeto,
  reais,
  tagDaRequisicao,
  temMensagemDeErro,
  tempoDeEsperaDoEtag,
  tipoDeCobranca,
  TIPOS_DE_COBRANCA,
  type Ambiente,
  type ContagemDoMes,
  type CustoDoMes,
  type PedidoAoSerpro,
  type RespostaLida,
} from "./regras";

const URL_DE_AUTENTICACAO = "https://autenticacao.sapi.serpro.gov.br/authenticate";
const URL_DO_GATEWAY: Record<Ambiente, string> = {
  producao: "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1",
  // A demonstração (trial): o mesmo envelope da produção, com dados fictícios.
  demonstracao: "https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1",
};
/** O gateway corta em 30 s; aqui, um pouco depois, para receber o 504 dele. */
const TEMPO_DA_CHAMADA_MS = 35_000;
const TEMPO_DO_TOKEN_MS = 20_000;

/**
 * O token da demonstração é público: está impresso no swagger oficial do trial
 * (apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/
 * chamadas/demonstracao/api-integra-contador-trial-sp.yaml). Vem de variável
 * de ambiente porque, escrito no código, o GitGuardian barra o PR.
 */
export function tokenDaDemonstracao(): string | null {
  return process.env.SERPRO_TRIAL_TOKEN?.trim() || null;
}

// ─── Configuração ────────────────────────────────────────────────────────────

export type ConfiguracaoDoSerpro = {
  integrationId: string;
  ligada: boolean;
  ambiente: Ambiente;
  atualizadaEm: Date;
  faltando: string[];
  consumerKey: string;
  consumerSecret: string;
  pfx: Buffer | null;
  senha: string;
  tetoCentavos: number | null;
  certificado: CertificadoLido | null;
  /** Quem recebe as autorizações (só dígitos): é o autor de cada pedido. */
  escritorio: { nome: string; cnpj: string } | null;
};

/** A conexão do Serpro do tenant, decifrada. null = ninguém conectou. Só no servidor. */
export async function configuracaoDoSerpro(tenantId: string): Promise<ConfiguracaoDoSerpro | null> {
  const prisma = getPrisma();
  const [conexao, recebe] = await Promise.all([
    prisma.tenantIntegration.findUnique({
      where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: CODIGO_DA_INTEGRACAO, instanceKey: "default" } },
      select: { id: true, enabled: true, configEnc: true, updatedAt: true },
    }),
    prisma.accessAuthorizationGrantee.findUnique({ where: { tenantId }, select: { name: true, cnpj: true } }),
  ]);
  if (!conexao) return null;
  const config = lerConfig(conexao.configEnc);
  const pfx = config.certificado ? Buffer.from(config.certificado, "base64") : null;
  const certificado = pfx && config.senhaDoCertificado ? lerCertificado(pfx, config.senhaDoCertificado) : null;
  return {
    integrationId: conexao.id,
    ligada: conexao.enabled,
    ambiente: lerAmbiente(config.ambiente),
    atualizadaEm: conexao.updatedAt,
    faltando: camposFaltando(integracaoDoCatalogo(CODIGO_DA_INTEGRACAO)!, config),
    consumerKey: config.consumerKey ?? "",
    consumerSecret: config.consumerSecret ?? "",
    // O A1 antigo guardado antes de 20/10/2026 vai convertido na conexão.
    pfx: certificado?.ok && certificado.convertido ? certificado.convertido : pfx,
    senha: config.senhaDoCertificado ?? "",
    tetoCentavos: lerTeto(config.tetoMensal),
    certificado,
    escritorio: recebe ? { nome: recebe.name, cnpj: recebe.cnpj } : null,
  };
}

/**
 * Conferência ao salvar a conexão: o certificado abre com a senha e não venceu,
 * e o teto é um valor em reais. Erro aqui é melhor que um 401 na primeira chamada.
 * O A1 em formato antigo (RC2) é guardado já convertido para o moderno (20/10/2026).
 */
export function validarConfigDoSerpro(config: Record<string, string>): string | null | { config: Record<string, string> } {
  let ajustada: Record<string, string> | null = null;
  if (config.certificado) {
    const pfx = Buffer.from(config.certificado, "base64");
    if (pfx.length > TAMANHO_MAXIMO_DO_CERTIFICADO) return "Arquivo grande demais para um certificado A1.";
    if (config.senhaDoCertificado) {
      const c = lerCertificado(pfx, config.senhaDoCertificado);
      if (!c.ok) return c.erro;
      if (c.validoAte && c.validoAte < hojeIso()) return `O certificado venceu em ${c.validoAte.split("-").reverse().join("/")}.`;
      if (c.convertido) ajustada = { ...config, certificado: c.convertido.toString("base64") };
    }
  }
  if (config.tetoMensal && lerTeto(config.tetoMensal) === null) return "Teto mensal inválido: use um valor em reais, como 400 ou 1.250,00.";
  return ajustada ? { config: ajustada } : null;
}

/**
 * Dá para chamar o Serpro? O motivo, quando não, é o que a tela mostra.
 *
 * Contratante e autor do pedido são o mesmo CNPJ por enquanto: o escritório
 * contrata e pede em nome próprio. Contratante diferente (a empresa do Connect
 * atendendo vários escritórios) exige o termo de autorização assinado pelo
 * escritório, que espera a decisão de em nome de quem contratar.
 */
export function prontidaoDoSerpro(cfg: ConfiguracaoDoSerpro | null, hoje = hojeIso()): { pronta: true } | { pronta: false; motivo: string } {
  if (!cfg) return { pronta: false, motivo: "O Serpro ainda não foi conectado (Configurações › Integrações)." };
  if (cfg.faltando.length) return { pronta: false, motivo: `Falta preencher na conexão do Serpro: ${cfg.faltando.join(", ")}.` };
  if (!cfg.ligada) return { pronta: false, motivo: "A conexão com o Serpro está desligada." };
  // Na demonstração não há chave, certificado, teto nem cliente de verdade
  // (20/10/2026): basta o token público.
  if (cfg.ambiente === "demonstracao") {
    return tokenDaDemonstracao()
      ? { pronta: true }
      : {
          pronta: false,
          motivo: "A demonstração do Serpro precisa do token público na variável SERPRO_TRIAL_TOKEN do servidor (está no swagger do trial, na documentação do Serpro).",
        };
  }
  if (!cfg.certificado || !cfg.certificado.ok) return { pronta: false, motivo: cfg.certificado?.ok === false ? cfg.certificado.erro : "Falta o certificado do Serpro." };
  if (cfg.certificado.validoAte && cfg.certificado.validoAte < hoje) {
    return { pronta: false, motivo: `O certificado do Serpro venceu em ${cfg.certificado.validoAte.split("-").reverse().join("/")}.` };
  }
  if (cfg.tetoCentavos === null) return { pronta: false, motivo: "O teto mensal do Serpro está inválido." };
  if (!cfg.escritorio) return { pronta: false, motivo: "Falta definir quem recebe as autorizações (em Autorizações de acesso)." };
  if (cfg.certificado.cnpj && cfg.certificado.cnpj !== cfg.escritorio.cnpj) {
    return {
      pronta: false,
      motivo: `O certificado é do CNPJ ${formatCnpj(cfg.certificado.cnpj)} e quem recebe as autorizações é ${formatCnpj(cfg.escritorio.cnpj)}. Por enquanto os dois precisam ser o mesmo: o termo de autorização, que permitiria contratar por outro CNPJ, ainda não está no Connect.`,
    };
  }
  return { pronta: true };
}

/** O CNPJ que contrata: o do certificado, ou, sem ele legível, o de quem recebe. */
function contratante(cfg: ConfiguracaoDoSerpro): string {
  return (cfg.certificado?.ok && cfg.certificado.cnpj) || cfg.escritorio!.cnpj;
}

/** Contratante e autor do corpo. Na demonstração, os do cenário: o trial confere os dois. */
function partesDoPedido(cfg: ConfiguracaoDoSerpro, pedido: PedidoAoSerpro): { contratante: string; autor: string } {
  if (cfg.ambiente === "demonstracao" && pedido.partesDaDemonstracao) return pedido.partesDaDemonstracao;
  return { contratante: contratante(cfg), autor: cfg.escritorio!.cnpj };
}

export const SO_EXEMPLOS_NA_DEMONSTRACAO =
  "A conexão do Serpro está em demonstração, que só responde aos exemplos fictícios da documentação: o pedido com dados de um cliente não é enviado.";

// ─── Token ───────────────────────────────────────────────────────────────────

type Token = { access: string; jwt: string; expiraEm: number };
// Por conexão e versão da configuração: salvar credencial nova invalida o token.
const tokens = new Map<string, Token>();
const chaveDoToken = (cfg: ConfiguracaoDoSerpro) => `${cfg.integrationId}:${cfg.atualizadaEm.getTime()}`;

class FalhaDeAutenticacao extends Error {
  constructor(
    readonly status: number | null,
    mensagem: string
  ) {
    super(mensagem);
  }
}

async function autenticar(cfg: ConfiguracaoDoSerpro, transporte: Transporte, renovar = false): Promise<Token> {
  const chave = chaveDoToken(cfg);
  const guardado = tokens.get(chave);
  if (!renovar && guardado && guardado.expiraEm > Date.now()) return guardado;

  let resposta;
  try {
    resposta = await transporte({
      url: URL_DE_AUTENTICACAO,
      cabecalhos: {
        Authorization: `Basic ${Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64")}`,
        "Role-Type": "TERCEIROS",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      corpo: "grant_type=client_credentials",
      pfx: cfg.pfx!,
      senha: cfg.senha,
      timeoutMs: TEMPO_DO_TOKEN_MS,
    });
  } catch {
    throw new FalhaDeAutenticacao(null, "O Serpro não respondeu à autenticação. Tente de novo em alguns minutos.");
  }
  if (resposta.status !== 200) {
    throw new FalhaDeAutenticacao(
      resposta.status,
      resposta.status === 401 || resposta.status === 403
        ? "O Serpro recusou a autenticação: confira a Consumer Key, o Consumer Secret e se o certificado é o da contratação."
        : `A autenticação no Serpro respondeu ${resposta.status}.`
    );
  }
  let corpo: Record<string, unknown> = {};
  try {
    corpo = JSON.parse(resposta.corpo) as Record<string, unknown>;
  } catch {
    // corpo vazio cai na falta de token logo abaixo
  }
  const access = typeof corpo.access_token === "string" ? corpo.access_token : "";
  const jwt = typeof corpo.jwt_token === "string" ? corpo.jwt_token : "";
  if (!access || !jwt) throw new FalhaDeAutenticacao(200, "A autenticação no Serpro não devolveu o token.");
  // A documentação não diz a unidade de `expires_in` (o exemplo traz 2008):
  // lido como segundos, com teto de 30 minutos e um minuto de folga. Se vencer
  // antes, a chamada volta 401 e o token é renovado uma vez.
  const segundos = Math.min(Number(corpo.expires_in) || 1800, 1800);
  const token = { access, jwt, expiraEm: Date.now() + Math.max(segundos - 60, 60) * 1000 };
  tokens.set(chave, token);
  return token;
}

/**
 * Testa a ligação, de graça. Na produção, só autentica; na demonstração, que
 * não autentica, faz a consulta de exemplo da documentação. Fica registrado
 * na saúde da integração.
 */
export async function testarConexao(tenantId: string, transporte: Transporte = transporteHttps): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  const demonstracao = cfg!.ambiente === "demonstracao";
  try {
    await executar({ tenantId, integrationId: cfg!.integrationId, trigger: "MANUAL" }, async () => {
      if (!demonstracao) {
        await autenticar(cfg!, transporte, true);
      } else {
        const r = await chamarSerpro(tenantId, EXEMPLO_DA_DEMONSTRACAO, { origem: "teste", transporte });
        if (!r.ok) throw new Error(r.erro);
      }
      return { resultado: null, counters: { [demonstracao ? "chamadas" : "autenticacoes"]: 1 } };
    });
    return {
      ok: true,
      texto: demonstracao ? "A demonstração do Serpro respondeu à consulta de exemplo." : "O Serpro aceitou a chave, o segredo e o certificado.",
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao testar a conexão." };
  }
}

// ─── Consumo e teto ──────────────────────────────────────────────────────────

/** O mês de cobrança é o do calendário em São Paulo. */
export function inicioDoMes(mes: string): Date {
  return new Date(`${mes}-01T00:00:00-03:00`);
}

export async function contagemDoMes(tenantId: string, mes = hojeIso().slice(0, 7)): Promise<ContagemDoMes> {
  const [ano, m] = mes.split("-").map(Number);
  const proximo = `${m === 12 ? ano + 1 : ano}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const grupos = await getPrisma().serproCall.groupBy({
    by: ["tipoDeCobranca"],
    // A demonstração já grava `cobrada: false`; o filtro do ambiente é a segunda trava.
    where: { tenantId, cobrada: true, ambiente: "PRODUCAO", createdAt: { gte: inicioDoMes(mes), lt: inicioDoMes(proximo) } },
    _count: { _all: true },
  });
  const contagem = { ...CONTAGEM_VAZIA };
  for (const g of grupos) {
    if ((TIPOS_DE_COBRANCA as readonly string[]).includes(g.tipoDeCobranca ?? "")) contagem[g.tipoDeCobranca as keyof ContagemDoMes] = g._count._all;
  }
  return contagem;
}

export async function consumoDoMes(tenantId: string, mes = hojeIso().slice(0, 7)): Promise<{ mes: string; contagem: ContagemDoMes; custo: CustoDoMes }> {
  const contagem = await contagemDoMes(tenantId, mes);
  return { mes, contagem, custo: custoDoMes(contagem) };
}

// ─── A chamada ───────────────────────────────────────────────────────────────

export type ResultadoDaChamada =
  | {
      ok: true;
      resposta: RespostaLida;
      cabecalhos: CabecalhosDaResposta;
      /** No 204 (ainda processando): o novo tempo de espera, em ms, lido do ETag. */
      tempoEsperaMs: number | null;
    }
  | {
      ok: false;
      /**
       * nao_pronta, fora_do_catalogo, sem_autorizacao e teto: nada foi chamado.
       * autenticacao: o /authenticate recusou ou não respondeu. rede: a chamada
       * ficou sem resposta. falha: o Serpro respondeu, com erro.
       */
      motivo: "nao_pronta" | "fora_do_catalogo" | "sem_autorizacao" | "teto" | "autenticacao" | "rede" | "falha";
      erro: string;
      /** O status da resposta do serviço; null quando não houve. */
      status: number | null;
      resposta?: RespostaLida;
    };

export async function chamarSerpro(
  tenantId: string,
  pedido: PedidoAoSerpro,
  opcoes: { userId?: string | null; origem: string; transporte?: Transporte }
): Promise<ResultadoDaChamada> {
  const transporte = opcoes.transporte ?? transporteHttps;
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, motivo: "nao_pronta", erro: pronta.motivo, status: null };

  // Só o que está no catálogo: o portão e o teto dependem do que ele diz do serviço.
  const servico = servicoDoCatalogo(pedido.idSistema, pedido.idServico);
  if (!servico || servico.caminho !== pedido.caminho) {
    return {
      ok: false,
      motivo: "fora_do_catalogo",
      erro: `O serviço ${pedido.idSistema} ${pedido.idServico} (${pedido.caminho}) não está no catálogo do Connect.`,
      status: null,
    };
  }

  // A demonstração fica fora do portão, do teto e do custo: é dado fictício,
  // sem cobrança. E só vai o pedido de exemplo — o trial responde "ERRO" a
  // qualquer outro, e o documento de um cliente não tem por que sair daqui.
  const demonstracao = cfg!.ambiente === "demonstracao";
  if (demonstracao && !pedido.partesDaDemonstracao) return { ok: false, motivo: "nao_pronta", erro: SO_EXEMPLOS_NA_DEMONSTRACAO, status: null };
  const tipo = tipoDeCobranca(pedido.caminho);
  if (tipo && !demonstracao) {
    const portao = await podeChamar(tenantId, pedido.contribuinte, servico);
    if (!portao.pode) return { ok: false, motivo: "sem_autorizacao", erro: portao.motivo, status: null };
    const teto = cabeNoTeto(await contagemDoMes(tenantId), tipo, cfg!.tetoCentavos!);
    if (!teto.cabe) {
      return {
        ok: false,
        motivo: "teto",
        erro: `Teto mensal do Serpro atingido (${reais(cfg!.tetoCentavos!)}). As chamadas cobradas voltam no mês que vem, ou com um teto maior.`,
        status: null,
      };
    }
  }

  const partes = partesDoPedido(cfg!, pedido);
  const corpo = JSON.stringify(corpoDoPedido(pedido, partes.contratante, partes.autor));
  const requestTag = tagDaRequisicao(partes.autor, pedido.contribuinte, servico.sequencial);
  const url = `${URL_DO_GATEWAY[cfg!.ambiente]}/${pedido.caminho}`;
  const inicio = Date.now();
  let r: RespostaHttps | null = null;
  let erroDeAutenticacao: string | null = null;
  try {
    if (demonstracao) {
      // Sem /authenticate, sem jwt_token e sem mTLS: só o Bearer público.
      r = await transporte({
        url,
        cabecalhos: { Authorization: `Bearer ${tokenDaDemonstracao()}`, "Content-Type": "application/json", "X-Request-Tag": requestTag },
        corpo,
        pfx: null,
        senha: "",
        timeoutMs: TEMPO_DA_CHAMADA_MS,
      });
    } else {
      let token = await autenticar(cfg!, transporte);
      const enviar = (t: Token) =>
        transporte({
          url,
          cabecalhos: { Authorization: `Bearer ${t.access}`, jwt_token: t.jwt, "Content-Type": "application/json", "X-Request-Tag": requestTag },
          corpo,
          pfx: cfg!.pfx!,
          senha: cfg!.senha,
          timeoutMs: TEMPO_DA_CHAMADA_MS,
        });
      r = await enviar(token);
      if (r.status === 401) {
        // Token vencido antes da hora: renova uma vez. O 401 não é cobrado.
        token = await autenticar(cfg!, transporte, true);
        r = await enviar(token);
      }
    }
  } catch (e) {
    // A renovação depois do 401 pode falhar também: a resposta que valia era a do 401.
    if (e instanceof FalhaDeAutenticacao) erroDeAutenticacao = e.message;
  }
  const resposta = r ? lerResposta(r.status, r.corpo) : null;

  await getPrisma().serproCall.create({
    data: {
      tenantId,
      caminho: pedido.caminho,
      idSistema: pedido.idSistema,
      idServico: pedido.idServico,
      contribuinte: pedido.contribuinte,
      // Falha na autenticação não chegou ao serviço: fica sem status de chamada.
      httpStatus: r ? r.status : null,
      cobrada: r && !demonstracao ? foiCobrada(pedido.caminho, r.status) : false,
      tipoDeCobranca: tipo,
      mensagens: resposta ? codigosDasMensagens(resposta.mensagens) : erroDeAutenticacao ? "autenticacao" : "sem resposta",
      duracaoMs: Date.now() - inicio,
      userId: opcoes.userId ?? null,
      origem: opcoes.origem.slice(0, 40),
      ambiente: demonstracao ? "DEMONSTRACAO" : "PRODUCAO",
      requestTag,
    },
  });

  if (!r || !resposta) {
    return erroDeAutenticacao
      ? { ok: false, motivo: "autenticacao", erro: erroDeAutenticacao, status: null }
      : { ok: false, motivo: "rede", erro: explicarErro(null, []), status: null };
  }
  // 304 é sucesso: o resultado anterior segue valendo, e o que importa vem no
  // ETag (o protocolo do Sitfis em cache, o token do termo de autorização). O
  // 200 com "ERRO" nas mensagens é falha, por mais que o status diga outra coisa.
  const sucesso = ((r.status >= 200 && r.status < 300) || r.status === 304) && !temMensagemDeErro(resposta.mensagens);
  if (sucesso) {
    return { ok: true, resposta, cabecalhos: r.cabecalhos, tempoEsperaMs: r.status === 204 ? tempoDeEsperaDoEtag(r.cabecalhos.etag) : null };
  }
  return { ok: false, motivo: "falha", erro: explicarErro(r.status, resposta.mensagens), status: r.status, resposta };
}

/** Só para os testes: esquece os tokens guardados. */
export function esquecerTokens() {
  tokens.clear();
}
