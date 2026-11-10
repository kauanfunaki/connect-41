import "server-only";

// Importação conferida de regras (Fase 3b, 10/11/2026): porte de `regras/importacao.py`. Cadastra
// regras a partir do modelo de seis colunas sem rodar o NEO e sem sobrescrever cadastro.
//
// - Análise: cada linha sai pronta, duplicada, em conflito ou inválida, com o motivo. A conta
//   bancária vem da tela ("arquivo" = a coluna BANCO só pode dizer "todos"; "todos" = regra global;
//   ou uma agência ativa da empresa, que vale para todas as linhas).
// - Confirmação: reenvia o arquivo, trava a empresa, refaz a análise e confere o comprovante da
//   prévia (`previa.ts`). Só então grava as prontas. Cadastro que mudou no meio recusa a importação.

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { regraChaveAtiva, historicoNormalizado } from "../motor/chaves";
import { normalizarParaMatch } from "../motor/texto";
import { hashDoArquivo } from "../motor/dedup";
import { lerRelatorioRegras, ErroDoModeloDeRegras, type LinhaRegra } from "../cadastro/relatorioRegras";
import { ErroDeRelatorio } from "../planilha/excel";
import { empresaDoTenant, ehDuplicado, falha, NAO_ENCONTRADA, ok, type Resultado } from "./base";
import { descricaoDaAgencia } from "./cadastros";
import { conferirComprovante, emitirComprovante, FRASE_DA_PREVIA, hashDaAnalise } from "./previa";

export type StatusDaLinha = "pronta" | "duplicada" | "conflito" | "invalida";

export type ItemDaImportacaoDeRegras = {
  linha: number;
  status: StatusDaLinha;
  motivo: string | null;
  contaNumero: number | null;
  contaId: string | null;
  contaDescricao: string | null;
  dc: "D" | "C" | null;
  descricao: string;
  historico: string;
  manterHistorico: boolean;
  agenciaId: string | null;
  banco: string;
};

export type ResumoDaImportacao = { totalLinhas: number; prontas: number; duplicadas: number; conflitos: number; invalidas: number };
export type PreviaDeRegras = ResumoDaImportacao & { arquivoHash: string; comprovante: string; itens: ItemDaImportacaoDeRegras[]; avisos: string[] };

const MAX_REGRAS = 1000;
type Tx = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/** `banco`: "arquivo", "todos" ou o id de uma conta bancária da empresa. */
function lerArquivo(bytes: Uint8Array, nomeArquivo: string): Resultado<LinhaRegra[]> {
  try {
    return ok(lerRelatorioRegras(bytes, nomeArquivo));
  } catch (e) {
    if (e instanceof ErroDoModeloDeRegras || e instanceof ErroDeRelatorio) return falha(e.message);
    throw e;
  }
}

const resumo = (itens: ItemDaImportacaoDeRegras[]): ResumoDaImportacao => ({
  totalLinhas: itens.length,
  prontas: itens.filter((i) => i.status === "pronta").length,
  duplicadas: itens.filter((i) => i.status === "duplicada").length,
  conflitos: itens.filter((i) => i.status === "conflito").length,
  invalidas: itens.filter((i) => i.status === "invalida").length,
});

async function analisar(
  db: Tx,
  ctx: { tenantId: string; empresaId: string },
  linhas: LinhaRegra[],
  banco: string,
): Promise<Resultado<{ itens: ItemDaImportacaoDeRegras[]; avisos: string[] }>> {
  if (linhas.length > MAX_REGRAS) return falha("Importe no máximo 1.000 regras por arquivo.");
  const avisos = [
    "Confira a empresa selecionada: o modelo não informa o CNPJ da empresa.",
    "A importação cadastra regras; não classifica lançamentos automaticamente.",
  ];
  let agencia: { id: string; bancoSigla: string; agencia: string; numero: string; digito: string | null } | null = null;
  if (banco !== "arquivo" && banco !== "todos") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(banco)) return falha("Selecione uma conta bancária cadastrada.");
    agencia = await db.coreAgencia.findFirst({
      where: { id: banco.toLowerCase(), tenantId: ctx.tenantId, empresaId: ctx.empresaId, deletedAt: null, ativa: true },
      select: { id: true, bancoSigla: true, agencia: true, numero: true, digito: true },
    });
    if (!agencia) return falha("Conta bancária indisponível nesta empresa.");
  }
  if (banco !== "arquivo") avisos.push("A escolha de banco na tela substitui a coluna BANCO de todas as linhas.");

  const numeros = [...new Set(linhas.map((l) => l.contaNumero).filter((n): n is number => !!n))];
  const contas = numeros.length
    ? await db.corePlanoConta.findMany({
        where: { tenantId: ctx.tenantId, empresaId: ctx.empresaId, deletedAt: null, contaNumero: { in: numeros } },
        select: { id: true, contaNumero: true, descricao: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const porNumero = new Map<number, typeof contas>();
  for (const c of contas) porNumero.set(c.contaNumero!, [...(porNumero.get(c.contaNumero!) ?? []), c]);
  const existentes = await db.coreRegra.findMany({
    where: { tenantId: ctx.tenantId, empresaId: ctx.empresaId, deletedAt: null },
    select: { agenciaId: true, historico: true, contaId: true, dc: true, descricao: true, manterHistorico: true, ativa: true, tipo: true },
  });

  const itens: ItemDaImportacaoDeRegras[] = linhas.map((linha) => {
    const encontradas = linha.contaNumero ? (porNumero.get(linha.contaNumero) ?? []) : [];
    const conta = encontradas.length === 1 ? encontradas[0] : null;
    const item: ItemDaImportacaoDeRegras = {
      linha: linha.linha, status: "pronta", motivo: null, contaNumero: linha.contaNumero,
      contaId: conta?.id ?? null, contaDescricao: conta?.descricao ?? null, dc: linha.dc,
      descricao: linha.descricao, historico: linha.historico, manterHistorico: linha.manterHistorico,
      agenciaId: agencia?.id ?? null, banco: agencia ? descricaoDaAgencia(agencia) : "Todos os bancos",
    };
    if (linha.erro) {
      item.status = "invalida";
      item.motivo = linha.erro;
    } else if (banco === "arquivo" && !["", "todos", "todos os bancos"].includes(normalizarParaMatch(linha.banco))) {
      item.status = "invalida";
      item.motivo = "Selecione a conta bancária cadastrada na tela para este arquivo.";
      item.banco = linha.banco;
    } else if (!conta) {
      item.status = "invalida";
      item.motivo = "Conta inexistente ou número ambíguo no plano da empresa.";
    }
    return item;
  });

  // Mesmo padrão canônico (acento e pontuação à parte) com dados diferentes: nenhuma entra.
  const assinatura = (x: { contaId: string | null; dc: string | null; descricao: string; manterHistorico: boolean }) =>
    JSON.stringify([x.contaId, x.dc, x.descricao, x.manterHistorico]);
  const grupos = new Map<string, { agenciaId: string | null; padrao: string; itens: ItemDaImportacaoDeRegras[] }>();
  for (const item of itens) {
    if (item.status !== "pronta") continue;
    const padrao = normalizarParaMatch(item.historico);
    const chave = JSON.stringify([item.agenciaId, padrao]);
    const g = grupos.get(chave) ?? { agenciaId: item.agenciaId, padrao, itens: [] };
    g.itens.push(item);
    grupos.set(chave, g);
  }
  for (const { agenciaId, padrao, itens: grupo } of grupos.values()) {
    if (new Set(grupo.map(assinatura)).size > 1) {
      for (const item of grupo) {
        item.status = "conflito";
        item.motivo = "Padrão repetido com dados diferentes.";
      }
      continue;
    }
    const candidatas = existentes.filter((r) => r.agenciaId === agenciaId && normalizarParaMatch(r.historico) === padrao);
    grupo.forEach((item, indice) => {
      if (candidatas.length) {
        const r = candidatas[0];
        const igual = candidatas.length === 1 && r.ativa && r.tipo === "automatica" && assinatura(item) === assinatura(r);
        item.status = igual ? "duplicada" : "conflito";
        item.motivo = igual ? "Regra já cadastrada com os mesmos dados." : "Já existe regra para este padrão e banco; revise manualmente.";
      } else if (indice) {
        item.status = "duplicada";
        item.motivo = "Linha repetida neste arquivo.";
      }
    });
  }
  return ok({ itens, avisos });
}

/** A prévia: nada é gravado. */
export async function analisarRegras(
  tenantId: string,
  userId: string,
  empresaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
  banco: string,
): Promise<Resultado<PreviaDeRegras>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const linhas = lerArquivo(bytes, nomeArquivo);
  if (!linhas.ok) return linhas;
  const analise = await analisar(getPrisma(), { tenantId, empresaId }, linhas.valor, banco);
  if (!analise.ok) return analise;
  const arquivoHash = hashDoArquivo(bytes);
  const comprovante = emitirComprovante({ tipo: "regras", tenantId, userId, empresaId, arquivoHash, analiseHash: hashDaAnalise(analise.valor.itens), extra: banco });
  return ok({ ...resumo(analise.valor.itens), arquivoHash, comprovante, itens: analise.valor.itens, avisos: analise.valor.avisos });
}

/** A confirmação: refaz a análise dentro da trava da empresa e grava só se a prévia ainda vale. */
export async function confirmarRegras(
  tenantId: string,
  userId: string,
  empresaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
  banco: string,
  comprovante: string,
): Promise<Resultado<ResumoDaImportacao & { importadas: number; arquivoHash: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const linhas = lerArquivo(bytes, nomeArquivo);
  if (!linhas.ok) return linhas;
  const arquivoHash = hashDoArquivo(bytes);
  try {
    return await getPrisma().$transaction(
      async (tx) => {
        // Duas confirmações da mesma empresa não criam o mesmo conjunto: a trava é a da empresa.
        await tx.$queryRaw`SELECT id FROM core_empresas WHERE id = ${empresaId} AND tenantId = ${tenantId} FOR UPDATE`;
        // Como o original (`bloquear=True`): as contas citadas e as regras da empresa ficam travadas até
        // a gravação, e a análise abaixo lê o estado mais novo, não o do começo da transação.
        const numeros = [...new Set(linhas.valor.map((l) => l.contaNumero).filter((n): n is number => !!n))];
        if (numeros.length) {
          await tx.$queryRaw`SELECT id FROM core_plano_contas WHERE empresaId = ${empresaId} AND contaNumero IN (${Prisma.join(numeros)}) FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM core_regras WHERE empresaId = ${empresaId} FOR UPDATE`;
        const analise = await analisar(tx, { tenantId, empresaId }, linhas.valor, banco);
        if (!analise.ok) return analise;
        const veredicto = conferirComprovante(comprovante, {
          tipo: "regras", tenantId, userId, empresaId, arquivoHash, analiseHash: hashDaAnalise(analise.valor.itens), extra: banco,
        });
        if (!veredicto.ok) return falha<ResumoDaImportacao & { importadas: number; arquivoHash: string }>(FRASE_DA_PREVIA[veredicto.motivo]);
        const prontas = analise.valor.itens.filter((i) => i.status === "pronta");
        for (const item of prontas) {
          const hn = historicoNormalizado(item.historico);
          await tx.coreRegra.create({
            data: {
              tenantId, empresaId, contaId: item.contaId!, agenciaId: item.agenciaId, descricao: item.descricao, historico: item.historico,
              historicoNormalizado: hn, dc: item.dc!, tipo: "automatica", manterHistorico: item.manterHistorico, ativa: true,
              chaveAtiva: regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: item.agenciaId, historicoNormalizado: hn }),
            },
          });
        }
        return ok({ ...resumo(analise.valor.itens), importadas: prontas.length, arquivoHash });
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if (ehDuplicado(e)) return falha("Uma das regras já foi cadastrada por outra pessoa enquanto a prévia estava aberta. Analise o arquivo novamente.");
    throw e;
  }
}
