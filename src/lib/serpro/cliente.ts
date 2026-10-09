// O cliente do Integra Contador: configuração, token, chamada, teto e registro.
//
// Toda chamada passa por `chamarSerpro`, que é o único caminho: confere se a
// ligação está pronta, se cabe no teto do mês, chama, e grava a linha em
// `serpro_calls` — inclusive quando deu erro, porque o 403 também é cobrado.

import { getPrisma } from "@/lib/prisma";
import { executar, lerConfig } from "@/lib/integracoes/data";
import { camposFaltando, integracaoDoCatalogo } from "@/lib/integracoes/catalogo";
import { hojeIso } from "@/lib/datas/calendario";
import { formatCnpj } from "@/lib/format";
import { lerCertificado, TAMANHO_MAXIMO_DO_CERTIFICADO, type CertificadoLido } from "./certificado";
import { transporteHttps, type Transporte } from "./transporte";
import {
  cabeNoTeto,
  CODIGO_DA_INTEGRACAO,
  codigosDasMensagens,
  CONTAGEM_VAZIA,
  corpoDoPedido,
  custoDoMes,
  explicarErro,
  foiCobrada,
  lerResposta,
  lerTeto,
  reais,
  tipoDeCobranca,
  TIPOS_DE_COBRANCA,
  type ContagemDoMes,
  type CustoDoMes,
  type PedidoAoSerpro,
  type RespostaLida,
} from "./regras";

const URL_DE_AUTENTICACAO = "https://autenticacao.sapi.serpro.gov.br/authenticate";
const URL_DO_GATEWAY = "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1";
/** O gateway corta em 30 s; aqui, um pouco depois, para receber o 504 dele. */
const TEMPO_DA_CHAMADA_MS = 35_000;
const TEMPO_DO_TOKEN_MS = 20_000;

// ─── Configuração ────────────────────────────────────────────────────────────

export type ConfiguracaoDoSerpro = {
  integrationId: string;
  ligada: boolean;
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
  return {
    integrationId: conexao.id,
    ligada: conexao.enabled,
    atualizadaEm: conexao.updatedAt,
    faltando: camposFaltando(integracaoDoCatalogo(CODIGO_DA_INTEGRACAO)!, config),
    consumerKey: config.consumerKey ?? "",
    consumerSecret: config.consumerSecret ?? "",
    pfx,
    senha: config.senhaDoCertificado ?? "",
    tetoCentavos: lerTeto(config.tetoMensal),
    certificado: pfx && config.senhaDoCertificado ? lerCertificado(pfx, config.senhaDoCertificado) : null,
    escritorio: recebe ? { nome: recebe.name, cnpj: recebe.cnpj } : null,
  };
}

/**
 * Conferência ao salvar a conexão: o certificado abre com a senha e não venceu,
 * e o teto é um valor em reais. Erro aqui é melhor que um 401 na primeira chamada.
 */
export function validarConfigDoSerpro(config: Record<string, string>): string | null {
  if (config.certificado) {
    const pfx = Buffer.from(config.certificado, "base64");
    if (pfx.length > TAMANHO_MAXIMO_DO_CERTIFICADO) return "Arquivo grande demais para um certificado A1.";
    if (config.senhaDoCertificado) {
      const c = lerCertificado(pfx, config.senhaDoCertificado);
      if (!c.ok) return c.erro;
      if (c.validoAte && c.validoAte < hojeIso()) return `O certificado venceu em ${c.validoAte.split("-").reverse().join("/")}.`;
    }
  }
  if (config.tetoMensal && lerTeto(config.tetoMensal) === null) return "Teto mensal inválido: use um valor em reais, como 400 ou 1.250,00.";
  return null;
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
  if (!cfg) return { pronta: false, motivo: "O Serpro ainda não foi conectado (Administração › Integrações)." };
  if (cfg.faltando.length) return { pronta: false, motivo: `Falta preencher na conexão do Serpro: ${cfg.faltando.join(", ")}.` };
  if (!cfg.ligada) return { pronta: false, motivo: "A conexão com o Serpro está desligada." };
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

/** Testa a ligação: só autentica, que é de graça. Fica registrado na saúde da integração. */
export async function testarConexao(tenantId: string, transporte: Transporte = transporteHttps): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  try {
    await executar({ tenantId, integrationId: cfg!.integrationId, trigger: "MANUAL" }, async () => {
      await autenticar(cfg!, transporte, true);
      return { resultado: null, counters: { autenticacoes: 1 } };
    });
    return { ok: true };
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
    where: { tenantId, cobrada: true, createdAt: { gte: inicioDoMes(mes), lt: inicioDoMes(proximo) } },
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
  | { ok: true; resposta: RespostaLida }
  | { ok: false; motivo: "nao_pronta" | "teto" | "falha"; erro: string; resposta?: RespostaLida };

export async function chamarSerpro(
  tenantId: string,
  pedido: PedidoAoSerpro,
  opcoes: { userId?: string | null; origem: string; transporte?: Transporte }
): Promise<ResultadoDaChamada> {
  const transporte = opcoes.transporte ?? transporteHttps;
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, motivo: "nao_pronta", erro: pronta.motivo };

  const tipo = tipoDeCobranca(pedido.caminho);
  if (tipo) {
    const teto = cabeNoTeto(await contagemDoMes(tenantId), tipo, cfg!.tetoCentavos!);
    if (!teto.cabe) {
      return { ok: false, motivo: "teto", erro: `Teto mensal do Serpro atingido (${reais(cfg!.tetoCentavos!)}). As chamadas cobradas voltam no mês que vem, ou com um teto maior.` };
    }
  }

  const corpo = JSON.stringify(corpoDoPedido(pedido, contratante(cfg!), cfg!.escritorio!.cnpj));
  const inicio = Date.now();
  let status: number | null = null;
  let resposta: RespostaLida | null = null;
  let erroDeRede: string | null = null;
  try {
    let token = await autenticar(cfg!, transporte);
    const enviar = (t: Token) =>
      transporte({
        url: `${URL_DO_GATEWAY}/${pedido.caminho}`,
        cabecalhos: { Authorization: `Bearer ${t.access}`, jwt_token: t.jwt, "Content-Type": "application/json" },
        corpo,
        pfx: cfg!.pfx!,
        senha: cfg!.senha,
        timeoutMs: TEMPO_DA_CHAMADA_MS,
      });
    let r = await enviar(token);
    if (r.status === 401) {
      // Token vencido antes da hora: renova uma vez. O 401 não é cobrado.
      token = await autenticar(cfg!, transporte, true);
      r = await enviar(token);
    }
    status = r.status;
    resposta = lerResposta(r.status, r.corpo);
  } catch (e) {
    erroDeRede = e instanceof FalhaDeAutenticacao ? e.message : null;
    if (e instanceof FalhaDeAutenticacao) status = e.status;
  }

  await getPrisma().serproCall.create({
    data: {
      tenantId,
      caminho: pedido.caminho,
      idSistema: pedido.idSistema,
      idServico: pedido.idServico,
      contribuinte: pedido.contribuinte,
      // Falha na autenticação não chegou ao serviço: fica sem status de chamada.
      httpStatus: resposta ? status : null,
      cobrada: resposta ? foiCobrada(pedido.caminho, status) : false,
      tipoDeCobranca: tipo,
      mensagens: resposta ? codigosDasMensagens(resposta.mensagens) : erroDeRede ? "autenticacao" : "sem resposta",
      duracaoMs: Date.now() - inicio,
      userId: opcoes.userId ?? null,
      origem: opcoes.origem.slice(0, 40),
    },
  });

  if (!resposta) return { ok: false, motivo: "falha", erro: erroDeRede ?? explicarErro(null, []) };
  if (status !== null && status >= 200 && status < 300) return { ok: true, resposta };
  return { ok: false, motivo: "falha", erro: explicarErro(status, resposta.mensagens), resposta };
}

/** Só para os testes: esquece os tokens guardados. */
export function esquecerTokens() {
  tokens.clear();
}
