// O nome de cada tela do Connect, a partir do endereço — para o chat da Ceci
// nunca mostrar caminho cru (13/10/2026).
//
// Pedido do Kauan: embaixo da pergunta aparecia "/solicitacoes", a página em que
// a pessoa estava. Agora aparece "Em Solicitações"; tela sem nome conhecido não
// mostra nada. O mesmo nome vira o rótulo do botão quando a resposta traz um
// endereço solto ("Link: /pendencias" → "Abrir Pendências ao cliente").
//
// A fonte é a mesma do menu: o nome dos módulos (`MODULE_CATALOG`, pela rota
// de `MODULE_ROUTES`) e, para o que fica fora do catálogo, o nome do item no
// menu Geral (`AppShell`) e na central de Ajuda (`TELAS_GERAIS`). Puro: roda
// no navegador (o chat) e no servidor (o texto que vai à Ceci).

import { MODULE_ROUTES, getModuleDef } from "@/lib/module-catalog";

/**
 * As telas fora do catálogo de módulos, com o nome do menu. Ganham do
 * catálogo quando os dois têm a mesma rota: no menu Geral, "Solicitações dos
 * clientes" aparece como "Solicitações".
 */
const TELAS_GERAIS: Readonly<Record<string, string>> = {
  "/home": "Início",
  "/tarefas": "Meu dia",
  "/transferencias": "Transferências",
  "/solicitacoes": "Solicitações",
  "/arquivos": "Arquivos",
  "/agenda": "Agenda",
  "/empresas": "Empresas",
  "/pessoas": "Pessoas",
  "/clientes": "Clientes",
  "/setor": "Espaços",
  "/kanban": "Espaços",
  "/notificacoes": "Notificações",
  "/ajuda": "Ajuda",
  "/configuracoes": "Configurações",
  "/admin": "Configurações",
  "/ferias": "Férias",
  "/desligamentos": "Desligamentos",
  "/admissoes": "Admissões",
};

/** Rota → nome, montado uma vez: o catálogo primeiro, as telas gerais por cima. */
const NOME_DA_ROTA: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [code, rota] of Object.entries(MODULE_ROUTES)) {
    const label = getModuleDef(code)?.label;
    // "Documentos fiscais — integrado": o que vem depois do travessão é nota
    // do catálogo, não nome de tela.
    if (label) m.set(rota, label.split(" — ")[0]!.trim());
  }
  for (const [rota, nome] of Object.entries(TELAS_GERAIS)) m.set(rota, nome);
  return m;
})();

/** Só o caminho: sem `?filtro` nem `#âncora`. */
function semFiltro(caminho: string): string {
  return caminho.split(/[?#]/)[0] ?? "";
}

/**
 * É um endereço de dentro do Connect? Começa com uma barra só, sem `//` (que o
 * navegador lê como outro site), sem barra invertida, espaço ou caractere de
 * controle. É o filtro que separa o que pode virar botão do que fica texto.
 */
export function ehCaminhoInterno(href: string): boolean {
  if (typeof href !== "string" || href.length < 2 || href.length > 500) return false;
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  return !/[\\\s\u0000-\u001f\u007f]/.test(href);
}

/**
 * O nome da tela de um endereço do Connect — a rota mais longa que bate, para
 * "/fiscal/classificacao" ser "Classificação" e não "Painel fiscal". `null`
 * para endereço de fora, ou de tela sem nome conhecido.
 */
export function nomeDaTela(caminho: string | null | undefined): string | null {
  if (!caminho || !ehCaminhoInterno(caminho)) return null;
  const base = semFiltro(caminho).replace(/\/+$/, "") || "/";
  let achado: string | null = null;
  let tamanho = 0;
  for (const [rota, nome] of NOME_DA_ROTA) {
    if ((base === rota || base.startsWith(`${rota}/`)) && rota.length > tamanho) {
      achado = nome;
      tamanho = rota.length;
    }
  }
  return achado;
}

/** "Em Solicitações" — o que fica embaixo da pergunta. `null` = não mostra nada. */
export function rotuloDaTela(caminho: string | null | undefined): string | null {
  const nome = nomeDaTela(caminho);
  return nome ? `Em ${nome}` : null;
}

/**
 * O rótulo gravado com a pergunta, pronto para a tela. Pergunta antiga guardou
 * o caminho cru ("/solicitacoes"): vira "Em Solicitações", ou some. Os outros
 * rótulos ("Empresa: Padaria Bom Grão") passam como estão.
 */
export function contextoParaMostrar(contexto: string | null | undefined): string | null {
  const t = contexto?.trim();
  if (!t) return null;
  return t.startsWith("/") ? rotuloDaTela(t) : t;
}

/**
 * O endereço é de uma tela que o Connect tem? Vale também para a ficha de um
 * item dentro dela ("/pendencias/…" é de Pendências ao cliente).
 */
export function ehTelaConhecida(caminho: string): boolean {
  return nomeDaTela(caminho) !== null;
}

/** A rota exata de uma tela (sem filtro e sem item)? É o que pode virar link mesmo sem vir de uma ferramenta. */
export function ehRotaDeTela(caminho: string): boolean {
  return ehCaminhoInterno(caminho) && !/[?#]/.test(caminho) && NOME_DA_ROTA.has(caminho.replace(/\/+$/, "") || "/");
}
