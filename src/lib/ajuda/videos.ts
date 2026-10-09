// Os vídeos de passo a passo da ajuda — o único lugar dos links (05/10/2026).
//
// Decisão do Kauan em 05/10: os vídeos ficam no YouTube, não listados, e tocam
// dentro da própria página (player do youtube-nocookie), só onde a pessoa abre
// a ajuda daquela tela ou daquele assunto: no artigo da tela e dentro do passo
// aberto. A seção "Vídeos" do topo da central, que repetia tudo, saiu em
// 08/10/2026 a pedido do Kauan. Substituiu o campo `video` do artigo, que nunca
// chegou a ser preenchido — assim não há duas fontes.
//
// Para pôr um vídeo no ar: cole o link entre as aspas, do jeito que o YouTube
// dá (`https://youtu.be/…`, `https://www.youtube.com/watch?v=…`, `…/shorts/…`).
// Link vazio não aparece; link que não é do YouTube reprova no teste
// (`videos.test.ts`) e também não aparece.

import { idDoVideo } from "./youtube";

/**
 * Vídeos do Connect, pela chave do artigo (a do endereço `/ajuda/<chave>`,
 * ver `artigos/`). O vídeo toca no topo do artigo e entra na central.
 *
 * Os números são os dos arquivos gravados em 06/10/2026 (`videos/equipe/`,
 * lista em `videos/LISTA.md`); os que faltam (19 a 21) são primeiros passos,
 * logo abaixo. Ex.: `bpo_contas_pagar: "https://youtu.be/xxxxxxxxxxx",`
 */
export const VIDEOS_DO_CONNECT: Readonly<Record<string, string>> = {
  // Publicados pelo Kauan (não listados): 01 a 09 em 08/10/2026, 10 a 49 em 09/10/2026.
  // 01 — Contas a pagar
  bpo_contas_pagar: "https://youtu.be/0kB56K30TQ8",
  // 02 — Contas a receber
  bpo_contas_receber: "https://youtu.be/hJwePmIAHrA",
  // 03 — Lançamentos
  bpo_lancamentos: "https://youtu.be/jMojHPUD-XI",
  // 04 — Fluxo de caixa
  bpo_fluxo_caixa: "https://youtu.be/EhnhJ7JbmiU",
  // 05 — Conciliação bancária
  bpo_conciliacao: "https://youtu.be/IxA0CNK1RZw",
  // 06 — Fornecedores e sacados
  bpo_cadastros: "https://youtu.be/8X5TjP5YXmA",
  // 07 — Pendências ao cliente
  bpo_pendencias: "https://youtu.be/rZ-eQXMKH-E",
  // 08 — Aprovações
  bpo_aprovacoes: "https://youtu.be/o3TnAXzUXFA",
  // 09 — Cobrança
  bpo_cobranca: "https://youtu.be/ADKuhGzXmtc",
  // 10 — Conversa com o cliente
  bpo_comunicacao: "https://youtu.be/lHt_EQBTwuI",
  // 11 — Repositório de Senhas
  bpo_senhas: "https://youtu.be/i5qB4BlRXM0",
  // 12 — Repositório de Manuais
  bpo_manual: "https://youtu.be/DSNfhaAsIu0",
  // 13 — DRE
  bpo_dre: "https://youtu.be/3qYY3YDohwE",
  // 14 — DRE econômica
  dre_economica: "https://youtu.be/LJsogBUqWwg",
  // 15 — Análises gerenciais
  dre_analises: "https://youtu.be/GcAeeM8kW5g",
  // 16 — Orçamento
  dre_orcamento: "https://youtu.be/EGktE5sUs24",
  // 17 — Início
  "geral:inicio": "https://youtu.be/DsVuJTkFY0M",
  // 18 — Meu dia
  "geral:meu-dia": "https://youtu.be/jbVIA86OQnU",
  // 22 — Empresas
  "geral:empresas": "https://youtu.be/INRVrkZGFqs",
  // 23 — Pessoas
  "geral:pessoas": "https://youtu.be/pQETZUdooyA",
  // 24 — Transferências
  "geral:transferencias": "https://youtu.be/rFH270LezMM",
  // 25 — Solicitações dos clientes
  portal_solicitacoes: "https://youtu.be/x47rnxWK3Qk",
  // 26 — Agenda
  "geral:agenda": "https://youtu.be/49vVH6XRqso",
  // 27 — Espaços
  "geral:espacos": "https://youtu.be/TIPh0ImN27U",
  // 28 — Certificados digitais
  tech_certificados: "https://youtu.be/YNyRwDTNkKg",
  // 29 — Leads
  comercial_leads: "https://youtu.be/_iJ9-Z_OcSk",
  // 30 — Processos
  societario_processos: "https://youtu.be/iGrwpKkt0ss",
  // 31 — Licenças
  societario_licencas: "https://youtu.be/hiVUf6G5JUM",
  // 32 — Minha área
  societario_minha_area: "https://youtu.be/d8Yij3hOvJg",
  // 33 — Exigências e prazos
  societario_prazos: "https://youtu.be/ItdxOgPuL5A",
  // 34 — Relatórios do Societário
  societario_relatorios: "https://youtu.be/4TrDmzaexFs",
  // 35 — Colaboradores
  dp_colaboradores: "https://youtu.be/SGUHvdkNj9k",
  // 36 — Afastamentos
  dp_afastamentos: "https://youtu.be/9DY2_9GnMMw",
  // 37 — Horas extras
  dp_horas_extras: "https://youtu.be/RTlvwcruKw0",
  // 38 — Escalas
  dp_escalas: "https://youtu.be/iarQ7Q9GM_Y",
  // 39 — Treinamentos
  dp_treinamentos: "https://youtu.be/CMALI9yVHng",
  // 40 — Avaliações de desempenho
  dp_avaliacoes: "https://youtu.be/PT7Kws7qdBY",
  // 41 — Vagas
  recrutamento_vagas: "https://youtu.be/_V5xIdyFxHQ",
  // 42 — Candidatos
  recrutamento_candidatos: "https://youtu.be/KaWSE8KeLbs",
  // 43 — Colaboradores de clientes
  recrutamento_colaboradores_clientes: "https://youtu.be/yHAOvLguxlA",
  // 44 — Testes
  recrutamento_testes: "https://youtu.be/AWodslVl2RA",
  // 45 — Documentos fiscais
  fiscal_documentos: "https://youtu.be/K3Kb8usYG-c",
  // 46 — Painel de Gestão
  gestao_painel: "https://youtu.be/A8UINtDcNgc",
  // 47 — Cargos e Salários
  gestao_cargos_salarios: "https://youtu.be/jFzwt1f0Q5Q",
  // 48 — Indicadores de RH
  gestao_indicadores_rh: "https://youtu.be/xrjf1VRaq7s",
  // 49 — Valora
  gestao_valora: "https://youtu.be/1oidghBVR4o",
};

/**
 * Vídeos dos primeiros passos da central de ajuda do Connect (06/10/2026), pela
 * chave do passo (`PRIMEIROS_PASSOS`, em `components/ajuda/CentralDeAjuda.tsx`).
 * O vídeo toca dentro do passo aberto.
 *
 * "meu-dia" e "transferir" não têm vídeo próprio: o do artigo (18 e 24) serve
 * — cole o mesmo link.
 */
export const VIDEOS_DOS_PRIMEIROS_PASSOS: Readonly<Record<string, string>> = {
  // 19 — Achar qualquer coisa com Ctrl+K
  busca: "https://youtu.be/aRjRKnFZyPA",
  // 20 — Trabalhar dentro de um setor
  setor: "https://youtu.be/EqjC9OIAgu4",
  // 21 — Filtrar uma lista
  filtros: "https://youtu.be/N0Ja1N2ASGE",
  // 18 — o mesmo vídeo do artigo Meu dia
  "meu-dia": "https://youtu.be/jbVIA86OQnU",
  // 24 — o mesmo vídeo do artigo Transferências
  transferir: "https://youtu.be/rFH270LezMM",
};

/**
 * Vídeos do portal do cliente, pela chave do passo (`lib/portal/ajuda.ts`).
 * O vídeo toca dentro do passo aberto — só para quem enxerga o passo (o módulo
 * dele ligado).
 */
export const VIDEOS_DO_PORTAL: Readonly<Record<string, string>> = {
  // Publicados pelo Kauan em 07/10/2026 (não listados).
  // 01 — Entrar no portal
  entrar: "https://youtu.be/Ow_kW0_U3iA",
  // 02 — O Início do portal (06/10/2026)
  inicio: "https://youtu.be/cdKK8OOCuag",
  // 03 — Pedir algo ao escritório
  solicitacao: "https://youtu.be/_1vL5AGY5oQ",
  // 04 — Responder uma pendência
  pendencia: "https://youtu.be/5-TPHs3MiF8",
  // 05 — Aprovar pagamentos
  aprovar: "https://youtu.be/AX0nsOwU_b4",
  // 06 — Acompanhar o financeiro
  financeiro: "https://youtu.be/2wOzvL26KPU",
  // 07 — Ler os comunicados
  comunicado: "https://youtu.be/GoEhTIzRVcs",
  // 08 — Esqueci minha senha
  senha: "https://youtu.be/cohqscMdEIQ",
};

// `hasOwn`: a chave vem de endereço e de catálogo; "constructor" não é vídeo.
function linkValido(mapa: Readonly<Record<string, string>>, chave: string): string | null {
  const link = Object.hasOwn(mapa, chave) ? mapa[chave] : "";
  return idDoVideo(link) ? link.trim() : null;
}

/** O vídeo do artigo do Connect, se o link já foi colado e é do YouTube. */
export function videoDoArtigo(chave: string): string | null {
  return linkValido(VIDEOS_DO_CONNECT, chave);
}

/** O vídeo do passo da ajuda do portal, se o link já foi colado e é do YouTube. */
export function videoDoPassoDoPortal(chave: string): string | null {
  return linkValido(VIDEOS_DO_PORTAL, chave);
}

/** O vídeo de um primeiro passo da central do Connect, se o link já foi colado e é do YouTube. */
export function videoDoPrimeiroPasso(chave: string): string | null {
  return linkValido(VIDEOS_DOS_PRIMEIROS_PASSOS, chave);
}

// ─── Miniaturas (08/10/2026) ────────────────────────────────────────────────
//
// As miniaturas no desenho que o Kauan escolheu (título e tela, com a área do
// vídeo) moram em `public/miniaturas/`, geradas das próprias gravações — as
// mesmas que ele sobe no YouTube. A ajuda mostra a nossa direto, sem esperar a
// miniatura personalizada do YouTube. O arquivo leva a chave do vídeo: a do
// Connect com ":" virando "-", a dos primeiros passos com "primeiros-passos-"
// e a do portal com "portal-" na frente.

/** "meu-dia" e "transferir" usam o vídeo do artigo (18 e 24) — e a miniatura dele. */
const MINIATURA_DO_ARTIGO: Readonly<Record<string, string>> = {
  "meu-dia": "geral-meu-dia",
  transferir: "geral-transferencias",
};

const GRUPOS = [
  ["connect", VIDEOS_DO_CONNECT],
  ["passos", VIDEOS_DOS_PRIMEIROS_PASSOS],
  ["portal", VIDEOS_DO_PORTAL],
] as const;

function nomeDaMiniatura(grupo: (typeof GRUPOS)[number][0], chave: string): string {
  if (grupo === "portal") return `portal-${chave}`;
  if (grupo === "passos") return MINIATURA_DO_ARTIGO[chave] ?? `primeiros-passos-${chave}`;
  return chave.replace(/:/g, "-");
}

/** Toda miniatura que a ajuda pode pedir — o teste confere que cada uma existe em `public/`. */
export function todasAsMiniaturas(): string[] {
  return GRUPOS.flatMap(([grupo, mapa]) => Object.keys(mapa).map((chave) => `/miniaturas/${nomeDaMiniatura(grupo, chave)}.jpg`));
}

/**
 * A nossa miniatura do vídeo, achada pelo link (o player só recebe o link), ou
 * `null` quando o link não é de nenhum vídeo da ajuda — aí vale a do YouTube.
 */
export function miniaturaDoVideo(link: string): string | null {
  const id = idDoVideo(link);
  if (!id) return null;
  for (const [grupo, mapa] of GRUPOS) {
    for (const [chave, outro] of Object.entries(mapa)) {
      if (idDoVideo(outro) === id) return `/miniaturas/${nomeDaMiniatura(grupo, chave)}.jpg`;
    }
  }
  return null;
}
