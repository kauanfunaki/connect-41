// ICMS e IPI no modo motor (API-CONNECT §11.2, 23/10/2026).
//
// O arquivo da competência e do estabelecimento é escolhido pelo Connect na
// lista de §6.4 (`GET /arquivos`): o primeiro considerado. As outras versões
// ficam oferecidas na mesma lista. Apuração e demonstrativo são `pesada` (lêem
// o LONGBLOB) e só rodam com a aba aberta; os documentos de um CFOP, só no
// clique (a linha vira `grupo`/`cfop`/`cst`/`aliquota` na URL).

import "server-only";
import { doMotor, type Leitura } from "../leitura";
import type { ArquivoDoMotor } from "@/lib/sped/motor";
import { GRUPOS_CFOP, type ApuracaoIcms, type DcipDime, type DemonstrativoIcms, type DocumentosDoCfop, type GrupoCfop, type SaldoIcms, type TabelasIcms } from "@/lib/sped/telasDoMotor";
import { param } from "../url";
import { falha, inteiroDaUrl, MODULO, opcaoDaUrl, podeLer, SEM_ESTABELECIMENTO, SEM_PERMISSAO, type Params, type TelaDeLeitura } from "./comum";

export type ArquivoDaCompetencia = { versoes: ArquivoDoMotor[]; escolhido: ArquivoDoMotor | null };

/**
 * As versões do SPED de ICMS/IPI do estabelecimento na competência e a
 * escolhida: a da URL (`arquivo`), se for desta lista, senão a considerada.
 * Um id de outro estabelecimento ou competência nunca é aceito.
 */
export async function arquivoDaCompetencia(tela: TelaDeLeitura, params: Params): Promise<Leitura<ArquivoDaCompetencia>> {
  if (!podeLer(tela, MODULO.icmsIpi)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  const { contexto, estabelecimento, motor } = tela;
  if (!contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  if (!estabelecimento) return falha(SEM_ESTABELECIMENTO, "sem_estabelecimento");
  return doMotor(async () => {
    const lista = await motor.cliente.listarArquivos(contexto.raiz, { obrigacao: "icms_ipi", cnpj: estabelecimento.cnpj, competencia: contexto.competencia, limite: 20 });
    const versoes = lista.itens.filter((a) => a.cnpj === estabelecimento.cnpj && a.competencia === contexto.competencia && a.obrigacao === "icms_ipi");
    const pedido = inteiroDaUrl(params, "arquivo");
    const escolhido = versoes.find((a) => a.id === pedido) ?? versoes.find((a) => a.considerado) ?? versoes[0] ?? null;
    return { versoes, escolhido };
  });
}

export type FiltroDoCfop = { grupo: GrupoCfop; cfop: string; cst: string; aliquota: string | null };

/** O CFOP clicado, da URL. Sem `grupo` válido e `cfop` de 4 dígitos, nada é lido. */
export function cfopDaUrl(params: Params): FiltroDoCfop | null {
  const grupo = opcaoDaUrl(params, "grupo", GRUPOS_CFOP);
  const cfop = param(params, "cfop");
  if (!grupo || !cfop || !/^\d{4}$/.test(cfop)) return null;
  const cst = param(params, "cst") ?? "";
  const aliquota = param(params, "aliquota");
  return { grupo, cfop, cst: /^[0-9A-Za-z]{0,4}$/.test(cst) ? cst : "", aliquota: aliquota && /^-?\d{1,6}(\.\d{1,6})?$/.test(aliquota) ? aliquota : null };
}

export type ApuracaoDaTela = { apuracao: Leitura<ApuracaoIcms>; documentos: Leitura<DocumentosDoCfop> | null; cfop: FiltroDoCfop | null };

/** A apuração do arquivo (pesada) e, se houve clique, os documentos do CFOP (pesada, limite 2000). */
export async function carregarApuracao(tela: TelaDeLeitura, arquivo: ArquivoDoMotor, params: Params): Promise<ApuracaoDaTela | null> {
  const { contexto, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.icmsIpi)) return null;
  const cfop = cfopDaUrl(params);
  // Em sequência, não em paralelo: as duas são pesadas, e o motor só admite duas ao mesmo tempo.
  const apuracao = await doMotor(() => motor.cliente.apuracaoDoArquivo(contexto.raiz, arquivo.id));
  const documentos = cfop && apuracao.dados
    ? await doMotor(() => motor.cliente.documentosDoCfop(contexto.raiz, arquivo.id, { grupo: cfop.grupo, cfop: cfop.cfop, cst: cfop.cst || undefined, aliquota: cfop.aliquota, limite: 2000 }))
    : null;
  return { apuracao, documentos, cfop };
}

/** A cadeia do saldo credor do estabelecimento (leve), por competência crescente. */
export async function carregarSaldos(tela: TelaDeLeitura): Promise<Leitura<SaldoIcms[]>> {
  if (!podeLer(tela, MODULO.icmsIpi)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  const { contexto, estabelecimento, motor } = tela;
  if (!contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  if (!estabelecimento) return falha(SEM_ESTABELECIMENTO, "sem_estabelecimento");
  return doMotor(async () => (await motor.cliente.saldosIcms(contexto.raiz, estabelecimento.id)).itens);
}

export async function carregarDemonstrativo(tela: TelaDeLeitura, arquivo: ArquivoDoMotor): Promise<Leitura<DemonstrativoIcms>> {
  if (!podeLer(tela, MODULO.icmsIpi)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  if (!tela.contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  const raiz = tela.contexto.raiz;
  return doMotor(() => tela.motor.cliente.demonstrativoDoArquivo(raiz, arquivo.id));
}

// As tabelas de ICMS são constantes do motor: o Connect guarda por 1 hora (§11.2.6).
const UMA_HORA_MS = 60 * 60 * 1000;
const tabelasEmCache = new Map<string, { em: number; tabelas: TabelasIcms }>();
export function limparCacheDasTabelas() { tabelasEmCache.clear(); }

export async function tabelasDeIcms(tela: TelaDeLeitura, agora = Date.now()): Promise<Leitura<TabelasIcms>> {
  if (!podeLer(tela, MODULO.icmsIpi)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  if (!tela.contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  const raiz = tela.contexto.raiz;
  const chave = `${tela.ctx.tenantId}:${raiz}`;
  const guardada = tabelasEmCache.get(chave);
  if (guardada && agora - guardada.em < UMA_HORA_MS) return { dados: guardada.tabelas, erro: null };
  const lida = await doMotor(() => tela.motor.cliente.tabelasIcms(raiz));
  if (lida.dados) tabelasEmCache.set(chave, { em: agora, tabelas: lida.dados });
  return lida;
}

export type DcipDimeDaTela = { dcip: Leitura<DcipDime>; tabelas: Leitura<TabelasIcms> };

/**
 * DCIP e DIME (leve). Só Santa Catarina: com a UF do cadastro do motor já à
 * mão (`GET /empresas`, a mesma fonte que o motor usa aqui), outro estado nem
 * chama e mostra o mesmo `uf_nao_suportada` que o motor daria.
 */
export async function carregarDcipDime(tela: TelaDeLeitura): Promise<DcipDimeDaTela | null> {
  const { contexto, estabelecimento, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.icmsIpi)) return null;
  const tabelas = tabelasDeIcms(tela);
  if (!estabelecimento) return { dcip: falha(SEM_ESTABELECIMENTO, "sem_estabelecimento"), tabelas: await tabelas };
  if (estabelecimento.uf && estabelecimento.uf.toUpperCase() !== "SC") {
    return { dcip: falha("DCIP e DIME só existem para estabelecimento de Santa Catarina.", "uf_nao_suportada", 422), tabelas: await tabelas };
  }
  const [dcip, t] = await Promise.all([doMotor(() => motor.cliente.dcipDime(contexto.raiz, estabelecimento.id, contexto.competencia)), tabelas]);
  return { dcip, tabelas: t };
}
