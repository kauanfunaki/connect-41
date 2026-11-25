// Carga do Contábil Core para o Connect (Fase 5, 10/11/2026). Cópia de mão única, que pode ser
// repetida: cada linha entra com o UUID do original (upsert), então rodar de novo atualiza o
// espelho sem duplicar nada. Plano em docs/CONTABIL-CORE.md, seção "Carga dos dados".
//
// Lê o PostgreSQL do original numa transação SOMENTE LEITURA (um retrato consistente) e grava no
// banco do Connect pelo Prisma. Sem `--gravar`, só simula: diz o que entraria e o que falta ligar.
//
// Variáveis de ambiente (nunca por argumento, para não ficar no histórico do terminal):
//   CARGA_ORIGEM_URL      postgres://usuario_somente_leitura:...@host:porta/banco
//   CARGA_ORIGEM_SSL      "1" para exigir TLS na conexão com o original
//   CARGA_TENANT_ID       o escritório do Connect que recebe os dados
//   CARGA_TENANT_ORIGEM   o tenant do original (obrigatório só se houver mais de um)
//   DATABASE_URL          o banco do Connect (o mesmo do app)
//
// Uso:
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/carga.ts [--gravar] [--relatorio=<arquivo.json>]
//
// O terminal mostra só contagens; o que identifica empresa ou pessoa (CNPJ, nome, e-mail) vai para
// o relatório, um arquivo local (por padrão na pasta temporária), que não deve ir para o git.
//
// Bloco B (Fase B5, 18/11/2026): depois das exportações, a conciliação — revisões, vínculos da
// revisão, análises do financeiro, documentos (com o original em disco) e vínculos do financeiro.
// Os originais (`financeiro_documentos.conteudo`) vão para storage/contabil-core/financeiro, pelas
// mesmas funções do serviço (`originaisFinanceiro.ts`), um documento por vez e com o SHA-256 conferido
// antes de gravar. Rode a carga da pasta raiz do Connect (o `storage/` é relativo a ela).
//
// Bloco C (Fase C4, 25/11/2026): no fim, os documentos — notas, comprovantes (o `arquivo_base64` vai
// para storage/contabil-core/comprovantes), cartões, faturas, gastos, documentos da fatura (o
// `conteudo` vai para storage/contabil-core/faturas) e distribuições —, cada arquivo pelas funções do
// serviço (`originaisComprovantes.ts`, `originaisFaturas.ts`) e com o SHA-256 conferido. As linhas que
// as travas novas do Connect recusariam (CHECKs da C2 e da C3, unicidades) são decididas ANTES de gravar
// (`mapear.puladasPelasTravas`) e ficam de fora com o motivo no relatório, sem parar a carga.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { Prisma } from "../../src/generated/prisma/client";
import { getPrisma } from "../../src/lib/prisma";
import * as mapear from "../../src/lib/contabil-core/carga/mapear";
import { formatoDoComprovante } from "../../src/lib/contabil-core/comprovantes/leitor";
import { tipoDoArquivo } from "../../src/lib/contabil-core/comprovantes/servico";
import { apagarOriginal, chaveDoOriginal, gravarOriginal, lerOriginal } from "../../src/lib/contabil-core/servidor/originaisFinanceiro";
import * as arquivosDosComprovantes from "../../src/lib/contabil-core/servidor/originaisComprovantes";
import * as arquivosDasFaturas from "../../src/lib/contabil-core/servidor/originaisFaturas";

const gravar = process.argv.includes("--gravar");
const relatorioArg = process.argv.find((a) => a.startsWith("--relatorio="))?.slice("--relatorio=".length);
const caminhoDoRelatorio = relatorioArg || join(tmpdir(), `carga-contabil-core-${Date.now()}.json`);

const origemUrl = process.env.CARGA_ORIGEM_URL;
const tenantDoAmbiente = process.env.CARGA_TENANT_ID;
if (!origemUrl) throw new Error("Defina CARGA_ORIGEM_URL (somente leitura).");
if (!tenantDoAmbiente) throw new Error("Defina CARGA_TENANT_ID (o escritório do Connect que recebe os dados).");
const tenantId: string = tenantDoAmbiente;

// `date` do PostgreSQL como texto: convertido para instante pelo `pg`, o fuso local mudaria o dia.
pg.types.setTypeParser(1082, (v) => v);
// `json` e `jsonb` como texto: o `JSON.parse` do `pg` arredondaria em silêncio um inteiro grande;
// `mapear.jsonDoOriginal` confere antes de ler (Bloco B).
pg.types.setTypeParser(114, (v) => v);
pg.types.setTypeParser(3802, (v) => v);

const prisma = getPrisma();
type Modelo = { upsert(args: { where: { id: string }; create: object; update: object }): Promise<unknown> };
type Contagem = {
  lidas: number;
  gravadas: number;
  recusadas: { id: string; erro: string }[];
  /** Nos documentos do financeiro, nos comprovantes e nos documentos da fatura: os arquivos em disco. */
  arquivos?: { gravados: number; jaIguais: number; reescritos: number };
  /** Revisões e análises cuja conta bancária (referência sem chave) não veio na carga. */
  semAgencia?: string[];
  /** Bloco C: as linhas que as travas do Connect recusariam, deixadas de fora ANTES de gravar. */
  puladas?: { id: string; motivo: string }[];
  /** Comprovantes sem o `arquivo_sha256` no original (de antes da migration 0037): o hash calculado aqui. */
  sha256Calculado?: string[];
  /** Comprovantes com base64 que o Python não decodifica (lá, sem hash): entram sem arquivo. */
  base64Invalido?: string[];
  /** Notas, comprovantes e faturas ligados a uma transação desfeita (importação desfeita): entram assim, como no original. */
  comTransacaoDesfeita?: string[];
};

const relatorio: {
  modo: string;
  empresasSemPar: { idOriginal: string; cnpj: string; razaoSocial: string }[];
  empresasJaLigadas: { idOriginal: string; cnpj: string; idNoConnect: string }[];
  pessoasSemPar: { idOriginal: string; email: string }[];
  porEmpresa: Record<string, Record<string, Contagem>>;
} = { modo: gravar ? "gravar" : "simular", empresasSemPar: [], empresasJaLigadas: [], pessoasSemPar: [], porEmpresa: {} };

/** CNPJ mascarado para o terminal: o completo fica só no relatório. */
const mascara = (cnpj: string) => {
  const d = mapear.digitos(cnpj);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.***/****-**` : "***";
};

async function upsertMuitos(modelo: Modelo, linhas: { id: string }[], conta: Contagem, semAtualizar: string[] = [], tamanhoDoLote = 200) {
  if (!gravar) return;
  const args = (l: { id: string }) => {
    const update: Record<string, unknown> = { ...l };
    delete update.id;
    for (const c of semAtualizar) delete update[c];
    return { where: { id: l.id }, create: l, update };
  };
  for (let i = 0; i < linhas.length; i += tamanhoDoLote) {
    const lote = linhas.slice(i, i + tamanhoDoLote);
    try {
      await prisma.$transaction(lote.map((l) => modelo.upsert(args(l)) as never));
      conta.gravadas += lote.length;
    } catch {
      // Um lote recusado é refeito linha a linha, para nomear só a que bateu (unicidade, chave estrangeira).
      for (const l of lote) {
        try {
          await modelo.upsert(args(l));
          conta.gravadas++;
        } catch (e) {
          conta.recusadas.push({ id: l.id, erro: (e as { code?: string; message?: string }).code ?? String((e as Error).message).slice(0, 200) });
        }
      }
    }
  }
}

/** As funções de disco de um serviço (originais do financeiro, comprovantes, faturas). */
type Disco = {
  ler(tenantId: string, chave: string): Promise<Buffer | null>;
  gravar(tenantId: string, chave: string, conteudo: Uint8Array): Promise<void>;
  apagar(tenantId: string, chave: string): Promise<void>;
};
const discoDoFinanceiro: Disco = { ler: lerOriginal, gravar: gravarOriginal, apagar: apagarOriginal };
const discoDosComprovantes: Disco = { ler: arquivosDosComprovantes.lerArquivo, gravar: arquivosDosComprovantes.gravarArquivo, apagar: arquivosDosComprovantes.apagarArquivo };
const discoDasFaturas: Disco = { ler: arquivosDasFaturas.lerArquivo, gravar: arquivosDasFaturas.gravarArquivo, apagar: arquivosDasFaturas.apagarArquivo };

/**
 * Os bytes (já conferidos) no disco, pela função do serviço. Idempotente: o arquivo que já está lá com o
 * mesmo SHA-256 fica como está; com outro conteúdo, é reescrito. Sem `--gravar`, nada vai para o disco.
 * O arquivo criado nesta rodada fica em `criadosAgora`, para não sobrar órfão se o banco recusar a linha.
 */
async function paraODisco(disco: Disco, conta: Contagem, id: string, chave: string, bytes: Uint8Array, sha256: string, criadosAgora: Map<string, string>): Promise<boolean> {
  if (!gravar) return true;
  const arquivos = (conta.arquivos ??= { gravados: 0, jaIguais: 0, reescritos: 0 });
  try {
    const atual = await disco.ler(tenantId, chave);
    if (atual && mapear.sha256Hex(atual) === sha256) {
      arquivos.jaIguais++;
    } else {
      await disco.gravar(tenantId, chave, bytes);
      if (atual) arquivos.reescritos++;
      else {
        arquivos.gravados++;
        criadosAgora.set(id, chave);
      }
    }
    return true;
  } catch (e) {
    conta.recusadas.push({ id, erro: `original não gravado em disco: ${String((e as Error).message).slice(0, 150)}` });
    return false;
  }
}

/** O arquivo gravado nesta rodada cuja linha o banco recusou não fica órfão. */
async function semOrfaos(disco: Disco, conta: Contagem, criadosAgora: Map<string, string>) {
  for (const r of conta.recusadas) {
    const chave = criadosAgora.get(r.id);
    if (chave) await disco.apagar(tenantId, chave);
  }
}

/** O tipo de mídia do comprovante pelo conteúdo, como o cadastro do serviço; o formato que ele não aceita fica pelo nome. */
function tipoDoComprovante(nome: string, bytes: Uint8Array): string {
  const formato = formatoDoComprovante(nome, "", bytes);
  return formato ? (formato.pdf ? "application/pdf" : formato.tipoMime) : tipoDoArquivo(nome);
}

/** As colunas lidas sem o arquivo (o `arquivo_base64` e o `conteudo` são lidos um por vez). */
const COLUNAS_DO_COMPROVANTE =
  "id, empresa_id, agencia_id, transacao_id, favorecido, cpf_cnpj, data_pagamento, data_vencimento, valor_documento, valor_pago, juros, multa, desconto, observacao, arquivo_nome, arquivo_sha256, created_at, updated_at, deleted_at";
const COLUNAS_DO_DOCUMENTO_DA_FATURA = "id, empresa_id, fatura_id, nome, hash_arquivo, status, resultado, erro, created_at, updated_at, deleted_at";

async function main() {
  const origem = new pg.Client({ connectionString: origemUrl, ssl: process.env.CARGA_ORIGEM_SSL === "1" ? { rejectUnauthorized: true } : undefined });
  await origem.connect();
  try {
    // Um retrato só: todas as leituras enxergam o mesmo instante do original.
    await origem.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const q = async (sql: string, args: unknown[] = []) => (await origem.query(sql, args)).rows as mapear.Linha[];

    const tenants = await q("SELECT id FROM tenants WHERE deleted_at IS NULL");
    const tenantOrigem = process.env.CARGA_TENANT_ORIGEM ?? (tenants.length === 1 ? String(tenants[0].id) : null);
    if (!tenantOrigem) throw new Error(`O original tem ${tenants.length} tenants: defina CARGA_TENANT_ORIGEM.`);
    if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) throw new Error("CARGA_TENANT_ID não é um escritório do Connect.");

    // Pessoas: pelo e-mail, no escritório de destino.
    const usuarios = await q("SELECT id, email FROM usuarios WHERE tenant_id = $1", [tenantOrigem]);
    const doConnect = await prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
    const porEmail = new Map(doConnect.map((u) => [u.email.trim().toLowerCase(), u.id]));
    const pessoas = new Map<string, string | null>();
    for (const u of usuarios) {
      const id = porEmail.get(String(u.email).trim().toLowerCase()) ?? null;
      pessoas.set(String(u.id), id);
      if (!id) relatorio.pessoasSemPar.push({ idOriginal: String(u.id), email: String(u.email) });
    }

    // Empresas: pelo CNPJ, nas empresas do escritório de destino.
    const companies = await prisma.company.findMany({ where: { tenantId, cnpj: { not: null } }, select: { id: true, cnpj: true } });
    const porCnpj = new Map<string, string[]>();
    for (const c of companies) porCnpj.set(mapear.digitos(c.cnpj), [...(porCnpj.get(mapear.digitos(c.cnpj)) ?? []), c.id]);
    const empresas = await q("SELECT * FROM empresas WHERE tenant_id = $1 ORDER BY created_at", [tenantOrigem]);

    for (const e of empresas) {
      const idOriginal = String(e.id);
      const cnpj = String(e.cnpj);
      const pares = porCnpj.get(mapear.digitos(cnpj)) ?? [];
      if (pares.length !== 1) {
        relatorio.empresasSemPar.push({ idOriginal, cnpj, razaoSocial: String(e.razao_social) });
        console.log(`empresa ${mascara(cnpj)}: ${pares.length ? "mais de uma empresa no Connect com este CNPJ" : "sem par no Connect"} (fica de fora)`);
        continue;
      }
      // Já ligada no Connect com outro cadastro: não sobrescreve o que alguém criou lá.
      const ligada = await prisma.coreEmpresa.findFirst({ where: { OR: [{ companyId: pares[0] }, { tenantId, cnpj }] }, select: { id: true } });
      if (ligada && ligada.id !== idOriginal) {
        relatorio.empresasJaLigadas.push({ idOriginal, cnpj, idNoConnect: ligada.id });
        console.log(`empresa ${mascara(cnpj)}: já está no Contábil Core do Connect com outro cadastro (fica de fora)`);
        continue;
      }

      const contagem: (typeof relatorio.porEmpresa)[string] = {};
      relatorio.porEmpresa[idOriginal] = contagem;
      const etapa = async (nome: string, modelo: Modelo, linhas: { id: string }[], semAtualizar: string[] = []) => {
        contagem[nome] = { lidas: linhas.length, gravadas: 0, recusadas: [] };
        await upsertMuitos(modelo, linhas, contagem[nome], semAtualizar);
      };
      const daEmpresa = (tabela: string, ordem = "created_at, id") => q(`SELECT * FROM ${tabela} WHERE empresa_id = $1 ORDER BY ${ordem}`, [idOriginal]);

      await etapa("empresa", prisma.coreEmpresa as unknown as Modelo, [mapear.empresa(e, tenantId, pares[0])]);
      const contas = await daEmpresa("plano_contas");
      // Primeiro todas as contas sem o pai; depois o pai, quando todas já existem.
      await etapa("plano_contas", prisma.corePlanoConta as unknown as Modelo, contas.map((l) => mapear.conta(l, tenantId)), ["paiId"]);
      if (gravar) {
        for (const l of contas) {
          await prisma.corePlanoConta.update({ where: { id: String(l.id) }, data: { paiId: l.pai_id ? String(l.pai_id) : null } }).catch(() => undefined);
        }
      }
      await etapa("faixas", prisma.corePlanoFaixa as unknown as Modelo, (await daEmpresa("plano_contas_faixas_tipo")).map((l) => mapear.faixa(l, tenantId)));
      const agenciasLidas = await daEmpresa("agencias_bancarias");
      await etapa("agencias", prisma.coreAgencia as unknown as Modelo, agenciasLidas.map((l) => mapear.agencia(l, tenantId)));
      await etapa("contrapartes", prisma.coreContraparte as unknown as Modelo, (await daEmpresa("contrapartes")).map((l) => mapear.contraparte(l, tenantId, pessoas)));
      await etapa("regras", prisma.coreRegra as unknown as Modelo, (await daEmpresa("regras")).map((l) => mapear.regra(l, tenantId)));
      await etapa("importacoes", prisma.coreImportacao as unknown as Modelo, (await daEmpresa("extrato_importacoes")).map((l) => mapear.importacao(l, tenantId, pessoas)));
      await etapa("transacoes", prisma.coreTransacao as unknown as Modelo, (await daEmpresa("transacoes", "data, ordem NULLS LAST, id")).map((l) => mapear.transacao(l, tenantId, pessoas)));
      await etapa("decisoes", prisma.coreNeoDecisao as unknown as Modelo, (await daEmpresa("neo_decisoes", "processado_em, id")).map((l) => mapear.decisao(l, tenantId)));
      await etapa("registros", prisma.coreRegistro as unknown as Modelo, (await daEmpresa("registros_contabeis")).map((l) => mapear.registro(l, tenantId, pessoas)));
      await etapa("exportacoes", prisma.coreExportacao as unknown as Modelo, (await daEmpresa("export_jobs")).map((l) => mapear.exportacao(l, tenantId, pessoas)));

      // ── Bloco B (B5): a conciliação. Depois das transações, de que o `extrato_hash` depende. ──
      const nova = (nome: string): Contagem => (contagem[nome] = { lidas: 0, gravadas: 0, recusadas: [] });
      /** Linha a linha: a que não converte (JSON com inteiro fora do limite) fica de fora, nomeada. */
      const converter = <T>(linhas: mapear.Linha[], fn: (l: mapear.Linha) => T, conta: Contagem): T[] => {
        const ok: T[] = [];
        for (const l of linhas) {
          try {
            ok.push(fn(l));
          } catch (e) {
            conta.recusadas.push({ id: String(l.id), erro: String((e as Error).message).slice(0, 200) });
          }
        }
        return ok;
      };
      /** Revisões e análises em páginas de 50: o snapshot de uma só pode ter milhares de linhas. O retrato é o mesmo (REPEATABLE READ). */
      const emPaginas = async (tabela: string, fn: (pagina: mapear.Linha[]) => Promise<void>) => {
        for (let desde = 0; ; desde += 50) {
          const pagina = await q(`SELECT * FROM ${tabela} WHERE empresa_id = $1 ORDER BY created_at, id LIMIT 50 OFFSET ${desde}`, [idOriginal]);
          if (!pagina.length) break;
          await fn(pagina);
        }
      };
      // `agenciaId` é referência sem chave estrangeira; a agência veio acima, com o mesmo UUID. A que não veio (apagada de verdade no original) vai para o relatório.
      const agencias = new Set(agenciasLidas.map((l) => String(l.id)));
      const conferirAgencia = (conta: Contagem, pagina: mapear.Linha[]) => {
        for (const l of pagina) if (!agencias.has(String(l.agencia_id))) (conta.semAgencia ??= []).push(String(l.id));
      };

      const revisoes = nova("revisoes");
      await emPaginas("conciliacao_revisoes", async (pagina) => {
        revisoes.lidas += pagina.length;
        conferirAgencia(revisoes, pagina);
        await upsertMuitos(prisma.coreConciliacaoRevisao as unknown as Modelo, converter(pagina, (l) => mapear.revisao(l, tenantId, pessoas), revisoes), revisoes, [], 10);
      });
      const vinculosDaRevisao = nova("vinculos_revisao");
      const lidosDaRevisao = await daEmpresa("conciliacao_vinculos");
      vinculosDaRevisao.lidas = lidosDaRevisao.length;
      await upsertMuitos(prisma.coreConciliacaoVinculo as unknown as Modelo, converter(lidosDaRevisao, (l) => mapear.vinculoDaRevisao(l, tenantId, pessoas), vinculosDaRevisao), vinculosDaRevisao);

      const analises = nova("analises");
      await emPaginas("financeiro_analises", async (pagina) => {
        analises.lidas += pagina.length;
        conferirAgencia(analises, pagina);
        await upsertMuitos(prisma.coreFinanceiroAnalise as unknown as Modelo, converter(pagina, (l) => mapear.analise(l, tenantId, pessoas), analises), analises, [], 10);
      });

      // Documentos: os bytes de um por vez, conferidos contra o `hash_arquivo` antes de ir para o disco.
      const documentos = nova("documentos");
      documentos.arquivos = { gravados: 0, jaIguais: 0, reescritos: 0 };
      const metas = await q(
        "SELECT id, empresa_id, analise_id, nome_arquivo, tipo, hash_arquivo, media_type, tamanho, created_at, updated_at, deleted_at FROM financeiro_documentos WHERE empresa_id = $1 ORDER BY created_at, id",
        [idOriginal],
      );
      documentos.lidas = metas.length;
      const linhasDosDocumentos: { id: string }[] = [];
      const criadosAgora = new Map<string, string>();
      for (const m of metas) {
        const id = String(m.id);
        const [linha] = await q("SELECT conteudo FROM financeiro_documentos WHERE id = $1", [id]);
        const conteudo = linha?.conteudo as Buffer | null | undefined;
        const motivo = mapear.conferirOriginal(conteudo, m);
        if (motivo || !conteudo) {
          documentos.recusadas.push({ id, erro: motivo ?? "documento sem conteúdo no original" });
          continue;
        }
        const storageKey = chaveDoOriginal(tenantId, id, String(m.nome_arquivo));
        if (!(await paraODisco(discoDoFinanceiro, documentos, id, storageKey, conteudo, String(m.hash_arquivo), criadosAgora))) continue;
        linhasDosDocumentos.push(mapear.documento(m, tenantId, storageKey));
      }
      await upsertMuitos(prisma.coreFinanceiroDocumento as unknown as Modelo, linhasDosDocumentos, documentos);
      await semOrfaos(discoDoFinanceiro, documentos, criadosAgora);

      const vinculosDoFinanceiro = nova("vinculos_financeiro");
      const lidosDoFinanceiro = await daEmpresa("financeiro_vinculos");
      vinculosDoFinanceiro.lidas = lidosDoFinanceiro.length;
      await upsertMuitos(prisma.coreFinanceiroVinculo as unknown as Modelo, converter(lidosDoFinanceiro, (l) => mapear.vinculoDoFinanceiro(l, tenantId, pessoas), vinculosDoFinanceiro), vinculosDoFinanceiro);

      // ── Bloco C (C4): os documentos, na ordem das chaves estrangeiras. Sem coluna de pessoa. ──
      const blocoC: mapear.LinhasDoBlocoC = {
        notas: await daEmpresa("notas_fiscais"),
        comprovantes: await q(`SELECT ${COLUNAS_DO_COMPROVANTE} FROM comprovantes WHERE empresa_id = $1 ORDER BY created_at, id`, [idOriginal]),
        cartoes: await daEmpresa("cartoes_credito"),
        faturas: await daEmpresa("faturas_cartao"),
        lancamentos: await daEmpresa("lancamentos_cartao"),
        documentos: await q(`SELECT ${COLUNAS_DO_DOCUMENTO_DA_FATURA} FROM fatura_documentos WHERE empresa_id = $1 ORDER BY created_at, id`, [idOriginal]),
        distribuicoes: await daEmpresa("fatura_distribuicoes"),
      };
      const puladas = mapear.puladasPelasTravas(blocoC);
      const desfeitas = new Set((await q("SELECT id FROM transacoes WHERE empresa_id = $1 AND deleted_at IS NOT NULL", [idOriginal])).map((l) => String(l.id)));
      /** A etapa do Bloco C: as linhas que as travas recusariam ficam de fora com o motivo; as ligadas a transação desfeita, anotadas. */
      const doBlocoC = (nome: string, linhas: mapear.Linha[]) => {
        const conta = nova(nome);
        conta.lidas = linhas.length;
        const ficam: mapear.Linha[] = [];
        for (const l of linhas) {
          const motivo = puladas.get(String(l.id));
          if (motivo) (conta.puladas ??= []).push({ id: String(l.id), motivo });
          else ficam.push(l);
          if (l.transacao_id && desfeitas.has(String(l.transacao_id))) (conta.comTransacaoDesfeita ??= []).push(String(l.id));
        }
        return { conta, ficam };
      };

      const notas = doBlocoC("notas", blocoC.notas);
      await upsertMuitos(prisma.coreNotaFiscal as unknown as Modelo, notas.ficam.map((l) => mapear.notaFiscal(l, tenantId)), notas.conta);

      // Comprovantes: o base64 de um por vez, decodificado como o original e conferido antes de ir para o disco.
      const comprovantes = doBlocoC("comprovantes", blocoC.comprovantes);
      comprovantes.conta.arquivos = { gravados: 0, jaIguais: 0, reescritos: 0 };
      const linhasDosComprovantes: { id: string }[] = [];
      const comprovantesCriadosAgora = new Map<string, string>();
      for (const m of comprovantes.ficam) {
        const id = String(m.id);
        const [linha] = await q("SELECT arquivo_base64 FROM comprovantes WHERE id = $1", [id]);
        const arquivo = mapear.arquivoDoComprovante({ ...m, arquivo_base64: linha?.arquivo_base64 });
        if (arquivo.tipo === "recusa") {
          comprovantes.conta.recusadas.push({ id, erro: arquivo.motivo });
          continue;
        }
        if (arquivo.tipo === "base64_invalido") (comprovantes.conta.base64Invalido ??= []).push(id);
        if (arquivo.tipo !== "arquivo") {
          linhasDosComprovantes.push(mapear.comprovante(m, tenantId, null));
          continue;
        }
        if (arquivo.calculado) (comprovantes.conta.sha256Calculado ??= []).push(id);
        const nome = String(m.arquivo_nome ?? "");
        const storageKey = arquivosDosComprovantes.chaveDoArquivo(tenantId, id, nome);
        if (!(await paraODisco(discoDosComprovantes, comprovantes.conta, id, storageKey, arquivo.bytes, arquivo.sha256, comprovantesCriadosAgora))) continue;
        linhasDosComprovantes.push(
          mapear.comprovante(m, tenantId, { sha256: arquivo.sha256, tamanho: arquivo.bytes.length, tipo: tipoDoComprovante(nome, arquivo.bytes), storageKey }),
        );
      }
      await upsertMuitos(prisma.coreComprovante as unknown as Modelo, linhasDosComprovantes, comprovantes.conta);
      await semOrfaos(discoDosComprovantes, comprovantes.conta, comprovantesCriadosAgora);

      const cartoes = doBlocoC("cartoes", blocoC.cartoes);
      await upsertMuitos(prisma.coreCartaoCredito as unknown as Modelo, cartoes.ficam.map((l) => mapear.cartao(l, tenantId)), cartoes.conta);
      const faturas = doBlocoC("faturas", blocoC.faturas);
      await upsertMuitos(prisma.coreFaturaCartao as unknown as Modelo, faturas.ficam.map((l) => mapear.fatura(l, tenantId)), faturas.conta);
      const lancamentos = doBlocoC("lancamentos_cartao", blocoC.lancamentos);
      await upsertMuitos(prisma.coreLancamentoCartao as unknown as Modelo, lancamentos.ficam.map((l) => mapear.lancamentoCartao(l, tenantId)), lancamentos.conta);

      // Documentos da fatura: o PDF de um por vez, conferido contra o `hash_arquivo` antes de ir para o disco.
      const documentosDaFatura = doBlocoC("documentos_fatura", blocoC.documentos);
      documentosDaFatura.conta.arquivos = { gravados: 0, jaIguais: 0, reescritos: 0 };
      const linhasDosPdfs: { id: string }[] = [];
      const pdfsCriadosAgora = new Map<string, string>();
      for (const m of documentosDaFatura.ficam) {
        const id = String(m.id);
        const [linha] = await q("SELECT conteudo FROM fatura_documentos WHERE id = $1", [id]);
        const conteudo = linha?.conteudo as Buffer | null | undefined;
        const motivo = mapear.conferirPdfDaFatura(conteudo, m);
        if (motivo || !conteudo) {
          documentosDaFatura.conta.recusadas.push({ id, erro: motivo ?? "documento sem conteúdo no original" });
          continue;
        }
        const storageKey = arquivosDasFaturas.chaveDoArquivo(tenantId, id);
        try {
          const dados = mapear.faturaDocumento(m, tenantId, { storageKey, tamanho: conteudo.length });
          if (!(await paraODisco(discoDasFaturas, documentosDaFatura.conta, id, storageKey, conteudo, String(m.hash_arquivo), pdfsCriadosAgora))) continue;
          linhasDosPdfs.push(dados);
        } catch (e) {
          // O `resultado` com inteiro fora do limite (`jsonDoOriginal`): a linha fica de fora, nomeada.
          documentosDaFatura.conta.recusadas.push({ id, erro: String((e as Error).message).slice(0, 200) });
        }
      }
      await upsertMuitos(prisma.coreFaturaDocumento as unknown as Modelo, linhasDosPdfs, documentosDaFatura.conta);
      await semOrfaos(discoDasFaturas, documentosDaFatura.conta, pdfsCriadosAgora);

      const distribuicoes = doBlocoC("distribuicoes_fatura", blocoC.distribuicoes);
      // A `aplicacao` nula vai como NULL do banco (o Prisma não aceita `null` puro numa coluna JSON).
      const linhasDasDistribuicoes = converter(distribuicoes.ficam, (l) => mapear.faturaDistribuicao(l, tenantId), distribuicoes.conta).map((d) => ({ ...d, aplicacao: d.aplicacao ?? Prisma.DbNull }));
      await upsertMuitos(prisma.coreFaturaDistribuicao as unknown as Modelo, linhasDasDistribuicoes, distribuicoes.conta);

      const resumo = Object.entries(contagem)
        .map(([t, c]) => {
          const extra = [
            c.recusadas.length ? `${c.recusadas.length} recusadas` : "",
            c.puladas?.length ? `${c.puladas.length} puladas pelas travas do Connect` : "",
            c.sha256Calculado?.length ? `${c.sha256Calculado.length} com o SHA-256 calculado aqui` : "",
            c.base64Invalido?.length ? `${c.base64Invalido.length} sem arquivo (base64 inválido)` : "",
            c.comTransacaoDesfeita?.length ? `${c.comTransacaoDesfeita.length} ligadas a transação desfeita` : "",
            c.semAgencia?.length ? `${c.semAgencia.length} sem a conta bancária` : "",
            c.arquivos && gravar ? `arquivos: ${c.arquivos.gravados} novos, ${c.arquivos.jaIguais} iguais, ${c.arquivos.reescritos} reescritos` : "",
          ].filter(Boolean);
          return `${t} ${gravar ? `${c.gravadas}/${c.lidas}` : c.lidas}${extra.length ? ` (${extra.join("; ")})` : ""}`;
        })
        .join(", ");
      console.log(`empresa ${mascara(cnpj)}: ${resumo}`);
    }
    await origem.query("COMMIT");
  } finally {
    await origem.end();
  }

  writeFileSync(caminhoDoRelatorio, JSON.stringify(relatorio, null, 1), "utf8");
  const contagens = Object.values(relatorio.porEmpresa).flatMap((t) => Object.values(t));
  const recusadas = contagens.reduce((s, c) => s + c.recusadas.length, 0);
  const puladas = contagens.reduce((s, c) => s + (c.puladas?.length ?? 0), 0);
  console.log(
    `\n${gravar ? "Carga gravada" : "Simulação (nada gravado; use --gravar)"}: ${Object.keys(relatorio.porEmpresa).length} empresa(s), ` +
      `${relatorio.empresasSemPar.length} sem par, ${relatorio.empresasJaLigadas.length} já ligada(s) com outro cadastro, ` +
      `${relatorio.pessoasSemPar.length} pessoa(s) sem par, ${recusadas} linha(s) recusada(s), ${puladas} pulada(s) pelas travas do Connect.\nRelatório: ${caminhoDoRelatorio}`,
  );
  // A pulada também pede atenção: o dado está no original e não veio (o motivo está no relatório).
  process.exitCode = recusadas || puladas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
