// Telas recentes — as últimas que a pessoa abriu, para o Ctrl+K oferecer de
// cara, sem ela digitar nada.
//
// Mora no **navegador** (`localStorage`), não no banco: gravar a cada troca de
// tela seria uma escrita por navegação, para uma informação que ninguém audita e
// que não faz falta se sumir. Fixar é escolha, e escolha vai para o banco (ver
// `telasFixadas.ts`); recente é rastro.
//
// A leitura sanea: código que não existe mais no catálogo cai fora, e o resto
// segue funcionando. Storage bloqueado (janela anônima, cookie de terceiro
// barrado) devolve lista vazia — o Ctrl+K continua buscando normalmente.

import { MODULE_ROUTES, getModuleDef } from "@/lib/module-catalog";

export const CHAVE_DE_TELAS_RECENTES = "connect41:telas-recentes";

/** Quantas telas recentes o Ctrl+K guarda. Cinco é o que cabe sem virar histórico. */
export const LIMITE_DE_TELAS_RECENTES = 5;

/** Lê a lista guardada, jogando fora o que não é código de módulo conhecido. */
export function lerTelasRecentes(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  let lido: unknown;
  try {
    lido = JSON.parse(bruto);
  } catch {
    return [];
  }
  if (!Array.isArray(lido)) return [];
  const vistos = new Set<string>();
  const codigos: string[] = [];
  for (const valor of lido) {
    if (typeof valor !== "string" || vistos.has(valor) || !getModuleDef(valor)) continue;
    vistos.add(valor);
    codigos.push(valor);
  }
  return codigos.slice(0, LIMITE_DE_TELAS_RECENTES);
}

/** A tela visitada vai para o topo; a mais antiga cai fora quando passa do teto. */
export function registrarTelaRecente(
  atuais: string[],
  code: string,
  limite: number = LIMITE_DE_TELAS_RECENTES
): string[] {
  if (!getModuleDef(code)) return atuais;
  return [code, ...atuais.filter((c) => c !== code)].slice(0, limite);
}

/**
 * De que módulo é esta rota — ou `null` quando não é de nenhum.
 *
 * Pelo **maior prefixo**: `/dre/economica` é a DRE econômica, não a DRE de
 * caixa (`/dre`), e `/pagar/abc` continua sendo contas a pagar. Comparar por
 * igualdade perderia a ficha aberta a partir da lista, que é justamente a tela
 * de onde a pessoa quer voltar.
 */
export function moduloDaRota(pathname: string): string | null {
  let achado: string | null = null;
  let tamanho = 0;
  for (const [code, rota] of Object.entries(MODULE_ROUTES)) {
    if ((pathname === rota || pathname.startsWith(`${rota}/`)) && rota.length > tamanho) {
      achado = code;
      tamanho = rota.length;
    }
  }
  return achado;
}
