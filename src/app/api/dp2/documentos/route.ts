import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatCpf, formatDocumento } from "@/lib/format";
import { lerDadosEsocial } from "@/lib/dp2/esocial/cadastro";
import { faltasDoDocumento, pdfDaFichaDeRegistro, pdfDoContratoDeExperiencia, type DadosDoDocumento } from "@/lib/dp2/documentosDoDp";

export const dynamic = "force-dynamic";

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

// Documentos do DP em PDF (25/11/2026, funcionalidade-776): ficha de registro e contrato de experiência.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = url.searchParams.get("pessoa") ?? "";
  const tipo = url.searchParams.get("tipo") === "EXPERIENCIA" ? "EXPERIENCIA" : "FICHA";
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await podeNoModulo(ctx, "dp2_colaboradores", "ver"))) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const prisma = getPrisma();
  const p = await prisma.person.findFirst({
    where: { id: personId, tenantId: ctx.tenantId, isInternal: false },
    include: { cargo: { select: { name: true } }, dependentes: { select: { name: true, relationship: true, birthDate: true } }, dp2Vinculo: true },
  });
  if (!p?.currentCompanyId || !p.dp2Vinculo) return NextResponse.json({ error: "Colaborador sem contrato no DP 2." }, { status: 404 });
  const foraDoFoco = await recusaDoFoco(ctx, [p.currentCompanyId]);
  if (foraDoFoco) return NextResponse.json({ error: foraDoFoco }, { status: 403 });
  const empresa = await prisma.company.findFirst({ where: { id: p.currentCompanyId, tenantId: ctx.tenantId } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const v = p.dp2Vinculo;
  const es = lerDadosEsocial(v.dadosEsocial);
  const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
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
  if (tipo === "EXPERIENCIA" && !dados.dataTermino) {
    return NextResponse.json({ error: "O contrato não é por prazo determinado: informe o tipo 2 e a data de término nos dados do eSocial do contrato." }, { status: 400 });
  }
  const faltas = faltasDoDocumento(tipo, dados);
  const pdf = tipo === "EXPERIENCIA" ? await pdfDoContratoDeExperiencia(dados) : await pdfDaFichaDeRegistro(dados);
  const nome = `${tipo === "EXPERIENCIA" ? "Contrato de experiencia" : "Ficha de registro"} ${p.name}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
      // O que faltou no cadastro, para quem quiser avisar (o PDF sai com "—" no lugar).
      ...(faltas.length ? { "X-Faltas": encodeURIComponent(faltas.join("; ")) } : {}),
    },
  });
}
