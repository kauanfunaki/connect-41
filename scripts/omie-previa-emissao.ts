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
//   geral/clientes    ListarClientes         — os tomadores da tela
//   servicos/servico  ListarCadastroServico  — os serviços da tela
//   servicos/os       ListarOS               — as últimas ordens de serviço
//   servicos/os       StatusOS               — o que o cron lê (da OS faturada mais recente)
//
// O que conferir na saída, contra emissao.ts: os nomes das listas
// (`clientes_cadastro`, `cadastros`, `ListaRpsNfse`), `intListar.nCodServ`,
// `cabecalho.cCodCateg`, o formato de `dDtFat`, os valores de `cFaturada`,
// `cAmbiente`, `cStatusRps` — e se o `StatusOS` de uma OS faturada traz mesmo o
// `ListaRpsNfse` com `nNfse` (se vier vazio, o StatusOS pode precisar de
// `lRps`/`lMsg`, e o cron não veria a autorização).
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
import { clientesDaPagina, conferirEmissor, servicosDaPagina } from "@/lib/integracoes/omie/emissao";

const SO_LEITURA = new Set(["ListarEmpresas", "ListarClientes", "ListarCadastroServico", "ListarOS", "StatusOS"]);

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  if (i >= 0) return process.argv[i + 1];
  return process.argv.find((a) => a.startsWith(`${nome}=`))?.split("=")[1];
}

async function chamar(cred: CredencialOmie, modulo: string, call: string, param: Record<string, unknown>): Promise<unknown | null> {
  if (!SO_LEITURA.has(call)) throw new Error(`A prévia só lê: ${call} não está na lista.`);
  console.log(`\n── ${modulo} ${call}  ${JSON.stringify(param)}`);
  try {
    const corpo = await chamarOmieNaFila(cred, modulo, call, param);
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
  const corpoClientes = await chamar(cred, "geral/clientes", "ListarClientes", { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N" });
  if (corpoClientes) {
    const r = clientesDaPagina(corpoClientes);
    console.log(`\n   → a tela leria ${r.clientes.length} tomador(es) ativo(s) nesta página, de ${r.totalDePaginas} página(s) de 5`);
  }
  const corpoServicos = await chamar(cred, "servicos/servico", "ListarCadastroServico", { nPagina: 1, nRegPorPagina: 5 });
  if (corpoServicos) {
    const r = servicosDaPagina(corpoServicos);
    console.log(`\n   → a tela leria ${r.servicos.length} serviço(s) ativo(s) nesta página; com categoria: ${r.servicos.filter((s) => s.categoria).length}`);
  }

  // 3. As últimas OS, e o StatusOS da faturada mais recente — o que o cron lê.
  const corpoOs = await chamar(cred, "servicos/os", "ListarOS", { pagina: 1, registros_por_pagina: 5, apenas_importado_api: "N", ordem_decrescente: "S" });
  const lista = Array.isArray(obj(corpoOs).osCadastro) ? (obj(corpoOs).osCadastro as unknown[]) : [];
  const faturada = lista.find((os) => String(obj(obj(os).InfoCadastro).cFaturada ?? "").toUpperCase() === "S") ?? lista[0];
  const nCodOS = obj(obj(faturada).Cabecalho).nCodOS;
  if (nCodOS) {
    const ehFaturada = faturada !== lista[0] || String(obj(obj(faturada).InfoCadastro).cFaturada ?? "").toUpperCase() === "S";
    console.log(`\n   → StatusOS da OS ${ehFaturada ? "faturada " : ""}mais recente da lista`);
    await chamar(cred, "servicos/os", "StatusOS", { nCodOS });
  } else {
    console.log("\n   → nenhuma OS na conta para ler o StatusOS (a primeira nota do piloto vai ser a primeira OS).");
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
