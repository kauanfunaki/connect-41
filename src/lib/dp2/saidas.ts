// DP 2, fase 2 (12/11/2026) — as saídas da competência fechada, com banco:
// holerites em PDF, remessa CNAB 240, lançamentos contábeis e o link para o
// cliente informar os eventos do mês. As regras moram nos arquivos puros
// (`holeritePdf.ts`, `cnab240.ts`, `contabilizacao.ts`); aqui só se junta o
// que eles precisam.

import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { nomeExibicao } from "@/lib/companyName";
import { formatCalendarDate, formatCpf, formatDocumento } from "@/lib/format";
import { guardarArquivo } from "@/lib/drive/servidor";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { pdfDosHolerites, type DadosDoHolerite, type LinhaDoHolerite } from "./holeritePdf";
import { BANCOS, gerarRemessa, problemaDoPagamento, type PagamentoDaRemessa } from "./cnab240";
import { contabilizar, lerContasDaFolha, type CalculoContabil, type ContasDaFolha, type RubricaContabil } from "./contabilizacao";
import { NOME_DO_TIPO_DE_COMPETENCIA, nomeDaCompetencia } from "./tela";
import type { ItemDoHolerite } from "./mensal";

const n = (v: unknown) => Number(v ?? 0);

/** A competência para uma rota de download: escritório, módulo e faixa conferidos. */
export async function competenciaParaBaixar(id: string) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { erro: "Não autenticado", status: 401 } as const;
  const pode = (await podeNoModulo(ctx, "dp2_competencia", "ver")) || (await podeNoModulo(ctx, "dp2_decimo", "ver"));
  if (!pode) return { erro: "Sem permissão.", status: 403 } as const;
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!comp) return { erro: "Competência não encontrada.", status: 404 } as const;
  const foraDoFoco = await recusaDoFoco(ctx, [comp.companyId]);
  if (foraDoFoco) return { erro: foraDoFoco, status: 403 } as const;
  return { ctx, comp } as const;
}

// ─── Holerites ──────────────────────────────────────────────────────────────

export async function dadosDosHolerites(tenantId: string, competenciaId: string, personId?: string): Promise<{ dados: DadosDoHolerite[]; nomeDoArquivo: string } | null> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({
    where: { id: competenciaId, tenantId },
    include: { company: { select: { name: true, displayName: true, cnpj: true, cpf: true, kind: true } } },
  });
  if (!comp) return null;
  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId, ...(personId ? { personId } : {}) },
    include: { person: { select: { name: true, cpf: true, admissionDate: true, dp2Vinculo: { select: { salarioBase: true, tipoSalario: true, horasMensais: true } } } } },
  });
  calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"));
  const empresa = nomeExibicao(comp.company);
  const doc = formatDocumento(comp.company.kind, comp.company.cnpj, comp.company.cpf);
  const competencia = nomeDaCompetencia(comp.ano, comp.mes);
  const dados = calculos.map((c): DadosDoHolerite => {
    const v = c.person.dp2Vinculo;
    const base = v ? (v.tipoSalario === "HORISTA" ? n(v.salarioBase) * v.horasMensais : n(v.salarioBase)) : 0;
    return {
      empresaNome: empresa,
      empresaDocumento: doc || null,
      competencia,
      tipo: NOME_DO_TIPO_DE_COMPETENCIA[comp.tipo] ?? comp.tipo,
      colaborador: c.person.name,
      cpf: c.person.cpf ? formatCpf(c.person.cpf) : null,
      admissao: c.person.admissionDate ? formatCalendarDate(c.person.admissionDate) : null,
      salarioBase: base,
      linhas: ((c.itens as unknown as ItemDoHolerite[]) ?? []).map((i): LinhaDoHolerite => ({ codigo: i.codigo, nome: i.nome, referencia: i.referencia, tipo: i.tipo, valor: i.valor })),
      proventos: n(c.proventos),
      descontos: n(c.descontos),
      liquido: n(c.liquido),
      baseInss: n(c.baseInss),
      baseFgts: n(c.baseFgts),
      fgts: n(c.fgts),
      baseIrrf: n(c.baseIrrf),
    };
  });
  const mes = `${String(comp.mes).padStart(2, "0")}-${comp.ano}`;
  const nomeDoArquivo =
    personId && dados[0] ? `Holerite ${dados[0].colaborador} ${mes}.pdf` : `Holerites ${empresa} ${mes}${comp.tipo === "MENSAL" ? "" : ` ${comp.tipo === "DECIMO_1" ? "13o 1a parcela" : "13o 2a parcela"}`}.pdf`;
  return { dados, nomeDoArquivo: nomeDoArquivo.replace(/[\\/:*?"<>|]/g, "-") };
}

/** Os holerites da competência num PDF, na pasta Departamento Pessoal da empresa (nos Arquivos). */
export async function guardarHoleritesNosArquivos(tenantId: string, competenciaId: string, userId: string): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId }, select: { companyId: true, situacao: true } });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.situacao !== "FECHADA") return { ok: false, erro: "Feche a competência antes de guardar os holerites." };
  const h = await dadosDosHolerites(tenantId, competenciaId);
  if (!h || h.dados.length === 0) return { ok: false, erro: "Não há holerites calculados." };
  const pasta = await pastaDoModeloDaEmpresa(tenantId, comp.companyId, "departamento pessoal");
  if (!pasta) return { ok: false, erro: "A empresa não tem a pasta Departamento Pessoal nos Arquivos (ela vem do modelo de pastas do escritório)." };
  const pdf = await pdfDosHolerites(h.dados);
  const r = await guardarArquivo({ tenantId, folderId: pasta, arquivo: new File([Buffer.from(pdf)], h.nomeDoArquivo, { type: "application/pdf" }), uploadedByUserId: userId });
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, texto: `${h.dados.length} holerite(s) em Arquivos › Departamento Pessoal (${r.nome}). Para mandar ao cliente, use "Enviar ao cliente" no arquivo.` };
}

// ─── Remessa CNAB 240 ───────────────────────────────────────────────────────

export async function gerarRemessaDaCompetencia(
  tenantId: string,
  competenciaId: string,
  dataPagamento: string,
  userId: string
): Promise<{ ok: true; id: string; texto: string } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({
    where: { id: competenciaId, tenantId },
    include: { company: { select: { id: true, name: true, displayName: true, cnpj: true, cpf: true, dp2Config: true } } },
  });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.situacao !== "FECHADA") return { ok: false, erro: "Feche a competência antes de gerar a remessa." };
  const cfg = comp.company.dp2Config;
  if (!cfg?.bancoCodigo || !cfg.agencia || !cfg.conta) return { ok: false, erro: "Cadastre a conta pagadora da empresa em DP 2 › Configuração da empresa." };
  const documento = (comp.company.cnpj ?? comp.company.cpf ?? "").replace(/\D/g, "");
  if (documento.length !== 14 && documento.length !== 11) return { ok: false, erro: "A empresa não tem CNPJ ou CPF no cadastro." };

  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId },
    include: { person: { select: { name: true, cpf: true, dp2Vinculo: true } } },
  });
  const pagamentos: PagamentoDaRemessa[] = [];
  const fora: { nome: string; motivo: string }[] = [];
  for (const c of calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"))) {
    const v = c.person.dp2Vinculo;
    const p: PagamentoDaRemessa = {
      nome: c.person.name,
      cpf: (c.person.cpf ?? "").replace(/\D/g, ""),
      banco: v?.bancoCodigo ?? "",
      agencia: v?.agencia ?? "",
      agenciaDigito: v?.agenciaDigito ?? "",
      conta: v?.conta ?? "",
      contaDigito: v?.contaDigito ?? "",
      tipoConta: v?.tipoConta === "POUPANCA" ? "POUPANCA" : "CORRENTE",
      valor: n(c.liquido),
      seuNumero: `${comp.ano}${String(comp.mes).padStart(2, "0")}-${c.personId.slice(0, 8)}`,
    };
    const problema = problemaDoPagamento(p);
    if (problema) fora.push({ nome: c.person.name, motivo: problema });
    else pagamentos.push(p);
  }
  if (pagamentos.length === 0) return { ok: false, erro: `Ninguém pode entrar na remessa: ${fora.map((f) => `${f.nome} (${f.motivo})`).join(", ") || "não há cálculo"}.` };

  const anteriores = await prisma.dp2Remessa.count({ where: { tenantId, competencia: { companyId: comp.companyId } } });
  const sequencial = anteriores + 1;
  const r = gerarRemessa({
    empresa: {
      documento,
      nome: nomeExibicao(comp.company),
      convenio: cfg.convenio ?? "",
      nomeDoBanco: BANCOS[cfg.bancoCodigo.padStart(3, "0")] ?? "",
      banco: cfg.bancoCodigo,
      agencia: cfg.agencia,
      agenciaDigito: cfg.agenciaDigito ?? "",
      conta: cfg.conta,
      contaDigito: cfg.contaDigito ?? "",
    },
    pagamentos,
    dataPagamento,
    sequencial,
    geradoEm: new Date(),
  });
  const nomeArquivo = `PAG${cfg.bancoCodigo.padStart(3, "0")}_${comp.ano}${String(comp.mes).padStart(2, "0")}_${String(sequencial).padStart(4, "0")}.rem`;
  const criada = await prisma.dp2Remessa.create({
    data: {
      tenantId,
      competenciaId,
      bancoCodigo: cfg.bancoCodigo,
      sequencial,
      dataPagamento,
      quantidade: r.quantidade,
      total: r.total,
      nomeArquivo,
      conteudo: r.conteudo,
      foraDaRemessa: fora,
      geradaPorId: userId,
    },
    select: { id: true },
  });
  const textoFora = fora.length ? ` Ficaram de fora: ${fora.map((f) => `${f.nome} (${f.motivo})`).join(", ")}.` : "";
  return { ok: true, id: criada.id, texto: `Remessa ${nomeArquivo} com ${r.quantidade} pagamento(s).${textoFora}` };
}

// ─── Lançamentos contábeis ──────────────────────────────────────────────────

export async function contasDaFolha(tenantId: string): Promise<ContasDaFolha> {
  const linha = await getPrisma().dp2ContasDaFolha.findUnique({ where: { tenantId } });
  return lerContasDaFolha(linha?.contas);
}

export async function lancamentosDaCompetencia(tenantId: string, competenciaId: string) {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return null;
  const [calculos, rubricas, contas] = await Promise.all([
    prisma.dp2Calculo.findMany({ where: { tenantId, competenciaId }, select: { itens: true, encargos: true, provisoes: true } }),
    prisma.dp2Rubrica.findMany({ where: { tenantId }, select: { codigo: true, nome: true, contaDebito: true, contaCredito: true } }),
    contasDaFolha(tenantId),
  ]);
  const mapa = new Map<string, RubricaContabil>(rubricas.map((r) => [r.codigo, r]));
  const entrada: CalculoContabil[] = calculos.map((c) => {
    const e = (c.encargos ?? {}) as Record<string, number>;
    const p = (c.provisoes ?? {}) as Record<string, number>;
    return {
      itens: ((c.itens as unknown as ItemDoHolerite[]) ?? []).map((i) => ({ codigo: i.codigo, nome: i.nome, tipo: i.tipo, valor: i.valor })),
      encargos: { inssEmpresa: n(e.inssEmpresa), rat: n(e.rat), terceiros: n(e.terceiros) },
      provisoes: { ferias: n(p.ferias), tercoFerias: n(p.tercoFerias), decimo: n(p.decimo), encargosFerias: n(p.encargosFerias), encargosDecimo: n(p.encargosDecimo) },
    };
  });
  const referencia = `${String(comp.mes).padStart(2, "0")}/${comp.ano}`;
  const ultimoDia = new Date(Date.UTC(comp.ano, comp.mes, 0)).toISOString().slice(0, 10);
  return { ...contabilizar(entrada, mapa, contas, referencia), data: ultimoDia, referencia };
}

// ─── Pedido de eventos ao cliente ───────────────────────────────────────────

export const DIAS_DO_LINK = 15;

export function novoToken(): string {
  return randomBytes(24).toString("base64url");
}
