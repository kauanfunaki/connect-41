// As ferramentas da "Ajuda do Connect" — o agente geral do chat, para quem
// está num setor que ainda não tem IA própria, e para dúvida de "como faço".
//
// Ele responde **como usar o sistema**, não sobre os dados do setor: as duas
// ferramentas leem o catálogo de telas e os manuais que o próprio escritório
// escreveu. Nada de lançamento, empresa ou processo passa por aqui.
//
// O recorte vem do `escopo`, montado por quem abre o chat depois de conferir o
// acesso: `setores` é a lista de setores que a pessoa enxerga. Tela e manual
// de setor fora dessa lista não aparecem — o mesmo filtro da barra lateral.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { getTenantModuleStates } from "@/lib/modules";
import { getModuleRoute } from "@/lib/module-catalog";

const SEM_PARAMETROS = { type: "object", properties: {}, additionalProperties: false } as const;

/** As telas que servem a todo setor — ficam fora do catálogo de módulos. */
export const TELAS_GERAIS = [
  { tela: "Início", caminho: "/home", descricao: "Resumo do dia: tarefas, transferências e avisos." },
  { tela: "Cadastros", caminho: "/empresas", descricao: "Empresas, pessoas e clientes do escritório." },
  { tela: "Tarefas", caminho: "/tarefas", descricao: "Tarefas atribuídas a você e ao seu setor." },
  { tela: "Conversas", caminho: "/conversas", descricao: "Histórico de atendimentos (Chatwoot) ligado a empresas e pessoas." },
  { tela: "Transferências", caminho: "/transferencias", descricao: "Passar um assunto para outro setor, com prazo e prioridade." },
  { tela: "Busca", caminho: "Ctrl+K", descricao: "Acha qualquer tela, empresa ou pessoa pelo nome." },
] as const;

/** Os setores do recorte — nunca do modelo. */
export function setoresDoEscopo(ctx: ContextoDaFerramenta): Set<string> {
  return new Set((ctx.escopo.setores ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Tira as tags do HTML do editor e junta os espaços. */
export function textoDoHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** As palavras da busca: até 5, com 3 letras ou mais. */
export function palavrasDaBusca(termo: string): string[] {
  return [...new Set(termo.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 3))].slice(0, 5);
}

/** Um trecho em volta da primeira palavra encontrada. */
export function trechoEmVolta(texto: string, palavras: string[], tamanho = 600): string {
  const minusculo = texto.toLowerCase();
  const pos = palavras.map((p) => minusculo.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const inicio = Math.max(0, pos - Math.floor(tamanho / 3));
  const trecho = texto.slice(inicio, inicio + tamanho);
  return `${inicio > 0 ? "…" : ""}${trecho}${inicio + tamanho < texto.length ? "…" : ""}`;
}

export const FERRAMENTAS_DE_AJUDA: Record<string, FerramentaRegistrada> = {
  listar_minhas_telas: {
    def: {
      nome: "listar_minhas_telas",
      descricao:
        "As telas do Connect que esta pessoa pode abrir: nome, setor, caminho e para que servem. Use para dizer onde fica uma função.",
      parametros: SEM_PARAMETROS as unknown as Record<string, unknown>,
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      const setores = setoresDoEscopo(ctx);
      const estados = await getTenantModuleStates(ctx.tenantId);
      return {
        gerais: TELAS_GERAIS,
        doSetor: estados
          .filter((m) => m.enabled && setores.has(m.sectorCode))
          .map((m) => ({
            tela: m.label,
            setor: m.sectorCode,
            caminho: getModuleRoute(m.code) ?? `/setor/${m.sectorCode}/${m.code}`,
            descricao: m.description,
          })),
      };
    },
  },

  buscar_nos_manuais: {
    def: {
      nome: "buscar_nos_manuais",
      descricao:
        "Procura nos manuais que o escritório escreveu (procedimentos, passo a passo). Devolve as páginas mais parecidas com um trecho. Use palavras-chave curtas; se não achar, tente sinônimos.",
      parametros: {
        type: "object",
        properties: { termo: { type: "string", description: "Palavras-chave, ex.: 'conciliação extrato'" } },
        required: ["termo"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const palavras = palavrasDaBusca(typeof args.termo === "string" ? args.termo : "");
      if (palavras.length === 0) throw new Error("Informe ao menos uma palavra com 3 letras ou mais.");
      const setores = [...setoresDoEscopo(ctx)];
      if (setores.length === 0) return { paginas: [], aviso: "Nenhum setor no seu acesso." };

      // A collation do banco já ignora maiúscula e acento no `contains`.
      const candidatas = await getPrisma().manualPage.findMany({
        where: {
          tenantId: ctx.tenantId,
          document: { sectorCode: { in: setores } },
          OR: palavras.flatMap((p) => [{ title: { contains: p } }, { content: { contains: p } }]),
        },
        select: {
          title: true,
          content: true,
          document: { select: { title: true, sectorCode: true } },
        },
        take: 40,
      });

      const pontuadas = candidatas
        .map((c) => {
          const texto = textoDoHtml(c.content ?? "");
          const alvo = `${c.title} ${c.document.title} ${texto}`.toLowerCase();
          const pontos = palavras.filter((p) => alvo.includes(p)).length;
          return { c, texto, pontos };
        })
        .filter((x) => x.pontos > 0)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, 5);

      return {
        paginas: pontuadas.map(({ c, texto }) => ({
          manual: c.document.title,
          pagina: c.title,
          setor: c.document.sectorCode,
          trecho: trechoEmVolta(texto, palavras),
        })),
      };
    },
  },
};
