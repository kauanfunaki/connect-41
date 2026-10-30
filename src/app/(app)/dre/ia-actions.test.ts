import { beforeEach, describe, expect, it, vi } from "vitest";
import { descreverProposta } from "@/lib/ia/chat/regras";

// O "Sim, aplicar" da Ceci do BPO (30/10/2026) chama as actions da tela; aqui
// elas são de mentira, para conferir o que chega a elas.

type RespostaDoMover = { success: true } | { error: string };
const moverCategoria = vi.fn<(...args: unknown[]) => Promise<RespostaDoMover>>(async () => ({ success: true }));
const alterarContasEmLote = vi.fn<(form: FormData) => Promise<unknown>>(async () => ({ ok: true, alteradas: 2, jaEstavam: 0, ficaram: [] }));
vi.mock("./actions", () => ({ moverCategoria: (...a: unknown[]) => moverCategoria(...a) }));
vi.mock("@/lib/financeiro/edicaoEmLoteServidor", () => ({ alterarContasEmLote: (f: FormData) => alterarContasEmLote(f) }));

const { aplicarPropostaDoBpo } = await import("./ia-actions");

const mover = { ferramenta: "propor_mover_categoria_na_dre", descricao: "", argumentos: { empresaId: "emp", empresaNome: "Transportadora", categoria: "Pedágio", lado: "pagamento", linha: "Custo Operacional", motivo: "é custo da viagem" } };
const trocar = { ferramenta: "propor_recategorizar_lancamentos", descricao: "", argumentos: { lancamentoIds: ["e1", "e2"], categoriaId: "c-frete", categoriaNome: "Fretes", motivo: "são fretes" } };

beforeEach(() => vi.clearAllMocks());

describe("aplicarPropostaDoBpo", () => {
  it("mover vai para o Mover da DRE, com empresa, categoria, lado e linha", async () => {
    expect(await aplicarPropostaDoBpo(mover)).toBeNull();
    expect(moverCategoria).toHaveBeenCalledWith("emp", "Pedágio", "pagamento", "Custo Operacional");
  });

  it("a recusa da tela volta como erro", async () => {
    moverCategoria.mockResolvedValueOnce({ error: "Esse grupo é de recebimento, e este valor foi pago." });
    expect(await aplicarPropostaDoBpo(mover)).toEqual({ error: "Esse grupo é de recebimento, e este valor foi pago." });
  });

  it("trocar a categoria vai para o Alterar marcadas, só com o campo categoria", async () => {
    expect(await aplicarPropostaDoBpo(trocar)).toBeNull();
    const form = alterarContasEmLote.mock.calls[0]![0];
    expect(form.getAll("campos")).toEqual(["categoria"]);
    expect(form.get("categoryId")).toBe("c-frete");
    expect(form.getAll("entryIds")).toEqual(["e1", "e2"]);
  });

  it("nada mudou porque travou: diz por quê", async () => {
    alterarContasEmLote.mockResolvedValueOnce({ ok: true, alteradas: 0, jaEstavam: 0, ficaram: [{ id: "e1", contraparteNome: "X", motivo: "Conta presa ao Omie até a virada." }] });
    expect(await aplicarPropostaDoBpo(trocar)).toEqual({ error: "Nenhum lançamento mudou: Conta presa ao Omie até a virada." });
  });

  it("recusa proposta sem lado, sem lançamentos ou desconhecida", async () => {
    expect(await aplicarPropostaDoBpo({ ...mover, argumentos: { ...mover.argumentos, lado: "outro" } })).toHaveProperty("error");
    expect(await aplicarPropostaDoBpo({ ...trocar, argumentos: { ...trocar.argumentos, lancamentoIds: [] } })).toHaveProperty("error");
    expect(await aplicarPropostaDoBpo({ ferramenta: "propor_outra", descricao: "", argumentos: {} })).toEqual({ error: "Proposta desconhecida." });
    expect(moverCategoria).not.toHaveBeenCalled();
  });
});

describe("o texto do cartão", () => {
  it("diz o que muda, em quem, e o motivo", () => {
    expect(descreverProposta(mover)).toBe('Na DRE de Transportadora, mover "Pedágio" para Custo Operacional (só neste cliente) — é custo da viagem');
    expect(descreverProposta(trocar)).toBe('Trocar a categoria de 2 lançamentos para "Fretes" — são fretes');
  });
});
