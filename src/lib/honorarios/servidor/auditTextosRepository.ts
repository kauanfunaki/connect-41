// Texto dos documentos: o que o robô extraiu e o que o leitor achou nele.
// Mesmo formato de linha do Aditiva Pronto (DECIMAL volta como texto, a data
// do documento como "AAAA-MM-DD").

import type { Prisma } from "@/generated/prisma/client";
import type { LeituraDoDocumento } from "../regras/honorarioLeitor";
import { db, tenantAtual } from "./contexto";

export interface IndiceTextoRow {
  chave: string;
  modificado_em: Date;
  tamanho: number;
}

export async function listarIndiceTextos(): Promise<IndiceTextoRow[]> {
  const t = await db().honorarioTexto.findMany({
    where: { tenantId: tenantAtual() },
    select: { chave: true, modificadoEm: true, tamanho: true },
  });
  return t.map((x) => ({ chave: x.chave, modificado_em: x.modificadoEm, tamanho: Number(x.tamanho) }));
}

export interface TextoParaGravar {
  chave: string;
  nomePasta: string;
  caminhoRelativo: string;
  modificadoEm: Date;
  tamanho: number;
  status: "ok" | "sem_texto" | "erro";
  paginas: number | null;
  texto: string | null;
  erro: string | null;
  roboVersao: string | null;
  leitura: LeituraDoDocumento | null;
  leitorVersao: number;
}

/** "AAAA-MM-DD" → Date (meia-noite UTC, como a coluna DATE). */
const paraData = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);
const daData = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function colunasDaLeitura(l: LeituraDoDocumento | null) {
  return {
    tipoDocumento: l?.tipo ?? null,
    dataDocumento: paraData(l?.data),
    honorario: l?.leitura?.valor ?? null,
    adicionalFuncionario: l?.leitura?.adicionalPorFuncionario ?? null,
    formaLeitura: l?.leitura?.forma ?? null,
    condicional: l?.leitura ? l.leitura.condicional : null,
    trecho: l?.leitura?.trecho ?? null,
    // '' = lido e sem CNPJ; null = sem texto (não dá para saber)
    cnpjs: l ? l.cnpjs.join(",").slice(0, 600) : null,
  } satisfies Partial<Prisma.HonorarioTextoUncheckedCreateInput>;
}

export async function gravarTextos(itens: TextoParaGravar[], agora: Date): Promise<void> {
  if (!itens.length) return;
  const tenantId = tenantAtual();
  await db().$transaction(
    itens.map((t) => {
      const dados = {
        nomePasta: t.nomePasta,
        caminhoRelativo: t.caminhoRelativo,
        modificadoEm: t.modificadoEm,
        tamanho: BigInt(t.tamanho),
        status: t.status,
        paginas: t.paginas,
        texto: t.texto,
        erro: t.erro,
        extraidoEm: agora,
        roboVersao: t.roboVersao,
        leitorVersao: t.leitorVersao,
        ...colunasDaLeitura(t.leitura),
      };
      return db().honorarioTexto.upsert({
        where: { tenantId_chave: { tenantId, chave: t.chave } },
        create: { tenantId, chave: t.chave, ...dados },
        update: dados,
      });
    }),
  );
}

export interface LeituraRow {
  chave: string;
  modificado_em: Date;
  tamanho: number;
  status: "ok" | "sem_texto" | "erro";
  erro: string | null;
  tipo_documento: "contrato" | "aditivo" | "outro" | null;
  data_documento: string | null;
  honorario: string | null; // DECIMAL vem como texto
  adicional_funcionario: string | null;
  forma_leitura: string | null;
  condicional: number | null;
  trecho: string | null;
  cnpjs: string | null;
}

/** Leituras sem o texto (o relatório não precisa dele). */
export async function listarLeituras(): Promise<LeituraRow[]> {
  const t = await db().honorarioTexto.findMany({
    where: { tenantId: tenantAtual() },
    select: {
      chave: true,
      modificadoEm: true,
      tamanho: true,
      status: true,
      erro: true,
      tipoDocumento: true,
      dataDocumento: true,
      honorario: true,
      adicionalFuncionario: true,
      formaLeitura: true,
      condicional: true,
      trecho: true,
      cnpjs: true,
    },
  });
  return t.map((x) => ({
    chave: x.chave,
    modificado_em: x.modificadoEm,
    tamanho: Number(x.tamanho),
    status: x.status as LeituraRow["status"],
    erro: x.erro,
    tipo_documento: x.tipoDocumento as LeituraRow["tipo_documento"],
    data_documento: daData(x.dataDocumento),
    honorario: x.honorario === null ? null : x.honorario.toString(),
    adicional_funcionario: x.adicionalFuncionario === null ? null : x.adicionalFuncionario.toString(),
    forma_leitura: x.formaLeitura,
    condicional: x.condicional === null ? null : x.condicional ? 1 : 0,
    trecho: x.trecho,
    cnpjs: x.cnpjs,
  }));
}

interface TextoDesatualizadoRow {
  chave: string;
  caminho_relativo: string;
  texto: string | null;
}

/** Textos lidos por uma versão antiga do leitor (para reler sem ir à rede). */
export async function listarTextosDesatualizados(versao: number, limite: number): Promise<TextoDesatualizadoRow[]> {
  const t = await db().honorarioTexto.findMany({
    where: { tenantId: tenantAtual(), status: "ok", leitorVersao: { not: versao } },
    select: { chave: true, caminhoRelativo: true, texto: true },
    take: limite,
  });
  return t.map((x) => ({ chave: x.chave, caminho_relativo: x.caminhoRelativo, texto: x.texto }));
}

export async function atualizarLeitura(chave: string, leitura: LeituraDoDocumento | null, versao: number): Promise<void> {
  await db().honorarioTexto.updateMany({
    where: { tenantId: tenantAtual(), chave },
    data: { leitorVersao: versao, ...colunasDaLeitura(leitura) },
  });
}

export interface LeituraPorChaveRow {
  chave: string;
  modificado_em: Date;
  tamanho: number;
  status: "ok" | "sem_texto" | "erro";
  data_documento: string | null;
  tipo_documento: "contrato" | "aditivo" | "outro" | null;
  texto?: string | null;
}

/** Leituras de algumas chaves; o texto só vem quando pedido (distrato precisa dele). */
export async function listarPorChaves(chaves: string[], comTexto: boolean): Promise<LeituraPorChaveRow[]> {
  const tenantId = tenantAtual();
  const saida: LeituraPorChaveRow[] = [];
  for (let i = 0; i < chaves.length; i += 500) {
    const lote = chaves.slice(i, i + 500);
    const t = await db().honorarioTexto.findMany({
      where: { tenantId, chave: { in: lote } },
      select: {
        chave: true,
        modificadoEm: true,
        tamanho: true,
        status: true,
        dataDocumento: true,
        tipoDocumento: true,
        texto: comTexto,
      },
    });
    saida.push(
      ...t.map((x) => ({
        chave: x.chave,
        modificado_em: x.modificadoEm,
        tamanho: Number(x.tamanho),
        status: x.status as LeituraPorChaveRow["status"],
        data_documento: daData(x.dataDocumento),
        tipo_documento: x.tipoDocumento as LeituraPorChaveRow["tipo_documento"],
        ...(comTexto ? { texto: x.texto ?? null } : {}),
      })),
    );
  }
  return saida;
}
