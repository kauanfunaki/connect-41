import { describe, expect, it } from "vitest";
import { classificar, LIMITES_PADRAO, type ItemDeTrabalho } from "@/lib/gestao/regras";
import { andando, paraComecar, pedeAgora, resumirDia } from "./meuDia";

const AGORA = new Date("2026-09-30T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const dias = (n: number) => new Date(AGORA.getTime() + n * DIA);

function item(id: string, parcial: Partial<ItemDeTrabalho>): { item: ItemDeTrabalho; c: ReturnType<typeof classificar> } {
  const it: ItemDeTrabalho = {
    origem: "CARD",
    id,
    titulo: id,
    setor: "bpo",
    responsaveis: ["u1"],
    estado: "ANDAMENTO",
    ultimaMovimentacao: dias(-1),
    prazo: null,
    concluidoEm: null,
    href: `/x/${id}`,
    ...parcial,
  };
  return { item: it, c: classificar(it, LIMITES_PADRAO, AGORA) };
}

const ITENS = [
  item("vencido", { prazo: dias(-2) }),
  item("vence-amanha", { prazo: dias(1), estado: "NAO_INICIADO" }),
  item("parado", { ultimaMovimentacao: dias(-20) }),
  item("andando-velho", { ultimaMovimentacao: dias(-3) }),
  item("andando-novo", { ultimaMovimentacao: dias(0) }),
  item("fila-sem-prazo", { estado: "NAO_INICIADO" }),
  item("fila-com-prazo", { estado: "NAO_INICIADO", prazo: dias(30) }),
  item("esperando-cliente", { estado: "ESPERANDO_CLIENTE" }),
  item("feito-ontem", { estado: "CONCLUIDO", concluidoEm: dias(-1) }),
  item("feito-mes-passado", { estado: "CONCLUIDO", concluidoEm: dias(-20) }),
];

describe("Meu dia", () => {
  it("conta cada coisa uma vez, pela régua da Gestão", () => {
    expect(resumirDia(ITENS, AGORA)).toEqual({
      atrasados: 1,
      vencendo: 1,
      parados: 2, // o parado há 20 dias e o que espera o cliente
      andamento: 3, // vencido, andando-velho e andando-novo
      aComecar: 3,
      concluidosNaSemana: 1,
    });
  });

  it("'pede agora' traz vencido, parado e vencendo, nessa ordem", () => {
    expect(pedeAgora(ITENS).map((x) => x.item.id)).toEqual(["vencido", "parado", "vence-amanha"]);
  });

  it("'andando' é o que anda sem alerta, o mais recente primeiro", () => {
    expect(andando(ITENS).map((x) => x.item.id)).toEqual(["andando-novo", "andando-velho"]);
  });

  it("'para começar' é a fila e o que espera alguém, prazo mais perto primeiro", () => {
    expect(paraComecar(ITENS).map((x) => x.item.id)).toEqual(["fila-com-prazo", "fila-sem-prazo", "esperando-cliente"]);
  });
});
