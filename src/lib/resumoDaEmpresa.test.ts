import { describe, expect, it } from "vitest";
import {
  casarResumo,
  destinosDaTransferencia,
  ESQUEMA_DO_RESUMO,
  LIMITE_DE_ATENCAO,
  LIMITE_DO_QUE_ACONTECEU,
  linhaDaTransferencia,
  linhasDoResumo,
  PROMPT_DO_RESUMO,
  respostaDoResumoSchema,
  type EventoDoResumo,
} from "@/lib/resumoDaEmpresa";

const NOMES: Record<string, string> = { tech: "Tech", bpo: "BPO", fiscal: "Fiscal", societario: "Societário" };
const rotulo = (codigo: string) => NOMES[codigo] ?? codigo;

describe("linhas do Resumo IA da empresa", () => {
  it("mostra cada setor de destino pelo nome, com a situação escrita como na tela", () => {
    expect(
      destinosDaTransferencia(
        [
          { sectorCode: "bpo", status: "NEW" },
          { sectorCode: "fiscal", status: "IN_PROGRESS" },
          { sectorCode: "societario", status: "DONE" },
        ],
        rotulo,
      ),
    ).toBe("BPO (nova), Fiscal (resolvendo), Societário (finalizada)");
  });

  it("não deixa código do banco na linha da transferência", () => {
    const linha = linhaDaTransferencia(
      { data: "01/09/2026", de: "tech", partes: [{ sectorCode: "bpo", status: "NEW" }], prioridade: "MEDIUM", resumo: "Teste!" },
      rotulo,
    );
    expect(linha).toBe('[Transferência] 01/09/2026 — de Tech para BPO (nova) · prioridade média · "Teste!"');
    expect(linha).not.toMatch(/NEW|MEDIUM|\bbpo\b|\btech\b/);
  });

  it("escreve a parte devolvida e as outras prioridades", () => {
    const linha = linhaDaTransferencia(
      { data: "02/09/2026", de: "fiscal", partes: [{ sectorCode: "bpo", status: "RETURNED" }], prioridade: "URGENT", resumo: null },
      rotulo,
    );
    expect(linha).toBe("[Transferência] 02/09/2026 — de Fiscal para BPO (devolvida) · prioridade urgente");
  });

  it("corta o assunto longo em 160 caracteres", () => {
    const linha = linhaDaTransferencia(
      { data: "03/09/2026", de: "tech", partes: [{ sectorCode: "bpo", status: "NEW" }], prioridade: "LOW", resumo: "a".repeat(300) },
      rotulo,
    );
    expect(linha.endsWith(`"${"a".repeat(160)}"`)).toBe(true);
  });
});

// O resumo em blocos (17/11/2026, melhoria-723): a IA só devolve o
// identificador da linha; selo e link saem do registro.
describe("resumo em blocos da empresa", () => {
  const CORES: Record<string, string> = { bpo: "#111111", fiscal: "#222222" };
  const setor = (codigo: string) => ({ rotulo: rotulo(codigo), cor: CORES[codigo] ?? "#000000" });

  const eventos: EventoDoResumo[] = [
    { tipo: "reuniao", data: "01/09/2026", titulo: "Alinhamento", cliente: "Fulano", setor: "bpo" },
    { tipo: "reuniao", data: "05/09/2026", titulo: "Fechamento", cliente: null, setor: null },
    {
      tipo: "transferencia",
      id: "id-da-transferencia",
      number: 12,
      data: "10/09/2026",
      de: "tech",
      partes: [
        { sectorCode: "bpo", status: "NEW" },
        { sectorCode: "fiscal", status: "RETURNED" },
      ],
      prioridade: "HIGH",
      resumo: "Conferir cadastro",
    },
    { tipo: "quadro", id: "id-da-tarefa", number: 77, pipelineId: "quadro-1", data: "12/09/2026", quadro: "Onboarding", setor: "fiscal", etapa: "Em andamento", vence: "20/09/2026", descricao: "Coletar documentos" },
    { tipo: "envio", id: "id-do-envio", data: "15/09/2026", titulo: "Balancete", publicado: false },
  ];
  const linhas = linhasDoResumo(eventos, rotulo);

  it("dá a cada linha um identificador por tipo, na ordem de chegada", () => {
    expect(linhas.map((l) => l.ref)).toEqual(["r1", "r2", "t1", "q1", "e1"]);
    expect(linhas.map((l) => l.linha)).toEqual([
      "r1: [Reunião] 01/09/2026 — Alinhamento (com Fulano) · setor BPO",
      "r2: [Reunião] 05/09/2026 — Fechamento",
      't1: [Transferência] 10/09/2026 — de Tech para BPO (nova), Fiscal (devolvida) · prioridade alta · "Conferir cadastro"',
      'q1: [Kanban Onboarding · Fiscal] atualizado em 12/09/2026 · etapa "Em andamento" · vence 20/09/2026 · Coletar documentos',
      'e1: [Envio ao cliente] 15/09/2026 — "Balancete" · rascunho',
    ]);
  });

  it("monta os selos e o link a partir do registro, com um selo por setor da transferência", () => {
    const r = casarResumo(
      {
        resumo: "  Mês   movimentado. ",
        aconteceu: [
          { ref: "t1", texto: "Tech pediu a conferência do cadastro." },
          { ref: "r1", texto: "Reunião de alinhamento." },
          { ref: "r2", texto: "Reunião de fechamento." },
          { ref: "q1", texto: "Coleta de documentos em andamento." },
          { ref: "e1", texto: "Balancete preparado." },
        ],
        atencao: [
          { ref: "t1", texto: "Responder a devolução do Fiscal." },
          { ref: "q1", texto: "Atividade vence em 20/09." },
          { ref: "e1", texto: "Publicar o balancete." },
          { ref: "r1", texto: "Enviar a ata." },
        ],
      },
      linhas,
      setor,
    );
    expect(r.resumo).toBe("Mês movimentado.");
    expect(r.aconteceu[0]).toEqual({
      ref: "t1",
      data: "10/09",
      texto: "Tech pediu a conferência do cadastro.",
      selos: [
        { tipo: "setor", rotulo: "BPO", cor: "#111111", situacao: "NEW" },
        { tipo: "setor", rotulo: "Fiscal", cor: "#222222", situacao: "RETURNED" },
        { tipo: "prioridade", prioridade: "HIGH" },
      ],
      href: "/transferencias/transferencia-12",
    });
    expect(r.aconteceu[1].selos).toEqual([{ tipo: "setor", rotulo: "BPO", cor: "#111111", situacao: null }]);
    // Reunião sem setor: sem selo.
    expect(r.aconteceu[2].selos).toEqual([]);
    expect(r.aconteceu[3].selos).toEqual([{ tipo: "setor", rotulo: "Fiscal", cor: "#222222", situacao: null }]);
    expect(r.aconteceu[4].selos).toEqual([{ tipo: "envio", publicado: false }]);
    // A reunião não tem tela própria: fica sem link.
    expect(r.atencao.map((i) => i.href)).toEqual(["/transferencias/transferencia-12", "/kanban/quadro-1/itens/tarefa-77", "/solicitacoes/envios/id-do-envio", null]);
  });

  it("descarta identificador que não existe, item sem texto e evento repetido na mesma lista", () => {
    const r = casarResumo(
      {
        resumo: "Resumo.",
        aconteceu: [
          { ref: "t9", texto: "Transferência que não existe." },
          { ref: "/transferencias/transferencia-1", texto: "Endereço no lugar do identificador." },
          { ref: "r1", texto: "   " },
          { ref: " T1 ", texto: "Vale: só muda a caixa e o espaço." },
          { ref: "t1", texto: "O mesmo evento de novo." },
        ],
        atencao: [{ ref: "x1", texto: "Nada." }],
      },
      linhas,
      setor,
    );
    expect(r.aconteceu.map((i) => [i.ref, i.texto])).toEqual([["t1", "Vale: só muda a caixa e o espaço."]]);
    expect(r.atencao).toEqual([]);
  });

  it("corta cada lista no limite e o texto longo", () => {
    const muitos: EventoDoResumo[] = Array.from({ length: 12 }, (_, i) => ({ tipo: "envio", id: `envio-${i}`, data: "01/10/2026", titulo: `Envio ${i}`, publicado: true }));
    const muitas = linhasDoResumo(muitos, rotulo);
    const itens = muitas.map((l) => ({ ref: l.ref, texto: "a".repeat(500) }));
    const r = casarResumo({ resumo: "Resumo.", aconteceu: itens, atencao: itens }, muitas, setor);
    expect(r.aconteceu).toHaveLength(LIMITE_DO_QUE_ACONTECEU);
    expect(r.atencao).toHaveLength(LIMITE_DE_ATENCAO);
    expect(r.aconteceu[0].texto).toHaveLength(240);
  });

  it("recusa a resposta fora do esquema", () => {
    expect(respostaDoResumoSchema.safeParse({ resumo: "Texto corrido.", aconteceu: "tudo" }).success).toBe(false);
    expect(respostaDoResumoSchema.safeParse({ resumo: "  ", aconteceu: [], atencao: [] }).success).toBe(false);
    expect(respostaDoResumoSchema.safeParse({ resumo: "Ok.", aconteceu: [{ ref: "t1", texto: "Fato." }], atencao: [] }).success).toBe(true);
  });

  it("o prompt manda ignorar instrução embutida e o esquema é estrito", () => {
    expect(PROMPT_DO_RESUMO).toContain("dado não confiável");
    expect(ESQUEMA_DO_RESUMO).toMatchObject({ additionalProperties: false, required: ["resumo", "aconteceu", "atencao"] });
  });
});
