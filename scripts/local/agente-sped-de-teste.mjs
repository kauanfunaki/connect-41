#!/usr/bin/env node
// Agente de teste do Gerar SPED (06/11/2026).
//
// Faz o papel do agente do motor contra um Connect LOCAL, seguindo o contrato
// de docs/SPED-GERACAO-PELO-AGENTE.md: pede a tarefa `gerar_sped`, baixa e
// confere o pacote, devolve um TXT FICTÍCIO em partes e conclui. Serve para
// testar a fila sem o motor e como referência de como o agente fala com o
// Connect. Não gera SPED nenhum: o arquivo diz que é fictício na primeira linha.
//
// Recusa endereço que não seja local — concluiria tarefas de verdade com um
// arquivo falso.
//
// Uso (as mesmas variáveis do agente de verdade):
//   OPS_URL=http://127.0.0.1:3127 OPS_TOKEN=<chave local> OPS_SLUG=agente-sped \
//     node scripts/local/agente-sped-de-teste.mjs [--uma-vez] [--tamanho-mb=20] [--falhar]

import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const tem = (nome) => args.includes(nome);
const valor = (nome, padrao) => { const a = args.find((x) => x.startsWith(`${nome}=`)); return a ? a.slice(nome.length + 1) : padrao; };

const ENDERECO = (process.env.OPS_URL || "").replace(/\/+$/, "");
const CHAVE = process.env.OPS_TOKEN || "";
const SLUG = process.env.OPS_SLUG || "";
const PARTE = 8 * 1024 * 1024;
const VERSAO = "agente-de-teste-2026-11-06";

if (!ENDERECO || !CHAVE || !SLUG) { console.error("Defina OPS_URL, OPS_TOKEN e OPS_SLUG."); process.exit(2); }
const host = new URL(ENDERECO).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(host) && !host.endsWith(".localhost")) {
  console.error(`Recusado: ${host} não é local. Este agente devolve um arquivo fictício e concluiria tarefas de verdade.`);
  process.exit(2);
}

const base = `${ENDERECO}/api/ops/watchers/${encodeURIComponent(SLUG)}`;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function chamar(metodo, caminho, init = {}) {
  return fetch(`${base}${caminho}`, { method: metodo, ...init, headers: { authorization: `Bearer ${CHAVE}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(60_000) });
}
async function lerJson(resposta, oQue) {
  const texto = await resposta.text();
  if (!resposta.ok) throw new Error(`${oQue}: HTTP ${resposta.status} ${texto.slice(0, 300)}`);
  return JSON.parse(texto);
}
const enviarJson = (metodo, caminho, corpo, oQue) => chamar(metodo, caminho, { headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => lerJson(r, oQue));
const devolver = (id, corpo) => enviarJson("POST", `/tarefas/${id}`, corpo, "devolver");

/** Um TXT de mentira em ISO-8859-1 com CRLF, com acentos para provar que os bytes não mudam no caminho. */
function txtFicticio(dados, tamanhoMb) {
  let texto = [
    `|0000|019|${dados.tipo_sped}|${dados.competencia}|ARQUIVO FICTÍCIO DE TESTE - NÃO TRANSMITIR|${dados.cnpj}|`,
    "|0001|0|",
    "|9999|3|",
  ].join("\r\n") + "\r\n";
  const alvo = Math.round(Number(tamanhoMb) * 1024 * 1024);
  const enchimento = "|9900|AÇÃO FICTÍCIA PARA OCUPAR ESPAÇO|\r\n";
  if (alvo > texto.length) texto += enchimento.repeat(Math.ceil((alvo - texto.length) / enchimento.length));
  return Buffer.from(texto, "latin1");
}

async function umaVolta() {
  const { tarefa } = await enviarJson("POST", "/tarefas", { capacidades: ["gerar_sped"], versao: VERSAO }, "pedir tarefa");
  if (!tarefa) { console.log("Nenhuma geração na fila."); return false; }
  const d = tarefa.dados;
  console.log(`Tarefa ${tarefa.id}, tentativa ${tarefa.tentativa}: ${d.obrigacao} ${d.competencia}, estabelecimento ${d.cnpj}.`);

  const r = await chamar("GET", `/tarefas/${tarefa.id}/pacote`);
  if (!r.ok) throw new Error(`baixar pacote: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  const pacote = Buffer.from(await r.arrayBuffer());
  const conferido = sha(pacote);
  if (conferido !== d.sha256 || conferido !== r.headers.get("x-conteudo-sha256") || pacote.length !== d.tamanho) {
    console.log("O pacote não confere: devolvendo como falha recuperável.");
    console.log(await devolver(tarefa.id, { ok: false, motivo: "O pacote baixado não confere com o SHA-256 da tarefa.", recuperavel: true }));
    return true;
  }
  const lido = JSON.parse(pacote.toString("utf8"));
  console.log(`Pacote conferido: ${pacote.length} bytes, revisão ${lido.revisao}, ${lido.documentos?.length ?? 0} documento(s).`);

  if (tem("--falhar")) {
    console.log(await devolver(tarefa.id, { ok: false, motivo: "Falha simulada pelo agente de teste.", recuperavel: true }));
    return true;
  }

  const arquivo = txtFicticio(d, valor("--tamanho-mb", "0"));
  const partes = Math.ceil(arquivo.length / PARTE);
  for (let n = 1; n <= partes; n++) {
    const pedaco = arquivo.subarray((n - 1) * PARTE, n * PARTE);
    const resposta = await chamar("PUT", `/tarefas/${tarefa.id}/partes/${n}`, { headers: { "content-type": "application/octet-stream", "x-parte-sha256": sha(pedaco) }, body: pedaco }).then((x) => lerJson(x, `parte ${n}`));
    console.log(`Parte ${n}/${partes}: ${resposta.tamanho} bytes${resposta.repetida ? ", repetida" : ""}.`);
  }
  const nome = `sped_${d.obrigacao}_${d.competencia}_FICTICIO.txt`;
  const fim = await devolver(tarefa.id, { ok: true, resultado: { arquivo: { nome, tamanho: arquivo.length, sha256: sha(arquivo), partes }, motor: { versao: VERSAO } } });
  console.log(`Devolvida: ${fim.status}. Arquivo ${nome}, ${arquivo.length} bytes, SHA-256 ${sha(arquivo)}.`);
  return true;
}

if (tem("--uma-vez")) {
  await umaVolta();
} else {
  console.log("Buscando geração a cada 10 s. Ctrl+C para parar.");
  for (;;) {
    try { await umaVolta(); } catch (err) { console.error(err instanceof Error ? err.message : err); }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
