// Carga dos dados do Aditiva Pronto para "Contratos e honorários" (F3 da migracao-622, 11/11/2026).
//
// Cópia de mão única, que pode ser repetida sem duplicar: cada coisa entra pela chave dela
// (vínculo pelo nome da pasta, texto pela chave do arquivo, envio pelo id do Aditiva, varredura
// pelo id do job). Lê o MySQL do Aditiva numa transação SOMENTE LEITURA e grava no Connect pelo
// Prisma. Sem `--gravar`, só simula: diz o que entraria e o que não casou.
//
// O que vem: configuração da varredura, vínculos pasta-empresa, empresas "sem pasta", valores
// informados à mão (só se mais novos que os do Connect), textos lidos, a última leitura do
// Acessórias, o histórico de envios e a última varredura concluída (pastas e arquivos), para as
// telas abrirem com dados antes de o robô rodar no Connect.
//
// Variáveis de ambiente (nunca por argumento, para não ficarem no histórico do terminal):
//   CARGA_ORIGEM_URL   mysql://usuario_somente_leitura:...@host:porta/aditiva_pronto
//   CARGA_TENANT_ID    o escritório do Connect que recebe os dados
//   DATABASE_URL       o banco do Connect (o mesmo do app)
//
// Uso:
//   npx tsx --env-file=.env scripts/honorarios/carga-do-aditiva.ts [--gravar] [--relatorio=<arquivo.json>]
//
// O terminal mostra só contagens. O que identifica empresa (CNPJ, razão social) vai para o
// relatório, um arquivo local (por padrão na pasta temporária), que não deve ir para o git.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mariadb from "mariadb";
import { Prisma } from "../../src/generated/prisma/client";
import { getPrisma } from "../../src/lib/prisma";
import { hashDaPasta } from "../../src/lib/honorarios/servidor/auditRepository";
import {
  casarEmpresas,
  dataSemFuso,
  digitos,
  json,
  manualVence,
  mapearVinculos,
  quemNoAditiva,
  type EmpresaDoAditiva,
  type VinculoDoAditiva,
} from "../../src/lib/honorarios/carga/mapear";

const gravar = process.argv.includes("--gravar");
const relatorioArg = process.argv.find((a) => a.startsWith("--relatorio="))?.slice("--relatorio=".length);
const caminhoDoRelatorio = relatorioArg || join(tmpdir(), `carga-honorarios-${Date.now()}.json`);

const origemUrl = process.env.CARGA_ORIGEM_URL;
const tenantDoAmbiente = process.env.CARGA_TENANT_ID;
if (!origemUrl) throw new Error("Defina CARGA_ORIGEM_URL (usuário somente leitura do banco do Aditiva).");
if (!tenantDoAmbiente) throw new Error("Defina CARGA_TENANT_ID (o escritório do Connect que recebe os dados).");
const tenantId: string = tenantDoAmbiente;

const prisma = getPrisma();
const contagens: Record<string, { lidas: number; gravadas: number; fora: number }> = {};
const relatorio = {
  modo: gravar ? "gravar" : "simular",
  empresasSemPar: [] as { idNoAditiva: string; cnpj: string | null; razaoSocial: string }[],
  empresasAmbiguas: [] as { idNoAditiva: string; cnpj: string | null; razaoSocial: string }[],
  vinculosSemEmpresa: [] as { pasta: string; tipo: string }[],
  contagens,
};
const conta = (etapa: string, lidas: number, gravadas: number, fora = 0) => {
  contagens[etapa] = { lidas, gravadas, fora };
  console.log(`${etapa.padEnd(26)} lidas ${String(lidas).padStart(6)} · ${gravar ? "gravadas" : "entrariam"} ${String(gravadas).padStart(6)} · fora ${fora}`);
};

const dec = (v: unknown) => (v === null || v === undefined ? null : new Prisma.Decimal(String(v)));
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
type Linha = Record<string, unknown>;
/** JSON do MySQL (texto ou objeto) para coluna Json do Prisma; vazio vira NULL do banco. */
const jsonParaGravar = (v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => {
  const valor = json<Prisma.InputJsonValue | null>(v, null);
  return valor === null ? Prisma.DbNull : valor;
};

async function emLotes<T>(itens: T[], tamanho: number, fazer: (lote: T[]) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += tamanho) await fazer(itens.slice(i, i + tamanho));
}

async function main() {
  if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) {
    throw new Error("CARGA_TENANT_ID não é um escritório do Connect.");
  }
  const url = new URL(origemUrl!);
  const origem = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    // O MySQL 8 usa caching_sha2_password: sem isto a conexão cai com "RSA public key is not
    // available" (o mesmo parâmetro que o DATABASE_URL do Connect precisa).
    allowPublicKeyRetrieval: true,
    bigIntAsNumber: true,
    insertIdAsNumber: true,
    dateStrings: false,
    timezone: "Z",
  });
  try {
    // Um retrato só: todas as leituras enxergam o mesmo instante do Aditiva.
    await origem.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await origem.query("START TRANSACTION READ ONLY");
    const q = (sql: string, args: unknown[] = []) => origem.query(sql, args) as Promise<Linha[]>;

    // ── Empresas: pelo CNPJ inteiro ────────────────────────────────
    const doAditiva = (await q("SELECT id, cnpj, razao_social FROM companies")) as unknown as EmpresaDoAditiva[];
    const doConnect = await prisma.company.findMany({ where: { tenantId, cnpj: { not: null } }, select: { id: true, cnpj: true } });
    const { porId, semPar, ambiguas } = casarEmpresas(doAditiva, doConnect);
    relatorio.empresasSemPar = semPar.map((e) => ({ idNoAditiva: e.id, cnpj: e.cnpj, razaoSocial: e.razao_social }));
    relatorio.empresasAmbiguas = ambiguas.map((e) => ({ idNoAditiva: e.id, cnpj: e.cnpj, razaoSocial: e.razao_social }));
    conta("empresas casadas", doAditiva.length, porId.size, semPar.length + ambiguas.length);

    // ── Configuração ───────────────────────────────────────────────
    const [config] = await q("SELECT raiz_unc, pasta_inicial, pasta_final, regex_subpasta_contrato, horario_agendado FROM au_config WHERE id = 1");
    if (config && gravar) {
      const dados = {
        raizUnc: String(config.raiz_unc),
        pastaInicial: String(config.pasta_inicial),
        pastaFinal: String(config.pasta_final),
        regexSubpastaContrato: String(config.regex_subpasta_contrato),
        horarioAgendado: texto(config.horario_agendado),
      };
      await prisma.honorarioConfig.upsert({ where: { tenantId }, create: { tenantId, ...dados }, update: dados });
    }
    conta("configuração", config ? 1 : 0, config ? 1 : 0);

    // ── Vínculos pasta-empresa ─────────────────────────────────────
    const vinculos = (await q("SELECT nome_pasta, company_id, tipo, vinculado_em FROM au_folder_links")) as unknown as VinculoDoAditiva[];
    const { gravar: vinculosOk, semEmpresa } = mapearVinculos(vinculos, porId);
    relatorio.vinculosSemEmpresa = semEmpresa.map((v) => ({ pasta: v.nome_pasta, tipo: v.tipo }));
    if (gravar) {
      // Linha a linha, sem lote em transação: com a latência até a produção, 200 upserts numa
      // transação passaram dos 5 s do Prisma (12/11/2026). Cada upsert é idempotente, então
      // uma carga interrompida se completa rodando de novo.
      for (const v of vinculosOk) {
        const nomePastaHash = hashDaPasta(v.nomePasta);
        const dados = { nomePasta: v.nomePasta, companyId: v.companyId, tipo: v.tipo, vinculadoEm: v.vinculadoEm };
        await prisma.honorarioVinculoPasta.upsert({
          where: { tenantId_nomePastaHash: { tenantId, nomePastaHash } },
          create: { tenantId, nomePastaHash, ...dados },
          update: dados,
        });
      }
    }
    conta("vínculos de pasta", vinculos.length, vinculosOk.length, semEmpresa.length);

    // ── Empresas sem pasta ─────────────────────────────────────────
    const marcas = await q("SELECT company_id, motivo, marcado_em FROM au_empresas_sem_pasta");
    const marcasOk = marcas.filter((m) => porId.has(String(m.company_id)));
    if (gravar) {
      for (const m of marcasOk) {
        const companyId = porId.get(String(m.company_id))!;
        const dados = { motivo: texto(m.motivo), marcadoEm: m.marcado_em as Date };
        await prisma.honorarioEmpresaSemPasta.upsert({ where: { companyId }, create: { companyId, tenantId, ...dados }, update: dados });
      }
    }
    conta("empresas sem pasta", marcas.length, marcasOk.length, marcas.length - marcasOk.length);

    // ── Valores informados à mão ───────────────────────────────────
    const manuais = await q("SELECT company_id, valor, documento, observacao, origem, informado_por, informado_em FROM au_honorarios_manuais");
    const jaNoConnect = new Map(
      (await prisma.honorarioManual.findMany({ where: { tenantId }, select: { companyId: true, informadoEm: true } })).map((m) => [m.companyId, m.informadoEm]),
    );
    let manuaisOk = 0;
    for (const m of manuais) {
      const companyId = porId.get(String(m.company_id));
      if (!companyId || !manualVence(m.informado_em as Date, jaNoConnect.get(companyId))) continue;
      manuaisOk++;
      if (!gravar) continue;
      const dados = {
        valor: dec(m.valor)!,
        documento: texto(m.documento),
        observacao: texto(m.observacao),
        origem: m.origem === "acessorias" ? "acessorias" : "digitado",
        informadoPor: quemNoAditiva(texto(m.informado_por)),
        informadoEm: m.informado_em as Date,
      };
      await prisma.honorarioManual.upsert({ where: { companyId }, create: { companyId, tenantId, ...dados }, update: dados });
    }
    conta("valores à mão", manuais.length, manuaisOk, manuais.length - manuaisOk);

    // ── Textos lidos dos contratos e aditivos ──────────────────────
    const [{ total: totalDeTextos }] = await q("SELECT COUNT(*) AS total FROM au_textos");
    let textosLidos = 0;
    for (let pagina = 0; ; pagina++) {
      const lote = await q(
        `SELECT chave, nome_pasta, caminho_relativo, modificado_em, tamanho, status, paginas, texto, erro, extraido_em,
                robo_versao, leitor_versao, tipo_documento, DATE_FORMAT(data_documento, '%Y-%m-%d') AS data_documento,
                honorario, adicional_funcionario, forma_leitura, condicional, trecho, cnpjs
         FROM au_textos ORDER BY chave LIMIT 200 OFFSET ?`,
        [pagina * 200],
      );
      if (!lote.length) break;
      textosLidos += lote.length;
      if (gravar) {
        // Linha a linha, pelo mesmo motivo dos vínculos (o texto pesa e a latência soma).
        for (const t of lote) {
            const dados = {
              nomePasta: String(t.nome_pasta),
              caminhoRelativo: String(t.caminho_relativo),
              modificadoEm: t.modificado_em as Date,
              tamanho: BigInt(String(t.tamanho)),
              status: String(t.status),
              paginas: t.paginas === null ? null : Number(t.paginas),
              texto: texto(t.texto),
              erro: texto(t.erro),
              extraidoEm: t.extraido_em as Date,
              roboVersao: texto(t.robo_versao),
              leitorVersao: Number(t.leitor_versao ?? 0),
              tipoDocumento: texto(t.tipo_documento),
              dataDocumento: dataSemFuso(texto(t.data_documento)),
              honorario: dec(t.honorario),
              adicionalFuncionario: dec(t.adicional_funcionario),
              formaLeitura: texto(t.forma_leitura),
              condicional: t.condicional === null ? null : Number(t.condicional) === 1,
              trecho: texto(t.trecho),
              cnpjs: texto(t.cnpjs),
            };
            const chave = String(t.chave);
            await prisma.honorarioTexto.upsert({
              where: { tenantId_chave: { tenantId, chave } },
              create: { tenantId, chave, ...dados },
              update: dados,
            });
        }
      }
    }
    conta("textos lidos", Number(totalDeTextos), textosLidos);

    // ── Última leitura do Acessórias ───────────────────────────────
    const acessorias = await q("SELECT cnpj_digitos, identificador, acessorias_id, razao, situacao, honorario, lido_em FROM au_acessorias_empresas");
    if (gravar && acessorias.length) {
      await prisma.$transaction(
        async (tx) => {
          await tx.honorarioAcessoriasEmpresa.deleteMany({ where: { tenantId } });
          await emLotes(acessorias, 500, (lote) =>
            tx.honorarioAcessoriasEmpresa.createMany({
              data: lote.map((a) => ({
                tenantId,
                cnpjDigitos: digitos(texto(a.cnpj_digitos)),
                identificador: String(a.identificador),
                acessoriasId: texto(a.acessorias_id),
                razao: texto(a.razao),
                situacao: texto(a.situacao),
                honorario: dec(a.honorario),
                lidoEm: a.lido_em as Date,
              })),
              skipDuplicates: true,
            }),
          );
        },
        { timeout: 60_000 },
      );
    }
    conta("leitura do Acessórias", acessorias.length, acessorias.length);

    // ── Histórico de envios ao Acessórias ──────────────────────────
    const envios = await q(
      `SELECT id, company_id, cnpj_digitos, razao_social, valor_anterior, valor_enviado, fonte, documento, conta, ip, status, erro,
              outros_campos, ficha_antes, ficha_depois, enviado_em, conferido_em, conferido_por
       FROM au_acessorias_envios`,
    );
    const enviosOk = envios.filter((e) => porId.has(String(e.company_id)));
    if (gravar) {
      for (const e of enviosOk) {
        const id = String(e.id);
        const outros = json<string[] | null>(e.outros_campos, null);
        const dados = {
          tenantId,
          companyId: porId.get(String(e.company_id))!,
          cnpjDigitos: digitos(texto(e.cnpj_digitos)),
          razaoSocial: String(e.razao_social).slice(0, 300),
          valorAnterior: dec(e.valor_anterior),
          valorEnviado: dec(e.valor_enviado)!,
          fonte: String(e.fonte),
          documento: texto(e.documento),
          conta: quemNoAditiva(texto(e.conta)),
          ip: texto(e.ip),
          status: String(e.status),
          erro: texto(e.erro),
          outrosCampos: outros?.length ? outros : Prisma.DbNull,
          fichaAntes: jsonParaGravar(e.ficha_antes),
          fichaDepois: jsonParaGravar(e.ficha_depois),
          enviadoEm: e.enviado_em as Date,
          conferidoEm: (e.conferido_em as Date | null) ?? null,
          conferidoPor: e.conferido_por ? quemNoAditiva(texto(e.conferido_por)) : null,
        };
        await prisma.honorarioAcessoriasEnvio.upsert({ where: { id }, create: { id, ...dados }, update: dados });
      }
    }
    conta("envios ao Acessórias", envios.length, enviosOk.length, envios.length - enviosOk.length);

    // ── Última varredura concluída ─────────────────────────────────
    const [job] = await q(
      `SELECT id, origem, solicitado_em, iniciado_em, ultimo_lote_em, concluido_em, robo_host, pastas_total, pastas_recebidas, arquivos_recebidos
       FROM au_sync_jobs WHERE status = 'concluido' ORDER BY concluido_em DESC LIMIT 1`,
    );
    const maisNovaNoConnect = await prisma.honorarioSyncJob.findFirst({
      where: { tenantId, status: "concluido" },
      orderBy: { concluidoEm: "desc" },
      select: { concluidoEm: true },
    });
    const trazerJob = !!job && (!maisNovaNoConnect?.concluidoEm || (job.concluido_em as Date) > maisNovaNoConnect.concluidoEm);
    let pastasDoJob: Linha[] = [];
    let arquivosDoJob: Linha[] = [];
    if (job && trazerJob) {
      pastasDoJob = await q("SELECT id, nome_pasta, subpastas_contrato, erro FROM au_folders WHERE job_id = ?", [job.id]);
      arquivosDoJob = await q(
        "SELECT folder_id, caminho_relativo, nome, ext, tamanho, modificado_em, pdf_assinado, pdf_marca FROM au_files WHERE job_id = ?",
        [job.id],
      );
    }
    if (gravar && job && trazerJob) {
      const jobId = String(job.id);
      await prisma.$transaction(
        async (tx) => {
          await tx.honorarioSyncJob.deleteMany({ where: { id: jobId, tenantId } });
          await tx.honorarioSyncJob.create({
            data: {
              id: jobId,
              tenantId,
              status: "concluido",
              origem: String(job.origem),
              solicitadoEm: job.solicitado_em as Date,
              iniciadoEm: (job.iniciado_em as Date | null) ?? null,
              ultimoLoteEm: (job.ultimo_lote_em as Date | null) ?? null,
              concluidoEm: job.concluido_em as Date,
              roboHost: texto(job.robo_host),
              pastasTotal: job.pastas_total === null ? null : Number(job.pastas_total),
              pastasRecebidas: Number(job.pastas_recebidas),
              arquivosRecebidos: Number(job.arquivos_recebidos),
            },
          });
          const idDaPasta = new Map<string, bigint>();
          for (const p of pastasDoJob) {
            const nomePasta = String(p.nome_pasta);
            const criada = await tx.honorarioPasta.create({
              data: {
                jobId,
                nomePasta,
                nomePastaHash: hashDaPasta(nomePasta),
                subpastasContrato: json<string[]>(p.subpastas_contrato, []),
                erro: texto(p.erro),
              },
              select: { id: true },
            });
            idDaPasta.set(String(p.id), criada.id);
          }
          await emLotes(arquivosDoJob, 1000, (lote) =>
            tx.honorarioArquivo.createMany({
              data: lote.map((a) => ({
                jobId,
                pastaId: idDaPasta.get(String(a.folder_id))!,
                caminhoRelativo: String(a.caminho_relativo),
                nome: String(a.nome),
                ext: String(a.ext),
                tamanho: BigInt(String(a.tamanho)),
                modificadoEm: a.modificado_em as Date,
                pdfAssinado: a.pdf_assinado === null ? null : Number(a.pdf_assinado) === 1,
                pdfMarca: texto(a.pdf_marca),
              })),
            }),
          );
        },
        { timeout: 300_000 },
      );
    }
    conta("última varredura (pastas)", pastasDoJob.length, trazerJob ? pastasDoJob.length : 0);
    conta("última varredura (arquivos)", arquivosDoJob.length, trazerJob ? arquivosDoJob.length : 0);
    if (job && !trazerJob) {
      console.log("A última varredura do Aditiva já está no Connect (ou o Connect tem uma mais nova): fica como está.");
    }

    await origem.query("COMMIT");
  } finally {
    await origem.end();
  }

  writeFileSync(caminhoDoRelatorio, JSON.stringify(relatorio, null, 2));
  console.log(`\n${gravar ? "Gravado." : "Simulação: nada foi gravado. Rode com --gravar para gravar."}`);
  console.log(`Relatório (com CNPJ e razão social; não vai para o git): ${caminhoDoRelatorio}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
