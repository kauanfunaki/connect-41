// Os vídeos de passo a passo da ajuda — o único lugar dos links (05/10/2026).
//
// Decisão do Kauan em 05/10: os vídeos ficam no YouTube, não listados, e tocam
// dentro da própria página (player do youtube-nocookie), no artigo da tela e na
// seção "Vídeos" da central. Substituiu o campo `video` do artigo, que nunca
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
  // 01 — Contas a pagar
  bpo_contas_pagar: "",
  // 02 — Contas a receber
  bpo_contas_receber: "",
  // 03 — Lançamentos
  bpo_lancamentos: "",
  // 04 — Fluxo de caixa
  bpo_fluxo_caixa: "",
  // 05 — Conciliação bancária
  bpo_conciliacao: "",
  // 06 — Fornecedores e sacados
  bpo_cadastros: "",
  // 07 — Pendências ao cliente
  bpo_pendencias: "",
  // 08 — Aprovações
  bpo_aprovacoes: "",
  // 09 — Cobrança
  bpo_cobranca: "",
  // 10 — Conversa com o cliente
  bpo_comunicacao: "",
  // 11 — Repositório de Senhas
  bpo_senhas: "",
  // 12 — Repositório de Manuais
  bpo_manual: "",
  // 13 — DRE
  bpo_dre: "",
  // 14 — DRE econômica
  dre_economica: "",
  // 15 — Análises gerenciais
  dre_analises: "",
  // 16 — Orçamento
  dre_orcamento: "",
  // 17 — Início
  "geral:inicio": "",
  // 18 — Meu dia
  "geral:meu-dia": "",
  // 22 — Empresas
  "geral:empresas": "",
  // 23 — Pessoas
  "geral:pessoas": "",
  // 24 — Transferências
  "geral:transferencias": "",
  // 25 — Solicitações dos clientes
  portal_solicitacoes: "",
  // 26 — Agenda
  "geral:agenda": "",
  // 27 — Espaços
  "geral:espacos": "",
  // 28 — Certificados digitais
  tech_certificados: "",
  // 29 — Leads
  comercial_leads: "",
  // 30 — Processos
  societario_processos: "",
  // 31 — Licenças
  societario_licencas: "",
  // 32 — Minha área
  societario_minha_area: "",
  // 33 — Exigências e prazos
  societario_prazos: "",
  // 34 — Relatórios do Societário
  societario_relatorios: "",
  // 35 — Colaboradores
  dp_colaboradores: "",
  // 36 — Afastamentos
  dp_afastamentos: "",
  // 37 — Horas extras
  dp_horas_extras: "",
  // 38 — Escalas
  dp_escalas: "",
  // 39 — Treinamentos
  dp_treinamentos: "",
  // 40 — Avaliações de desempenho
  dp_avaliacoes: "",
  // 41 — Vagas
  recrutamento_vagas: "",
  // 42 — Candidatos
  recrutamento_candidatos: "",
  // 43 — Colaboradores de clientes
  recrutamento_colaboradores_clientes: "",
  // 44 — Testes
  recrutamento_testes: "",
  // 45 — Documentos fiscais
  fiscal_documentos: "",
  // 46 — Painel de Gestão
  gestao_painel: "",
  // 47 — Cargos e Salários
  gestao_cargos_salarios: "",
  // 48 — Indicadores de RH
  gestao_indicadores_rh: "",
  // 49 — Valora
  gestao_valora: "",
};

/**
 * Vídeos dos primeiros passos da central de ajuda do Connect (06/10/2026), pela
 * chave do passo (`PRIMEIROS_PASSOS`, em `components/ajuda/CentralDeAjuda.tsx`).
 * O vídeo toca dentro do passo aberto e entra na seção "Vídeos" da central.
 *
 * "meu-dia" e "transferir" não têm vídeo próprio: o do artigo (18 e 24) serve
 * — cole o mesmo link, e a seção "Vídeos" mostra uma vez só.
 */
export const VIDEOS_DOS_PRIMEIROS_PASSOS: Readonly<Record<string, string>> = {
  // 19 — Achar qualquer coisa com Ctrl+K
  busca: "",
  // 20 — Trabalhar dentro de um setor
  setor: "",
  // 21 — Filtrar uma lista
  filtros: "",
  // 18 — o mesmo vídeo do artigo Meu dia
  "meu-dia": "",
  // 24 — o mesmo vídeo do artigo Transferências
  transferir: "",
};

/**
 * Vídeos do portal do cliente, pela chave do passo (`lib/portal/ajuda.ts`).
 * O vídeo toca dentro do passo e entra na seção "Vídeos" da ajuda do portal —
 * só para quem enxerga o passo (o módulo dele ligado).
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
