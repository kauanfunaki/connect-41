// Documentos do DP do colaborador (25/11/2026, funcionalidade-776): monta o
// PDF a partir do cadastro, do contrato e do que o DP 2 já gravou. A mesma
// função serve ao download (/api/dp2/documentos) e ao "Guardar nos Arquivos"
// (pasta Departamento Pessoal da empresa).

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatCpf, formatDocumento } from "@/lib/format";
import { lerDadosEsocial } from "./esocial/cadastro";
import { responsaveisDeSst } from "./esocial/servidor";
import { historicoDoPpp, pdfDoPpp } from "./ppp";
import { afastamentosDosXml, NOME_DO_MOTIVO } from "./afastamentos";
import type { ItemDoHolerite } from "./mensal";
import { competenciaDe } from "./tabelas";
import { linhasDoQuadro, pdfDoQuadroDeHorario } from "./quadroDeHorario";
import { pdfDaMovimentacao, type MovimentoDeEmpregado } from "./documentosDoDp";
import { faltasDoDocumento, pdfDaFichaDaCtps, pdfDaFichaDeRegistro, pdfDoContratoDeExperiencia, type DadosDoDocumento } from "./documentosDoDp";

export type TipoDeDocumento = "FICHA" | "EXPERIENCIA" | "PPP" | "CTPS";
export const TIPOS_DE_DOCUMENTO: Record<TipoDeDocumento, string> = {
  FICHA: "Ficha de registro",
  EXPERIENCIA: "Contrato de experiencia",
  PPP: "Historico PPP",
  CTPS: "Ficha de atualizacao da CTPS",
};
export const lerTipoDeDocumento = (v: string | null): TipoDeDocumento => (v === "EXPERIENCIA" || v === "PPP" || v === "CTPS" ? v : "FICHA");

const PARENTESCO: Record<string, string> = { CONJUGE: "Cônjuge", COMPANHEIRO: "Companheiro(a)", FILHO: "Filho(a)", ENTEADO: "Enteado(a)", PAIS: "Pai/Mãe", OUTRO: "Outro" };

const endereco = (e: { addressStreet: string | null; addressNumber: string | null; addressComplement: string | null; neighborhood: string | null; city: string | null; stateCode: string | null; zipCode: string | null }) =>
  [
    [e.addressStreet, e.addressNumber].filter(Boolean).join(", "),
    e.addressComplement,
    e.neighborhood,
    [e.city, e.stateCode].filter(Boolean).join("/"),
    e.zipCode ? `CEP ${e.zipCode}` : null,
  ]
    .filter(Boolean)
    .join(", ") || null;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type DocumentoGerado = { ok: true; pdf: Uint8Array; nome: string; companyId: string; faltas: string[] } | { ok: false; erro: string; status: number };

/** O PDF do documento escolhido. A permissão e o foco são de quem chama. */
export async function documentoDoColaborador(tenantId: string, personId: string, tipo: TipoDeDocumento): Promise<DocumentoGerado> {
  const prisma = getPrisma();
  const p = await prisma.person.findFirst({
    where: { id: personId, tenantId, isInternal: false },
    include: { cargo: { select: { name: true } }, dependentes: { select: { name: true, relationship: true, birthDate: true } }, dp2Vinculo: true },
  });
  if (!p?.currentCompanyId || !p.dp2Vinculo) return { ok: false, erro: "Colaborador sem contrato no DP 2.", status: 404 };
  const empresa = await prisma.company.findFirst({ where: { id: p.currentCompanyId, tenantId } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada.", status: 404 };
  const v = p.dp2Vinculo;
  const es = lerDadosEsocial(v.dadosEsocial);
  const nome = `${TIPOS_DE_DOCUMENTO[tipo]} ${p.name}.pdf`;

  // Histórico PPP (funcionalidade-761): dos S-2240 e S-2220 gerados para a pessoa.
  if (tipo === "PPP") {
    const [eventos, resp] = await Promise.all([
      prisma.dp2EventoEsocial.findMany({ where: { tenantId, personId: p.id, tipo: { in: ["S-2240", "S-2220"] } }, select: { tipo: true, xml: true, situacao: true, createdAt: true } }),
      responsaveisDeSst(tenantId, p.currentCompanyId),
    ]);
    const pdf = await pdfDoPpp(historicoDoPpp(eventos, dia(p.dismissalDate)), {
      empresa: nomeExibicao(empresa),
      documentoDaEmpresa: formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null,
      colaborador: p.name,
      cpf: p.cpf ? formatCpf(p.cpf) : null,
      pis: p.pis,
      admissao: dia(p.admissionDate),
      cargo: p.cargo?.name ?? null,
      cbo: es.cbo,
      responsavelAmbiental: resp.ambientalNome ? `${resp.ambientalNome}${resp.ambientalNumero ? ` · registro ${resp.ambientalNumero}${resp.ambientalUf ? `/${resp.ambientalUf}` : ""}` : ""}` : null,
      medicoDoPcmso: resp.medicoNome ? `${resp.medicoNome}${resp.medicoCrm ? ` · CRM ${resp.medicoCrm}${resp.medicoUf ? `/${resp.medicoUf}` : ""}` : ""}` : null,
    });
    return { ok: true, pdf, nome, companyId: p.currentCompanyId, faltas: [] };
  }

  const dados: DadosDoDocumento = {
    empresa: nomeExibicao(empresa),
    documentoDaEmpresa: formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null,
    enderecoDaEmpresa: endereco(empresa),
    cidade: empresa.city,
    colaborador: p.name,
    cpf: p.cpf ? formatCpf(p.cpf) : null,
    rg: p.rg,
    pis: p.pis,
    ctps: p.ctps ? `${p.ctps}${p.ctpsSerie ? ` série ${p.ctpsSerie}` : ""}` : null,
    nascimento: dia(p.birthDate),
    endereco: endereco(p),
    escolaridade: p.education,
    admissao: dia(p.admissionDate),
    cargo: p.cargo?.name ?? null,
    cbo: es.cbo,
    salario: Number(v.salarioBase),
    tipoSalario: v.tipoSalario === "HORISTA" ? "HORISTA" : "MENSAL",
    horasMensais: v.horasMensais,
    jornada: es.descricaoJornada,
    matricula: v.matricula,
    categoria: v.categoria,
    dataTermino: es.tipoContrato === "2" ? es.dataTermino : null,
    dependentes: p.dependentes.map((d) => ({ nome: d.name, parentesco: PARENTESCO[d.relationship] ?? d.relationship, nascimento: dia(d.birthDate) })),
  };

  // Ficha de atualização da CTPS (funcionalidade-776): o que o DP 2 gravou depois da admissão.
  if (tipo === "CTPS") {
    const [historico, ferias, s2230, calculos, transferencias] = await Promise.all([
      prisma.dp2HistoricoSalarial.findMany({ where: { tenantId, personId: p.id }, orderBy: [{ data: "asc" }, { createdAt: "asc" }] }),
      prisma.dp2Ferias.findMany({ where: { tenantId, personId: p.id }, orderBy: { inicioGozo: "asc" } }),
      prisma.dp2EventoEsocial.findMany({ where: { tenantId, personId: p.id, tipo: "S-2230", situacao: { not: "REJEITADO" } }, select: { xml: true }, orderBy: { createdAt: "asc" } }),
      prisma.dp2Calculo.findMany({ where: { tenantId, personId: p.id, competencia: { tipo: "MENSAL", situacao: "FECHADA" } }, select: { itens: true, competencia: { select: { ano: true, mes: true } } } }),
      prisma.dp2Transferencia.findMany({ where: { tenantId, personId: p.id }, orderBy: { data: "asc" } }),
    ]);
    const nomesDasEmpresas = new Map(
      (
        await prisma.company.findMany({
          where: { tenantId, id: { in: [...new Set(transferencias.flatMap((t) => [t.companyId, t.deCompanyId]))] } },
          select: { id: true, name: true, tradeName: true, displayName: true },
        })
      ).map((c) => [c.id, nomeExibicao(c)])
    );
    const contribuicoes = calculos
      .flatMap((c) =>
        ((c.itens ?? []) as unknown as ItemDoHolerite[]).filter((i) => i.papel === "CONTRIBUICAO_SINDICAL").map((i) => ({ competencia: competenciaDe(c.competencia.ano, c.competencia.mes), valor: i.valor }))
      )
      .sort((a, b) => a.competencia.localeCompare(b.competencia));
    const pdf = await pdfDaFichaDaCtps(dados, {
      alteracoes: historico.map((h) => ({ data: dia(h.data)!, de: h.salarioAnterior === null ? null : Number(h.salarioAnterior), para: Number(h.salario), motivo: h.motivo })),
      ferias: ferias.map((f) => ({ aquisitivoInicio: dia(f.aquisitivoInicio)!, aquisitivoFim: dia(f.aquisitivoFim)!, inicio: dia(f.inicioGozo)!, dias: f.diasGozo, abono: f.diasAbono })),
      afastamentos: afastamentosDosXml(s2230.map((e) => e.xml)).map((a) => ({ inicio: a.inicio, fim: a.fim, motivo: NOME_DO_MOTIVO[a.motivo] ? `${a.motivo} · ${NOME_DO_MOTIVO[a.motivo]}` : `motivo ${a.motivo} (Tabela 18)` })),
      contribuicoes,
      transferencias: transferencias.map((t) => ({ data: dia(t.data)!, texto: `de ${nomesDasEmpresas.get(t.deCompanyId) ?? "outra empresa"} para ${nomesDasEmpresas.get(t.companyId) ?? "outra empresa"} · ${t.motivo}` })),
    });
    return { ok: true, pdf, nome, companyId: p.currentCompanyId, faltas: [] };
  }

  if (tipo === "EXPERIENCIA" && !dados.dataTermino) {
    return { ok: false, erro: "O contrato não é por prazo determinado: informe o tipo 2 e a data de término nos dados do eSocial do contrato.", status: 400 };
  }
  const faltas = faltasDoDocumento(tipo, dados);
  const pdf = tipo === "EXPERIENCIA" ? await pdfDoContratoDeExperiencia(dados) : await pdfDaFichaDeRegistro(dados);
  return { ok: true, pdf, nome, companyId: p.currentCompanyId, faltas };
}

/** O quadro de horário de trabalho da empresa (CLT art. 74), com os empregados ativos hoje. */
export async function quadroDeHorarioDaEmpresa(tenantId: string, companyId: string): Promise<DocumentoGerado> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada.", status: 404 };
  const hoje = new Date();
  const [pessoas, horarios] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId, currentCompanyId: companyId, isInternal: false, dp2Vinculo: { isNot: null }, OR: [{ dismissalDate: null }, { dismissalDate: { gte: hoje } }] },
      select: { name: true, cargo: { select: { name: true } }, dp2Vinculo: { select: { horarioId: true } } },
    }),
    prisma.dp2Horario.findMany({ where: { tenantId, companyId } }),
  ]);
  const horario = new Map(horarios.map((h) => [h.id, h]));
  const quadro = linhasDoQuadro(pessoas.map((p) => ({ nome: p.name, cargo: p.cargo?.name ?? null, horario: (p.dp2Vinculo?.horarioId && horario.get(p.dp2Vinculo.horarioId)) || null })));
  const enderecoDaEmpresa = [[empresa.addressStreet, empresa.addressNumber].filter(Boolean).join(", "), empresa.neighborhood, [empresa.city, empresa.stateCode].filter(Boolean).join("/")].filter(Boolean).join(" · ") || null;
  const pdf = await pdfDoQuadroDeHorario(quadro, {
    empresa: nomeExibicao(empresa),
    documento: formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null,
    endereco: enderecoDaEmpresa,
    cidade: empresa.city,
    data: hoje.toISOString().slice(0, 10),
  });
  return { ok: true, pdf, nome: `Quadro de horario ${nomeExibicao(empresa)}.pdf`, companyId, faltas: quadro.semHorario.length ? [`Sem horário no contrato: ${quadro.semHorario.join(", ")}`] : [] };
}

/**
 * A movimentação de empregados da empresa no período: admissões, desligamentos,
 * transferências entre empresas do grupo e afastamentos e retornos (S-2230),
 * com os ativos no início e no fim.
 */
export async function movimentacaoDaEmpresa(tenantId: string, companyId: string, de: string, ate: string): Promise<DocumentoGerado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) return { ok: false, erro: "Informe o período da movimentação (de e até).", status: 400 };
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada.", status: 404 };
  const passaram = await prisma.dp2Transferencia.findMany({ where: { tenantId, OR: [{ companyId }, { deCompanyId: companyId }] }, select: { personId: true } });
  const pessoas = await prisma.person.findMany({
    where: { tenantId, isInternal: false, type: "COLABORADOR", dp2Vinculo: { isNot: null }, OR: [{ currentCompanyId: companyId }, { id: { in: passaram.map((t) => t.personId) } }] },
    select: { id: true, name: true, currentCompanyId: true, admissionDate: true, dismissalDate: true, cargo: { select: { name: true } } },
  });
  const ids = pessoas.map((p) => p.id);
  const [transferencias, s2230] = await Promise.all([
    prisma.dp2Transferencia.findMany({ where: { tenantId, personId: { in: ids } }, orderBy: { data: "asc" } }),
    prisma.dp2EventoEsocial.findMany({ where: { tenantId, personId: { in: ids }, tipo: "S-2230", situacao: { not: "REJEITADO" } }, select: { personId: true, xml: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const nomes = new Map(
    (
      await prisma.company.findMany({
        where: { tenantId, id: { in: [...new Set(transferencias.flatMap((t) => [t.companyId, t.deCompanyId]))] } },
        select: { id: true, name: true, tradeName: true, displayName: true },
      })
    ).map((c) => [c.id, nomeExibicao(c)])
  );
  // A empresa da pessoa numa data, pelas transferências.
  const empresaEm = (personId: string, atual: string | null, data: string) => {
    const daPessoa = transferencias.filter((t) => t.personId === personId);
    if (daPessoa.length === 0) return atual;
    let empresaNaData = daPessoa[0].deCompanyId;
    for (const t of daPessoa) if (dia(t.data)! <= data) empresaNaData = t.companyId;
    return empresaNaData;
  };
  const movimentos: MovimentoDeEmpregado[] = [];
  let ativosNoInicio = 0;
  for (const p of pessoas) {
    const adm = dia(p.admissionDate);
    const desl = dia(p.dismissalDate);
    if (adm && adm < de && (!desl || desl >= de) && empresaEm(p.id, p.currentCompanyId, de) === companyId) ativosNoInicio++;
    if (adm && adm >= de && adm <= ate && empresaEm(p.id, p.currentCompanyId, adm) === companyId) movimentos.push({ data: adm, nome: p.name, tipo: "ADMISSAO", detalhe: p.cargo?.name ?? "" });
    if (desl && desl >= de && desl <= ate && empresaEm(p.id, p.currentCompanyId, desl) === companyId) movimentos.push({ data: desl, nome: p.name, tipo: "DESLIGAMENTO", detalhe: "" });
    for (const t of transferencias.filter((x) => x.personId === p.id)) {
      const d = dia(t.data)!;
      if (d < de || d > ate) continue;
      if (t.deCompanyId === companyId) movimentos.push({ data: d, nome: p.name, tipo: "TRANSFERIDO_PARA", detalhe: nomes.get(t.companyId) ?? "outra empresa" });
      if (t.companyId === companyId) movimentos.push({ data: d, nome: p.name, tipo: "VEIO_DE", detalhe: nomes.get(t.deCompanyId) ?? "outra empresa" });
    }
    for (const a of afastamentosDosXml(s2230.filter((x) => x.personId === p.id).map((x) => x.xml))) {
      const motivo = NOME_DO_MOTIVO[a.motivo] ? `${a.motivo} · ${NOME_DO_MOTIVO[a.motivo]}` : `motivo ${a.motivo}`;
      if (a.inicio >= de && a.inicio <= ate && empresaEm(p.id, p.currentCompanyId, a.inicio) === companyId) movimentos.push({ data: a.inicio, nome: p.name, tipo: "AFASTAMENTO", detalhe: motivo });
      if (a.fim && a.fim >= de && a.fim <= ate && empresaEm(p.id, p.currentCompanyId, a.fim) === companyId) movimentos.push({ data: a.fim, nome: p.name, tipo: "RETORNO", detalhe: motivo });
    }
  }
  const pdf = await pdfDaMovimentacao({ empresa: nomeExibicao(empresa), documento: formatDocumento(empresa.kind, empresa.cnpj, empresa.cpf) || null, de, ate }, movimentos, ativosNoInicio);
  return { ok: true, pdf, nome: `Movimentacao de empregados ${de.split("-").reverse().join("-")} a ${ate.split("-").reverse().join("-")}.pdf`, companyId, faltas: [] };
}
