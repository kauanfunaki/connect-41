// As telas do Connect que uma etapa do fluxo pode abrir ("Abrir Admissões no
// Connect") — 10/11/2026, pedido do Kauan. Puro: sai do catálogo de módulos,
// que é a fonte das rotas, mais as telas gerais que não são módulo. Assim a
// etapa só guarda um endereço que existe, e nunca um link para fora.

import { MODULE_CATALOG, getModuleRoute } from "@/lib/module-catalog";

export type TelaDoConnect = { href: string; rotulo: string; modulo: string | null };

/** As telas do menu Geral que não são módulo do catálogo. */
const TELAS_GERAIS: readonly TelaDoConnect[] = [
  { href: "/empresas", rotulo: "Empresas", modulo: null },
  { href: "/pessoas", rotulo: "Pessoas", modulo: null },
  { href: "/agenda", rotulo: "Agenda", modulo: null },
  { href: "/kanban", rotulo: "Quadros", modulo: null },
];

function montar(): TelaDoConnect[] {
  const vistas = new Set<string>();
  const out: TelaDoConnect[] = [];
  const incluir = (t: TelaDoConnect) => {
    if (vistas.has(t.href)) return;
    vistas.add(t.href);
    out.push(t);
  };
  for (const m of MODULE_CATALOG) {
    const href = getModuleRoute(m.code);
    if (href) incluir({ href, rotulo: m.label, modulo: m.code });
  }
  TELAS_GERAIS.forEach(incluir);
  return out.sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Todas, em ordem alfabética. */
export const TELAS_DO_CONNECT: readonly TelaDoConnect[] = montar();

const POR_ENDERECO = new Map(TELAS_DO_CONNECT.map((t) => [t.href, t]));

export function telaDoConnect(href: string | null | undefined): TelaDoConnect | null {
  return href ? (POR_ENDERECO.get(href) ?? null) : null;
}

export const ehTelaDoConnect = (href: string) => POR_ENDERECO.has(href);

/**
 * As telas que o editor oferece: as gerais e as dos módulos ligados no
 * escritório. A tela que a etapa já usa fica na lista mesmo com o módulo
 * desligado depois — para o seletor não esconder o que está gravado.
 */
export function telasParaEscolher(modulosLigados: ReadonlySet<string>, emUso: readonly string[] = []): TelaDoConnect[] {
  const usadas = new Set(emUso);
  return TELAS_DO_CONNECT.filter((t) => t.modulo === null || modulosLigados.has(t.modulo) || usadas.has(t.href));
}
