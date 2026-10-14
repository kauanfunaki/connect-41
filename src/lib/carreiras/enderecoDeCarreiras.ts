// 41 Carreiras — o portal de vagas da 41 num endereço próprio (decisões do
// Kauan, 13/10/2026).
//
// O portal é EXCLUSIVO da 41 (um escritório só, o tenant da 41): sem integração
// com o LinkedIn, as vagas que o Recrutamento da 41 recebe das empresas
// clientes são publicadas lá. Não é recurso para os outros escritórios do
// Connect — para eles, `/carreiras/<escritorio>` segue igual.
//
// Endereço principal: `carreiras.41contabil.com.br` (o DNS é de terceiro e o
// registro ainda não existe). Enquanto isso vale `carreiras.useconnect.com.br`
// (DNS curinga do Connect). Trocar de um para o outro é CONFIGURAÇÃO:
//
//   CARREIRAS_HOSTS            os endereços do portal, separados por vírgula
//   CARREIRAS_HOST_PRINCIPAL   o canônico; os outros redirecionam (308) para ele
//   CARREIRAS_TENANT_SLUG      o escritório da 41 no Connect (padrão: 41tech)
//
// Sem nenhum endereço configurado, nada aqui liga: o proxy, as páginas e os
// links fazem exatamente o que faziam antes.
//
// Lido em RUNTIME, no servidor — nunca `NEXT_PUBLIC_*`, que é gravada no build,
// e o Dockerfile builda sem receber as variáveis do EasyPanel.
//
// Funções puras (o ambiente entra por parâmetro): rodam no proxy, nas páginas e
// nos testes, e precisam concordar entre si.

export const MARCA_41_CARREIRAS = {
  /** O nome do portal. */
  nome: "41 Carreiras",
  /** Quem conduz os processos seletivos (o escritório, não o tenant "41 Tech"). */
  escritorio: "41 Contábil",
} as const;

/**
 * O slug do escritório da 41 no Connect: é o do seed (`prisma/seed.ts`), o dos
 * scripts de dados (`scripts/dados-de-demonstracao.ts`, `scripts/local/*`) e o
 * dos testes do assistente do WhatsApp. `CARREIRAS_TENANT_SLUG` troca.
 */
export const SLUG_PADRAO_DA_41 = "41tech";

export type ConfigDeCarreiras = {
  /** Todos os endereços do portal, sem porta e em minúsculas. O principal está entre eles. */
  hosts: string[];
  /** O endereço canônico — os outros redirecionam para ele. */
  principal: string;
  /**
   * O escritório cujas vagas o portal mostra. Null quando CARREIRAS_TENANT_SLUG
   * está fora do formato: os endereços continuam isolados (só "não
   * encontrada"), em vez de caírem no Connect.
   */
  tenantSlug: string | null;
};

type Ambiente = Record<string, string | undefined>;

// Nome de host com pelo menos um ponto: `localhost` e IP não são endereço de
// portal público.
const FORMATO_HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Slug de escritório, como `slugify` em admin/workspaces gera.
const FORMATO_SLUG = /^[a-z0-9-]{1,60}$/;

/**
 * O host sem porta, sem ponto final e em minúsculas — ou null se não for um
 * nome de host. Aceita o valor colado com protocolo ou caminho
 * (`https://carreiras.41contabil.com.br/`), que é o erro mais comum ao
 * configurar.
 */
export function normalizarHost(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const host = valor
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]!
    .replace(/:\d*$/, "")
    .replace(/\.$/, "");
  return FORMATO_HOST.test(host) ? host : null;
}

/**
 * Os endereços do próprio Connect, que NUNCA viram portal de vagas, mesmo que
 * apareçam em CARREIRAS_HOSTS por engano: o domínio principal (o site), o
 * `www.`, o `app.` e o host de APP_PUBLIC_URL. Um erro de digitação ali
 * transformaria o Connect inteiro no portal — e a equipe perderia o acesso.
 */
function enderecosDoConnect(env: Ambiente): Set<string> {
  const proibidos = new Set<string>();
  const dominio = normalizarHost(env.APP_DOMAIN?.trim().replace(/^\.+/, ""));
  if (dominio) {
    const sufixo = env.SECTOR_HOST_SUFFIX?.trim().toLowerCase() ?? "";
    for (const h of [dominio, `www.${dominio}`, `app.${dominio}`, `app${sufixo}.${dominio}`]) proibidos.add(h);
  }
  const publica = normalizarHost(env.APP_PUBLIC_URL);
  if (publica) proibidos.add(publica);
  return proibidos;
}

/**
 * A configuração do 41 Carreiras, ou null quando ele está desligado (nenhum
 * endereço válido). Desligado é o comportamento de antes, em todo lugar.
 */
export function configDeCarreiras(env: Ambiente = process.env): ConfigDeCarreiras | null {
  const proibidos = enderecosDoConnect(env);
  const valido = (h: string | null): h is string => h !== null && !proibidos.has(h);

  const lista = [...new Set((env.CARREIRAS_HOSTS ?? "").split(",").map(normalizarHost).filter(valido))];
  const pedido = normalizarHost(env.CARREIRAS_HOST_PRINCIPAL);
  const principal = valido(pedido) ? pedido : lista[0];
  if (!principal) return null;

  // Slug fora do formato não casa com escritório nenhum e não entra em
  // caminho: o portal fica fechado (tudo "não encontrada"), mas os endereços
  // dele seguem fora do Connect — fechar é o lado seguro.
  const pedidoSlug = env.CARREIRAS_TENANT_SLUG?.trim().toLowerCase() || SLUG_PADRAO_DA_41;
  const tenantSlug = FORMATO_SLUG.test(pedidoSlug) ? pedidoSlug : null;

  return { hosts: lista.includes(principal) ? lista : [principal, ...lista], principal, tenantSlug };
}

/** O host da requisição é um endereço do 41 Carreiras? */
export function ehHostDeCarreiras(host: string | null | undefined, config: ConfigDeCarreiras | null): boolean {
  if (!config) return false;
  const h = normalizarHost(host);
  return h !== null && config.hosts.includes(h);
}

/** O escritório do slug é o da 41 (com o portal configurado)? */
export function ehDa41(slug: string, config: ConfigDeCarreiras | null): config is ConfigDeCarreiras & { tenantSlug: string } {
  return !!config?.tenantSlug && slug.trim().toLowerCase() === config.tenantSlug;
}

// ─── Os caminhos do portal ──────────────────────────────────────────────────

/** Uma página do portal de vagas de um escritório. */
export type PaginaDoPortal =
  | { tipo: "lista" }
  | { tipo: "vaga"; id: string }
  | { tipo: "conta" }
  | { tipo: "entrar"; token?: string };

/**
 * O caminho de uma página do portal. `curto` é o formato do 41 Carreiras
 * (`/`, `/vagas/<id>`, `/minha-conta`), servido no endereço próprio; o longo é
 * o de sempre (`/carreiras/<escritorio>/…`), que vale no endereço do Connect.
 */
export function caminhoNoPortal(slug: string, pagina: PaginaDoPortal, curto: boolean): string {
  const base = curto ? "" : `/carreiras/${encodeURIComponent(slug)}`;
  switch (pagina.tipo) {
    case "lista":
      return curto ? "/" : base;
    case "vaga":
      return curto ? `/vagas/${encodeURIComponent(pagina.id)}` : `${base}/${encodeURIComponent(pagina.id)}`;
    case "conta":
      return `${base}/minha-conta`;
    case "entrar":
      return `${base}/minha-conta/entrar${pagina.token ? `?t=${encodeURIComponent(pagina.token)}` : ""}`;
  }
}

/** A origem de APP_PUBLIC_URL, ou null quando ela falta ou não é http(s). */
function origemDoApp(appPublicUrl: string | null | undefined): string | null {
  const bruto = appPublicUrl?.trim();
  if (!bruto || !/^https?:\/\//i.test(bruto)) return null;
  try {
    return new URL(bruto).origin;
  } catch {
    return null;
  }
}

/**
 * O endereço público (absoluto) de uma página do portal — o canônico, o do
 * JSON-LD, o do e-mail ao candidato e o que o Connect mostra e manda pelo
 * WhatsApp. Da 41, com o portal configurado: no endereço principal do 41
 * Carreiras. Dos outros escritórios (ou sem o portal): em APP_PUBLIC_URL, como
 * sempre. Null quando não há endereço absoluto possível.
 */
export function enderecoPublicoDoPortal(slug: string, pagina: PaginaDoPortal, env: Ambiente = process.env): string | null {
  const config = configDeCarreiras(env);
  if (ehDa41(slug, config)) return `https://${config.principal}${caminhoNoPortal(config.tenantSlug, pagina, true)}`;
  // Mesma regra de `publicUrl` (lib/jobPostingSchema): base sem barra no fim.
  const base = (env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}${caminhoNoPortal(slug, pagina, false)}`;
}

/** O endereço da vaga no 41 Carreiras, quando ela é da 41 e o portal está configurado; senão null. */
export function urlDaVagaNo41Carreiras(tenantSlug: string, vagaId: string, env: Ambiente = process.env): string | null {
  const config = configDeCarreiras(env);
  return ehDa41(tenantSlug, config) ? `https://${config.principal}${caminhoNoPortal(config.tenantSlug, { tipo: "vaga", id: vagaId }, true)}` : null;
}

/** A página inicial do 41 Carreiras, ou null com o portal desligado (ou fechado). */
export function urlDoHub(env: Ambiente = process.env): string | null {
  const config = configDeCarreiras(env);
  return config?.tenantSlug ? `https://${config.principal}/` : null;
}

// ─── O portal visto de uma página ───────────────────────────────────────────

export type RotasDoPortal = {
  lista: string;
  vaga: (id: string) => string;
  conta: string;
  entrar: string;
  /** O teste do candidato (`/teste/<token>`), que só existe no endereço do Connect. */
  teste: (token: string) => string;
  /** O caminho do cookie da sessão do candidato — o navegador só o manda dentro dele. */
  caminhoDoCookie: string;
};

export type PortalDoTenant = {
  slug: string;
  /** É o escritório da 41, com o 41 Carreiras configurado: marca e endereços do portal. */
  da41: boolean;
  /** A página está sendo servida no endereço do 41 Carreiras: links curtos. */
  curto: boolean;
  rotas: RotasDoPortal;
};

/**
 * Como uma página do portal de um escritório se comporta neste host. Null
 * quando ela não pode ser servida aqui: no endereço do 41 Carreiras só existe
 * o escritório da 41 (o proxy já barra; isto é a segunda tranca).
 */
export function portalNoHost(
  slug: string,
  host: string | null | undefined,
  config: ConfigDeCarreiras | null,
  appPublicUrl?: string | null,
): PortalDoTenant | null {
  const curto = ehHostDeCarreiras(host, config);
  const da41 = ehDa41(slug, config);
  if (curto && !da41) return null;
  const origem = origemDoApp(appPublicUrl);
  return {
    slug,
    da41,
    curto,
    rotas: {
      lista: caminhoNoPortal(slug, { tipo: "lista" }, curto),
      vaga: (id) => caminhoNoPortal(slug, { tipo: "vaga", id }, curto),
      conta: caminhoNoPortal(slug, { tipo: "conta" }, curto),
      entrar: caminhoNoPortal(slug, { tipo: "entrar" }, curto),
      // O teste fica no Connect: no endereço do portal, o link sai absoluto.
      teste: (token) => `${curto && origem ? origem : ""}/teste/${encodeURIComponent(token)}`,
      caminhoDoCookie: curto ? "/minha-conta" : `/carreiras/${slug}`,
    },
  };
}

/** O nome de quem conduz o processo seletivo, como o candidato lê. */
export function nomeDoEscritorio(portal: Pick<PortalDoTenant, "da41">, nomeDoTenant: string): string {
  return portal.da41 ? MARCA_41_CARREIRAS.escritorio : nomeDoTenant;
}

// ─── O proxy no endereço do 41 Carreiras ────────────────────────────────────

export type RotaNoHostDeCarreiras =
  /** Serve a página interna, com o endereço do navegador intacto. */
  | { tipo: "reescrever"; para: string }
  /** Mesmo host, outro caminho (308) — os endereços antigos e os atalhos. */
  | { tipo: "redirecionar"; para: string }
  /** A rota pública como está (candidatura, logo do escritório, arquivos do Next). */
  | { tipo: "seguir" }
  | { tipo: "nao-encontrada" };

// Id de vaga (uuid) — só um segmento, sem nada que vire outro caminho.
const FORMATO_ID = /^[A-Za-z0-9-]{1,64}$/;

// Rotas que passam como estão: a candidatura e o robots/sitemap do portal
// (/api/carreiras/), o logo do escritório no topo (/api/workspace-logos/) e os
// arquivos internos do Next. Mais nada: nem login, nem portal do cliente, nem
// as telas da equipe, nem as outras APIs.
const LIVRES = ["/api/carreiras/", "/api/workspace-logos/", "/_next/"];

// Os ícones da aba do navegador (app/icon.png e app/apple-icon.png).
const ICONES = new Set(["/icon.png", "/apple-icon.png"]);

/**
 * O que o proxy faz com um caminho no endereço do 41 Carreiras. Lista
 * fechada: o que não está aqui é "não encontrada", para nunca expor a equipe
 * ou o Portal do Cliente neste endereço.
 */
export function rotaNoHostDeCarreiras(caminho: string, tenantSlug: string | null): RotaNoHostDeCarreiras {
  if (!tenantSlug) return { tipo: "nao-encontrada" };
  const p = caminho === "/" ? "/" : caminho.replace(/\/+$/, "");
  if (p === "/" || p === "") return { tipo: "reescrever", para: caminhoNoPortal(tenantSlug, { tipo: "lista" }, false) };
  if (LIVRES.some((l) => p.startsWith(l)) || ICONES.has(p)) return { tipo: "seguir" };

  const [primeiro, ...resto] = p.slice(1).split("/");
  const interno = (pagina: PaginaDoPortal): RotaNoHostDeCarreiras => ({
    tipo: "reescrever",
    para: caminhoNoPortal(tenantSlug, pagina, false),
  });
  const atalho = (pagina: PaginaDoPortal): RotaNoHostDeCarreiras => ({
    tipo: "redirecionar",
    para: caminhoNoPortal(tenantSlug, pagina, true),
  });
  const so = (...partes: string[]) => resto.length === partes.length && partes.every((x, i) => resto[i] === x);

  switch (primeiro) {
    case "vagas":
      if (resto.length === 0) return atalho({ tipo: "lista" });
      if (resto.length === 1 && FORMATO_ID.test(resto[0]!)) return interno({ tipo: "vaga", id: resto[0]! });
      return { tipo: "nao-encontrada" };
    case "minha-conta":
      if (so()) return interno({ tipo: "conta" });
      if (so("entrar")) return interno({ tipo: "entrar" });
      return { tipo: "nao-encontrada" };
    case "robots.txt":
      return resto.length === 0 ? { tipo: "reescrever", para: "/api/carreiras/robots" } : { tipo: "nao-encontrada" };
    case "sitemap.xml":
      return resto.length === 0 ? { tipo: "reescrever", para: "/api/carreiras/sitemap" } : { tipo: "nao-encontrada" };
    case "carreiras": {
      // O endereço antigo, com o host trocado à mão: só o da 41 tem para onde ir.
      if (resto.length === 0) return atalho({ tipo: "lista" });
      const [slug, ...depois] = resto;
      if (slug !== tenantSlug) return { tipo: "nao-encontrada" };
      if (depois.length === 0) return atalho({ tipo: "lista" });
      if (depois.length === 1 && depois[0] === "minha-conta") return atalho({ tipo: "conta" });
      if (depois.length === 2 && depois[0] === "minha-conta" && depois[1] === "entrar") return atalho({ tipo: "entrar" });
      if (depois.length === 1 && FORMATO_ID.test(depois[0]!)) return atalho({ tipo: "vaga", id: depois[0]! });
      return { tipo: "nao-encontrada" };
    }
    default:
      return { tipo: "nao-encontrada" };
  }
}

/**
 * A página de "não encontrada" do endereço do 41 Carreiras, servida pelo
 * próprio proxy: não depende de banco nem do layout do Connect, e não leva a
 * lugar nenhum da equipe — só de volta às vagas.
 */
export const PAGINA_NAO_ENCONTRADA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Página não encontrada · 41 Carreiras</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f7f7f8;color:#18181b}
main{max-width:420px;text-align:center}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 20px;color:#52525b;line-height:1.5}
a{display:inline-block;padding:10px 18px;border-radius:8px;background:#18181b;color:#fff;font-weight:600;text-decoration:none}
@media (prefers-color-scheme:dark){body{background:#111113;color:#f4f4f5}p{color:#a1a1aa}a{background:#f4f4f5;color:#18181b}}
</style>
</head>
<body>
<main>
<h1>Página não encontrada</h1>
<p>Este endereço não existe no 41 Carreiras. As vagas abertas estão na página inicial.</p>
<a href="/">Ver as vagas abertas</a>
</main>
</body>
</html>
`;
