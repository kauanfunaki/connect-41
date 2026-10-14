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
  /**
   * O nome do portal — o produto. Um lugar só (títulos, topo, rodapé, imagem
   * de compartilhamento): trocar o nome é esta linha.
   */
  nome: "41 Carreiras",
  /**
   * Quem conduz os processos seletivos: a 41 Tallent, a marca do Recrutamento
   * da 41 (Kauan, 14/10/2026). É o nome que o candidato lê no selo "Processo
   * conduzido por…", no rodapé, no e-mail de acesso e na conta.
   */
  recrutamento: "41 Tallent",
  /** Como a própria 41 Tallent se apresenta na política dela (41contabil.com.br/41-tallent). */
  grupo: "uma empresa do grupo 41 Contábil",
  /** O escritório contábil da 41 — não o tenant "41 Tech". */
  escritorio: "41 Contábil",
  /**
   * O CNPJ da 41 Tallent, que o rodapé mostra — dos registros do Kauan
   * (18/06/2026), a confirmar com ele: a página pública de Políticas e Termos
   * não o trazia em 14/10/2026. Vazio, a linha do CNPJ some. (Não é o da 41
   * Contábil, 31.052.957/0001-05.)
   */
  cnpj: "57.848.164/0001-90",
  /**
   * A política de privacidade OFICIAL da 41 Tallent (Políticas e Termos). O
   * consentimento da candidatura e o rodapé apontam para ela; a página
   * `/privacidade` do portal é só um resumo do que este site faz.
   */
  politicaDePrivacidade: "https://41contabil.com.br/41-tallent/politicas-e-termos/",
  /** O canal da política oficial para os pedidos do titular (LGPD). */
  emailDePrivacidade: "privacidade@41contabil.com.br",
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
  /** A página inicial: no 41 Carreiras, a capa com a busca; nos outros escritórios, a lista. */
  | { tipo: "lista" }
  /** Todas as vagas, com busca e filtros (15/10/2026: a capa do 41 Carreiras deixou de ser a lista). */
  | { tipo: "vagas" }
  | { tipo: "vaga"; id: string }
  | { tipo: "conta" }
  | { tipo: "entrar"; token?: string }
  /** O aviso de privacidade do candidato. */
  | { tipo: "privacidade" };

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
    case "vagas":
      return `${base}/vagas`;
    case "privacidade":
      return `${base}/privacidade`;
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
  /** A página inicial (no 41 Carreiras, a capa). */
  lista: string;
  /** Todas as vagas, com busca e filtros. */
  vagas: string;
  /** O aviso de privacidade do candidato. */
  privacidade: string;
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
      vagas: caminhoNoPortal(slug, { tipo: "vagas" }, curto),
      privacidade: caminhoNoPortal(slug, { tipo: "privacidade" }, curto),
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
  return portal.da41 ? MARCA_41_CARREIRAS.recrutamento : nomeDoTenant;
}

/**
 * A imagem de compartilhamento (LinkedIn, WhatsApp, Pandapé) de uma página do
 * 41 Carreiras, no endereço principal: a da capa, ou a de uma vaga. Null fora
 * da 41 ou com o portal desligado — os outros escritórios seguem sem imagem.
 * A rota fica em `/api/carreiras/og/`, que o proxy já deixa passar no
 * endereço do portal (e que é pública no do Connect).
 */
export function imagemDeCompartilhamento(slug: string, vagaId: string | null, env: Ambiente = process.env): string | null {
  const config = configDeCarreiras(env);
  if (!ehDa41(slug, config)) return null;
  const base = `https://${config.principal}/api/carreiras/og/${encodeURIComponent(config.tenantSlug)}`;
  return vagaId ? `${base}/${encodeURIComponent(vagaId)}` : base;
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

// Rotas que passam como estão: a candidatura, o robots/sitemap, as imagens de
// compartilhamento e o logo das empresas das vagas (/api/carreiras/), o logo
// do escritório (/api/workspace-logos/), a marca da 41 Tallent
// (public/41-tallent: logo e ícone, arquivos estáticos) e os arquivos
// internos do Next. Mais nada: nem login, nem portal do cliente, nem as telas
// da equipe, nem as outras APIs.
const LIVRES = ["/api/carreiras/", "/api/workspace-logos/", "/41-tallent/", "/_next/"];

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
      // A lista com busca e filtros (15/10/2026) — antes, `/vagas` voltava para a capa.
      if (resto.length === 0) return interno({ tipo: "vagas" });
      if (resto.length === 1 && FORMATO_ID.test(resto[0]!)) return interno({ tipo: "vaga", id: resto[0]! });
      return { tipo: "nao-encontrada" };
    case "privacidade":
      return resto.length === 0 ? interno({ tipo: "privacidade" }) : { tipo: "nao-encontrada" };
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
      // Antes do id: "vagas" e "privacidade" também cabem no formato de um.
      if (depois.length === 1 && depois[0] === "vagas") return atalho({ tipo: "vagas" });
      if (depois.length === 1 && depois[0] === "privacidade") return atalho({ tipo: "privacidade" });
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
 * lugar nenhum da equipe — só de volta às vagas. Desde 15/10/2026 com a cara
 * do 41 Carreiras (as cores da 41 Tallent e a marca dela, de
 * `public/41-tallent`) e uma busca, que vai para a lista de vagas.
 */
export const PAGINA_NAO_ENCONTRADA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<title>Página não encontrada · ${MARCA_41_CARREIRAS.nome}</title>
<link rel="icon" href="/41-tallent/marca.png" type="image/png">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;font-family:"Hanken Grotesk",ui-sans-serif,"Segoe UI",sans-serif;background:#FAF6F0;color:#1E0B33}
header{background:#3B0670;padding:14px 16px}
header a{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:600;letter-spacing:.02em}
header img{width:36px;height:36px;border-radius:8px;background:#D090FF}
main{flex:1;display:flex;align-items:center;justify-content:center;padding:48px 16px;position:relative;overflow:hidden}
main:before{content:"";position:absolute;right:-120px;bottom:-60px;width:420px;height:364px;background:#EBD3FF;clip-path:polygon(50% 0,100% 100%,0 100%);opacity:.7}
section{position:relative;max-width:520px;width:100%}
.selo{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#3B0670;margin:0 0 12px}
h1{font-size:32px;line-height:1.15;margin:0 0 12px;color:#3B0670}
p{margin:0 0 24px;color:#5B5170;line-height:1.6;font-size:17px}
form{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
input{flex:1 1 220px;min-width:0;height:48px;border:1px solid #8E84A0;border-radius:10px;padding:0 14px;font:inherit;font-size:16px;background:#fff;color:#1E0B33}
input:focus{outline:3px solid #D090FF;outline-offset:1px;border-color:#3B0670}
button,.botao{height:48px;padding:0 20px;border-radius:10px;border:0;font:inherit;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
button{background:#3B0670;color:#fff}
.botao{background:transparent;color:#3B0670;border:1.5px solid #3B0670}
button:focus-visible,.botao:focus-visible{outline:3px solid #D090FF;outline-offset:2px}
</style>
</head>
<body>
<header><a href="/"><img src="/41-tallent/marca.png" alt="">${MARCA_41_CARREIRAS.nome}</a></header>
<main>
<section>
<p class="selo">Erro 404</p>
<h1>Esta página não existe</h1>
<p>O endereço pode estar incompleto, ou a vaga já foi encerrada. Busque outra vaga ou veja todas as que estão abertas.</p>
<form method="get" action="/vagas" role="search">
<input type="search" name="q" aria-label="Cargo ou palavra-chave" placeholder="Cargo ou palavra-chave">
<button type="submit">Buscar</button>
</form>
<a class="botao" href="/vagas">Ver vagas abertas</a>
</section>
</main>
</body>
</html>
`;

/**
 * O logo da empresa de uma vaga publicada, pela rota pública do portal
 * (`/api/carreiras/logo/<escritorio>/<vaga>`) — relativo, porque a rota passa
 * no endereço do 41 Carreiras e no do Connect. O logo da empresa em si fica
 * numa rota com sessão; esta só serve o de uma vaga que está no portal.
 */
export function caminhoDoLogoDaVaga(slug: string, vagaId: string): string {
  return `/api/carreiras/logo/${encodeURIComponent(slug)}/${encodeURIComponent(vagaId)}`;
}
