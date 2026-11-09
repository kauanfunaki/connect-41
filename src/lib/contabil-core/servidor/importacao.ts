import "server-only";

// Importação de extrato OFX (Fase 2, 09/11/2026): porte de `ExtratoService.importar_ofx`,
// `extrato/importacoes.py` e da conferência de identidade da conta. PDF e planilha entram com os
// leitores por banco (Fase 4).
//
// A ordem é a do original:
// 1. a conta do arquivo confere com a escolhida (outra conta recusa; sem dados suficientes, exige
//    confirmação explícita);
// 2. o mesmo arquivo com transações vivas na empresa recusa ("já importado"), antes de abrir lote;
// 3. o lote nasce ANTES da leitura, para a tentativa ficar registrada mesmo se o arquivo for ilegível;
// 4. cada transação passa pela barreira do valor suspeito e pela chave de duplicidade (igual à do
//    Python), e entra com a coluna `hashAtivo`;
// 5. o saldo declarado (`LEDGERBAL`) é conferido contra o lote anterior da mesma conta (aviso).
//
// O arquivo não é guardado: só o SHA-256 (minimização de dado bancário de cliente).

import { getPrisma } from "@/lib/prisma";
import { formatInstantDate } from "@/lib/format";
import { conferirFechamento } from "../motor/conferencia";
import { hashAtivo } from "../motor/chaves";
import { modulo, naoNegativo, somaTodos } from "../motor/decimal";
import { hashDedup, hashDoArquivo } from "../motor/dedup";
import { conferirIdentidade, identidadeDoOfx } from "../motor/identidade";
import { ErroOfx, lerOfx } from "../motor/ofx";
import { historicoPareceLinhaCrua, motivoValorNaoConfiavel } from "../motor/valorConfiavel";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { dataDoDia, decDoBanco, dia, empresaDoTenant, falha, NAO_ENCONTRADA, ok, paraBanco, type Resultado } from "./base";
import { cancelarLancamento } from "./neo";
import { descricaoDaAgencia } from "./cadastros";

/** O maior extrato aceito. O OFX de um ano inteiro de uma conta movimentada fica bem abaixo disto. */
export const MB_POR_EXTRATO = 10;

export type ResultadoDaImportacao = {
  importacaoId: string;
  totalNoArquivo: number;
  importadas: number;
  duplicadas: number;
  erros: number;
  rejeitadas: number;
  motivosRejeicao: string[];
  errosDeLeitura: string[];
  alertaSaldo: string | null;
  /** A conta do arquivo não pôde ser conferida inteira e a pessoa confirmou: vai para a auditoria. */
  identidadeConfirmada: boolean;
};

export type RecusaDaImportacao = { erro: string; precisaConfirmar?: boolean };

/** Decodifica como o original: UTF-8 estrito; se não for, latin-1 (cada byte é um caractere). */
export function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return s;
  }
}

/** O arquivo parece OFX pelo conteúdo, e não pela extensão. */
export function pareceOfx(texto: string): boolean {
  const inicio = texto.slice(0, 4096).toUpperCase();
  return inicio.includes("OFXHEADER") || inicio.includes("<OFX>") || /<\?OFX/.test(inicio);
}

export async function importarOfx(
  tenantId: string,
  userId: string,
  empresaId: string,
  agenciaId: string,
  nomeArquivo: string,
  bytes: Uint8Array,
  confirmarConta: boolean,
): Promise<{ ok: true; valor: ResultadoDaImportacao } | ({ ok: false } & RecusaDaImportacao)> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return { ok: false, erro: NAO_ENCONTRADA };
  const prisma = getPrisma();
  const agencia = await prisma.coreAgencia.findFirst({ where: { id: agenciaId, tenantId, empresaId, deletedAt: null } });
  if (!agencia) return { ok: false, erro: "Conta bancária não encontrada nesta empresa." };

  const texto = decodificar(bytes);
  if (!pareceOfx(texto)) {
    return { ok: false, erro: "Este arquivo não é um OFX. Por enquanto o Connect lê só extrato em OFX; PDF e planilha continuam no Contábil Core." };
  }

  // 1. A conta do arquivo.
  const conferencia = conferirIdentidade(identidadeDoOfx(texto), agencia);
  if (conferencia.estado === "DIVERGENTE") return { ok: false, erro: `Extrato de outra conta. ${conferencia.mensagens.join(" ")}` };
  if (conferencia.estado === "CONFIRMAR" && !confirmarConta) {
    return {
      ok: false,
      precisaConfirmar: true,
      erro: `O arquivo não diz todos os dados da conta. Confira se ele é mesmo de ${descricaoDaAgencia(agencia)} e confirme para importar.`,
    };
  }

  // 2. O mesmo arquivo já está no sistema?
  const hashArquivo = hashDoArquivo(bytes);
  const anterior = await prisma.coreImportacao.findFirst({
    where: { empresaId, hashArquivo, deletedAt: null, canceladaEm: null, transacoes: { some: { deletedAt: null } } },
    include: { agencia: true, _count: { select: { transacoes: { where: { deletedAt: null } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (anterior) {
    return {
      ok: false,
      erro:
        `Este arquivo já foi importado em ${formatInstantDate(anterior.createdAt)} na conta ${anterior.agencia.bancoSigla} ag. ${anterior.agencia.agencia} c/c ${anterior.agencia.numero} ` +
        `(${anterior.nomeArquivo}, ${anterior._count.transacoes} transações no sistema). Para importá-lo de novo, desfaça aquela importação na aba Importações.`,
    };
  }

  // 3. O lote, antes da leitura.
  const lote = await prisma.coreImportacao.create({
    data: { tenantId, empresaId, agenciaId, nomeArquivo: corta(nomeArquivo || "sem-nome", 255), hashArquivo, criadoPorId: userId },
    select: { id: true },
  });

  let leitura;
  try {
    leitura = lerOfx(texto);
  } catch (e) {
    if (e instanceof ErroOfx) return { ok: false, erro: `Arquivo OFX inválido: ${e.message}` };
    throw e;
  }
  if (leitura.totalBlocos === 0) return { ok: false, erro: "Nenhuma transação encontrada no arquivo OFX." };

  // 4. As transações.
  const motivosRejeicao: string[] = [];
  let rejeitadas = 0;
  let duplicadas = 0;
  const vistos = new Set<string>();
  const novas: { hash: string; t: (typeof leitura.transacoes)[number] }[] = [];
  for (const t of leitura.transacoes) {
    const motivo = motivoValorNaoConfiavel(t.historico, t.valor);
    if (motivo) {
      // Não entra: valor errado contamina o razão em silêncio; a linha que falta aparece na conciliação.
      rejeitadas++;
      motivosRejeicao.push(`${corta(t.historico, 80)} — ${motivo}`);
      continue;
    }
    if (historicoPareceLinhaCrua(t.historico)) console.warn("[contabil-core] extrato com histórico de linha crua");
    const hash = hashDedup(empresaId, agenciaId, t.fitid);
    if (vistos.has(hash)) {
      duplicadas++;
      continue;
    }
    vistos.add(hash);
    novas.push({ hash, t });
  }
  // Só linha VIVA duplica: a de uma importação desfeita não ocupa mais o lugar.
  const existentes = new Set(
    (await prisma.coreTransacao.findMany({ where: { empresaId, hashAtivo: { in: novas.map((n) => n.hash) } }, select: { hashDedup: true } })).map((t) => t.hashDedup),
  );
  const paraGravar = novas.filter((n) => !existentes.has(n.hash));
  duplicadas += novas.length - paraGravar.length;
  // `skipDuplicates`: se outra importação do mesmo extrato entrou nesse meio-tempo, a coluna única recusa a linha repetida.
  const gravadas = paraGravar.length
    ? (
        await prisma.coreTransacao.createMany({
          data: paraGravar.map(({ hash, t }) => ({
            tenantId, empresaId, agenciaId, importacaoId: lote.id,
            data: dataDoDia(t.data),
            valor: paraBanco(modulo(t.valor)),
            historico: corta(t.historico || t.tipoOfx, 500),
            dc: naoNegativo(t.valor) ? "C" : "D",
            ordem: t.ordem,
            hashDedup: hash,
            hashAtivo: hashAtivo({ hashDedup: hash, deletedAt: null }),
            status: "pendente",
          })),
          skipDuplicates: true,
        })
      ).count
    : 0;
  duplicadas += paraGravar.length - gravadas;

  // 5. O saldo declarado contra o lote anterior da conta (a âncora é o período anterior, não o envio anterior).
  let alertaSaldo: string | null = null;
  if (leitura.saldoDeclarado && leitura.dataSaldo) {
    const ancora = await prisma.coreImportacao.findFirst({
      where: { empresaId, agenciaId, deletedAt: null, canceladaEm: null, dataSaldoDeclarado: { not: null, lt: dataDoDia(leitura.dataSaldo) } },
      orderBy: { dataSaldoDeclarado: "desc" },
      select: { saldoDeclarado: true, dataSaldoDeclarado: true },
    });
    if (ancora?.saldoDeclarado && ancora.dataSaldoDeclarado) {
      alertaSaldo = conferirFechamento({
        saldoAnterior: decDoBanco(ancora.saldoDeclarado),
        dataAnterior: dia(ancora.dataSaldoDeclarado),
        // O movimento é o de TODAS as transações lidas do arquivo, não só as novas: reenvio parcial não acusa diferença.
        movimento: somaTodos(leitura.transacoes.map((t) => t.valor)),
        saldoDeclarado: leitura.saldoDeclarado,
        dataDeclarada: leitura.dataSaldo,
      });
    }
  }

  await prisma.coreImportacao.update({
    where: { id: lote.id },
    data: {
      totalNoArquivo: leitura.totalBlocos, importadas: gravadas, duplicadas, rejeitadas,
      saldoDeclarado: leitura.saldoDeclarado ? paraBanco(leitura.saldoDeclarado) : null,
      dataSaldoDeclarado: leitura.dataSaldo ? dataDoDia(leitura.dataSaldo) : null,
      alertaSaldo,
    },
  });

  return {
    ok: true,
    valor: {
      importacaoId: lote.id, totalNoArquivo: leitura.totalBlocos, importadas: gravadas, duplicadas, erros: leitura.erros.length,
      rejeitadas, motivosRejeicao, errosDeLeitura: leitura.erros, alertaSaldo, identidadeConfirmada: conferencia.estado === "CONFIRMAR",
    },
  };
}

export async function listarImportacoes(tenantId: string, empresaId: string) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  return getPrisma().coreImportacao.findMany({
    where: { tenantId, empresaId, deletedAt: null },
    select: {
      id: true, nomeArquivo: true, createdAt: true, totalNoArquivo: true, importadas: true, duplicadas: true, rejeitadas: true,
      canceladaEm: true, motivoCancelamento: true, alertaSaldo: true, saldoDeclarado: true, dataSaldoDeclarado: true,
      agencia: { select: { bancoSigla: true, agencia: true, numero: true, digito: true } },
      _count: { select: { transacoes: { where: { deletedAt: null } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/**
 * Desfaz um envio inteiro: cancela o lançamento de cada transação classificada (que volta a ser
 * pendente e sai da fila do automático), e só então apaga a transação. Na ordem inversa ficaria, no
 * meio, uma transação apagada com partidas vivas no razão.
 */
export async function desfazerImportacao(
  tenantId: string,
  userId: string,
  empresaId: string,
  importacaoId: string,
  motivo: string,
): Promise<Resultado<{ nome: string; transacoes: number; lancamentos: number }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const texto = motivo.trim();
  if (texto.length < 3) return falha("Diga por que a importação está sendo desfeita.");
  const prisma = getPrisma();
  return prisma.$transaction(
    async (tx) => {
      const lote = await tx.coreImportacao.findFirst({ where: { id: importacaoId, tenantId, empresaId, deletedAt: null } });
      if (!lote) return falha<{ nome: string; transacoes: number; lancamentos: number }>("Importação não encontrada.");
      if (lote.canceladaEm) return falha<{ nome: string; transacoes: number; lancamentos: number }>("Esta importação já foi desfeita.");
      const transacoes = await tx.coreTransacao.findMany({ where: { importacaoId, empresaId, deletedAt: null }, select: { id: true, hashDedup: true } });
      const agora = new Date();
      let lancamentos = 0;
      for (const t of transacoes) {
        const partidas = await cancelarLancamento(tx, { tenantId, empresaId }, t.id, `Importação cancelada: ${texto}`, userId);
        lancamentos += partidas / 2;
      }
      // A transação sai e solta o hash: o mesmo extrato pode entrar de novo (o fluxo de conserto).
      await tx.coreTransacao.updateMany({ where: { id: { in: transacoes.map((t) => t.id) } }, data: { deletedAt: agora, hashAtivo: null } });
      await tx.coreImportacao.update({ where: { id: lote.id }, data: { canceladaEm: agora, canceladaPorId: userId, motivoCancelamento: corta(texto, 300) } });
      return ok({ nome: lote.nomeArquivo, transacoes: transacoes.length, lancamentos });
    },
    { timeout: 60_000 },
  );
}
