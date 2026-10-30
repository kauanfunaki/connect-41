// A Ceci corrigindo a DRE (30/10/2026) — o que ela lê e o que ela propõe.
//
// Pedido do Kauan: a Amanda alimentou a DRE de alguns clientes e a Ceci via a
// inconsistência, mas não tinha como corrigir. Faltavam duas coisas:
//
// 1. **Ver de onde vem o número**: as categorias de uma linha (`ver_linha_da_dre`)
//    e os lançamentos de uma categoria (`lancamentos_da_categoria`). Antes ela
//    só tinha as linhas e as 5 maiores categorias sem grupo.
// 2. **Propor a correção**, nas duas formas que a tela já tem: mover a
//    categoria de linha só naquele cliente (o "Mover" da DRE) e trocar a
//    categoria de lançamentos (o "Alterar marcadas" de contas). As duas são
//    de escrita, então **não executam**: viram o cartão "Sim, aplicar" no chat,
//    e o sim chama a mesma action da tela, com as mesmas travas (foco, Omie,
//    rateio, permissão) — ver `src/app/(app)/dre/ia-actions.ts`.
//
// As leituras são as da tela (`dreDoMes`, as baixas do mês): a Ceci vê o mesmo
// número que a Amanda vê.

import { getPrisma } from "@/lib/prisma";
import type { ContextoDaFerramenta, FerramentaRegistrada } from "@/lib/ia/ferramentas";
import { dreDoMes, inicioDoMes, mesesComMovimento } from "@/lib/dre/data";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import { grupoDeTexto } from "@/lib/dre/mapeamento";
import { escolhasDeGrupo, grupoAceitaOrigem, rotuloDoGrupo } from "@/lib/dre/estrutura";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { baixasNoPeriodo, movimentosDeCaixa } from "@/lib/financeiro/baixa/consultas";
import { nomeExibicao } from "@/lib/companyName";
import { linkDaTela, mesLegivel } from "@/lib/ia/legivel";
import { competenciaOpcional, exigirModulo, link, reais } from "./ferramentas-bpo";

const LANCAMENTOS = 30;

async function empresaPedida(args: Record<string, unknown>, ctx: ContextoDaFerramenta) {
  const id = typeof args.empresaId === "string" ? args.empresaId.trim() : "";
  if (!id) throw new Error("Informe a empresa (o id de buscar_empresa).");
  const e = await getPrisma().company.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, name: true, displayName: true } });
  if (!e) throw new Error("Empresa não encontrada. Use buscar_empresa para achar o id.");
  return e;
}

async function mesPedido(args: Record<string, unknown>, ctx: ContextoDaFerramenta, companyId: string) {
  const pedida = competenciaOpcional(args);
  if (pedida) return { ano: Number(pedida.slice(0, 4)), mes: Number(pedida.slice(5, 7)) };
  const [maisRecente] = await mesesComMovimento(ctx.tenantId, companyId);
  if (!maisRecente) throw new Error("A empresa não tem movimento pago no Connect.");
  return maisRecente;
}

const chaveDoMes = (m: { ano: number; mes: number }) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;

/** "pagamento", "recebimento" ou "os dois" — o que a Ceci precisa para não propor o impossível. */
function ladoDoGrupo(code: string): string {
  const pagamento = grupoAceitaOrigem(code, "pagamento");
  const recebimento = grupoAceitaOrigem(code, "recebimento");
  return pagamento && recebimento ? "os dois" : pagamento ? "pagamento" : "recebimento";
}

export const FERRAMENTAS_DA_DRE_DO_BPO: Record<string, FerramentaRegistrada> = {
  ver_linha_da_dre: {
    def: {
      nome: "ver_linha_da_dre",
      descricao:
        "As categorias que compõem uma linha do DRE de uma empresa num mês, com valor e lado (pagamento ou recebimento), e as linhas para onde uma categoria pode ser movida. Use linha = o nome da linha como dre_do_mes devolve (ex.: \"Custo Operacional\"), ou \"sem classificação\".",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id de buscar_empresa" },
          competencia: { type: "string", description: "AAAA-MM, ou \"\" para o mais recente" },
          linha: { type: "string", description: "O nome da linha, ou \"sem classificação\"" },
        },
        required: ["empresaId", "competencia", "linha"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_dre");
      const empresa = await empresaPedida(args, ctx);
      const mes = await mesPedido(args, ctx, empresa.id);
      const [{ resultado, fonte }, modelo] = await Promise.all([dreDoMes(ctx.tenantId, empresa.id, mes), modeloDaEmpresa(ctx.tenantId, empresa.id)]);
      const pedida = typeof args.linha === "string" ? args.linha.trim() : "";
      const semClassificacao = /^sem\s+classifica/i.test(pedida) || /^n[ãa]o\s+classificad/i.test(pedida);
      const grupo = semClassificacao ? null : grupoDeTexto(pedida, modelo);
      if (!semClassificacao && !grupo) {
        throw new Error(`Linha "${pedida}" desconhecida neste modelo de DRE. As linhas com categoria são: ${modelo.grupos.map((g) => g.label).join("; ")}.`);
      }
      const categorias = semClassificacao ? resultado.naoClassificado : (resultado.porCategoria[grupo!] ?? []);
      const chave = chaveDoMes(mes);
      return {
        empresa: nomeExibicao(empresa),
        competencia: chave,
        linha: semClassificacao ? "Sem classificação" : rotuloDoGrupo(grupo!, modelo),
        fonte: fonte.tipo === "import" ? "planilha importada (dá para mover a categoria de linha, mas não há lançamentos no Connect para trocar de categoria)" : "financeiro do Connect",
        categorias: categorias.slice(0, 40).map((c) => ({ categoria: c.categoria, valor: reais(c.centavos), lado: c.origem })),
        linhasParaMover: escolhasDeGrupo(modelo).map((g) => ({ linha: g.label, aceita: ladoDoGrupo(g.code) })),
        link: linkDaTela(`Abrir o DRE de ${mesLegivel(chave)}`, link("/dre", { empresa: empresa.id, mes: `${mes.ano}-${mes.mes}` })),
      };
    },
  },

  lancamentos_da_categoria: {
    def: {
      nome: "lancamentos_da_categoria",
      descricao:
        "Os lançamentos pagos ou recebidos de uma categoria numa empresa e mês (os que somam no DRE de caixa), com o id de cada um, e as categorias do mesmo lado para onde eles podem ir. Use antes de propor trocar a categoria de lançamentos.",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string", description: "O id de buscar_empresa" },
          competencia: { type: "string", description: "AAAA-MM, ou \"\" para o mais recente" },
          categoria: { type: "string", description: "O nome da categoria, como ver_linha_da_dre devolve" },
        },
        required: ["empresaId", "competencia", "categoria"],
        additionalProperties: false,
      },
      natureza: "leitura",
    },
    executar: async (args, ctx) => {
      exigirModulo(ctx, "bpo_dre");
      const empresa = await empresaPedida(args, ctx);
      const mes = await mesPedido(args, ctx, empresa.id);
      const nome = typeof args.categoria === "string" ? args.categoria.trim() : "";
      if (!nome) throw new Error("Informe a categoria.");
      const [{ categorias, fonte }, modelo] = await Promise.all([dreDoMes(ctx.tenantId, empresa.id, mes), modeloDaEmpresa(ctx.tenantId, empresa.id)]);
      if (fonte.tipo === "import") {
        return { aviso: "O DRE deste mês vem de uma planilha importada: não há lançamentos no Connect para trocar de categoria. Para corrigir, mova a categoria de linha." };
      }
      const daCategoria = categorias.filter((c) => chaveDaCategoria(c.nome) === chaveDaCategoria(nome));
      if (daCategoria.length === 0) throw new Error(`Categoria "${nome}" não encontrada no plano desta empresa.`);
      const ids = new Set(daCategoria.map((c) => c.id));
      const lado = daCategoria[0]!.origem;

      // O mesmo recorte da DRE de caixa (`lancamentosDoMes`): pago dentro do mês.
      const de = inicioDoMes(mes.ano, mes.mes);
      const ate = inicioDoMes(mes.mes === 12 ? mes.ano + 1 : mes.ano, mes.mes === 12 ? 1 : mes.mes + 1);
      const movimentos = (await movimentosDeCaixa(baixasNoPeriodo({ tenantId: ctx.tenantId, companyId: empresa.id }, de, ate))).filter((m) => m.categoryId && ids.has(m.categoryId));
      const porConta = new Map<string, { centavos: number; soEncargos: boolean }>();
      for (const m of movimentos) {
        const atual = porConta.get(m.entryId) ?? { centavos: 0, soEncargos: true };
        porConta.set(m.entryId, { centavos: atual.centavos + m.centavos, soEncargos: atual.soEncargos && m.parte !== "principal" });
      }
      const contas = await getPrisma().financeEntry.findMany({
        where: { tenantId: ctx.tenantId, companyId: empresa.id, id: { in: [...porConta.keys()] } },
        select: { id: true, description: true, dueDate: true, kind: true, counterparty: { select: { name: true } }, _count: { select: { allocations: true } } },
      });
      const ordenadas = contas.sort((a, b) => Math.abs(porConta.get(b.id)!.centavos) - Math.abs(porConta.get(a.id)!.centavos));
      return {
        empresa: nomeExibicao(empresa),
        competencia: chaveDoMes(mes),
        categoria: daCategoria[0]!.nome,
        lado,
        quantidade: contas.length,
        lancamentos: ordenadas.slice(0, LANCAMENTOS).map((c) => {
          const v = porConta.get(c.id)!;
          return {
            id: c.id,
            descricao: c.description,
            contraparte: c.counterparty.name,
            vencimento: c.dueDate.toISOString().slice(0, 10),
            valorNoMes: reais(Math.abs(v.centavos)),
            // Rateio e encargos não mudam trocando a categoria da conta: avisa antes de propor.
            ...(c._count.allocations > 1 ? { rateada: true } : {}),
            ...(v.soEncargos ? { soJurosOuDesconto: true } : {}),
          };
        }),
        categoriasDoMesmoLado: categorias
          .filter((c) => c.origem === lado && !ids.has(c.id))
          .slice(0, 80)
          .map((c) => ({ id: c.id, categoria: c.nome, linha: c.grupo ? rotuloDoGrupo(c.grupo, modelo) : "sem classificação" })),
      };
    },
  },

  // ─── As de escrita. Sem executor: viram o cartão "Sim, aplicar". ──────────

  propor_mover_categoria_na_dre: {
    def: {
      nome: "propor_mover_categoria_na_dre",
      descricao:
        "Propõe mover uma categoria para outra linha do DRE SÓ nesta empresa (as outras seguem o plano padrão). NÃO move: registra a sugestão para a pessoa confirmar. A linha de destino precisa aceitar o lado da categoria (veja linhasParaMover em ver_linha_da_dre).",
      parametros: {
        type: "object",
        properties: {
          empresaId: { type: "string" },
          empresaNome: { type: "string", description: "O nome da empresa, para o cartão" },
          categoria: { type: "string", description: "O nome da categoria, como ver_linha_da_dre devolve" },
          lado: { type: "string", enum: ["pagamento", "recebimento"] },
          linha: { type: "string", description: "O nome da linha de destino, de linhasParaMover" },
          motivo: { type: "string", description: "Por que, com base no que você leu" },
        },
        required: ["empresaId", "empresaNome", "categoria", "lado", "linha", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },

  propor_recategorizar_lancamentos: {
    def: {
      nome: "propor_recategorizar_lancamentos",
      descricao:
        "Propõe trocar a categoria de lançamentos (os ids de lancamentos_da_categoria) para outra do mesmo lado. NÃO troca: registra a sugestão para a pessoa confirmar. Não inclua lançamento rateado nem os marcados soJurosOuDesconto.",
      parametros: {
        type: "object",
        properties: {
          lancamentoIds: { type: "array", items: { type: "string" }, description: "Os ids, até 50" },
          categoriaId: { type: "string", description: "O id de categoriasDoMesmoLado" },
          categoriaNome: { type: "string", description: "O nome da categoria de destino, para o cartão" },
          motivo: { type: "string", description: "Por que, com base no que você leu" },
        },
        required: ["lancamentoIds", "categoriaId", "categoriaNome", "motivo"],
        additionalProperties: false,
      },
      natureza: "escrita",
    },
  },
};
