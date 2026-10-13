// Prévia da emissão de NFS-e pelo Omie — SÓ LEITURA (Fase 2, 13/10/2026).
//
//   npx tsx --env-file=.env scripts/omie-previa-emissao.ts                 # lista as empresas com conta do Omie
//   npx tsx --env-file=.env scripts/omie-previa-emissao.ts --empresa <id>  # a prévia de uma empresa
//
// ── Por que isto existe ─────────────────────────────────────────────────────
//
// A regra do projeto: adaptador só vai para produção depois de ver resposta
// real da API. O adaptador da emissão (src/lib/integracoes/omie/emissao.ts) foi
// escrito pela documentação pública do Omie, e emitir é nota de verdade na
// prefeitura — não há sandbox de NFS-e. Antes da primeira nota do piloto, esta
// prévia chama, com as chaves de uma empresa, só os métodos de leitura que a
// tela e o cron usam, e imprime a FORMA de cada resposta:
//
//   geral/empresas    ListarEmpresas         — por qual CNPJ a nota sairia
//   geral/clientes    ListarClientes         — os tomadores da tela (e os bloqueados)
//   servicos/servico  ListarCadastroServico  — os serviços da tela, todas as páginas
//   servicos/os       ListarOS               — as últimas OS: a categoria sugerida
//   servicos/os       StatusOS               — o que o cron lê, da OS faturada e
//                                              NÃO cancelada mais recente
//
// A primeira rodada (13/10/2026, MULTI) confirmou os nomes das listas e mostrou
// o `StatusOS` de uma OS cancelada (005/005). Esta rodada é para ver o de uma
// nota autorizada: `nNfse` preenchido, o `cStatusRps` que vem nela (o código
// trata 004 como sucesso) e se `danfe` e `xml_distr` são link ou o XML inteiro.
// Se a primeira página de OS não tiver nenhuma faturada e não cancelada, a
// prévia diz e não chama o StatusOS.
//
// ── O que ela NÃO faz ───────────────────────────────────────────────────────
//
// Não cria, não altera, não fatura, não cancela: só os cinco métodos acima, e
// o script se recusa a chamar qualquer outro. Não grava no banco do Connect
// (só lê a conta da empresa). E não imprime dado do cliente: os exemplos saem
// mascarados (letra vira "x", dígito vira "9") — ficam abertos só paginação e
// bandeiras de situação. As chaves do Omie nunca aparecem.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { nomeExibicao } from "@/lib/companyName";
import { empresasDaResposta, type CredencialOmie } from "@/lib/integracoes/omie/cliente";
import { instanciaDaEmpresa, PREFIXO_DA_EMPRESA } from "@/lib/integracoes/omie/contas";
import { chamarOmieNaFila, idDaConta } from "@/lib/integracoes/omie/fila";
import { estruturaSemDados } from "@/lib/integracoes/omie/estrutura";
import {
  clientesDaPagina,
  conferirEmissor,
  desfechoDoStatus,
  lerStatusDaOS,
  osDaPagina,
  servicosDaPagina,
  sugestoesDasOS,
  type ServicoDoOmie,
} from "@/lib/integracoes/omie/emissao";

const SO_LEITURA = new Set(["ListarEmpresas", "ListarClientes", "ListarCadastroServico", "ListarOS", "StatusOS"]);
/** O mesmo teto da tela: 10 páginas de 50 serviços. */
const MAX_PAGINAS_DE_SERVICO = 10;

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i >= 0) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith(`${nome}=`))?.split("=")[1];
}

/** Chama e imprime a forma da resposta; com `mostrar` falso, só chama (as páginas seguintes de uma lista). */
async function chamar(cred: CredencialOmie, modulo: string, call: string, param: Record<string, unknown>, mostrar = true): Promise<unknown | null> {
  if (!SO_LEITURA.has(call)) throw new Error(`A prévia só lê: ${call} não está na lista.`);
  console.log(`\n── ${modulo} ${call}  ${JSON.stringify(param)}`);
  try {
    const corpo = await chamarOmieNaFila(cred, modulo, call, param);
    if (!mostrar) return corpo;
    const linhas = estruturaSemDados(corpo);
    const largura = Math.min(70, Math.max(...linhas.map((l) => l.caminho.length), 10));
    for (const l of linhas) console.log(`   ${l.caminho.padEnd(largura)}  ${l.tipo.padEnd(10)}  ${l.exemplo}`);
    if (linhas.length >= 200) console.log("   … (cortado em 200 campos)");
    return corpo;
  } catch (err) {
    // O erro é informação: parâmetro com nome errado volta como mensagem do Omie.
    console.log(`   ERRO: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** O tipo de um campo de texto, sem o conteúdo: é o que decide se `danfe`/`xml_distr` cabem num link. */
function formaDoTexto(v: unknown): string {
  const t = v === null || v === undefined ? "" : String(v).trim();
  if (!t) return "vazio";
  if (/^https?:\/\//i.test(t)) return `link http(s), ${t.length} caracteres`;
  if (t.startsWith("<")) return `XML inteiro, ${t.length} caracteres`;
  return `outro texto, ${t.length} caracteres`;
}

async function listarContas() {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { integrationCode: "omie", instanceKey: { startsWith: PREFIXO_DA_EMPRESA } },
    select: { tenantId: true, instanceKey: true, enabled: true, lastError: true, configEnc: true },
  });
  const ids = conexoes.map((c) => c.instanceKey.slice(PREFIXO_DA_EMPRESA.length));
  const empresas = await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, displayName: true } });
  const porId = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  // A mesma App Key em mais de uma empresa aparece com a mesma letra de conta.
  const letras = new Map<string, string>();
  console.log("Empresas com conta do Omie no Connect:\n");
  for (const c of conexoes) {
    const id = c.instanceKey.slice(PREFIXO_DA_EMPRESA.length);
    const appKey = lerConfig(c.configEnc).appKey ?? "";
    const conta = appKey ? idDaConta({ appKey }) : "";
    if (conta && !letras.has(conta)) letras.set(conta, String.fromCharCode(65 + letras.size));
    console.log(
      `  ${id}  conta ${letras.get(conta) ?? "?"}  ${c.enabled ? "ligada   " : "DESLIGADA"}  ${porId.get(id) ?? "(empresa removida)"}${c.lastError ? `  — último erro: ${c.lastError.slice(0, 80)}` : ""}`
    );
  }
  console.log("\nContas com a mesma letra usam a mesma App Key. Rode de novo com --empresa <id>.");
}

async function main() {
  const companyId = argumento("--empresa");
  if (!companyId) return listarContas();

  const prisma = getPrisma();
  const empresa = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, tenantId: true, name: true, displayName: true, cnpj: true, cpf: true } });
  if (!empresa) throw new Error(`Empresa ${companyId} não encontrada.`);
  const conexao = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId: empresa.tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
    select: { enabled: true, configEnc: true },
  });
  if (!conexao) throw new Error("Esta empresa não tem conta do Omie cadastrada.");
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) throw new Error("Falta App Key ou App Secret na conta desta empresa.");
  const cred = { appKey: config.appKey, appSecret: config.appSecret };

  console.log(`Prévia da emissão de NFS-e — só leitura`);
  console.log(`Empresa: ${nomeExibicao(empresa)} (${empresa.id})${conexao.enabled ? "" : "  — a conta está DESLIGADA no Connect"}`);

  // 1. Por qual CNPJ a nota sairia.
  const corpoEmpresas = await chamar(cred, "geral/empresas", "ListarEmpresas", { pagina: 1, registros_por_pagina: 50 });
  const empresasDaConta = empresasDaResposta(corpoEmpresas);
  const documento = (empresa.cnpj ?? empresa.cpf ?? "").replace(/\D/g, "") || null;
  const conferencia = conferirEmissor(empresasDaConta, documento);
  console.log(`\n   → a conta lista ${empresasDaConta.length} empresa(s); o documento desta empresa no Connect está entre elas: ${conferencia.pode ? "SIM" : "NÃO"}`);

  // 2. Tomadores e serviços, como a tela lê.
  const corpoClientes = await chamar(cred, "geral/clientes", "ListarClientes", { pagina: 1, registros_por_pagina: 50, apenas_importado_api: "N" });
  if (corpoClientes) {
    const r = clientesDaPagina(corpoClientes);
    console.log(
      `\n   → nesta página, a tela leria ${r.clientes.length} tomador(es) ativo(s); ${r.bloqueados.length} com faturamento bloqueado ficam de fora — de ${r.totalDePaginas} página(s) de 50`
    );
  }

  // Todas as páginas de serviço (a forma só da primeira), para contar os códigos fiscais dos ativos.
  const servicos: ServicoDoOmie[] = [];
  let paginasDeServico = 1;
  for (let pagina = 1; pagina <= Math.min(paginasDeServico, MAX_PAGINAS_DE_SERVICO); pagina++) {
    const corpo = await chamar(cred, "servicos/servico", "ListarCadastroServico", { nPagina: pagina, nRegPorPagina: 50 }, pagina === 1);
    if (!corpo) break;
    const r = servicosDaPagina(corpo);
    servicos.push(...r.servicos);
    paginasDeServico = r.totalDePaginas;
  }
  const quantos = (f: (s: ServicoDoOmie) => unknown) => servicos.filter(f).length;
  console.log(`\n   → serviços ativos lidos: ${servicos.length}${paginasDeServico > MAX_PAGINAS_DE_SERVICO ? ` (parou em ${MAX_PAGINAS_DE_SERVICO} de ${paginasDeServico} páginas)` : ""}`);
  console.log(`     com cCodCateg: ${quantos((s) => s.categoria)} · com cCodServMun: ${quantos((s) => s.codigoMunicipal)} · com cCodLC116: ${quantos((s) => s.codigoLC116)}`);
  console.log(`     sem cCodServMun nem cCodLC116 (a tela mostra o aviso da prefeitura): ${quantos((s) => !s.codigoMunicipal && !s.codigoLC116)}`);

  // 3. As últimas OS: a categoria sugerida, e o StatusOS da faturada e não cancelada mais recente.
  const corpoOs = await chamar(cred, "servicos/os", "ListarOS", { pagina: 1, registros_por_pagina: 50, apenas_importado_api: "N", ordem_decrescente: "S" });
  const lista = osDaPagina(corpoOs);
  const sugestoes = sugestoesDasOS(lista);
  console.log(`\n   → ${lista.length} OS na primeira página; canceladas: ${lista.filter((os) => os.cancelada === true).length}`);
  console.log(`     categoria sugerida (a da OS mais recente não cancelada): ${sugestoes.categoria ? "SIM" : "NÃO — a tela vai pedir a categoria"}`);
  console.log(`     serviços com código municipal ou LC 116 numa OS recente: ${Object.keys(sugestoes.porServico).length}`);

  const autorizada = lista.find((os) => os.faturada === true && os.cancelada !== true);
  if (!autorizada) {
    console.log(
      lista.length === 0
        ? "\n   → nenhuma OS na conta para ler o StatusOS (a primeira nota do piloto vai ser a primeira OS)."
        : `\n   → nenhuma OS faturada e não cancelada entre as ${lista.length} da primeira página — sem StatusOS de nota autorizada desta vez.`
    );
  } else {
    console.log("\n   → StatusOS da OS faturada e não cancelada mais recente");
    const corpoStatus = await chamar(cred, "servicos/os", "StatusOS", { nCodOS: Number(autorizada.codigo) });
    if (corpoStatus) {
      const status = lerStatusDaOS(corpoStatus);
      const listaDeRps = obj(corpoStatus).ListaRpsNfse;
      const bruto = Array.isArray(listaDeRps) ? obj(listaDeRps.at(-1)) : {};
      const rps = status.rps.at(-1);
      console.log(`\n   → RPS na resposta: ${status.rps.length}; o último: cStatusRps "${String(bruto.cStatusRps ?? "")}", cStatusLote "${String(bruto.cStatusLote ?? "")}"`);
      console.log(`     nNfse: ${rps?.numeroNfse ? "preenchido" : "VAZIO"} · danfe: ${formaDoTexto(bruto.danfe)} · xml_distr: ${formaDoTexto(bruto.xml_distr)}`);
      console.log(`     o Connect daria: ${desfechoDoStatus(status).estado}${rps?.url ? ", com o link da nota" : ", SEM link da nota"}`);
    }
  }

  console.log("\nFim da prévia. Nada foi criado nem alterado no Omie, e nada foi gravado no Connect.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
