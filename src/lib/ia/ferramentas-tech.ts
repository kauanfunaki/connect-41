// O que a Ceci do chat sabe do Tech (03/11/2026): os sistemas do Ops Center e
// a abertura de chamados.
//
// Pedido do Kauan: tirar dúvida sobre o que já existe ("já tem um robô que faz
// X?", "quem cuida do sistema Y?", "o robô Z está no ar?") e abrir o chamado
// de melhoria, bug ou suporte que a conversa pedir. Toda Ceci da equipe tem as
// três ferramentas — a pergunta sobre um robô aparece no meio de qualquer
// setor, e encaminhar para outra Ceci perderia o histórico da conversa.
//
// ─── Quem vê o quê ───────────────────────────────────────────────────────────
//
// O recorte vem do `escopo`, montado por quem abre o chat (`escopoDoTech`), e
// nunca do modelo:
// - `ops: "completo"` — quem vê o Ops Center: robôs com a situação (no ar,
//   erros de hoje, instabilidade), inclusive os desativados, sites e apps.
// - `ops: "catalogo"` — quem pode abrir chamado, com o Ops Center ligado: nome,
//   o que faz e responsável dos itens ativos. É o que a triagem dos chamados já
//   mostra a qualquer solicitante (`catalogoParaTriagem`).
// - `chamado: "1"` — quem pode abrir chamado (`podeAbrir`), com os setores de
//   onde pode abrir em `setoresDoChamado`.
//
// ─── Abrir chamado ───────────────────────────────────────────────────────────
//
// `propor_abrir_chamado` é de escrita e não tem executor: vira o cartão "Abrir
// chamado" no chat, com categoria, título e descrição. O sim chama
// `abrirPelaCeci` (src/lib/chamados/comandos.ts) — o rascunho e a finalização
// da tela Novo chamado, com as mesmas regras de quem abre, de categoria e de
// formulário.

import { getPrisma } from "@/lib/prisma";
import type { FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { catalogoParaTriagem, robosComSituacao, type ItemExistente, type RoboComSituacao } from "@/lib/ops/catalogo";
import { caminhoDaCategoria, categoriasClassificaveis } from "@/lib/chamados/catalogo";
import { categoriaSchema, PRIORIDADES, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";
import { palavrasDaBusca } from "@/lib/ia/ferramentas-ajuda";
import { linkDaTela } from "@/lib/ia/legivel";
import { ABRIR_CHAMADO } from "@/lib/ia/chat/regras";

export const SISTEMAS_DO_OPS = "sistemas_do_ops_center";
export const CATEGORIAS_DE_CHAMADO = "categorias_de_chamado";

const MAX_ITENS = 40;

const listaDoEscopo = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const dataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Os itens que batem com a busca, os de mais palavras primeiro; busca vazia devolve todos. */
export function filtrarPorBusca<T>(itens: T[], busca: string, textos: (i: T) => (string | null)[]): T[] {
  const palavras = palavrasDaBusca(busca);
  if (palavras.length === 0) return itens;
  return itens
    .map((item) => {
      const alvo = textos(item).filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return { item, pontos: palavras.filter((p) => alvo.includes(p)).length };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.item);
}

const TIPO_EM_PALAVRAS = { robo: "robô", site: "site", app: "app" } as const;
const STATUS_EM_PALAVRAS = { SUCCESS: "sucesso", ERROR: "erro", WARNING: "aviso" } as const;

function itemDoCatalogo(i: ItemExistente) {
  return {
    tipo: TIPO_EM_PALAVRAS[i.tipo],
    nome: i.nome,
    oQueFaz: i.descricao ?? "sem descrição cadastrada",
    responsavel: i.responsavel ?? "sem responsável",
    ...(i.detalhe ? { [i.tipo === "app" ? "repositorio" : "cliente"]: i.detalhe } : {}),
    ...(i.endereco ? { endereco: i.endereco } : {}),
  };
}

function roboComSituacao(r: RoboComSituacao) {
  return {
    tipo: "robô",
    nome: r.nome,
    oQueFaz: r.descricao ?? "sem descrição cadastrada",
    responsavel: r.responsavel ?? "sem responsável",
    ...(r.cliente ? { cliente: r.cliente } : {}),
    situacao: r.atividade.toLocaleLowerCase("pt-BR"),
    ...(r.ultimoSinal ? { ultimoSinal: dataHora(r.ultimoSinal) } : {}),
    hoje: `${r.hoje.total} arquivos — ${r.hoje.sucesso} com sucesso, ${r.hoje.erro} com erro, ${r.hoje.aviso} com aviso`,
    ...(r.ultimoEvento
      ? { ultimoArquivo: `${STATUS_EM_PALAVRAS[r.ultimoEvento.status]} em ${dataHora(r.ultimoEvento.quando)}${r.ultimoEvento.erro ? ` — ${r.ultimoEvento.erro}` : ""}` }
      : {}),
    ...(r.instabilidade ? { instabilidadeAvisada: `desde ${dataHora(r.instabilidade.desde)}${r.instabilidade.nota ? ` — ${r.instabilidade.nota}` : ""}` } : {}),
    link: linkDaTela(`Ver ${r.nome} no Ops Center`, `/ops?watcher=${encodeURIComponent(r.slug)}`),
  };
}

export const FERRAMENTAS_DO_TECH: Record<string, FerramentaRegistrada> = {
  [SISTEMAS_DO_OPS]: {
    def: {
      nome: SISTEMAS_DO_OPS,
      descricao:
        "Os sistemas que o Tech já entregou e estão no Ops Center: robôs (automações), sites e apps, com o que cada um faz e quem é o responsável; para quem tem acesso ao Ops Center, também a situação dos robôs (no ar, sem comunicação, desativado), os arquivos de hoje e o último erro. Use para \"já existe algo que faz X?\", \"quem cuida de Y?\" e \"o robô Z está funcionando?\", e antes de abrir um chamado de algo novo. Busque com palavras-chave curtas do que a pessoa quer; \"\" lista tudo.",
      parametros: {
        type: "object",
        properties: {
          busca: { type: "string", description: "Palavras-chave (ex.: 'extrato bancário', 'folha'), ou \"\" para tudo" },
          tipo: { type: "string", enum: ["todos", "robo", "site", "app"] },
        },
        required: ["busca", "tipo"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      const nivel = ctx.escopo.ops;
      if (nivel !== "completo" && nivel !== "catalogo") throw new Error("O Ops Center não está disponível para o seu acesso.");
      const busca = typeof args.busca === "string" ? args.busca.trim() : "";
      const tipo = ["robo", "site", "app"].includes(String(args.tipo)) ? String(args.tipo) : "todos";
      const quer = (t: string) => tipo === "todos" || tipo === t;

      const catalogo = await catalogoParaTriagem(ctx.tenantId);
      const outros = catalogo.filter((i) => i.tipo !== "robo" && quer(i.tipo));
      const textos = (i: ItemExistente) => [i.nome, i.descricao, i.detalhe, i.responsavel];
      if (nivel === "catalogo") {
        const itens = filtrarPorBusca(catalogo.filter((i) => quer(i.tipo)), busca, textos);
        return {
          itens: itens.slice(0, MAX_ITENS).map(itemDoCatalogo),
          ...(itens.length > MAX_ITENS ? { aviso: `Mostrando ${MAX_ITENS} de ${itens.length}; refine a busca.` } : {}),
          acesso: "Só os itens ativos, sem a situação dos robôs: ela fica com quem tem acesso ao Ops Center.",
        };
      }

      const robos = quer("robo")
        ? filtrarPorBusca(await robosComSituacao(ctx.tenantId), busca, (r) => [r.nome, r.descricao, r.cliente, r.responsavel])
        : [];
      const demais = filtrarPorBusca(outros, busca, textos);
      const total = robos.length + demais.length;
      return {
        itens: [...robos.map(roboComSituacao), ...demais.map(itemDoCatalogo)].slice(0, MAX_ITENS),
        ...(total > MAX_ITENS ? { aviso: `Mostrando ${MAX_ITENS} de ${total}; refine a busca.` } : {}),
        link: linkDaTela("Abrir o Ops Center", tipo === "site" ? "/ops?view=sites" : tipo === "app" ? "/ops?view=apps" : "/ops"),
      };
    },
  },

  [CATEGORIAS_DE_CHAMADO]: {
    def: {
      nome: CATEGORIAS_DE_CHAMADO,
      descricao:
        "A árvore de categorias de chamado ao Tech (grupo › categoria), os campos que cada categoria pede e os setores de onde a pessoa pode abrir. Chame antes de propor_abrir_chamado: a categoria e o setor saem daqui, nunca de suposição.",
      parametros: { type: "object", properties: {}, additionalProperties: false },
      natureza: "leitura",
    },
    executar: async (_args, ctx) => {
      if (ctx.escopo.chamado !== "1") throw new Error("Você não pode abrir chamados: o seu setor não está entre os solicitantes, ou o módulo está desligado.");
      const codigos = listaDoEscopo(ctx.escopo.setoresDoChamado);
      const [linhas, setores] = await Promise.all([
        getPrisma().helpdeskCategory.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
        getPrisma().sector.findMany({ where: { tenantId: ctx.tenantId, code: { in: codigos }, active: true }, select: { code: true, label: true }, orderBy: { label: "asc" } }),
      ]);
      const novo = linkDaTela("Abrir pela tela Novo chamado", "/chamados/novo");
      if (linhas.length === 0) return { categorias: [], aviso: "As categorias ainda não foram criadas: o primeiro chamado precisa sair pela tela.", link: novo };
      const categorias = categoriasClassificaveis(linhas).flatMap((row) => {
        const lida = categoriaSchema.safeParse(row);
        if (!lida.success) return [];
        const c = lida.data;
        return [
          {
            categoriaId: row.id,
            caminho: caminhoDaCategoria(linhas, row.id),
            ...(c.formSchema.length
              ? { campos: c.formSchema.map((f) => ({ chave: f.key, nome: f.label, tipo: f.type, obrigatorio: f.required, ...(f.options.length ? { opcoes: f.options } : {}), ...(f.helpText ? { ajuda: f.helpText } : {}) })) }
              : {}),
            ...(c.requiredAttachments.some((a) => a.required) ? { anexoObrigatorio: c.requiredAttachments.filter((a) => a.required).map((a) => a.label) } : {}),
            ...(c.requiresApproval ? { precisaDeAprovacao: true } : {}),
          },
        ];
      });
      const ativo = ctx.escopo.setorAtivo ?? "";
      return {
        categorias,
        setores: setores.map((s) => ({ codigo: s.code, nome: s.label })),
        setorSugerido: setores.some((s) => s.code === ativo) ? ativo : (setores[0]?.code ?? null),
        prioridades: PRIORIDADES.map((p) => ({ codigo: p, nome: ROTULOS_PRIORIDADE[p] })),
        link: novo,
      };
    },
  },

  [ABRIR_CHAMADO]: {
    def: {
      nome: ABRIR_CHAMADO,
      descricao:
        "Prepara a abertura de um chamado ao Tech, para a pessoa confirmar no cartão — NADA é aberto sem o sim dela. Use quando a pessoa pedir uma melhoria, a correção de um erro, suporte, acesso ou um sistema novo e já tiver contado o que precisa. A categoria, o setor e os campos vêm de categorias_de_chamado; o título é curto e a descrição diz, nas palavras da pessoa, o que acontece, onde, desde quando e o que ela espera. Não invente fato que ela não disse.",
      parametros: {
        type: "object",
        properties: {
          categoriaId: { type: "string", description: "O categoriaId de categorias_de_chamado" },
          titulo: { type: "string", description: "Até 80 caracteres, resumindo o pedido" },
          descricao: { type: "string", description: "O pedido completo, com o que a pessoa contou na conversa" },
          setor: { type: "string", description: "O código do setor solicitante, de categorias_de_chamado" },
          prioridade: { type: "string", enum: [...PRIORIDADES] },
          campos: {
            type: "array",
            description: "Os campos que a categoria pede, com a resposta da pessoa; [] se não pede",
            items: {
              type: "object",
              properties: { chave: { type: "string" }, nome: { type: "string" }, valor: { type: "string" } },
              required: ["chave", "nome", "valor"],
              additionalProperties: false,
            },
          },
        },
        required: ["categoriaId", "titulo", "descricao", "setor", "prioridade", "campos"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
