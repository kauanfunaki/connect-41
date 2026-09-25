// Contas do Omie → `FinanceEntry` da empresa (25/09). Tradução em `financeiro.ts`.
//
// **Só leitura do lado do Omie.** Três listagens: categorias, clientes/
// fornecedores (para o nome da contraparte) e movimentos financeiros.
//
// ─── As regras que decidem ───────────────────────────────────────────────────
//
// - **Prévia antes de gravar.** Os campos vêm da documentação e ainda não foram
//   vistos numa resposta real; `gravar: false` faz a leitura inteira e só conta.
// - **O Omie manda na conta que veio dele.** Lido de novo, o título atualiza a
//   situação, o pagamento, o valor, o vencimento e a categoria. Exceção: conta
//   que no Connect entrou em acordo ou foi baixada por perda — essa decisão é
//   do Connect, e a leitura não a desfaz (`preservados`).
// - **Entra como conferida**, não provisória: quem lançou no Omie foi o BPO.
//   Não passa por alçada (`approvalStatus` fica no padrão, `NAO_REQUER`).
// - **Cancelado que o Connect nunca viu não é criado** — só ocupa lista.
// - **Categoria:** pelo código do Omie. A que o plano da empresa ainda não tem
//   entra no plano **dela** (é particularidade do cliente), com a linha da DRE
//   do de-para padrão quando o nome é conhecido. Nome igual ao do plano padrão
//   usa a do padrão, para não duplicar.
// - **Janela:** títulos com vencimento desde 1º de janeiro do ano passado, em
//   páginas de 500, até 20 páginas por execução; conta grande continua de onde
//   parou na próxima (`cursor` da linha `financeiro:{empresa}`).
//
// ─── Conciliação (25/09, Fase 1) ─────────────────────────────────────────────
//
// Depois dos títulos, a leitura passa às linhas de conta corrente
// (`cTpLancamento: "CC"`, dos últimos 90 dias): a baixa de cada título grava
// em que conta o dinheiro passou e quando o BPO conciliou, e o que não tem
// título (transferência entre contas, tarifa e rendimento lançados do extrato)
// vira lançamento. O cursor diz em que fase parou
// (`t:3`, `c:7`; número puro é da versão anterior, e é página de título).
// Antes de tudo, as contas bancárias do Connect são ligadas às do Omie (a que
// só existe lá é criada aqui), e no
// fim as linhas de extrato que batem com baixa conciliada lá saem da fila
// (`conciliarEmpresaPeloOmie`). Tradução em `conciliacao.ts`.
//
// Limite conhecido: título com mais de uma baixa cujas linhas caiam em páginas
// diferentes fica com a da última página. É pagamento parcial, e raro.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { executar, lerConfig } from "@/lib/integracoes/data";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import { MAPEAMENTO_PADRAO } from "@/lib/dre/mapeamento-padrao";
import { escopoDa, ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { chamarOmie } from "./cliente";
import { instanciaDaEmpresa } from "./contas";
import { lerCategorias, mapearMovimento, paginaDeCategorias, paginaDeMovimentos, type TituloDoOmie } from "./financeiro";
import {
  juntarBaixas,
  lerContasCorrentes,
  ligarContas,
  mapearLinhaDeConta,
  paginaDeContasCorrentes,
  type BaixaDoOmie,
  type LancamentoDeContaDoOmie,
  mesmoNumero,
} from "./conciliacao";
import { conciliarEmpresaPeloOmie } from "@/lib/financeiro/conciliacao/omieServidor";

export const PREFIXO_DO_FINANCEIRO = "financeiro:";
export const instanciaDoFinanceiro = (companyId: string) => `${PREFIXO_DO_FINANCEIRO}${companyId}`;

const POR_PAGINA = 500;
const MAX_PAGINAS = 20;
const MAX_PAGINAS_DE_CADASTRO = 10;

const GRUPO_PADRAO = new Map(MAPEAMENTO_PADRAO.map((p) => [chaveDaCategoria(p.categoria), p.grupo]));
const emAndamento = new Set<string>();

type Cred = { appKey: string; appSecret: string };
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

export type ResumoDoFinanceiro =
  | { companyId: string; ok: true; gravou: boolean; counters: Record<string, number> }
  | { companyId: string; ok: false; erro: string };

function janelaDesde(agora: Date): string {
  return `01/01/${agora.getFullYear() - 1}`;
}

type Fase = "t" | "c";

/** O cursor da linha de progresso: fase e página. Número puro é da versão anterior (títulos). */
export function lerCursor(cursor: string | null | undefined): { fase: Fase; pagina: number } {
  const m = /^(?:([tc]):)?(\d+)$/.exec(cursor ?? "");
  if (!m) return { fase: "t", pagina: 1 };
  return { fase: (m[1] as Fase | undefined) ?? "t", pagina: Math.max(1, Number(m[2])) };
}

const NOME_DA_TRANSFERENCIA = "Transferência entre contas";
const NOME_DO_LANCAMENTO_DE_CONTA = "Lançamento de conta corrente";

/**
 * As linhas de conta corrente vão só 90 dias para trás. Elas servem à
 * conciliação, que é do extrato recente — e são muitas (176 páginas desde 2025
 * na ER Dias). Os títulos continuam com a janela longa: a DRE precisa deles.
 */
function janelaDaConta(agora: Date): string {
  const d = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [ano, mes, dia] = saoPauloParts(d).dateKey.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Todas as páginas de uma listagem de cadastro (categorias, clientes). */
async function todasAsPaginas(
  cred: Cred,
  modulo: string,
  call: string,
  ler: (corpo: unknown) => { itens: unknown[]; totalDePaginas: number }
): Promise<unknown[]> {
  const itens: unknown[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_DE_CADASTRO; pagina++) {
    const corpo = await chamarOmie(cred, modulo, call, { pagina, registros_por_pagina: POR_PAGINA });
    const p = ler(corpo);
    itens.push(...p.itens);
    if (pagina >= p.totalDePaginas || p.itens.length === 0) break;
  }
  return itens;
}

/** Nome e documento de cada cliente/fornecedor do Omie, pelo código. */
async function contrapartesDoOmie(cred: Cred): Promise<Map<string, { nome: string; documento: string | null }>> {
  const itens = await todasAsPaginas(cred, "geral/clientes", "ListarClientesResumido", (corpo) => {
    const o = obj(corpo);
    const lista = Array.isArray(o.clientes_cadastro_resumido) ? o.clientes_cadastro_resumido : Object.values(o).find(Array.isArray) ?? [];
    const total = Number(o.total_de_paginas);
    return { itens: lista as unknown[], totalDePaginas: Number.isFinite(total) && total > 0 ? total : 1 };
  });
  const mapa = new Map<string, { nome: string; documento: string | null }>();
  for (const i of itens.map(obj)) {
    const codigo = texto(i.codigo_cliente) || texto(i.codigo_cliente_omie);
    const nome = texto(i.razao_social) || texto(i.nome_fantasia);
    const doc = texto(i.cnpj_cpf).replace(/\D/g, "");
    if (codigo && nome) mapa.set(codigo, { nome: nome.slice(0, 180), documento: doc.length === 11 || doc.length === 14 ? doc : null });
  }
  return mapa;
}

/**
 * Lê (e, com `gravar`, grava) as contas do Omie da empresa. Sem `gravar` nada é
 * escrito — nem a categoria, nem a contraparte, nem a linha de progresso.
 */
export async function sincronizarFinanceiroDaEmpresa(
  tenantId: string,
  companyId: string,
  trigger: "CRON" | "MANUAL",
  opcoes: { gravar: boolean; agora?: Date }
): Promise<ResumoDoFinanceiro> {
  const chave = `${tenantId}:${companyId}`;
  if (emAndamento.has(chave)) return { companyId, ok: false, erro: "Já existe uma leitura das contas desta empresa em andamento." };

  const prisma = getPrisma();
  const conta = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
  });
  if (!conta) return { companyId, ok: false, erro: "Esta empresa não tem conta do Omie cadastrada." };
  const config = lerConfig(conta.configEnc);
  if (!config.appKey || !config.appSecret) return { companyId, ok: false, erro: "Falta App Key ou App Secret." };
  const cred = { appKey: config.appKey, appSecret: config.appSecret };
  const agora = opcoes.agora ?? new Date();

  const progresso = opcoes.gravar
    ? await prisma.tenantIntegration.upsert({
        where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(companyId) } },
        create: { tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(companyId), label: "Contas do Omie", configEnc: "" },
        update: {},
      })
    : null;

  const ler = async () => {
    const cont: Record<string, number> = { paginas: 0, lidos: 0, novos: 0, atualizados: 0, iguais: 0 };
    const somar = (k: string, n = 1) => (cont[k] = (cont[k] ?? 0) + n);

    // ─── categorias ────────────────────────────────────────────────────────
    const doOmie = lerCategorias(await todasAsPaginas(cred, "geral/categorias", "ListarCategorias", paginaDeCategorias));
    const doPlano = await prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
      select: { id: true, name: true, kind: true, companyId: true, omieCode: true },
    });
    const porCodigo = new Map(doPlano.filter((c) => c.omieCode && c.companyId).map((c) => [c.omieCode!, c.id]));
    const porNome = new Map<string, string>();
    // Padrão primeiro e empresa depois: com o mesmo nome, a da empresa ganha.
    for (const c of [...doPlano].sort((a, b) => Number(a.companyId !== null) - Number(b.companyId !== null))) {
      porNome.set(`${c.kind}|${chaveDaCategoria(c.name)}`, c.id);
    }
    const infoDoCodigo = new Map(doOmie.map((c) => [c.codigo, c]));
    const criadasAgora = new Map<string, string>();

    async function categoriaDo(t: Pick<TituloDoOmie, "kind" | "categoriaCodigo">): Promise<string | null> {
      if (!t.categoriaCodigo) return null;
      const codigo = t.categoriaCodigo;
      const ja = porCodigo.get(codigo) ?? criadasAgora.get(`${t.kind}|${codigo}`);
      if (ja) return ja;
      const info = infoDoCodigo.get(codigo);
      if (!info) return null;
      const kind = info.kind ?? t.kind;
      const pelaNome = porNome.get(`${kind}|${chaveDaCategoria(info.nome)}`);
      if (pelaNome) {
        porCodigo.set(codigo, pelaNome);
        return pelaNome;
      }
      somar("categorias_novas");
      if (!opcoes.gravar) {
        criadasAgora.set(`${t.kind}|${codigo}`, `previa:${codigo}`);
        return `previa:${codigo}`;
      }
      const criada = await prisma.financeCategory.upsert({
        where: { tenantId_scope_name_kind: { tenantId, scope: escopoDa(companyId), name: info.nome, kind } },
        create: {
          tenantId,
          companyId,
          scope: escopoDa(companyId),
          name: info.nome,
          kind,
          planGroup: info.grupo?.slice(0, 120) ?? null,
          dreGroup: GRUPO_PADRAO.get(chaveDaCategoria(info.nome)) ?? null,
          omieCode: codigo,
          active: !info.inativa,
        },
        update: { omieCode: codigo },
        select: { id: true },
      });
      porCodigo.set(codigo, criada.id);
      criadasAgora.set(`${t.kind}|${codigo}`, criada.id);
      return criada.id;
    }

    // ─── contrapartes ──────────────────────────────────────────────────────
    const doOmieContrapartes = await contrapartesDoOmie(cred);
    const existentes = await prisma.financeCounterparty.findMany({
      where: { tenantId, companyId },
      select: { id: true, name: true, document: true },
    });
    const porDocumento = new Map(existentes.filter((e) => e.document).map((e) => [e.document!, e.id]));
    const porNomeDeContraparte = new Map(existentes.map((e) => [e.name.toLowerCase(), e.id]));

    async function contraparteDo(t: Pick<TituloDoOmie, "contraparteCodigo" | "contraparteDocumento">): Promise<string> {
      const cadastro = t.contraparteCodigo ? doOmieContrapartes.get(t.contraparteCodigo) : undefined;
      const documento = t.contraparteDocumento ?? cadastro?.documento ?? null;
      const nome = cadastro?.nome ?? (documento ? `CPF/CNPJ ${documento}` : `Cliente/fornecedor ${t.contraparteCodigo ?? "sem código"} do Omie`);
      const ja = (documento && porDocumento.get(documento)) || porNomeDeContraparte.get(nome.toLowerCase());
      if (ja) return ja;
      somar("contrapartes_novas");
      if (!opcoes.gravar) {
        const id = `previa:${documento ?? nome}`;
        if (documento) porDocumento.set(documento, id);
        porNomeDeContraparte.set(nome.toLowerCase(), id);
        return id;
      }
      const criada = await prisma.financeCounterparty.create({
        data: { tenantId, companyId, name: nome, document: documento },
        select: { id: true },
      });
      if (documento) porDocumento.set(documento, criada.id);
      porNomeDeContraparte.set(nome.toLowerCase(), criada.id);
      return criada.id;
    }

    // ─── contas bancárias ──────────────────────────────────────────────────
    const contasDoOmie = lerContasCorrentes(
      await todasAsPaginas(cred, "geral/contacorrente", "ListarContasCorrentes", paginaDeContasCorrentes)
    );
    const contasDoConnect = await prisma.bankAccount.findMany({
      where: { tenantId, companyId },
      select: { id: true, bankCode: true, accountDigits: true, omieAccountId: true, omieAccountLabel: true },
    });
    const ligadas = ligarContas(contasDoConnect, contasDoOmie);
    const jaUsadas = new Set(contasDoConnect.map((c) => c.omieAccountId).filter(Boolean));
    for (const c of contasDoConnect) {
      const omie = ligadas.get(c.id);
      if (!omie) {
        if (!c.omieAccountId) somar("contas_sem_par_no_omie");
        continue;
      }
      if (c.omieAccountId === omie.id && c.omieAccountLabel === omie.rotulo) {
        somar("contas_ligadas");
        continue;
      }
      // Outra conta do Connect já ligada a esta do Omie: não tira de lá.
      if (c.omieAccountId !== omie.id && jaUsadas.has(omie.id)) {
        somar("contas_sem_par_no_omie");
        continue;
      }
      somar("contas_ligadas");
      if (opcoes.gravar) {
        await prisma.bankAccount.update({ where: { id: c.id }, data: { omieAccountId: omie.id, omieAccountLabel: omie.rotulo } });
        jaUsadas.add(omie.id);
      }
    }
    // Conta ativa que só existe no Omie entra no Connect já ligada: o Omie é a
    // fonte, e sem a conta aqui não há onde importar o extrato. Conta do
    // Connect com o mesmo número que não ligou (dúvida) não ganha gêmea.
    for (const o of contasDoOmie) {
      if (o.inativa || jaUsadas.has(o.id)) continue;
      if (contasDoConnect.some((c) => c.bankCode === o.banco && mesmoNumero(c.accountDigits, o.conta))) continue;
      somar("contas_criadas");
      if (!opcoes.gravar) continue;
      try {
        await prisma.bankAccount.create({
          data: {
            tenantId,
            companyId,
            nickname: o.rotulo.slice(0, 80),
            bankCode: o.banco,
            agency: o.agencia,
            accountNumber: o.numero || o.conta,
            accountDigits: o.conta,
            omieAccountId: o.id,
            omieAccountLabel: o.rotulo,
          },
        });
        jaUsadas.add(o.id);
      } catch (err) {
        if (!isPrismaUniqueError(err)) throw err;
      }
    }

    // Contraparte dos lançamentos de conta que não têm cliente/fornecedor no Omie.
    const contrapartesPorNome = new Map<string, string>();
    async function contraparteChamada(nome: string): Promise<string> {
      const ja = contrapartesPorNome.get(nome) ?? porNomeDeContraparte.get(nome.toLowerCase());
      if (ja) return ja;
      const criada = await prisma.financeCounterparty.create({ data: { tenantId, companyId, name: nome }, select: { id: true } });
      contrapartesPorNome.set(nome, criada.id);
      porNomeDeContraparte.set(nome.toLowerCase(), criada.id);
      return criada.id;
    }

    const inicio = opcoes.gravar ? lerCursor(progresso?.cursor) : { fase: "t" as Fase, pagina: 1 };
    let fase = inicio.fase;
    let pagina = inicio.pagina;
    let proxima: string | null = null;
    let leuContas = false;
    // Na prévia, uma página de cada fase — é amostra, não carga.
    const maxPaginas = opcoes.gravar ? MAX_PAGINAS : 2;
    for (let volta = 0; volta < maxPaginas; volta++) {
      if (fase === "c") {
        leuContas = true;
        const fim = await lerPaginaDeConta(pagina);
        if (fim || !opcoes.gravar) {
          proxima = null;
          break;
        }
        pagina++;
        proxima = `c:${pagina}`;
        continue;
      }

      // ─── títulos ─────────────────────────────────────────────────────────
      const corpo = await chamarOmie(cred, "financas/mf", "ListarMovimentos", {
        nPagina: pagina,
        nRegPorPagina: POR_PAGINA,
        dDtVencDe: janelaDesde(agora),
      });
      const { itens, totalDePaginas } = paginaDeMovimentos(corpo);
      cont.paginas++;
      cont.lidos += itens.length;

      const titulos: TituloDoOmie[] = [];
      for (const item of itens) {
        const r = mapearMovimento(item);
        if ("fora" in r) somar(`fora_${r.fora}`);
        else titulos.push(r);
      }
      const jaNoConnect = await prisma.financeEntry.findMany({
        where: { tenantId, companyId, omieTitleId: { in: titulos.map((t) => t.omieTitleId) } },
        select: {
          id: true, omieTitleId: true, status: true, paidAt: true, amount: true, dueDate: true,
          categoryId: true, competence: true, closeReason: true, agreementId: true,
          omieBaixaId: true, omieReconciledAt: true,
        },
      });
      const atualPorTitulo = new Map(jaNoConnect.map((e) => [e.omieTitleId!, e]));

      for (const t of titulos) {
        if (t.parcial) somar("parciais");
        const atual = atualPorTitulo.get(t.omieTitleId);
        const status = t.situacao === "PAGO" ? "PAGO" : t.situacao === "CANCELADO" ? "CANCELADO" : "CONFERIDO";
        if (!atual && status === "CANCELADO") {
          somar("cancelados_ignorados");
          continue;
        }
        if (atual && (atual.closeReason || atual.agreementId)) {
          somar("preservados");
          continue;
        }
        const categoryId = await categoriaDo(t);
        if (!categoryId) somar("sem_categoria");
        const dados = {
          status,
          paidAt: t.pagamento,
          amount: t.valor.toFixed(2),
          dueDate: t.vencimento,
          competence: t.competencia,
          categoryId: categoryId && !categoryId.startsWith("previa:") ? categoryId : null,
        } as const;

        if (!atual) {
          somar("novos");
          if (opcoes.gravar) {
            await prisma.financeEntry.create({
              data: {
                tenantId,
                companyId,
                kind: t.kind,
                counterpartyId: await contraparteDo(t),
                description: t.descricao,
                omieTitleId: t.omieTitleId,
                ...dados,
              },
            });
          } else {
            await contraparteDo(t);
          }
          continue;
        }

        // Título que voltou a ficar em aberto (baixa estornada no Omie) perde a
        // baixa que a fase de conta tinha gravado — senão a tela de
        // conciliação o daria como conciliado sem pagamento.
        const estornado = status !== "PAGO" && (atual.omieBaixaId !== null || atual.omieReconciledAt !== null);
        const mudou =
          estornado ||
          atual.status !== dados.status ||
          (atual.paidAt?.getTime() ?? null) !== (dados.paidAt?.getTime() ?? null) ||
          atual.amount.toFixed(2) !== dados.amount ||
          atual.dueDate.getTime() !== dados.dueDate.getTime() ||
          atual.competence !== dados.competence ||
          (dados.categoryId !== null && atual.categoryId !== dados.categoryId);
        if (!mudou) {
          somar("iguais");
          continue;
        }
        somar("atualizados");
        if (opcoes.gravar) {
          await prisma.financeEntry.update({
            where: { id: atual.id },
            // Categoria só troca quando o Omie tem uma: a classificada no
            // Connect não some porque o Omie não a informou.
            data: {
              ...dados,
              categoryId: dados.categoryId ?? atual.categoryId,
              ...(estornado ? { omieBaixaId: null, omiePaidAmount: null, omieReconciledAt: null } : {}),
            },
          });
        }
      }

      if (pagina >= totalDePaginas || itens.length === 0 || !opcoes.gravar) {
        fase = "c";
        pagina = 1;
      } else {
        pagina++;
      }
      proxima = `${fase}:${pagina}`;
    }

    if (opcoes.gravar && leuContas) {
      somar("extrato_conciliado_pelo_omie", await conciliarEmpresaPeloOmie(tenantId, companyId));
    }
    return { cont, proxima };

    /** Uma página das linhas de conta corrente. Devolve `true` na última. */
    async function lerPaginaDeConta(n: number): Promise<boolean> {
      const corpo = await chamarOmie(cred, "financas/mf", "ListarMovimentos", {
        nPagina: n,
        nRegPorPagina: POR_PAGINA,
        dDtPagtoDe: janelaDaConta(agora),
        cTpLancamento: "CC",
      });
      const { itens, totalDePaginas } = paginaDeMovimentos(corpo);
      cont.paginas++;
      somar("linhas_de_conta", itens.length);

      const baixas: BaixaDoOmie[] = [];
      const avulsos: LancamentoDeContaDoOmie[] = [];
      for (const item of itens) {
        const r = mapearLinhaDeConta(item);
        if ("fora" in r) somar(`conta_fora_${r.fora}`);
        else if (r.tipo === "baixa") baixas.push(r);
        else avulsos.push(r);
      }

      // ─── baixas ──────────────────────────────────────────────────────────
      const porTitulo = juntarBaixas(baixas);
      const lancamentos = await prisma.financeEntry.findMany({
        where: { tenantId, companyId, omieTitleId: { in: porTitulo.map((b) => b.omieTitleId) } },
        select: { id: true, omieTitleId: true, omieAccountId: true, omieBaixaId: true, omiePaidAmount: true, omieReconciledAt: true },
      });
      const porId = new Map(lancamentos.map((l) => [l.omieTitleId!, l]));
      for (const b of porTitulo) {
        const l = porId.get(b.omieTitleId);
        if (!l) {
          // Título fora da janela (vencido antes dela) ou ainda não lido.
          somar("baixas_sem_titulo_no_connect");
          continue;
        }
        somar(b.conciliadoEm ? "baixas_conciliadas" : "baixas_nao_conciliadas");
        const mudou =
          l.omieAccountId !== b.contaId ||
          l.omieBaixaId !== b.baixaId ||
          (l.omiePaidAmount?.toFixed(2) ?? null) !== b.valor.toFixed(2) ||
          (l.omieReconciledAt?.getTime() ?? null) !== (b.conciliadoEm?.getTime() ?? null);
        if (!mudou) continue;
        somar("baixas_atualizadas");
        if (opcoes.gravar) {
          await prisma.financeEntry.update({
            where: { id: l.id },
            data: {
              omieAccountId: b.contaId,
              omieBaixaId: b.baixaId,
              omiePaidAmount: b.valor.toFixed(2),
              omieReconciledAt: b.conciliadoEm,
            },
          });
        }
      }

      // ─── lançamentos de conta sem título ─────────────────────────────────
      const jaLancados = await prisma.financeEntry.findMany({
        where: { tenantId, companyId, omieMovementId: { in: avulsos.map((t) => t.movimentoId) } },
        select: {
          id: true, omieMovementId: true, paidAt: true, amount: true, competence: true,
          categoryId: true, omieAccountId: true, omieReconciledAt: true,
        },
      });
      const porMovimento = new Map(jaLancados.map((e) => [e.omieMovementId!, e]));
      for (const t of avulsos) {
        const categoryId = await categoriaDo(t);
        const dados = {
          status: "PAGO",
          paidAt: t.pagamento,
          dueDate: t.pagamento,
          amount: t.valor.toFixed(2),
          competence: t.competencia,
          categoryId: categoryId && !categoryId.startsWith("previa:") ? categoryId : null,
          omieAccountId: t.contaId,
          omiePaidAmount: t.valor.toFixed(2),
          omieReconciledAt: t.conciliadoEm,
        } as const;
        const atual = porMovimento.get(t.movimentoId);
        if (!atual) {
          somar(t.transferencia ? "transferencias_novas" : "lancamentos_de_conta_novos");
          if (opcoes.gravar) {
            await prisma.financeEntry.create({
              data: {
                tenantId,
                companyId,
                kind: t.kind,
                counterpartyId: t.transferencia
                  ? await contraparteChamada(NOME_DA_TRANSFERENCIA)
                  : t.contraparteCodigo || t.contraparteDocumento
                    ? await contraparteDo(t)
                    : await contraparteChamada(NOME_DO_LANCAMENTO_DE_CONTA),
                description: `${t.transferencia ? NOME_DA_TRANSFERENCIA : NOME_DO_LANCAMENTO_DE_CONTA} (Omie)`,
                omieMovementId: t.movimentoId,
                ...dados,
              },
            });
          }
          continue;
        }
        const mudou =
          (atual.paidAt?.getTime() ?? null) !== t.pagamento.getTime() ||
          atual.amount.toFixed(2) !== dados.amount ||
          atual.competence !== dados.competence ||
          atual.omieAccountId !== dados.omieAccountId ||
          (atual.omieReconciledAt?.getTime() ?? null) !== (t.conciliadoEm?.getTime() ?? null) ||
          (dados.categoryId !== null && atual.categoryId !== dados.categoryId);
        if (!mudou) continue;
        somar("lancamentos_de_conta_atualizados");
        if (opcoes.gravar) {
          await prisma.financeEntry.update({
            where: { id: atual.id },
            data: { ...dados, categoryId: dados.categoryId ?? atual.categoryId },
          });
        }
      }

      return n >= totalDePaginas || itens.length === 0;
    }
  };

  emAndamento.add(chave);
  try {
    if (!opcoes.gravar || !progresso) {
      const { cont } = await ler();
      return { companyId, ok: true, gravou: false, counters: cont };
    }
    const counters = await executar({ tenantId, integrationId: progresso.id, trigger }, async () => {
      const { cont, proxima } = await ler();
      return { resultado: cont, counters: cont, cursor: proxima };
    });
    return { companyId, ok: true, gravou: true, counters };
  } catch (err) {
    return { companyId, ok: false, erro: err instanceof Error ? err.message : "Falha ao ler as contas do Omie." };
  } finally {
    emAndamento.delete(chave);
  }
}

/**
 * As empresas que já importaram as contas uma vez (têm a linha de progresso) —
 * só essas o cron atualiza, e no máximo a cada 6 horas (ou de novo logo, se a
 * leitura anterior parou no meio). A primeira importação é sempre de uma
 * pessoa, depois da prévia.
 */
export async function sincronizarTodoOFinanceiroOmie(agora = new Date()): Promise<ResumoDoFinanceiro[]> {
  // A cada 6 horas por empresa: a leitura relê a janela inteira, e o cron das
  // notas roda a cada 30 minutos.
  const antesDe = new Date(agora.getTime() - 6 * 60 * 60 * 1000);
  const linhas = await getPrisma().tenantIntegration.findMany({
    where: {
      integrationCode: "omie",
      enabled: true,
      instanceKey: { startsWith: PREFIXO_DO_FINANCEIRO },
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: antesDe } }, { cursor: { not: null } }],
    },
    select: { tenantId: true, instanceKey: true },
    orderBy: { lastRunAt: "asc" },
  });
  const resumos: ResumoDoFinanceiro[] = [];
  for (const l of linhas) {
    resumos.push(
      await sincronizarFinanceiroDaEmpresa(l.tenantId, l.instanceKey.slice(PREFIXO_DO_FINANCEIRO.length), "CRON", { gravar: true })
    );
  }
  return resumos;
}
