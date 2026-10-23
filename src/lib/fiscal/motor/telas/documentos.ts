// Documentos e importações no modo motor (API-CONNECT §11.1, 23/10/2026).
//
// - Acervo: **nenhuma rota nova**. Lê a projeção `FiscalDocument` que a
//   sincronização (`src/lib/sped/sync.ts`) já mantém, pela mesma consulta do
//   acervo (`listarDocumentos`), recortada no estabelecimento escolhido.
// - Importações, quarentena e cobertura: as rotas leves da v1.

import "server-only";
import { doMotor, type Leitura } from "../leitura";
import { listarDocumentos } from "@/lib/fiscal/data";
import { documentoDoAcervo, importacaoNaCompetencia, type LinhaDoAcervoNoMotor } from "@/lib/fiscal/previa/doMotor";
import type { ImportacaoDoMotor, ItemDaListaDeCobertura, ResumoDaQuarentena, RespostaDaCobertura, ErrosDeExtracao, ResumoNfse } from "@/lib/sped/telasDoMotor";
import { param } from "../url";
import { cursorDaUrl, falha, inteiroDaUrl, MODULO, opcaoDaUrl, podeLer, primeiroEUltimoDia, SEM_ESTABELECIMENTO, SEM_PERMISSAO, type Params, type TelaDeLeitura } from "./comum";

export const TIPOS_DO_ACERVO = ["NFE", "NFCE", "CTE", "NFSE"] as const;
export const SENTIDOS = ["entrada", "saida"] as const;

export type AcervoDoMotor = {
  linhas: LinhaDoAcervoNoMotor[];
  total: number;
  totalLimitado: boolean;
  temProxima: boolean;
  pagina: number;
  porPagina: number;
  companyId: string;
};

type Dependencias = { listar?: typeof listarDocumentos };

/**
 * A aba Acervo. O alcance é só a `Company` do estabelecimento — mais estreito
 * que o da equipe —, e o sentido é o lado do documento em que está o CNPJ dele.
 */
export async function carregarAcervo(tela: TelaDeLeitura, params: Params, deps: Dependencias = {}): Promise<Leitura<AcervoDoMotor>> {
  if (!podeLer(tela, MODULO.documentos)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  const { contexto, estabelecimento } = tela;
  if (!contexto || !tela.ctx.tenantId) return falha("Nenhuma raiz de CNPJ liberada.");
  if (!estabelecimento) return falha(SEM_ESTABELECIMENTO, "sem_estabelecimento");
  const tipo = opcaoDaUrl(params, "tipo", TIPOS_DO_ACERVO);
  const sentido = opcaoDaUrl(params, "sentido", SENTIDOS);
  const pagina = inteiroDaUrl(params, "pagina") ?? 1;
  const listar = deps.listar ?? listarDocumentos;
  try {
    const r = await listar({ tipo: "EMPRESAS", tenantId: tela.ctx.tenantId, companyIds: [estabelecimento.companyId] }, {
      companyId: estabelecimento.companyId,
      competencia: contexto.competencia,
      tipo,
      ...(sentido ? { parte: { lado: sentido === "saida" ? "emitente" as const : "destinatario" as const, documento: estabelecimento.cnpj } } : {}),
    }, pagina);
    return { dados: {
      linhas: r.documentos.map((d) => documentoDoAcervo(d, estabelecimento.cnpj)),
      total: r.total, totalLimitado: r.totalLimitado, temProxima: r.temProxima, pagina, porPagina: r.porPagina, companyId: estabelecimento.companyId,
    }, erro: null };
  } catch (err) {
    console.error("[fiscal/motor/acervo]", err);
    return falha("Não foi possível ler o acervo do Connect.");
  }
}

export type ImportacoesDoMotor = {
  resumo: Leitura<ResumoDaQuarentena>;
  lista: Leitura<{ itens: ImportacaoDoMotor[]; proximo_cursor: string | null; foraDaCompetencia: number }>;
  detalhe: Leitura<ImportacaoDoMotor> | null;
  quarentena: Leitura<Awaited<ReturnType<TelaDeLeitura["motor"]["cliente"]["listarQuarentena"]>>>;
  cursorImportacoes: string | null;
  cursorQuarentena: string | null;
  todas: boolean;
  classe: string;
  pendentes: boolean;
};

/**
 * Importações (lista e detalhe) e a quarentena (resumo e lista, sem XML). A
 * lista mostra as importações que tocaram a competência escolhida
 * (`por_competencia`), ou todas com `todas=1`. A quarentena, no detalhe de uma
 * importação, é a daquela importação.
 */
export async function carregarImportacoes(tela: TelaDeLeitura, params: Params): Promise<ImportacoesDoMotor | null> {
  const { contexto, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.documentos)) return null;
  const raiz = contexto.raiz;
  const cursorImportacoes = cursorDaUrl(params, "c_imp");
  const cursorQuarentena = cursorDaUrl(params, "c_quar");
  const idImportacao = inteiroDaUrl(params, "importacao");
  const todas = param(params, "todas") === "1";
  // `classe` da URL: vazio na URL = só as que pedem decisão (o padrão do
  // motor, `desconhecido`); `todas` = todas as classes.
  const classeUrl = param(params, "classe");
  const classe = classeUrl === "todas" ? "" : classeUrl && /^[a-z_]{1,40}$/.test(classeUrl) ? classeUrl : "desconhecido";
  const pendentes = param(params, "pendentes") !== "0";
  const [resumo, lista, detalhe, quarentena] = await Promise.all([
    doMotor(() => motor.cliente.resumoDaQuarentena(raiz)),
    doMotor(async () => {
      const p = await motor.cliente.listarImportacoes(raiz, { limite: 50, cursor: cursorImportacoes });
      const itens = todas ? p.itens : p.itens.filter((i) => importacaoNaCompetencia(i, contexto.competencia));
      return { itens, proximo_cursor: p.proximo_cursor, foraDaCompetencia: p.itens.length - itens.length };
    }),
    idImportacao ? doMotor(() => motor.cliente.obterImportacao(raiz, idImportacao)) : Promise.resolve(null),
    doMotor(() => motor.cliente.listarQuarentena(raiz, { importacao_id: idImportacao ?? undefined, classe, apenas_pendentes: pendentes, limite: 50, cursor: cursorQuarentena })),
  ]);
  return { resumo, lista, detalhe, quarentena, cursorImportacoes, cursorQuarentena, todas, classe: classeUrl === "todas" ? "todas" : classe, pendentes };
}

export type CoberturaDaTela = {
  cobertura: Leitura<RespostaDaCobertura> | null;
  lista: Leitura<ItemDaListaDeCobertura[]>;
  erros: Leitura<ErrosDeExtracao>;
  nfse: Leitura<ResumoNfse>;
};

/**
 * A aba Cobertura: o registro da competência (só com estabelecimento), a
 * lista das apurações, os erros de extração pendentes do mês e o resumo de
 * NFS-e. Só lê `cobertura_competencias`: nunca dispara a apuração (141 s).
 * Item de estabelecimento que a pessoa não vê não aparece.
 */
export async function carregarCobertura(tela: TelaDeLeitura): Promise<CoberturaDaTela | null> {
  const { contexto, motor, estabelecimento } = tela;
  if (!contexto || !podeLer(tela, MODULO.documentos)) return null;
  const raiz = contexto.raiz;
  const vistos = new Set(tela.mapa.visiveis.map((e) => e.id));
  const [dataIni, dataFim] = primeiroEUltimoDia(contexto.competencia);
  const [cobertura, lista, erros, nfse] = await Promise.all([
    estabelecimento ? doMotor(() => motor.cliente.obterCobertura(raiz, estabelecimento.id, contexto.competencia)) : Promise.resolve(null),
    doMotor(async () => (await motor.cliente.listarCoberturas(raiz, { empresa_id: estabelecimento?.id, limite: 60 })).filter((c) => vistos.has(c.empresa_id))),
    doMotor(() => motor.cliente.errosDeExtracao(raiz, { data_ini: dataIni, data_fim: dataFim })),
    doMotor(() => motor.cliente.resumoNfse(raiz)),
  ]);
  return { cobertura, lista, erros, nfse };
}
