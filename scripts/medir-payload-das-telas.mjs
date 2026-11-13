#!/usr/bin/env node
// Mede o "peso" de cada tela interna do Connect (as páginas de `src/app/(app)`):
//
// - o HTML da primeira carga (TTFB, tempo total, bytes crus e com gzip);
// - o payload RSC da navegação pelo menu — o que o navegador baixa ao clicar
//   num item do menu estando em outra tela (padrão: a /home);
// - o JavaScript da tela: o que toda tela já carrega (a base) e o que é só dela;
// - nas telas mais pesadas, quais componentes cliente recebem as maiores props.
//
// Só roda contra um servidor LOCAL e com o banco LOCAL — nunca a produção:
//
//   node scripts/local/com-banco-local.mjs npm run build
//   node scripts/local/com-banco-local.mjs npx next start -p 3210      (deixar rodando)
//   node scripts/local/com-banco-local.mjs node scripts/medir-payload-das-telas.mjs
//
// O lançador carrega o `.env.localdev` (DATABASE_URL local e JWT_ACCESS_SECRET).
// O script usa o banco só para LER: a conta que assina o token e, quando nenhum
// link das telas leva a uma rota dinâmica, um id real para preenchê-la. As
// requisições ao servidor são todas GET.
//
// Opções:
//   --base <url>          servidor medido (padrão http://localhost:3210); recusa o que não for local
//   --rodadas <n>         medições por rota depois do aquecimento (padrão 3; vale a mediana)
//   --filtro <texto>      só as rotas cujo padrão contém o texto (ou /regex/)
//   --usuario <e-mail>    conta usada no token (padrão: SUPER_ADMIN/ADMIN do escritório "41 Tech")
//   --de <caminho>        tela de onde parte a navegação simulada (padrão /home)
//   --saida <pasta>       onde gravar os relatórios (padrão .local/payload)
//   --param <padrão>=<url>  resolve à mão uma rota dinâmica (repetível), ex.:
//                         --param "/empresas/[id]=/empresas/abc123"
//   --timeout <ms>        limite por requisição (padrão 90000)
//   --detalhes <n>        quantas rotas (as de maior RSC) ganham a análise das props (padrão 15)
//   --guardar-corpos      grava o HTML e o RSC de cada rota em <saida>/corpos/, para inspecionar
//
// Se toda tela der 500 com "column/table does not exist" no log do servidor, o
// banco local está atrás do schema: ver "Atualizar o banco" em scripts/local/README.md.
//
// Saída: <saida>/relatorio-payload.json (dados crus) e <saida>/relatorio-payload.md.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import mariadb from "mariadb";

// ── Opções ───────────────────────────────────────────────────────────────────

function lerOpcoes(argv) {
  const op = {
    base: "http://localhost:3210",
    rodadas: 3,
    filtro: null,
    usuario: null,
    de: "/home",
    saida: ".local/payload",
    params: {},
    timeout: 90_000,
    detalhes: 15,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const valor = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Falta o valor de ${a}`);
      return v;
    };
    if (a === "--base") op.base = valor();
    else if (a === "--rodadas") op.rodadas = Math.max(1, Number(valor()) || 3);
    else if (a === "--filtro") op.filtro = valor();
    else if (a === "--usuario") op.usuario = valor();
    else if (a === "--de") op.de = valor();
    else if (a === "--saida") op.saida = valor();
    else if (a === "--timeout") op.timeout = Number(valor()) || op.timeout;
    else if (a === "--detalhes") op.detalhes = Number(valor()) || 0;
    else if (a === "--guardar-corpos") op.guardarCorpos = true;
    else if (a === "--param") {
      const v = valor();
      const k = v.indexOf("=");
      if (k < 0) throw new Error(`--param espera <padrão>=<url>, veio "${v}"`);
      op.params[v.slice(0, k)] = v.slice(k + 1);
    } else if (a === "--help" || a === "-h") {
      console.log("Veja o cabeçalho de scripts/medir-payload-das-telas.mjs.");
      process.exit(0);
    } else throw new Error(`Opção desconhecida: ${a}`);
  }
  return op;
}

const op = lerOpcoes(process.argv.slice(2));

// ── Guardas: servidor e banco só locais ──────────────────────────────────────

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const base = new URL(op.base);
if (!HOSTS_LOCAIS.has(base.hostname)) {
  console.error(`Recusado: --base precisa ser local (localhost/127.0.0.1/[::1]); veio "${base.hostname}".`);
  process.exit(1);
}
const ORIGEM = base.origin;

let urlDoBanco;
try {
  urlDoBanco = new URL(process.env.DATABASE_URL ?? "");
} catch {
  urlDoBanco = null;
}
if (!urlDoBanco || !HOSTS_LOCAIS.has(urlDoBanco.hostname)) {
  console.error(
    "Recusado: a DATABASE_URL não é local (ou não existe). Rode pelo lançador:\n" +
      "  node scripts/local/com-banco-local.mjs node scripts/medir-payload-das-telas.mjs",
  );
  process.exit(1);
}
const SEGREDO = process.env.JWT_ACCESS_SECRET;
if (!SEGREDO) {
  console.error("Falta JWT_ACCESS_SECRET no ambiente (vem do .env.localdev pelo lançador).");
  process.exit(1);
}

// ── Banco (só leitura) ───────────────────────────────────────────────────────

const db = await mariadb.createConnection({
  host: urlDoBanco.hostname,
  port: Number(urlDoBanco.port || 3306),
  user: decodeURIComponent(urlDoBanco.username),
  password: decodeURIComponent(urlDoBanco.password),
  database: urlDoBanco.pathname.replace(/^\//, "") || "connect41",
  allowPublicKeyRetrieval: true,
});

async function primeiraLinha(sql, valores = []) {
  const linhas = await db.query(sql, valores);
  return linhas[0] ?? null;
}

const conta = op.usuario
  ? await primeiraLinha("SELECT id, tenantId, role, name FROM users WHERE email = ? AND active = 1 LIMIT 1", [op.usuario])
  : await primeiraLinha(
      `SELECT u.id, u.tenantId, u.role, u.name FROM users u JOIN tenants t ON t.id = u.tenantId
        WHERE t.name = '41 Tech' AND u.role IN ('SUPER_ADMIN','ADMIN') AND u.active = 1
        ORDER BY FIELD(u.role, 'SUPER_ADMIN', 'ADMIN'), u.createdAt LIMIT 1`,
    );
if (!conta) {
  console.error("Não achei a conta (SUPER_ADMIN/ADMIN do escritório \"41 Tech\" ou a do --usuario).");
  process.exit(1);
}
const setores = (await db.query("SELECT sectorCode FROM user_sectors WHERE userId = ?", [conta.id])).map((l) => l.sectorCode);
const concessoes =
  conta.role === "SUPER_ADMIN"
    ? (await db.query("SELECT tenantId FROM user_tenant_access WHERE userId = ?", [conta.id])).map((l) => l.tenantId)
    : [];

// ── Token de acesso (o mesmo formato de signAccess em src/lib/auth/jwt.ts) ───

function assinarAcesso() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = {
    sub: conta.id,
    tenantId: conta.tenantId,
    role: conta.role,
    sectors: setores,
    accessibleTenants: conta.role === "SUPER_ADMIN" ? [...new Set([conta.tenantId, ...concessoes])] : [],
    iat: agora,
    exp: agora + 4 * 3600,
  };
  const cabeca = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(corpo)}`;
  return `${cabeca}.${createHmac("sha256", SEGREDO).update(cabeca).digest("base64url")}`;
}
const COOKIE = `access_token=${assinarAcesso()}`;

// ── Rotas: todas as page.tsx do grupo (app) ──────────────────────────────────

const RAIZ_APP = resolve("src/app/(app)");

function listarPaginas(dir, segmentos = []) {
  const paginas = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // @slot (modais paralelos/interceptados) não é tela própria; _pasta é privada.
      if (nome.startsWith("@") || nome.startsWith("_")) continue;
      paginas.push(...listarPaginas(caminho, [...segmentos, nome]));
    } else if (nome === "page.tsx" || nome === "page.ts" || nome === "page.jsx" || nome === "page.js") {
      paginas.push(segmentos);
    }
  }
  return paginas;
}

const ehGrupo = (s) => s.startsWith("(") && s.endsWith(")");
const ehDinamico = (s) => s.startsWith("[");
const ehOpcional = (s) => s.startsWith("[[");

const todasAsRotas = listarPaginas(RAIZ_APP)
  .map((segs) => {
    const visiveis = segs.filter((s) => !ehGrupo(s));
    const padrao = "/" + visiveis.join("/");
    return {
      padrao: padrao === "/" ? "/" : padrao,
      segmentos: visiveis,
      arquivo: `src/app/(app)/${[...segs, "page.tsx"].join("/")}`,
    };
  })
  .sort((a, b) => a.padrao.localeCompare(b.padrao));

function casaFiltro(padrao) {
  if (!op.filtro) return true;
  const m = /^\/(.+)\/([a-z]*)$/.exec(op.filtro);
  return m ? new RegExp(m[1], m[2]).test(padrao) : padrao.includes(op.filtro);
}

// Nomes estáticos de cada nível (inclui pastas sem page.tsx, como /kanban/itens):
// um link /kanban/itens não pode resolver /kanban/[id].
const estaticosPorNivel = new Map();
for (const r of todasAsRotas) {
  for (let i = 0; i < r.segmentos.length; i++) {
    const s = r.segmentos[i];
    if (ehDinamico(s)) continue;
    const chave = r.segmentos.slice(0, i).join("/");
    if (!estaticosPorNivel.has(chave)) estaticosPorNivel.set(chave, new Set());
    estaticosPorNivel.get(chave).add(s);
  }
}

function urlSemOpcional(r) {
  // [[...resto]] opcional: a própria base é uma URL válida.
  const segs = r.segmentos.filter((s) => !ehOpcional(s));
  return "/" + segs.join("/");
}

function casarComPadrao(r, caminho) {
  const partes = caminho.split("/").filter(Boolean);
  const segs = r.segmentos;
  let j = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (ehOpcional(s)) return j === partes.length || i === segs.length - 1;
    if (s.startsWith("[...")) return j < partes.length && i === segs.length - 1;
    if (j >= partes.length) return false;
    if (ehDinamico(s)) {
      const nivel = estaticosPorNivel.get(segs.slice(0, i).join("/"));
      const v = decodeURIComponent(partes[j]);
      if (nivel?.has(v) || v.startsWith("[") || v.includes(".")) return false;
    } else if (s !== partes[j]) return false;
    j++;
  }
  return j === partes.length;
}

// Links candidatos dentro de um HTML/RSC: qualquer string que comece com "/".
function colherCaminhos(texto, destino) {
  const re = /["'](\/[A-Za-z0-9\-._~%:@!$&*+,;=/]*)/g;
  let m;
  while ((m = re.exec(texto))) {
    let c = m[1];
    if (c.length < 2 || c.startsWith("//") || c.startsWith("/_next/") || c.startsWith("/api/")) continue;
    if (c.length > 1 && c.endsWith("/")) c = c.slice(0, -1);
    if (!destino.has(c)) destino.set(c, destino.size);
  }
}

// ── Consultas de reserva para rotas dinâmicas sem link nas telas ─────────────
//
// Só usadas quando nenhuma tela medida linka a rota (nem herda o parâmetro de
// outra já resolvida). Cada consulta recebe o tenantId e devolve as colunas na
// ordem dos parâmetros dinâmicos do padrão. Consulta que falhe ou volte vazia
// (tabela sem registro no banco local) só deixa a rota como "não resolvida".
const RESERVA = {
  "/admin/campos/[id]/editar": "SELECT id FROM custom_fields WHERE tenantId = ? LIMIT 1",
  "/admin/setores/[id]/editar": "SELECT id FROM sectors WHERE tenantId = ? LIMIT 1",
  "/admin/tags/[id]/editar": "SELECT id FROM tags WHERE tenantId = ? LIMIT 1",
  "/admin/usuarios/[id]/editar": "SELECT id FROM users WHERE tenantId = ? LIMIT 1",
  "/admin/workspaces/[id]": "SELECT id FROM tenants WHERE id = ? LIMIT 1",
  "/arquivos/pasta/[id]": "SELECT id FROM drive_folders WHERE tenantId = ? LIMIT 1",
  "/avaliacoes/[id]": "SELECT id FROM evaluation_cycles WHERE tenantId = ? LIMIT 1",
  "/chamados/[id]": "SELECT id FROM helpdesk_tickets WHERE tenantId = ? LIMIT 1",
  "/controle-interno/[id]": "SELECT id FROM tech_internal_items WHERE tenantId = ? LIMIT 1",
  "/dp2/competencia/[id]": "SELECT id FROM dp2_competencias WHERE tenantId = ? LIMIT 1",
  "/empresas/[id]": "SELECT id FROM companies WHERE tenantId = ? LIMIT 1",
  "/estoque/[id]": "SELECT id FROM inventory_items WHERE tenantId = ? LIMIT 1",
  "/kanban/itens/[itemId]": "SELECT id FROM pipeline_items WHERE tenantId = ? LIMIT 1",
  "/pessoas/[id]": "SELECT id FROM people WHERE tenantId = ? LIMIT 1",
  "/solicitacoes/envios/[docId]": "SELECT id FROM client_documents WHERE tenantId = ? LIMIT 1",
  "/testes/[id]": "SELECT id FROM assessment_links WHERE tenantId = ? LIMIT 1",
  "/treinamentos/[id]": "SELECT id FROM trainings WHERE tenantId = ? LIMIT 1",
};

async function resolverPelaReserva(r) {
  const sql = RESERVA[r.padrao];
  if (!sql) return null;
  try {
    const linha = await primeiraLinha(sql, [conta.tenantId]);
    if (!linha) return null;
    const valores = Object.values(linha).map(String);
    let k = 0;
    const segs = r.segmentos.filter((s) => !ehOpcional(s)).map((s) => (ehDinamico(s) ? encodeURIComponent(valores[k++] ?? "") : s));
    return "/" + segs.join("/");
  } catch {
    return null;
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const kb = (n) => (n == null ? "—" : (n / 1024).toFixed(1));
const ms = (n) => (n == null ? "—" : Math.round(n).toString());
const mediana = (xs) => {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const cacheDoRsc = new Map(); // chave dos cabeçalhos → valor de _rsc aceito pelo servidor

async function pedir(caminho, { rsc = null } = {}) {
  const cabecalhos = { cookie: COOKIE, "accept-encoding": "identity", "user-agent": "medir-payload-das-telas" };
  let chave = null;
  if (rsc) {
    cabecalhos.rsc = "1";
    if (rsc.arvore) cabecalhos["next-router-state-tree"] = rsc.arvore;
    if (rsc.nextUrl) cabecalhos["next-url"] = rsc.nextUrl;
    chave = `${rsc.arvore ?? ""}|${rsc.nextUrl ?? ""}`;
  }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const url = new URL(caminho, ORIGEM);
    if (rsc && cacheDoRsc.has(chave)) url.searchParams.set("_rsc", cacheDoRsc.get(chave));
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(url, { headers: cabecalhos, redirect: "manual", signal: AbortSignal.timeout(op.timeout) });
    } catch (e) {
      return { status: 0, erro: String(e?.cause?.code ?? e?.name ?? e), ttfb: null, total: performance.now() - t0, bytes: 0, gzip: 0, corpo: Buffer.alloc(0) };
    }
    const ttfb = performance.now() - t0;
    const corpo = Buffer.from(await res.arrayBuffer());
    const total = performance.now() - t0;
    const local = res.headers.get("location");
    // O Next 16 devolve 307 para a mesma URL com o `_rsc` certo (hash dos
    // cabeçalhos do roteador) quando ele falta: guarda e repete uma vez.
    if (rsc && res.status === 307 && local) {
      const destino = new URL(local, ORIGEM);
      if (destino.pathname === url.pathname && destino.searchParams.has("_rsc") && tentativa === 0) {
        cacheDoRsc.set(chave, destino.searchParams.get("_rsc"));
        continue;
      }
    }
    return { status: res.status, location: local, ttfb, total, bytes: corpo.length, gzip: gzipSync(corpo).length, corpo, tipo: res.headers.get("content-type") };
  }
  return { status: 0, erro: "loop de _rsc", bytes: 0, gzip: 0, corpo: Buffer.alloc(0) };
}

// ── Flight (RSC) ─────────────────────────────────────────────────────────────

// O payload RSC que vem embutido no HTML, nas chamadas self.__next_f.push(...).
function flightDoHtml(html) {
  const partes = [];
  const re = /self\.__next_f\.push\(\[(\d),("(?:[^"\\]|\\[\s\S])*")\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const s = JSON.parse(m[2]);
      if (m[1] === "1") partes.push(Buffer.from(s, "utf8"));
      else if (m[1] === "3") partes.push(Buffer.from(s, "base64"));
    } catch {
      /* pedaço que não é string JSON: ignora */
    }
  }
  return Buffer.concat(partes);
}

// Quebra o fluxo em linhas `id:conteúdo`. Linhas de texto/binário trazem o
// tamanho no prefixo (T<hex>, ou A/O/U/S… para arrays tipados) e não terminam
// em quebra de linha.
function linhasDoFlight(buf) {
  const linhas = [];
  let i = 0;
  while (i < buf.length) {
    const doisPontos = buf.indexOf(0x3a, i);
    if (doisPontos < 0) break;
    const id = buf.toString("latin1", i, doisPontos);
    if (!/^[0-9a-f]+$/.test(id)) {
      const nl = buf.indexOf(0x0a, i);
      if (nl < 0) break;
      i = nl + 1;
      continue;
    }
    const j = doisPontos + 1;
    const prefixo = /^([TAOoUSsLlGgMmVb])([0-9a-f]+),/.exec(buf.toString("latin1", j, Math.min(j + 24, buf.length)));
    if (prefixo) {
      const ini = j + prefixo[0].length;
      const fim = Math.min(buf.length, ini + parseInt(prefixo[2], 16));
      linhas.push({ id, tipo: prefixo[1], bytes: fim - i, conteudo: buf.subarray(ini, fim) });
      i = fim;
      continue;
    }
    const nl = buf.indexOf(0x0a, j);
    const fim = nl < 0 ? buf.length : nl;
    const c = String.fromCharCode(buf[j]);
    let tipo = "";
    let ini = j;
    if (c === "H" && buf[j + 1] === 0x4c) {
      tipo = "HL";
      ini = j + 2;
    } else if (/[A-Z]/.test(c)) {
      tipo = c;
      ini = j + 1;
    }
    linhas.push({ id, tipo, bytes: fim + 1 - i, conteudo: buf.subarray(ini, fim) });
    i = fim + 1;
  }
  return linhas;
}

function jsonDaLinha(l) {
  try {
    return JSON.parse(l.conteudo.toString("utf8"));
  } catch {
    return undefined;
  }
}

// A árvore do roteador da tela de origem, no formato que o cliente manda em
// `Next-Router-State-Tree` ([segmento, filhos, null, null, dicas]).
//
// No Next 16.4 a linha 0 traz `t.t`, a árvore de transporte: cada nó é
// `{ s: segmento, h: dicas, d: dados, c: "$Q<linha>" }`, e os filhos ficam em
// outra linha, como pares [chave, nó]. O cliente a converte (cache.js,
// convertRouteTreeToFlightRouterState) e tira o que só ele usa
// (flight-data-helpers.js, prepareFlightRouterStateForRequest) — aqui é o mesmo.
function arvoreDaTela(html) {
  const linhas = linhasDoFlight(flightDoHtml(html));
  const porId = new Map(linhas.filter((l) => l.tipo === "").map((l) => [l.id, l]));
  const valor = (v) => {
    if (typeof v === "string") {
      const m = /^\$[QW]?([0-9a-f]+)$/.exec(v);
      if (m && porId.has(m[1])) return jsonDaLinha(porId.get(m[1]));
    }
    return v;
  };
  const zero = valor("$0");
  const raiz = valor(zero?.t?.t);
  if (raiz && typeof raiz === "object" && "s" in raiz) {
    const converter = (no) => {
      no = valor(no);
      const s = no.s;
      const segmento = typeof s === "string" ? s : [s.n, s.k, s.t, null];
      const filhos = {};
      for (const [chave, filho] of valor(no.c) ?? []) filhos[chave] = converter(filho);
      const r = [segmento, filhos];
      if (no.h) r.push(null, null, no.h);
      return r;
    };
    return encodeURIComponent(JSON.stringify(converter(raiz)));
  }
  // Formato anterior (Next 15/16.0): `f[0][0]` já é o FlightRouterState.
  const f = zero?.f;
  if (!Array.isArray(f) || !Array.isArray(f[0]) || !Array.isArray(f[0][0])) return null;
  const limpar = (no) => {
    const [segmento, filhos, , marcador, dicas] = no.map((v) => (v === "$undefined" ? undefined : v));
    const r = [typeof segmento === "string" ? segmento : [segmento[0], segmento[1], segmento[2], null], {}];
    for (const [k, v] of Object.entries(filhos ?? {})) r[1][k] = limpar(v);
    if (marcador) {
      r[2] = null;
      r[3] = marcador;
    }
    if (dicas !== undefined) r[4] = dicas;
    return r;
  };
  return encodeURIComponent(JSON.stringify(limpar(f[0][0])));
}

// id do módulo cliente → arquivo, pelos client-reference-manifest do build.
// Sem o build na pasta, os componentes saem só com o id.
const arquivoDoModulo = new Map();
function lerManifestos(dir = resolve(".next/server/app")) {
  let nomes;
  try {
    nomes = readdirSync(dir);
  } catch {
    return;
  }
  for (const nome of nomes) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) lerManifestos(caminho);
    else if (nome.endsWith("client-reference-manifest.js")) {
      try {
        const t = readFileSync(caminho, "utf8");
        const json = JSON.parse(t.slice(t.indexOf("] = ") + 4).trim().replace(/;$/, ""));
        for (const [arquivo, m] of Object.entries(json.clientModules ?? {})) {
          if (!arquivoDoModulo.has(String(m.id))) arquivoDoModulo.set(String(m.id), arquivo.replace(/^\[project\]\//, "").replace(/ <module evaluation>$/, ""));
        }
      } catch {
        /* manifesto em formato inesperado: segue sem nomes */
      }
    }
  }
}

// Componentes cliente e o tamanho das props que cada um recebe no payload.
function propsPorComponente(buf) {
  const linhas = linhasDoFlight(buf);
  const porId = new Map(linhas.map((l) => [l.id, l]));
  // Linha I: [idDoModulo, [chunks], nomeExportado]; o nome pode vir numa linha
  // à parte ("$5" → 5:"LoadingBoundaryProvider").
  const deref = (v) => {
    const m = typeof v === "string" && /^\$([0-9a-f]+)$/.exec(v);
    return m && porId.has(m[1]) ? jsonDaLinha(porId.get(m[1])) : v;
  };
  const nomes = new Map();
  for (const l of linhas) {
    if (l.tipo !== "I") continue;
    const ref = jsonDaLinha(l);
    if (!Array.isArray(ref)) continue;
    const modulo = String(deref(ref[0]) ?? "");
    const exportado = deref(ref[2]);
    const arquivo = arquivoDoModulo.get(modulo) ?? `módulo ${modulo}`;
    nomes.set(l.id, exportado && exportado !== "default" && exportado !== "*" ? `${exportado} (${arquivo})` : arquivo);
  }
  const resultado = new Map(); // nome → { maior, soma, vezes, prop, propBytes }
  const composicao = { elementos: 0, elementosHtml: 0, classes: 0, propsCliente: 0, registros: 0, bytesDeRegistros: 0 };
  // Elemento cuja chave é o id de um registro (uuid/cuid): uma linha de tabela,
  // um cartão. É a parte do payload que cresce com a quantidade de registros.
  const chaveDeRegistro = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,})$/i;
  const registros = new Set();
  const contados = new Set();
  const tamanho = (v) => {
    // Referências a linhas de fora ("$1f", "$@1f") entram com o tamanho da linha.
    let extra = 0;
    const s = JSON.stringify(v, (_k, x) => {
      if (typeof x === "string") {
        const m = /^\$[@QW]?([0-9a-f]+)$/.exec(x);
        if (m && porId.has(m[1]) && !contados.has(m[1])) {
          contados.add(m[1]);
          extra += porId.get(m[1]).bytes;
        }
      }
      return x;
    });
    return Buffer.byteLength(s ?? "") + extra;
  };
  const andar = (x, prof = 0, dentroDeRegistro = false) => {
    if (prof > 400 || x === null || typeof x !== "object") return;
    if (Array.isArray(x)) {
      if (x[0] === "$" && typeof x[1] === "string" && x.length >= 4 && x[3] && typeof x[3] === "object") {
        const props = x[3];
        composicao.elementos++;
        if (!dentroDeRegistro && typeof x[2] === "string" && chaveDeRegistro.test(x[2])) {
          registros.add(x[2]);
          composicao.bytesDeRegistros += Buffer.byteLength(JSON.stringify(x));
          dentroDeRegistro = true;
        }
        if (!x[1].startsWith("$")) {
          // Elemento HTML renderizado no servidor (div, tr, td…): o className
          // de Tailwind repete em cada linha de tabela e cartão.
          composicao.elementosHtml++;
          if (typeof props.className === "string") composicao.classes += Buffer.byteLength(props.className) + 14;
        }
        if (x[1].startsWith("$L")) {
          const nome = nomes.get(x[1].slice(2)) ?? x[1];
          const semFilhos = { ...props };
          delete semFilhos.children;
          contados.clear();
          const total = tamanho(semFilhos);
          let prop = null;
          let propBytes = 0;
          for (const [k, v] of Object.entries(semFilhos)) {
            contados.clear();
            const t = tamanho(v);
            if (t > propBytes) {
              prop = k;
              propBytes = t;
            }
          }
          const atual = resultado.get(nome) ?? { maior: 0, soma: 0, vezes: 0, prop: null, propBytes: 0 };
          atual.vezes++;
          atual.soma += total;
          composicao.propsCliente += total;
          if (total > atual.maior) Object.assign(atual, { maior: total, prop, propBytes });
          resultado.set(nome, atual);
        }
        andar(props.children, prof + 1, dentroDeRegistro);
        for (const [k, v] of Object.entries(props)) if (k !== "children") andar(v, prof + 1, dentroDeRegistro);
        return;
      }
      for (const y of x) andar(y, prof + 1, dentroDeRegistro);
      return;
    }
    for (const v of Object.values(x)) andar(v, prof + 1, dentroDeRegistro);
  };
  for (const l of linhas) if (l.tipo === "") andar(jsonDaLinha(l));
  composicao.registros = registros.size;
  const maioresLinhas = linhas
    .filter((l) => l.tipo === "" || l.tipo === "T")
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((l) => ({ id: l.id, tipo: l.tipo || "json", bytes: l.bytes, inicio: l.conteudo.toString("utf8", 0, 160).replace(/\s+/g, " ") }));
  return {
    componentes: [...resultado.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.soma - a.soma)
      .slice(0, 12),
    maioresLinhas,
    linhas: linhas.length,
    composicao,
  };
}

// ── Diagnóstico do corpo ─────────────────────────────────────────────────────

function textoCurto(html) {
  const pegar = (re) => (re.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
  return pegar(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || pegar(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || pegar(/<title>([\s\S]*?)<\/title>/i);
}

function classificar(r) {
  if (r.status === 0) return { situacao: "falhou", motivo: r.erro };
  if (r.status >= 300 && r.status < 400) return { situacao: "redireciona", motivo: r.location };
  const html = r.corpo.toString("utf8");
  if (r.status === 404) return { situacao: "404", motivo: textoCurto(html) || "notFound()" };
  if (r.status >= 500) {
    const digest = /"digest":"([^"\\]+)/.exec(html.replace(/\\"/g, '"'))?.[1];
    return { situacao: String(r.status), motivo: `erro do servidor${digest ? ` (digest ${digest})` : ""}: ${textoCurto(html)}` };
  }
  // 200 com redirect/notFound/erro dentro de um Suspense (o status já tinha saído).
  const meta = /<meta id="__next-page-redirect"[^>]*content="[^;]*;url=([^"]+)"/.exec(html);
  if (meta) return { situacao: "redireciona (stream)", motivo: meta[1].replace(/&amp;/g, "&") };
  if (html.includes("NEXT_HTTP_ERROR_FALLBACK;404")) return { situacao: "404 (stream)", motivo: textoCurto(html) || "notFound() dentro do Suspense" };
  const flight = flightDoHtml(html);
  const erros = linhasDoFlight(flight).filter((l) => l.tipo === "E");
  if (erros.length) {
    const d = jsonDaLinha(erros[0]);
    return { situacao: "erro (stream)", motivo: `erro num Suspense${d?.digest ? ` (digest ${d.digest})` : ""}` };
  }
  return { situacao: "ok", motivo: null };
}

const RE_ASSET = /\/_next\/static\/[A-Za-z0-9\-._~%/]+\.(?:js|css)(?:\?[A-Za-z0-9=&_.-]+)?/g;
function assetsDe(texto) {
  const m = texto.match(RE_ASSET) ?? [];
  return [...new Set(m.map((a) => a.replace(/\\+$/, "")))];
}

const tamanhoDoAsset = new Map();
async function medirAsset(a) {
  const chave = a.split("?")[0];
  if (tamanhoDoAsset.has(chave)) return tamanhoDoAsset.get(chave);
  let v = { bytes: 0, gzip: 0, status: 0 };
  try {
    const res = await fetch(new URL(a, ORIGEM), { headers: { "accept-encoding": "identity" }, signal: AbortSignal.timeout(op.timeout) });
    const corpo = Buffer.from(await res.arrayBuffer());
    v = { bytes: corpo.length, gzip: gzipSync(corpo).length, status: res.status };
  } catch {
    /* fica zerado */
  }
  tamanhoDoAsset.set(chave, v);
  return v;
}
const chaveAsset = (a) => a.split("?")[0];

// ── 1. Descoberta (também é o aquecimento do HTML) ───────────────────────────

const inicio = Date.now();
console.log(`Servidor: ${ORIGEM}   conta: ${conta.name} (${conta.role}, ${setores.length} setores)`);

const rotas = todasAsRotas.filter((r) => casaFiltro(r.padrao));
const caminhosVistos = new Map();
const resolvidas = new Map(); // padrão → { url, origem }
const descoberta = new Map(); // url → resposta da descoberta

async function visitar(url) {
  if (descoberta.has(url)) return descoberta.get(url);
  const r = await pedir(url);
  colherCaminhos(r.corpo.toString("utf8"), caminhosVistos);
  descoberta.set(url, r);
  return r;
}

// A tela de origem da navegação, e a árvore do roteador que ela deixa no cliente.
const origemHtml = await visitar(op.de);
const ARVORE = origemHtml.status === 200 ? arvoreDaTela(origemHtml.corpo.toString("utf8")) : null;
if (!ARVORE) console.warn(`Aviso: não consegui ler a árvore do roteador de ${op.de}; o RSC sai completo (sem navegação parcial).`);
const RSC = { arvore: ARVORE, nextUrl: op.de };

// Para a descoberta, todas as rotas estáticas (mesmo fora do filtro) ajudam a
// achar links; com filtro, só as rotas filtradas são visitadas.
for (const r of rotas) {
  if (r.segmentos.some((s) => ehDinamico(s) && !ehOpcional(s))) continue;
  const url = urlSemOpcional(r);
  resolvidas.set(r.padrao, { url, origem: "estática" });
  process.stdout.write(`descoberta ${url}\r`);
  await visitar(url);
}

for (const [padrao, url] of Object.entries(op.params)) resolvidas.set(padrao, { url, origem: "--param" });

// A própria tela de origem é medida chegando de outra (de si para si o
// roteador não pede nada): a primeira tela estática que abriu.
let RSC_DA_ORIGEM = RSC;
for (const [url, resp] of descoberta) {
  if (url === op.de || classificar(resp).situacao !== "ok") continue;
  const arvore = arvoreDaTela(resp.corpo.toString("utf8"));
  if (arvore) {
    RSC_DA_ORIGEM = { arvore, nextUrl: url };
    break;
  }
}

// Valor com cara de id (uuid, cuid, número) vem antes de texto solto que só
// casou com o padrão por acaso (ex.: "empresa-0", um id de elemento da tela).
const pareceId = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) || /^c[a-z0-9]{20,}$/.test(v) || /^\d+$/.test(v);

function valoresDinamicos(r, caminho) {
  const partes = caminho.split("/").filter(Boolean);
  return r.segmentos.flatMap((s, i) => (ehDinamico(s) && !ehOpcional(s) && partes[i] !== undefined ? [decodeURIComponent(partes[i])] : []));
}

// Visita a URL candidata. Endereço curto (src/lib/enderecoCurto.ts): o link
// com o id leva a /empresas/empresa-7 — se o destino é a mesma tela, vale ele.
async function experimentar(r, url) {
  let situacao = classificar(await visitar(url));
  if (situacao.situacao.startsWith("redireciona") && situacao.motivo) {
    const destino = new URL(situacao.motivo, ORIGEM).pathname;
    if (destino !== url && casarComPadrao(r, destino)) {
      url = destino;
      situacao = classificar(await visitar(url));
    }
  }
  return { url, ok: situacao.situacao === "ok" };
}

async function rodadaDeLinks() {
  let novas = 0;
  for (const r of rotas) {
    if (resolvidas.has(r.padrao)) continue;
    const candidatos = [...caminhosVistos.keys()]
      .filter((c) => casarComPadrao(r, c))
      .map((c) => ({ c, nota: valoresDinamicos(r, c).filter(pareceId).length }))
      .sort((a, b) => b.nota - a.nota)
      .slice(0, 4)
      .map((x) => x.c);
    for (const c of candidatos) {
      const { url, ok } = await experimentar(r, c);
      if (ok || c === candidatos.at(-1)) {
        resolvidas.set(r.padrao, { url, origem: "link", ok });
        novas++;
        break;
      }
    }
  }
  return novas;
}

// /empresas/[id]/turnos/novo herda o [id] de qualquer rota já resolvida que
// comece por /empresas/[id] (e que tenha aberto).
function porHeranca(r) {
  const partes = [];
  for (let i = 0; i < r.segmentos.length; i++) {
    const s = r.segmentos[i];
    if (ehOpcional(s)) break;
    if (!ehDinamico(s)) {
      partes.push(s);
      continue;
    }
    const prefixo = "/" + r.segmentos.slice(0, i + 1).join("/");
    let valor = null;
    for (const [padrao, alvo] of resolvidas) {
      if (alvo.ok === false || (padrao !== prefixo && !padrao.startsWith(prefixo + "/"))) continue;
      valor = alvo.url.split("/").filter(Boolean)[i] ?? null;
      if (valor) break;
    }
    if (!valor) return null;
    partes.push(valor);
  }
  return "/" + partes.join("/");
}

async function rodadaDeHeranca() {
  let novas = 0;
  for (const r of rotas) {
    if (resolvidas.has(r.padrao)) continue;
    const candidato = porHeranca(r);
    if (!candidato) continue;
    const { url, ok } = await experimentar(r, candidato);
    resolvidas.set(r.padrao, { url, origem: "herdado", ok });
    novas++;
  }
  return novas;
}

async function resolverTudo(passos) {
  for (let passo = 0; passo < passos; passo++) if (!((await rodadaDeLinks()) + (await rodadaDeHeranca()))) break;
}

await resolverTudo(8);
for (const r of rotas) {
  if (resolvidas.has(r.padrao) || !r.segmentos.some(ehDinamico)) continue;
  const candidato = await resolverPelaReserva(r);
  if (candidato) {
    const { url, ok } = await experimentar(r, candidato);
    resolvidas.set(r.padrao, { url, origem: "banco", ok });
  }
}
await resolverTudo(4);
process.stdout.write(" ".repeat(80) + "\r");

const naoResolvidas = rotas.filter((r) => !resolvidas.has(r.padrao)).map((r) => r.padrao);
console.log(`Rotas: ${rotas.length} (resolvidas ${resolvidas.size}, sem valor para o parâmetro ${naoResolvidas.length})`);

// ── 2. Medição ───────────────────────────────────────────────────────────────

const resultados = [];
const corposRsc = new Map();
let n = 0;
for (const r of rotas) {
  const alvo = resolvidas.get(r.padrao);
  if (!alvo) continue;
  n++;
  const html = [];
  const rsc = [];
  const navegacao = alvo.url === op.de ? RSC_DA_ORIGEM : RSC;
  await pedir(alvo.url, { rsc: navegacao }); // aquecimento do RSC (o do HTML foi a descoberta)
  for (let k = 0; k < op.rodadas; k++) {
    html.push(await pedir(alvo.url));
    rsc.push(await pedir(alvo.url, { rsc: navegacao }));
  }
  // Uma vez sem a árvore: o RSC completo (layouts + tela), o de um F5 sem HTML.
  const rscCompleto = ARVORE ? await pedir(alvo.url, { rsc: { arvore: null, nextUrl: null } }) : null;
  const ultimoHtml = html.at(-1);
  const ultimoRsc = rsc.at(-1);
  const { situacao, motivo } = classificar(ultimoHtml);
  const textoHtml = ultimoHtml.corpo.toString("utf8");
  const assets = ultimoHtml.status === 200 ? assetsDe(textoHtml) : [];
  const assetsNaNavegacao = ultimoRsc.status === 200 ? assetsDe(ultimoRsc.corpo.toString("utf8")) : [];
  for (const a of new Set([...assets, ...assetsNaNavegacao])) await medirAsset(a);
  corposRsc.set(r.padrao, ultimoRsc.corpo);
  if (op.guardarCorpos) {
    const pasta = join(resolve(op.saida), "corpos");
    mkdirSync(pasta, { recursive: true });
    const nome = r.padrao.replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_|_$/g, "") || "raiz";
    writeFileSync(join(pasta, `${nome}.html`), ultimoHtml.corpo);
    writeFileSync(join(pasta, `${nome}.rsc`), ultimoRsc.corpo);
  }
  const linha = {
    padrao: r.padrao,
    url: alvo.url,
    origemDoParametro: alvo.origem,
    arquivo: r.arquivo,
    status: ultimoHtml.status,
    situacao,
    motivo,
    html: {
      ttfb: mediana(html.map((x) => x.ttfb)),
      total: mediana(html.map((x) => x.total)),
      bytes: ultimoHtml.bytes,
      gzip: ultimoHtml.gzip,
    },
    rsc: {
      status: ultimoRsc.status,
      location: ultimoRsc.location ?? null,
      ttfb: mediana(rsc.map((x) => x.ttfb)),
      total: mediana(rsc.map((x) => x.total)),
      bytes: ultimoRsc.bytes,
      gzip: ultimoRsc.gzip,
      completoBytes: rscCompleto?.bytes ?? null,
      completoGzip: rscCompleto?.gzip ?? null,
    },
    assets: assets.map(chaveAsset),
    assetsNaNavegacao: assetsNaNavegacao.map(chaveAsset),
  };
  resultados.push(linha);
  console.log(
    `${String(n).padStart(3)} ${String(linha.status).padStart(3)} ${linha.padrao.padEnd(58)} ` +
      `ttfb ${ms(linha.html.ttfb).padStart(5)} ms  html ${kb(linha.html.bytes).padStart(7)} KB  rsc ${kb(linha.rsc.bytes).padStart(7)} KB (${kb(linha.rsc.gzip)} gz) ${linha.rsc.status !== 200 ? `[rsc ${linha.rsc.status}]` : ""}`,
  );
}

// ── 3. JavaScript: base comum e o que é de cada tela ─────────────────────────

const ehJs = (a) => a.endsWith(".js");
const ehCss = (a) => a.endsWith(".css");
const comHtml = resultados.filter((x) => x.situacao === "ok" && x.assets.length);
let base_ = null;
for (const x of comHtml) {
  const s = new Set(x.assets);
  base_ = base_ ? new Set([...base_].filter((a) => s.has(a))) : s;
}
base_ ??= new Set();
const soma = (lista, campo) => lista.reduce((t, a) => t + (tamanhoDoAsset.get(a)?.[campo] ?? 0), 0);
const baseJs = [...base_].filter(ehJs);
const baseCss = [...base_].filter(ehCss);
const assetsDaOrigem = new Set(assetsDe(origemHtml.corpo.toString("utf8")).map(chaveAsset));
for (const x of resultados) {
  const proprios = x.assets.filter((a) => !base_.has(a));
  x.js = {
    proprios: proprios.filter(ehJs).length,
    propriosBytes: soma(proprios.filter(ehJs), "bytes"),
    propriosGzip: soma(proprios.filter(ehJs), "gzip"),
    totalBytes: soma(x.assets.filter(ehJs), "bytes"),
    totalGzip: soma(x.assets.filter(ehJs), "gzip"),
    css: soma(x.assets.filter(ehCss), "bytes"),
  };
  // O que o clique no menu (vindo da tela de origem) faz baixar de JS novo.
  const novos = x.assetsNaNavegacao.filter((a) => ehJs(a) && !assetsDaOrigem.has(a));
  x.js.naNavegacaoBytes = soma(novos, "bytes");
  x.js.naNavegacaoGzip = soma(novos, "gzip");
}

// ── 4. Props: o que pesa no RSC das telas mais pesadas ───────────────────────

const pesadas = [...resultados]
  .filter((x) => x.rsc.status === 200)
  .sort((a, b) => b.rsc.bytes - a.rsc.bytes)
  .slice(0, op.detalhes);
lerManifestos();
for (const x of pesadas) x.detalheRsc = propsPorComponente(corposRsc.get(x.padrao));
// A parte que cresce com os registros, em toda tela que abriu (é barato).
for (const x of resultados) {
  if (x.rsc.status !== 200) continue;
  const { registros, bytesDeRegistros } = (x.detalheRsc ?? propsPorComponente(corposRsc.get(x.padrao))).composicao;
  x.rsc.registros = registros;
  x.rsc.bytesDeRegistros = bytesDeRegistros;
}
// O que o layout (app) manda em toda primeira carga, visto no HTML da tela de origem.
const detalheDoLayout = origemHtml.status === 200 ? propsPorComponente(flightDoHtml(origemHtml.corpo.toString("utf8"))) : null;

// ── 5. Relatórios ────────────────────────────────────────────────────────────

const saida = resolve(op.saida);
mkdirSync(saida, { recursive: true });
const resumo = {
  geradoEm: new Date().toISOString(),
  servidor: ORIGEM,
  conta: { papel: conta.role, setores },
  navegacaoAPartirDe: op.de,
  rscParcial: Boolean(ARVORE),
  rodadas: op.rodadas,
  filtro: op.filtro,
  duracaoSegundos: Math.round((Date.now() - inicio) / 1000),
  rotas: rotas.length,
  medidas: resultados.length,
  naoResolvidas,
  base: {
    js: baseJs.length,
    jsBytes: soma(baseJs, "bytes"),
    jsGzip: soma(baseJs, "gzip"),
    css: baseCss.length,
    cssBytes: soma(baseCss, "bytes"),
    cssGzip: soma(baseCss, "gzip"),
  },
};
writeFileSync(join(saida, "relatorio-payload.json"), JSON.stringify({ resumo, layout: detalheDoLayout, assets: Object.fromEntries(tamanhoDoAsset), rotas: resultados }, null, 2));

const md = [];
const tabela = (titulo, cabecalho, linhas) => {
  md.push(`## ${titulo}`, "", `| ${cabecalho.join(" | ")} |`, `|${cabecalho.map(() => "---").join("|")}|`);
  for (const l of linhas) md.push(`| ${l.join(" | ")} |`);
  md.push("");
};
const rotulo = (x) => `\`${x.padrao}\``;
const ok = resultados.filter((x) => x.situacao === "ok");
const falhas = resultados.filter((x) => x.situacao !== "ok");
const TOP = 25;

md.push(
  "# Payload das telas internas do Connect",
  "",
  `Gerado em ${resumo.geradoEm} por \`scripts/medir-payload-das-telas.mjs\`, contra ${ORIGEM} (build de produção, banco local).`,
  `Conta ${conta.role} com ${setores.length} setores; mediana de ${op.rodadas} rodadas depois de um aquecimento.`,
  `RSC = navegação pelo menu a partir de \`${op.de}\` (${ARVORE ? "árvore do roteador enviada: só o que muda vem" : "sem árvore: payload completo"}).`,
  "Tamanhos em KB (1 KB = 1024 bytes); gzip calculado aqui, nível padrão.",
  "",
  `- Rotas encontradas: **${rotas.length}**; medidas: **${resultados.length}**; 200 sem erro: **${ok.length}**; com falha/redirect: **${falhas.length}**; dinâmicas sem valor: **${naoResolvidas.length}**.`,
  `- JS base (presente em toda tela que abriu): **${baseJs.length} arquivos, ${kb(resumo.base.jsBytes)} KB cru / ${kb(resumo.base.jsGzip)} KB gzip**; CSS base: ${baseCss.length} arquivos, ${kb(resumo.base.cssBytes)} KB / ${kb(resumo.base.cssGzip)} KB gzip.`,
  `- Duração da medição: ${resumo.duracaoSegundos} s.`,
  "",
);

tabela(
  `Maior payload RSC (navegação pelo menu) — top ${TOP}`,
  ["#", "rota", "RSC KB", "RSC gzip KB", "RSC total ms", "RSC completo KB", "HTML KB"],
  [...ok].sort((a, b) => b.rsc.bytes - a.rsc.bytes).slice(0, TOP).map((x, i) => [i + 1, rotulo(x), kb(x.rsc.bytes), kb(x.rsc.gzip), ms(x.rsc.total), kb(x.rsc.completoBytes), kb(x.html.bytes)]),
);
tabela(
  `Maior HTML (primeira carga) — top ${TOP}`,
  ["#", "rota", "HTML KB", "HTML gzip KB", "TTFB ms", "total ms"],
  [...ok].sort((a, b) => b.html.bytes - a.html.bytes).slice(0, TOP).map((x, i) => [i + 1, rotulo(x), kb(x.html.bytes), kb(x.html.gzip), ms(x.html.ttfb), ms(x.html.total)]),
);
tabela(
  `TTFB mais lento (HTML) — top ${TOP}`,
  ["#", "rota", "TTFB ms", "HTML total ms", "RSC total ms", "HTML KB"],
  [...ok].sort((a, b) => b.html.ttfb - a.html.ttfb).slice(0, TOP).map((x, i) => [i + 1, rotulo(x), ms(x.html.ttfb), ms(x.html.total), ms(x.rsc.total), kb(x.html.bytes)]),
);
tabela(
  `Mais JS próprio da tela (além da base) — top ${TOP}`,
  ["#", "rota", "arquivos", "JS próprio KB", "JS próprio gzip KB", "JS total gzip KB", "JS novo no clique gzip KB"],
  [...ok].sort((a, b) => b.js.propriosBytes - a.js.propriosBytes).slice(0, TOP).map((x, i) => [i + 1, rotulo(x), x.js.proprios, kb(x.js.propriosBytes), kb(x.js.propriosGzip), kb(x.js.totalGzip), kb(x.js.naNavegacaoGzip)]),
);

tabela(
  `RSC que cresce com a quantidade de registros — top ${TOP} por KB por registro`,
  ["#", "rota", "registros na tela", "KB por registro", "KB em registros", "% do RSC", "RSC KB"],
  [...ok]
    .filter((x) => x.rsc.registros >= 2)
    .sort((a, b) => b.rsc.bytesDeRegistros / b.rsc.registros - a.rsc.bytesDeRegistros / a.rsc.registros)
    .slice(0, TOP)
    .map((x, i) => [
      i + 1,
      rotulo(x),
      x.rsc.registros,
      kb(x.rsc.bytesDeRegistros / x.rsc.registros),
      kb(x.rsc.bytesDeRegistros),
      `${Math.round((100 * x.rsc.bytesDeRegistros) / Math.max(1, x.rsc.bytes))}%`,
      kb(x.rsc.bytes),
    ]),
);
md.push(
  "Registro = elemento cuja chave é um id (uuid/cuid), como a linha de uma tabela ou um cartão. Com o banco local pequeno",
  "estes números são o custo unitário: multiplicar pela quantidade da produção dá a ordem de grandeza da tela lá.",
  "",
);

if (detalheDoLayout) {
  md.push(
    `## O que vai em toda primeira carga (HTML de \`${op.de}\`)`,
    "",
    "Componentes cliente com mais props no RSC embutido no HTML — o layout `(app)` entra aqui; na navegação pelo menu ele não vem de novo.",
    "",
    "| componente cliente | props KB (soma) | vezes | maior prop |",
    "|---|---|---|---|",
  );
  for (const c of detalheDoLayout.componentes.filter((c) => c.soma > 1024 && !c.nome.includes("node_modules/next/")).slice(0, 8))
    md.push(`| ${c.nome} | ${kb(c.soma)} | ${c.vezes} | \`${c.prop}\` (${kb(c.propBytes)} KB) |`);
  md.push("");
}

md.push("## O que pesa no RSC das telas mais pesadas", "");
for (const x of pesadas) {
  if (!x.detalheRsc) continue;
  const cp = x.detalheRsc.composicao;
  md.push(
    `### ${rotulo(x)} — RSC ${kb(x.rsc.bytes)} KB`,
    "",
    `${cp.elementosHtml} elementos HTML renderizados no servidor; só o \`className\` deles soma ${kb(cp.classes)} KB ` +
      `(${Math.round((100 * cp.classes) / Math.max(1, x.rsc.bytes))}% do RSC). Props de componentes cliente: ${kb(cp.propsCliente)} KB.` +
      (cp.registros
        ? ` **${cp.registros} registros** (elementos com o id como chave) somam ${kb(cp.bytesDeRegistros)} KB, ` +
          `~${kb(cp.bytesDeRegistros / cp.registros)} KB cada: essa parte cresce com a quantidade de registros.`
        : ""),
    "",
  );
  // Os do próprio Next (layout-router, o `loading` de cada segmento) repetem em toda tela.
  const comps = x.detalheRsc.componentes.filter((c) => c.soma > 1024 && !c.nome.includes("node_modules/next/")).slice(0, 5);
  if (comps.length) {
    md.push("| componente cliente | props KB (soma) | vezes | maior instância KB | maior prop |", "|---|---|---|---|---|");
    for (const c of comps) md.push(`| ${c.nome} | ${kb(c.soma)} | ${c.vezes} | ${kb(c.maior)} | \`${c.prop}\` (${kb(c.propBytes)} KB) |`);
  } else md.push("Nenhum componente cliente com mais de 1 KB de props somadas.");
  md.push("");
}

tabela(
  "Rotas com falha, redirect ou erro",
  ["rota", "url medida", "situação", "motivo / destino"],
  falhas.map((x) => [rotulo(x), `\`${x.url}\``, x.situacao, (x.motivo ?? "").replace(/\|/g, "\\|")]),
);

md.push("## Rotas dinâmicas sem valor para o parâmetro", "");
md.push(naoResolvidas.length ? naoResolvidas.map((p) => `- \`${p}\``).join("\n") : "Nenhuma.", "");

tabela(
  "Todas as rotas medidas",
  ["rota", "status", "TTFB ms", "HTML KB", "HTML gz", "RSC KB", "RSC gz", "registros", "JS próprio gz", "parâmetro de"],
  resultados.map((x) => [rotulo(x), x.situacao === "ok" ? x.status : `${x.status} ${x.situacao}`, ms(x.html.ttfb), kb(x.html.bytes), kb(x.html.gzip), kb(x.rsc.bytes), kb(x.rsc.gzip), x.rsc.registros ?? "—", kb(x.js?.propriosGzip), x.origemDoParametro]),
);

writeFileSync(join(saida, "relatorio-payload.md"), md.join("\n"));
await db.end();
console.log(`\nRelatórios: ${join(saida, "relatorio-payload.md")} e relatorio-payload.json`);
