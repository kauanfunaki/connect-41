// Ensaio da importação de relações fiscais de clientes e fornecedores num banco LOCAL (Fase 3b,
// 10/11/2026).
//
// Cadastra uma empresa inventada e um plano, monta relações .xlsx inventadas e passa pela análise e
// pela confirmação: linha pronta, duplicada (no relatório e no cadastro), em conflito, inválida,
// comprovante de outro arquivo, comprovante forjado, prévia desatualizada, CNPJ de outra empresa,
// escritório errado e reimportação. No fim apaga tudo pela exclusão da empresa. Nenhum dado real.
//
// Uso (o preload deixa importar os módulos com "server-only" fora do Next):
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-importacao-contrapartes.ts

import ExcelJS from "exceljs";
import { getPrisma } from "../../src/lib/prisma";
import { contaSchema, contraparteSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarContraparte } from "../../src/lib/contabil-core/servidor/cadastros";
import { analisarContrapartes, confirmarContrapartes } from "../../src/lib/contabil-core/servidor/importacaoContrapartes";
import { FRASE_DA_PREVIA } from "../../src/lib/contabil-core/servidor/previa";
import { NAO_ENCONTRADA } from "../../src/lib/contabil-core/servidor/base";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

const CNPJ_EMPRESA = "41.414.141/0001-41";

type Linha = { conta?: number | string; cruzada?: number; nome?: string; razao?: string; endereco?: string; uf?: string; documento?: string };

/** Uma relação no layout do sistema fiscal: metadados, título, cabeçalho na linha 7. */
async function relacao(tipo: "fornecedor" | "cliente", linhas: Linha[], cnpj: string | null = CNPJ_EMPRESA): Promise<Uint8Array> {
  const titulo = tipo === "fornecedor" ? "RELAÇÃO DE FORNECEDORES" : "RELAÇÃO DE CLIENTES";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(titulo);
  ws.getCell(1, 1).value = "Empresa:";
  ws.getCell(1, 3).value = "EMPRESA ENSAIO CONTRAPARTES LTDA";
  ws.getCell(2, 1).value = "C.N.P.J.:";
  if (cnpj) ws.getCell(2, 3).value = cnpj;
  ws.getCell(5, 1).value = titulo;
  const cabecalhos = ["Conta", tipo === "fornecedor" ? "Conta Cliente" : "Conta Fornecedor", "Nome", "Razão Social", "Endereço", "UF", "C.N.P.J./C.P.F./C.E.I./C.A.E.P.F./Outros"];
  cabecalhos.forEach((c, i) => (ws.getCell(7, i + 1).value = c));
  linhas.forEach((l, i) => {
    [l.conta, l.cruzada, l.nome, l.razao, l.endereco, l.uf, l.documento].forEach((v, j) => {
      if (v !== undefined) ws.getCell(8 + i, j + 1).value = v;
    });
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, name: "Empresa Ensaio Contrapartes LTDA", cnpj: CNPJ_EMPRESA } as never,
    select: { id: true },
  });

  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const conta = async (numero: number, codigo: string) =>
      valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo, descricao: `Conta fictícia ${numero}`, tipo: "passivo", contaNumero: numero })));
    const c501 = await conta(501, "2.1.3.01.0501");
    const c502 = await conta(502, "2.1.3.01.0502");
    const c503 = await conta(503, "2.1.3.01.0503");
    const c601 = await conta(601, "1.1.2.01.0601");
    // Cadastros que já existem: o mesmo tipo com a mesma conta, com outra conta, e o tipo oposto.
    const contraparte = (tipo: string, documento: string, contaContabilId: string) =>
      salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo, documento, razaoSocial: "CADASTRO PRÉVIO FICTÍCIO", contaContabilId }));
    valor(await contraparte("fornecedor", "22.222.222/0001-22", c502.id));
    valor(await contraparte("fornecedor", "33.333.333/0001-33", c501.id));
    valor(await contraparte("cliente", "55.555.555/0001-55", c601.id));

    const linhas: Linha[] = [
      { conta: 501, nome: "ALFA", razao: "FORNECEDOR ALFA FICTÍCIO LTDA", endereco: "RUA DE TESTE, 100", documento: "11.111.111/0001-11" }, // pronta
      { conta: 502, razao: "FORNECEDOR BETA FICTÍCIO LTDA", documento: "22.222.222/0001-22" }, // duplicada (cadastro)
      { conta: 503, razao: "FORNECEDOR GAMA FICTÍCIO LTDA", documento: "33.333.333/0001-33" }, // conflito (outra conta)
      { conta: 501, razao: "DOCUMENTO CURTO", documento: "123" }, // inválida
      { conta: 999, razao: "CONTA INEXISTENTE FICTÍCIA", documento: "66.666.666/0001-66" }, // inválida (por ora)
      { conta: 501, nome: "alfa", razao: "Fornecedor Alfa Fictício Ltda", endereco: "RUA DE TESTE, 100", documento: "11111111000111" }, // duplicada (relatório)
      { conta: 501, razao: "DELTA FICTÍCIA", documento: "44.444.444/0001-44" }, // conflito (contas diferentes)
      { conta: 502, razao: "DELTA FICTÍCIA", documento: "44.444.444/0001-44" }, // conflito
      { conta: 503, razao: "UF LONGA FICTÍCIA", uf: "PRR", documento: "77.777.777/0001-77" }, // inválida (campo cadastral)
      { conta: 503, cruzada: 12, razao: "ÉPSILON FICTÍCIO", documento: "55.555.555/0001-55" }, // pronta (o cadastro é de cliente)
    ];
    const arquivo = await relacao("fornecedor", linhas);
    const previa = valor(await analisarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx"));
    const st = previa.itens.map((i) => i.status[0]).join("");
    confere("prévia classifica cada linha", st === "pdcii" + "dccip" && previa.prontas === 2 && previa.duplicadas === 2 && previa.conflitos === 3 && previa.invalidas === 3, { st, previa: { ...previa, itens: undefined } });
    confere("motivo do campo cadastral", previa.itens[8].motivo === "O campo cadastral 'uf' possui valor inválido ou muito longo.", previa.itens[8].motivo);
    confere("motivo da conta inexistente", previa.itens[4].motivo === "A conta informada no relatório não existe no plano desta empresa.", previa.itens[4].motivo);
    confere("aviso da Conta Cliente", previa.avisos.some((a) => a.includes("Conta Cliente")), previa.avisos);
    confere("prévia não grava", (await prisma.coreContraparte.count({ where: { tenantId, empresaId } })) === 3);

    const outro = await relacao("fornecedor", linhas.slice(0, 3));
    const deOutro = await confirmarContrapartes(tenantId, user.id, empresaId, outro, "fornecedores.xlsx", previa.comprovante);
    confere("comprovante de outro arquivo é recusado", !deOutro.ok && deOutro.erro === FRASE_DA_PREVIA.arquivo, deOutro);
    const forjado = await confirmarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx", "token-forjado");
    confere("comprovante forjado é recusado", !forjado.ok && forjado.erro === FRASE_DA_PREVIA.invalida, forjado);
    const deOutraPessoa = await confirmarContrapartes(tenantId, "outra-pessoa", empresaId, arquivo, "fornecedores.xlsx", previa.comprovante);
    confere("comprovante de outra pessoa é recusado", !deOutraPessoa.ok && deOutraPessoa.erro === FRASE_DA_PREVIA.de_outro, deOutraPessoa);
    const deOutroEscritorio = await analisarContrapartes("outro-escritorio", user.id, empresaId, arquivo, "fornecedores.xlsx");
    confere("empresa de outro escritório não existe", !deOutroEscritorio.ok && deOutroEscritorio.erro === NAO_ENCONTRADA, deOutroEscritorio);

    // A conta 999 passa a existir depois da prévia: a confirmação refaz a análise e recusa.
    const c999 = await conta(999, "2.1.3.01.0999");
    const velha = await confirmarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx", previa.comprovante);
    confere("prévia desatualizada é recusada", !velha.ok && velha.erro === FRASE_DA_PREVIA.desatualizada, velha);
    confere("nada gravado nas recusas", (await prisma.coreContraparte.count({ where: { tenantId, empresaId } })) === 3);

    const nova = valor(await analisarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx"));
    confere("nova prévia: 3 prontas", nova.prontas === 3, { ...nova, itens: undefined });
    const feita = valor(await confirmarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx", nova.comprovante));
    confere("confirmação importa as prontas", feita.importadas === 3 && feita.duplicadas === 2 && feita.conflitos === 3 && feita.invalidas === 2 && feita.tipo === "fornecedor", feita);
    const alfa = await prisma.coreContraparte.findFirst({ where: { tenantId, empresaId, documento: "11111111000111" } });
    confere(
      "gravada com origem, confirmação, chave e dados sem nulos",
      !!alfa && alfa.origem === "relatorio_fiscal" && alfa.tipo === "fornecedor" && alfa.contaContabilId === c501.id && alfa.ativa &&
        alfa.confirmadoPorId === user.id && !!alfa.confirmadoEm && !!alfa.chaveAtiva && alfa.nomeFantasia === "ALFA" &&
        JSON.stringify(alfa.dadosCadastrais) === JSON.stringify({ endereco: "RUA DE TESTE, 100" }),
      alfa,
    );
    const epsilon = await prisma.coreContraparte.findFirst({ where: { tenantId, empresaId, documento: "55555555000155", tipo: "fornecedor" } });
    confere("tipo oposto convive; sem dados cadastrais fica nulo", !!epsilon && epsilon.contaContabilId === c503.id && epsilon.dadosCadastrais === null, epsilon);
    const de999 = await prisma.coreContraparte.findFirst({ where: { tenantId, empresaId, documento: "66666666000166" } });
    confere("a conta criada depois entra na nova prévia", de999?.contaContabilId === c999.id);

    const repetida = await confirmarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx", nova.comprovante);
    confere("o mesmo comprovante não vale de novo (a análise mudou)", !repetida.ok && repetida.erro === FRASE_DA_PREVIA.desatualizada, repetida);
    const reimportacao = valor(await analisarContrapartes(tenantId, user.id, empresaId, arquivo, "fornecedores.xlsx"));
    confere("reimportação: tudo duplicado ou em conflito", reimportacao.prontas === 0 && reimportacao.duplicadas === 5, { ...reimportacao, itens: undefined });

    const outraEmpresa = await analisarContrapartes(tenantId, user.id, empresaId, await relacao("fornecedor", linhas, "98.765.432/0001-10"), "f.xlsx");
    confere("CNPJ de outra empresa é recusado", !outraEmpresa.ok && outraEmpresa.erro.startsWith("O CNPJ do relatório não corresponde"), outraEmpresa);
    const semCnpj = valor(await analisarContrapartes(tenantId, user.id, empresaId, await relacao("cliente", [{ conta: 601, razao: "CLIENTE FICTÍCIO", documento: "88.888.888/0001-88" }], null), "c.xlsx"));
    confere("sem CNPJ no relatório: aviso", semCnpj.tipoDetectado === "cliente" && semCnpj.prontas === 1 && semCnpj.avisos[0].startsWith("O relatório não informa o CNPJ"), semCnpj.avisos);
    const ilegivel = await analisarContrapartes(tenantId, user.id, empresaId, new TextEncoder().encode("a;b"), "c.csv");
    confere("arquivo ilegível devolve a mensagem do leitor", !ilegivel.ok && ilegivel.erro === "Envie uma planilha com extensão XLSX ou XLS.", ilegivel);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
    const sobrou = await prisma.coreEmpresa.count({ where: { companyId: company.id } });
    confere("limpeza: a empresa de teste foi apagada", sobrou === 0 && (await prisma.company.count({ where: { id: company.id } })) === 0);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
