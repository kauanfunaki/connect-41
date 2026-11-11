// Honorário no Acessórias: conferir (ler tudo) e atualizar (uma empresa ou várias).
// Veio do Aditiva Pronto (F4 da migracao-622) com as mesmas travas.
//
// Cuidados, porque a documentação não diz se o POST /companies apaga campo omitido:
//  1. Só envia para empresa que JÁ existe no Acessórias (o POST também cria).
//  2. Lê a ficha completa antes, manda o honorário junto com razão social e fantasia
//     atuais (sem alterar), e lê a ficha de novo depois.
//  3. Se qualquer outro campo mudar, o envio fica registrado com o antes/depois e TODOS
//     os envios travam até alguém conferir no Connect.
//  4. O envio em lote só libera depois de um envio individual que confirmou o valor sem
//     mexer em mais nada.
// As operações longas (conferir tudo, lote) rodam em segundo plano neste servidor, como no
// Aditiva; a diferença é que o andamento fica gravado (hon_acessorias_operacoes) e sobrevive a
// um reinício como "interrompida", em vez de sumir.

import { Prisma } from "@/generated/prisma/client";
import { AppError } from "./erros";
import { db, tenantAtual } from "./contexto";
import * as repo from "./honorariosRepository";
import { logger } from "./log";
import {
  buscarEmpresa,
  conexaoDoEscritorio,
  ErroAcessorias,
  gravarEmpresa,
  honorarioDaFicha,
  listarPagina,
  type ConexaoAcessorias,
  type FichaAcessorias,
} from "./acessoriasClient";
import { formatoAcessorias } from "../regras/honorariosRegras";
import { montarRelatorioHonorarios, soDigitos, type EmpresaHonorario } from "./honorariosService";

const MAX_PAGINAS = 200; // 4.000 empresas: trava contra laço infinito se a API repetir páginas
/** Sem sinal por este tempo, a operação é dada como interrompida (o servidor reiniciou no meio). */
const SEM_SINAL_MS = 3 * 60_000;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (v: number | null) => (v === null ? "vazio" : brl.format(v));

// ── Comparação de fichas ──────────────────────────────────────────

/** Campos que mudam sozinhos a cada gravação e não indicam efeito colateral. */
const IGNORAR_NA_COMPARACAO = new Set(["Honorario", "DtLastDH", "DataUltimaAlteracao", "UltimaAlteracao"]);

function normalizar(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return JSON.stringify(v.map(normalizar).sort());
  if (typeof v === "object") {
    return JSON.stringify(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, normalizar((v as Record<string, unknown>)[k])]),
    );
  }
  return String(v).trim();
}

/** Campos (além do honorário) cujo valor mudou entre as duas leituras. */
export function camposAlterados(antes: FichaAcessorias, depois: FichaAcessorias | null): string[] {
  if (!depois) return ["(ficha não encontrada depois do envio)"];
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...chaves]
    .filter((k) => !IGNORAR_NA_COMPARACAO.has(k))
    .filter((k) => normalizar(antes[k]) !== normalizar(depois[k]))
    .sort();
}

export function inativaNoAcessorias(f: FichaAcessorias): boolean {
  return /inativ/i.test(String(f.Status ?? ""));
}

/** Campos do POST: identificador, honorário e o que já está lá (para não ser apagado). */
export function camposDoEnvio(f: FichaAcessorias, valor: number): Record<string, string> {
  const campos: Record<string, string> = {
    cnpj: String(f.Identificador),
    honorario: formatoAcessorias(valor),
  };
  if (typeof f.Razao === "string" && f.Razao.trim()) campos.nome = f.Razao;
  if (typeof f.Fantasia === "string" && f.Fantasia.trim()) campos.fantasia = f.Fantasia;
  return campos;
}

// ── Operação em segundo plano (gravada) ───────────────────────────

export interface ResultadoEnvio {
  companyId: string;
  razao: string;
  status: "ok" | "erro" | "ignorado";
  mensagem: string;
  outrosCampos?: string[];
}

export interface Operacao {
  id: string;
  tipo: "conferir" | "enviar_lote";
  conta: string;
  executando: boolean;
  iniciadaEm: Date;
  concluidaEm: Date | null;
  total: number | null;
  feitos: number;
  erros: number;
  mensagem: string | null;
  resultados: ResultadoEnvio[];
}

type OperacaoDoBanco = Awaited<ReturnType<ReturnType<typeof db>["honorarioAcessoriasOperacao"]["findFirstOrThrow"]>>;

function paraOperacao(o: OperacaoDoBanco): Operacao {
  return {
    id: o.id,
    tipo: o.tipo as Operacao["tipo"],
    conta: o.conta,
    executando: o.ativoTenantId !== null,
    iniciadaEm: o.iniciadaEm,
    concluidaEm: o.concluidaEm,
    total: o.total,
    feitos: o.feitos,
    erros: o.erros,
    mensagem: o.mensagem,
    resultados: Array.isArray(o.resultados) ? (o.resultados as unknown as ResultadoEnvio[]) : [],
  };
}

/** Dá como interrompida a operação ativa que parou de dar sinal (o servidor reiniciou no meio). */
async function encerrarParadas(tenantId: string, agora = new Date()) {
  await db().honorarioAcessoriasOperacao.updateMany({
    where: { tenantId, ativoTenantId: { not: null }, atualizadaEm: { lt: new Date(agora.getTime() - SEM_SINAL_MS) } },
    data: {
      ativoTenantId: null,
      concluidaEm: agora,
      mensagem: "Interrompida: o servidor do Connect reiniciou no meio. Rode de novo.",
    },
  });
}

/** A operação mais recente do escritório (a que está rodando, ou a última que terminou). */
export async function operacaoAtual(): Promise<Operacao | null> {
  const tenantId = tenantAtual();
  await encerrarParadas(tenantId);
  const o = await db().honorarioAcessoriasOperacao.findFirst({ where: { tenantId }, orderBy: { iniciadaEm: "desc" } });
  return o ? paraOperacao(o) : null;
}

async function iniciarOperacao(tipo: Operacao["tipo"], conta: string, total: number | null): Promise<string> {
  const tenantId = tenantAtual();
  await encerrarParadas(tenantId);
  const agora = new Date();
  try {
    const o = await db().honorarioAcessoriasOperacao.create({
      data: { tenantId, tipo, conta, ativoTenantId: tenantId, iniciadaEm: agora, atualizadaEm: agora, total },
      select: { id: true },
    });
    return o.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Já há uma operação com o Acessórias em andamento. Aguarde terminar.");
    }
    throw err;
  }
}

async function avancar(id: string, d: { feitos: number; erros: number; resultados?: ResultadoEnvio[] }) {
  await db().honorarioAcessoriasOperacao.update({
    where: { id },
    data: {
      feitos: d.feitos,
      erros: d.erros,
      atualizadaEm: new Date(),
      ...(d.resultados ? { resultados: d.resultados as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

async function encerrar(id: string, mensagem: string, d: { feitos: number; erros: number; resultados?: ResultadoEnvio[] }) {
  const agora = new Date();
  await db().honorarioAcessoriasOperacao.update({
    where: { id },
    data: {
      ativoTenantId: null,
      concluidaEm: agora,
      atualizadaEm: agora,
      mensagem: mensagem.slice(0, 500),
      feitos: d.feitos,
      erros: d.erros,
      ...(d.resultados ? { resultados: d.resultados as unknown as Prisma.InputJsonValue } : {}),
    },
  });
}

async function exigirConexao(): Promise<ConexaoAcessorias> {
  const s = await conexaoDoEscritorio(tenantAtual());
  if (!s.pronta) throw new AppError(503, s.motivo);
  return s.conexao;
}

export async function estado() {
  const tenantId = tenantAtual();
  const [conexao, operacao, bloqueio, envioLoteLiberado] = await Promise.all([
    conexaoDoEscritorio(tenantId),
    operacaoAtual(),
    repo.buscarBloqueio(),
    repo.existeEnvioLimpo(),
  ]);
  return {
    configurado: conexao.pronta,
    motivoNaoConfigurado: conexao.pronta ? null : conexao.motivo,
    operacao,
    envioLoteLiberado,
    bloqueio: bloqueio && {
      id: bloqueio.id,
      companyId: bloqueio.company_id,
      razaoSocial: bloqueio.razao_social,
      enviadoEm: bloqueio.enviado_em,
      conta: bloqueio.conta,
      outrosCampos: (Array.isArray(bloqueio.outros_campos) ? bloqueio.outros_campos : []) as string[],
      fichaAntes: bloqueio.ficha_antes as Record<string, unknown> | null,
      fichaDepois: bloqueio.ficha_depois as Record<string, unknown> | null,
    },
  };
}

export type EstadoAcessorias = Awaited<ReturnType<typeof estado>>;

// ── Conferir: lê todas as empresas do Acessórias ──────────────────

function paraCache(f: FichaAcessorias): repo.AcessoriasEmpresa | null {
  const cnpjDigitos = soDigitos(String(f.Identificador ?? ""));
  if (cnpjDigitos.length < 11 || cnpjDigitos.length > 14) return null;
  return {
    cnpjDigitos,
    identificador: String(f.Identificador),
    acessoriasId: f.ID === undefined ? null : String(f.ID),
    razao: typeof f.Razao === "string" ? f.Razao : null,
    situacao: typeof f.Status === "string" ? f.Status : null,
    honorario: honorarioDaFicha(f),
  };
}

/** Começa a conferência em segundo plano e devolve na hora. */
export async function conferirTudo(conta: string): Promise<void> {
  const conexao = await exigirConexao();
  const id = await iniciarOperacao("conferir", conta, null);

  void (async () => {
    const porCnpj = new Map<string, repo.AcessoriasEmpresa>();
    try {
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const lista = await listarPagina(conexao, pagina);
        if (!lista.length) break;
        const antes = porCnpj.size;
        for (const f of lista) {
          const e = paraCache(f);
          if (e) porCnpj.set(e.cnpjDigitos, e);
        }
        await avancar(id, { feitos: porCnpj.size, erros: 0 });
        if (porCnpj.size === antes) break; // página repetida: a API não pagina como esperado
      }
      await repo.substituirAcessorias([...porCnpj.values()], new Date());
      await encerrar(id, `${porCnpj.size} empresa(s) lidas do Acessórias.`, { feitos: porCnpj.size, erros: 0 });
      logger.info(`[acessorias] conferência por ${conta}: ${porCnpj.size} empresas`);
    } catch (err) {
      await encerrar(id, `A conferência falhou: ${(err as Error).message}`, { feitos: porCnpj.size, erros: 1 }).catch(() => undefined);
      logger.error(`[acessorias] conferência falhou: ${(err as Error).message}`);
    }
  })();
}

// ── Enviar ────────────────────────────────────────────────────────

async function exigirPodeEnviar(): Promise<ConexaoAcessorias> {
  const conexao = await exigirConexao();
  const bloqueio = await repo.buscarBloqueio();
  if (bloqueio) {
    throw new AppError(
      409,
      `Envios travados: o envio de ${bloqueio.razao_social} mexeu em outros campos no Acessórias. Confira e libere na tela antes de continuar.`,
    );
  }
  return conexao;
}

/** Envia o honorário de UMA empresa já calculada no relatório. Nunca lança: devolve o resultado. */
async function enviarLinha(c: ConexaoAcessorias, l: EmpresaHonorario, conta: string, ip: string | null): Promise<ResultadoEnvio> {
  const base = { companyId: l.empresa.id, razao: l.empresa.razaoSocial };
  const cnpjDigitos = soDigitos(l.empresa.cnpj);
  const valor = l.valor;
  if (valor === null) return { ...base, status: "ignorado", mensagem: "Sem honorário para enviar." };
  if (l.situacao === "DISTRATO") return { ...base, status: "ignorado", mensagem: "Empresa com distrato: honorário não enviado." };

  const registrar = (d: Partial<repo.NovoEnvio> & Pick<repo.NovoEnvio, "status">) =>
    repo.registrarEnvio({
      companyId: l.empresa.id,
      cnpjDigitos,
      razaoSocial: l.empresa.razaoSocial,
      valorAnterior: null,
      valorEnviado: valor,
      fonte: l.fonte ?? "documento",
      documento: l.manual?.documento ?? (l.documento ? `${l.documento.nomePasta}/${l.documento.caminhoRelativo}` : null),
      conta,
      ip,
      erro: null,
      outrosCampos: null,
      fichaAntes: undefined,
      fichaDepois: undefined,
      agora: new Date(),
      ...d,
    });

  let antes: FichaAcessorias | null;
  try {
    antes = await buscarEmpresa(c, cnpjDigitos);
  } catch (err) {
    const erro = `Não foi possível ler a empresa no Acessórias: ${(err as Error).message}`;
    await registrar({ status: "erro", erro });
    return { ...base, status: "erro", mensagem: erro };
  }
  if (!antes) {
    const erro = "Empresa não encontrada no Acessórias (o envio criaria uma empresa nova; nada foi enviado).";
    await registrar({ status: "erro", erro });
    return { ...base, status: "erro", mensagem: erro };
  }
  if (inativaNoAcessorias(antes)) {
    const erro = "Empresa inativa no Acessórias; nada foi enviado.";
    await registrar({ status: "erro", erro, fichaAntes: antes });
    return { ...base, status: "erro", mensagem: erro };
  }

  const valorAnterior = honorarioDaFicha(antes);
  let resposta: string;
  try {
    resposta = await gravarEmpresa(c, camposDoEnvio(antes, valor));
  } catch (err) {
    const erro = `O Acessórias recusou a atualização: ${(err as Error).message}`;
    await registrar({ status: "erro", erro, valorAnterior, fichaAntes: antes });
    return { ...base, status: "erro", mensagem: erro };
  }

  let depois: FichaAcessorias | null = null;
  try {
    depois = await buscarEmpresa(c, cnpjDigitos);
  } catch (err) {
    logger.warn(`[acessorias] releitura de uma empresa falhou: ${(err as Error).message}`);
  }
  const outrosCampos = camposAlterados(antes, depois);
  // Se o Acessórias diz que CRIOU uma empresa, o identificador não casou com a existente:
  // trava os envios como efeito colateral.
  if (/criad/i.test(resposta)) outrosCampos.push(`Empresa nova criada no Acessórias (${resposta})`);
  const confirmado = depois !== null && Math.abs((honorarioDaFicha(depois) ?? -1) - valor) < 0.005;
  const erro = confirmado ? null : `O Acessórias respondeu "${resposta}", mas o honorário não mudou na releitura.`;

  await registrar({
    status: confirmado ? "ok" : "erro",
    erro,
    valorAnterior,
    outrosCampos: outrosCampos.length ? outrosCampos : null,
    fichaAntes: antes,
    fichaDepois: depois,
  });
  if (depois) {
    const cache = paraCache(depois);
    if (cache) await repo.gravarAcessoriasUma(cache, new Date());
  }
  logger.info(
    `[acessorias] ${conta} atualizou uma empresa: ${valorAnterior ?? "—"} → ${valor} (${confirmado ? "ok" : "não confirmado"})${outrosCampos.length ? ` · outros campos mudaram: ${outrosCampos.join(", ")}` : ""}`,
  );

  if (outrosCampos.length) {
    return {
      ...base,
      status: "erro",
      outrosCampos,
      mensagem: `Honorário enviado, mas outros campos mudaram no Acessórias (${outrosCampos.join(", ")}). Os envios foram travados até alguém conferir.`,
    };
  }
  return confirmado
    ? { ...base, status: "ok", mensagem: `Atualizado de ${reais(valorAnterior)} para ${reais(valor)}.` }
    : { ...base, status: "erro", mensagem: erro! };
}

function linhaParaEnvio(rel: Awaited<ReturnType<typeof montarRelatorioHonorarios>>, companyId: string, valorEsperado: number) {
  const l = rel.empresas.find((e) => e.empresa.id === companyId);
  if (!l) throw new AppError(404, "Empresa não encontrada no relatório de honorários.");
  if (l.situacao === "DISTRATO") {
    throw new AppError(400, `${l.empresa.razaoSocial} tem distrato da prestação de serviços: o honorário não é enviado.`);
  }
  if (l.valor === null) throw new AppError(400, `${l.empresa.razaoSocial} não tem honorário para enviar.`);
  // O valor confirmado pela pessoa na tela precisa ser o mesmo que o servidor calcula agora.
  if (Math.abs(l.valor - valorEsperado) >= 0.005) {
    throw new AppError(409, `O honorário de ${l.empresa.razaoSocial} mudou desde que a tela foi aberta. Recarregue e confira.`);
  }
  return l;
}

export async function enviarUma(conta: string, ip: string | null, companyId: string, valorEsperado: number): Promise<ResultadoEnvio> {
  const conexao = await exigirPodeEnviar();
  if ((await operacaoAtual())?.executando) throw new AppError(409, "Há uma operação com o Acessórias em andamento. Aguarde terminar.");
  const rel = await montarRelatorioHonorarios();
  return enviarLinha(conexao, linhaParaEnvio(rel, companyId, valorEsperado), conta, ip);
}

/** Começa o envio em lote em segundo plano e devolve quantas empresas vão. */
export async function enviarLote(conta: string, ip: string | null, itens: { companyId: string; valorEsperado: number }[]): Promise<number> {
  const conexao = await exigirPodeEnviar();
  if (!(await repo.existeEnvioLimpo())) {
    throw new AppError(409, "Antes do envio em lote, atualize UMA empresa e confira no Acessórias que só o honorário mudou.");
  }
  const rel = await montarRelatorioHonorarios();
  const linhas = itens.map((i) => linhaParaEnvio(rel, i.companyId, i.valorEsperado));
  const id = await iniciarOperacao("enviar_lote", conta, linhas.length);

  void (async () => {
    const resultados: ResultadoEnvio[] = [];
    let erros = 0;
    try {
      for (const l of linhas) {
        const r = await enviarLinha(conexao, l, conta, ip).catch(
          (err): ResultadoEnvio => ({ companyId: l.empresa.id, razao: l.empresa.razaoSocial, status: "erro", mensagem: (err as Error).message }),
        );
        resultados.push(r);
        if (r.status === "erro") erros++;
        await avancar(id, { feitos: resultados.length, erros, resultados });
        if (r.outrosCampos?.length) {
          await encerrar(id, `Parado: o envio de ${l.empresa.razaoSocial} mexeu em outros campos no Acessórias. Confira antes de continuar.`, {
            feitos: resultados.length,
            erros,
            resultados,
          });
          return;
        }
      }
      await encerrar(id, `${resultados.length - erros} de ${linhas.length} atualizada(s).`, { feitos: resultados.length, erros, resultados });
    } catch (err) {
      await encerrar(id, `O envio em lote falhou: ${(err as Error).message}`, { feitos: resultados.length, erros: erros + 1, resultados }).catch(
        () => undefined,
      );
    }
  })();

  return linhas.length;
}

// ── Histórico e liberação ─────────────────────────────────────────

export async function listarEnvios(limite: number) {
  const rows = await repo.listarEnvios(limite);
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    razaoSocial: r.razao_social,
    cnpj: r.cnpj_digitos,
    valorAnterior: r.valor_anterior === null ? null : Number(r.valor_anterior),
    valorEnviado: Number(r.valor_enviado),
    fonte: r.fonte,
    conta: r.conta,
    status: r.status,
    erro: r.erro,
    outrosCampos: (Array.isArray(r.outros_campos) ? r.outros_campos : null) as string[] | null,
    enviadoEm: r.enviado_em,
    conferidoEm: r.conferido_em,
    conferidoPor: r.conferido_por,
  }));
}

export type EnvioNoHistorico = Awaited<ReturnType<typeof listarEnvios>>[number];

export async function liberarEnvios(conta: string, envioId: string): Promise<void> {
  if (!(await repo.marcarConferido(envioId, conta, new Date()))) {
    throw new AppError(404, "Envio não encontrado ou já conferido.");
  }
  logger.info(`[acessorias] ${conta} conferiu o envio ${envioId} e liberou os envios`);
}

export { ErroAcessorias };
