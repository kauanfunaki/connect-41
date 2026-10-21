import { describe, expect, it } from "vitest";
import { diaDaSemana, somarDias } from "@/lib/datas/calendario";
import { cnpjComDigitos, cnpjDaPadaria, cnpjDeContraparte, cnpjFormatado } from "./documentos";
import { MARCA, diaUtil, diaUtilAntes, montarDemonstracaoDoBpo, situacoesDoPlano, variar, type PlanoDoBpo } from "./plano";

// O que se testa: que os números batem entre as telas (lançamento pago ⇔
// transação conciliada no mesmo dia, saldo do extrato = abertura + movimento),
// que nada nasce no futuro e que as situações de história existem — em vários
// dias diferentes, porque o plano é relativo ao dia em que o script roda.

const DIAS = [
  new Date("2026-10-15T15:00:00.000Z"), // quinta, meio do mês (o dia em que nasceu)
  new Date("2026-11-01T13:00:00.000Z"), // domingo, primeiro dia do mês
  new Date("2026-12-31T22:00:00.000Z"), // quinta, último dia do ano
  new Date("2027-03-06T12:00:00.000Z"), // sábado
];

const centavosDe = (p: PlanoDoBpo) => new Map(p.lancamentos.map((l) => [l.chave, l]));

describe("CNPJs fictícios", () => {
  it("dígitos verificadores certos (conferidos contra um CNPJ conhecido)", () => {
    expect(cnpjComDigitos("11222333", "0001")).toBe("11222333000181");
  });

  it("matriz e filiais com a mesma raiz e ordens 0001, 0002, 0003; contraparte com ordem 0000", () => {
    expect(cnpjFormatado(cnpjDaPadaria(1))).toMatch(/^41\.000\.010\/0001-\d\d$/);
    expect(cnpjDaPadaria(2).slice(0, 8)).toBe(cnpjDaPadaria(1).slice(0, 8));
    expect(cnpjDeContraparte(7).slice(8, 12)).toBe("0000");
    expect(() => cnpjDeContraparte(0)).toThrow();
  });
});

describe("utilidades", () => {
  it("variar é determinístico e fica dentro da faixa", () => {
    expect(variar(100_000, "x", 10)).toBe(variar(100_000, "x", 10));
    for (const chave of ["a", "b", "c", "d", "e"]) {
      const v = variar(100_000, chave, 10);
      expect(v).toBeGreaterThanOrEqual(90_000);
      expect(v).toBeLessThanOrEqual(110_000);
    }
    expect(variar(12_345, "x", 0)).toBe(12_345);
  });

  it("dia útil: sábado e domingo vão para a segunda (ou voltam para a sexta)", () => {
    expect(diaUtil("2026-10-17")).toBe("2026-10-19");
    expect(diaUtil("2026-10-18")).toBe("2026-10-19");
    expect(diaUtil("2026-10-16")).toBe("2026-10-16");
    expect(diaUtilAntes("2026-10-18")).toBe("2026-10-16");
  });
});

for (const agora of DIAS) {
  describe(`plano em ${agora.toISOString().slice(0, 10)}`, () => {
    const p = montarDemonstracaoDoBpo(agora);
    const hoje = p.hoje;
    const mesAtual = p.meses[p.meses.length - 1]!;
    const lanc = centavosDe(p);

    it("é o mesmo para o mesmo dia", () => {
      expect(JSON.stringify(montarDemonstracaoDoBpo(agora))).toBe(JSON.stringify(p));
    });

    it("seis meses de histórico terminando no mês atual", () => {
      expect(p.meses).toHaveLength(6);
      expect(mesAtual).toBe(hoje.slice(0, 7));
    });

    it("chaves únicas", () => {
      for (const lista of [p.lancamentos, p.transacoes, p.categorias, p.centros, p.contrapartes, p.extratos, p.quadro.cards]) {
        const chaves = lista.map((x) => x.chave);
        expect(new Set(chaves).size).toBe(chaves.length);
      }
      const fit = p.transacoes.map((t) => `${t.conta}:${t.fitId}`);
      expect(new Set(fit).size).toBe(fit.length);
    });

    it("pago ⇔ com data de pagamento, sempre antes de hoje; cancelado nunca pago", () => {
      for (const l of p.lancamentos) {
        expect(l.status === "PAGO", l.chave).toBe(l.pagoEm !== null);
        if (l.pagoEm) expect(l.pagoEm < hoje, l.chave).toBe(true);
        if (l.pagoEm) expect(diaDaSemana(l.pagoEm) < 5, `${l.chave} pago no fim de semana`).toBe(true);
        if (l.status === "CANCELADO") expect(l.renegociadoNo, l.chave).not.toBeNull();
      }
    });

    it("competência nunca no futuro: a DRE econômica e as Análises abrem no mês atual", () => {
      for (const l of p.lancamentos) expect(l.competence <= mesAtual, `${l.chave} ${l.competence}`).toBe(true);
    });

    it("categoria, centro e contraparte são da mesma empresa do lançamento; categoria do mesmo tipo", () => {
      const cat = new Map(p.categorias.map((c) => [c.chave, c]));
      const cc = new Map(p.centros.map((c) => [c.chave, c]));
      const cp = new Map(p.contrapartes.map((c) => [c.chave, c]));
      for (const l of p.lancamentos) {
        expect(cp.get(l.contraparte)?.empresa, l.chave).toBe(l.empresa);
        expect(l.categoria, l.chave).not.toBeNull();
        expect(cat.get(l.categoria!)?.empresa, l.chave).toBe(l.empresa);
        expect(cat.get(l.categoria!)?.kind, l.chave).toBe(l.kind);
        if (l.centro) expect(cc.get(l.centro)?.empresa, l.chave).toBe(l.empresa);
      }
      for (const c of p.contrapartes) {
        if (c.categoria) expect(cat.get(c.categoria)?.empresa).toBe(c.empresa);
        if (c.centro) expect(cc.get(c.centro)?.empresa).toBe(c.empresa);
      }
    });

    it("todo lançamento pago tem a sua transação conciliada, no mesmo dia e pelo mesmo valor", () => {
      const conciliados = new Map<string, number>();
      for (const t of p.transacoes.filter((x) => x.status === "CONCILIADA")) {
        expect(t.lancamentos.length, t.chave).toBeGreaterThan(0);
        let soma = 0;
        for (const chave of t.lancamentos) {
          const l = lanc.get(chave)!;
          expect(l.status, chave).toBe("PAGO");
          expect(l.pagoEm, chave).toBe(t.data);
          expect(l.empresa, chave).toBe(t.conta);
          soma += l.kind === "PAGAR" ? -l.centavos : l.centavos;
          conciliados.set(chave, (conciliados.get(chave) ?? 0) + 1);
        }
        expect(soma, t.chave).toBe(t.centavos);
      }
      for (const l of p.lancamentos.filter((x) => x.status === "PAGO")) expect(conciliados.get(l.chave), l.chave).toBe(1);
    });

    it("nenhuma transação depois de ontem nem antes da abertura da conta", () => {
      for (const t of p.transacoes) {
        expect(t.data < hoje, t.chave).toBe(true);
        expect(t.data >= p.contas.find((c) => c.chave === t.conta)!.aberturaEm, t.chave).toBe(true);
      }
    });

    it("o saldo de cada extrato é a abertura mais o movimento até o fim dele — o saldo do banco bate com o calculado", () => {
      for (const x of p.extratos) {
        const conta = p.contas.find((c) => c.chave === x.conta)!;
        const movimento = p.transacoes.filter((t) => t.conta === x.conta && t.data <= x.fim).reduce((s, t) => s + t.centavos, 0);
        expect(x.saldoCentavos, x.chave).toBe(conta.aberturaCentavos + movimento);
        expect(p.transacoes.filter((t) => t.extrato === x.chave).length, x.chave).toBe(x.transacoes);
      }
      for (const c of p.contas) {
        const ultimo = p.extratos.filter((x) => x.conta === c.chave).at(-1)!;
        expect(ultimo.fim).toBe(somarDias(hoje, -1));
      }
    });

    it("uma categoria sem classificação, só na matriz, só no mês passado", () => {
      const semGrupo = p.categorias.filter((c) => c.dreGroup === null);
      expect(semGrupo.map((c) => c.chave)).toEqual(["matriz:delivery"]);
      const usos = p.lancamentos.filter((l) => l.categoria === "matriz:delivery");
      expect(usos.length).toBe(2);
      for (const l of usos) {
        expect(l.competence).toBe(p.meses[p.meses.length - 2]);
        expect(l.pagoEm?.slice(0, 7)).toBe(l.competence);
      }
    });

    it("história 1: a conta que vence hoje espera a aprovação, lançada pelo segundo administrador", () => {
      const l = lanc.get("historia:masseira")!;
      expect(l.vencimento).toBe(hoje);
      expect(l.aprovacao).toBe("AGUARDANDO");
      expect(l.criadoPor).toBe("outro");
      expect(l.centavos).toBeGreaterThan(p.acessoDoPortal.alcadaCentavos);
      expect(p.aprovacoes.some((a) => a.lancamento === l.chave && a.decisao === "ENVIADO")).toBe(true);
    });

    it("história 2: a pendência atrasada segue aberta", () => {
      const x = p.pendencias.find((y) => y.chave === "pendencia:cartao")!;
      expect(x.status).toBe("ABERTA");
      expect(x.vencimento < hoje).toBe(true);
    });

    it("história 3: cada transação pendente com par tem um lançamento em aberto, do mesmo tipo e valor, e o CNPJ no memo — e nenhum outro com o mesmo valor", () => {
      for (const [tx, chave] of [["tx:historia:gas", "historia:gas"], ["tx:historia:festival", "historia:festival"]] as const) {
        const t = p.transacoes.find((x) => x.chave === tx)!;
        const l = lanc.get(chave)!;
        expect(t.status).toBe("PENDENTE");
        expect(l.status).toBe("CONFERIDO");
        expect(Math.abs(t.centavos)).toBe(l.centavos);
        expect(t.centavos < 0).toBe(l.kind === "PAGAR");
        const doc = p.contrapartes.find((c) => c.chave === l.contraparte)!.document!;
        expect(t.memo).toContain(cnpjFormatado(doc));
        // A janela da sugestão: vencimento entre 10 dias antes e 5 depois da transação.
        expect(l.vencimento >= somarDias(t.data, -10) && l.vencimento <= somarDias(t.data, 5)).toBe(true);
        const mesmoValor = p.lancamentos.filter((x) => x.empresa === l.empresa && x.kind === l.kind && x.status !== "PAGO" && x.status !== "CANCELADO" && x.centavos === l.centavos);
        expect(mesmoValor.map((x) => x.chave)).toEqual([chave]);
      }
    });

    it("história 4: acordo com a primeira parcela paga e as outras em aberto; o original cancelado como renegociado", () => {
      const acordo = p.acordos[0]!;
      const parcelas = p.lancamentos.filter((l) => l.parcelaDo === acordo.chave);
      expect(parcelas.map((l) => l.status)).toEqual(["PAGO", "CONFERIDO", "CONFERIDO"]);
      expect(parcelas.reduce((s, l) => s + l.centavos, 0)).toBe(acordo.acordadoCentavos);
      const original = p.lancamentos.find((l) => l.renegociadoNo === acordo.chave)!;
      expect(original.status).toBe("CANCELADO");
      expect(original.centavos).toBe(acordo.originalCentavos);
    });

    it("cobrança: dois títulos a receber vencidos em aberto, com contato registrado", () => {
      for (const chave of ["cobranca:hotel", "cobranca:colegio"]) {
        const l = lanc.get(chave)!;
        expect(l.kind).toBe("RECEBER");
        expect(l.status).toBe("CONFERIDO");
        expect(l.vencimento < hoje).toBe(true);
        expect(p.contatos.some((c) => c.lancamento === chave)).toBe(true);
      }
    });

    it("dois meses à frente: há títulos em aberto vencendo depois de hoje", () => {
      const futuros = p.lancamentos.filter((l) => l.status === "CONFERIDO" && l.vencimento > hoje);
      expect(futuros.length).toBeGreaterThan(10);
      expect(futuros.some((l) => l.vencimento > somarDias(hoje, 30))).toBe(true);
    });

    it("nada nasce no futuro: avisos, atividades, mensagens e contatos", () => {
      const limite = agora.getTime();
      const instantes = [
        ...p.avisos.map((a) => a.quando),
        ...p.quadro.cards.flatMap((c) => [c.criadoEm, c.atualizadoEm, ...c.atividades.map((a) => a.quando)]),
        ...p.pendencias.flatMap((x) => [x.criadoEm, ...x.mensagens.map((m) => m.quando)]),
        ...p.solicitacoes.flatMap((s) => [s.criadoEm, ...s.mensagens.map((m) => m.quando)]),
        ...p.conversa.map((m) => m.quando),
        ...p.contatos.map((c) => c.quando),
        ...p.aprovacoes.map((a) => a.quando),
      ];
      for (const i of instantes) expect(new Date(i).getTime() <= limite, i).toBe(true);
    });

    it("nada de e-mail de verdade; o que a limpeza procura leva a marca", () => {
      expect(p.acessoDoPortal.email.endsWith("@exemplo.invalido")).toBe(true);
      expect(p.acessoDoPortal.name.startsWith(MARCA)).toBe(true);
      for (const e of p.empresas) expect(e.name.startsWith(MARCA)).toBe(true);
      expect(p.quadro.espaco.name.startsWith(MARCA)).toBe(true);
      for (const t of p.quadro.etiquetas) expect(t.name.startsWith(MARCA)).toBe(true);
      expect(p.manual.title.startsWith(MARCA)).toBe(true);
      expect(p.comunicado.title.startsWith(MARCA)).toBe(true);
      for (const a of p.avisos) expect(a.message.startsWith(MARCA)).toBe(true);
      for (const pasta of p.pastas.filter((x) => x.empresa === null && x.pai === null)) expect(pasta.name.startsWith(MARCA)).toBe(true);
    });

    it("orçamento só do primeiro mês do histórico em diante (sem estouro falso no acumulado)", () => {
      const meses = new Set(p.orcamentos[0]!.linhas.map((l) => l.mes));
      const ano = Number(hoje.slice(0, 4));
      const primeiro = p.meses[0]!.startsWith(String(ano)) ? Number(p.meses[0]!.slice(5, 7)) : 1;
      expect(Math.min(...meses)).toBe(primeiro);
      expect(Math.max(...meses)).toBe(12);
    });

    it("cards: prazo às 20h de São Paulo, subtarefa apontando para um card que existe", () => {
      const chaves = new Set(p.quadro.cards.map((c) => c.chave));
      for (const c of p.quadro.cards) {
        if (c.prazo) expect(c.prazo.endsWith("T23:00:00.000Z"), c.chave).toBe(true);
        if (c.pai) expect(chaves.has(c.pai)).toBe(true);
        for (const a of c.atividades) if (a.respostaA !== null) expect(c.atividades[a.respostaA]?.respostaA).toBeNull();
      }
    });

    it("equipe fictícia: [demo], e-mail fictício; todo responsável de card existe; cada pessoa com trabalho em aberto", () => {
      expect(p.equipe.length).toBe(4);
      for (const m of p.equipe) {
        expect(m.name.startsWith(MARCA)).toBe(true);
        expect(m.email.endsWith("@exemplo.invalido")).toBe(true);
      }
      const chaves = new Set<string>(p.equipe.map((m) => m.chave));
      for (const c of p.quadro.cards) {
        for (const r of [...c.responsaveis, ...c.horas.map((h) => h.quem), ...c.atividades.map((a) => a.quem)]) {
          if (r.startsWith("equipe:")) expect(chaves.has(r), `${c.chave} → ${r}`).toBe(true);
        }
      }
      for (const m of p.equipe) {
        const abertos = p.quadro.cards.filter((c) => c.responsaveis.includes(m.chave) && !c.etapa.endsWith(":feito"));
        expect(abertos.length, m.name).toBeGreaterThan(0);
      }
      expect(p.quadro.cards.some((c) => c.responsaveis.length === 0)).toBe(true);
    });

    it("Meu time com de tudo: card da equipe atrasado, vencendo hoje, parado e concluído na semana", () => {
      const daEquipe = p.quadro.cards.filter((c) => c.lista === "lista:equipe");
      const dia = (c: (typeof daEquipe)[number]) => (c.prazo ? new Date(new Date(c.prazo).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : null);
      expect(daEquipe.some((c) => !c.etapa.endsWith(":feito") && dia(c) !== null && dia(c)! < hoje)).toBe(true);
      expect(daEquipe.some((c) => dia(c) === hoje)).toBe(true);
      expect(daEquipe.some((c) => c.etapa.endsWith(":fazendo") && new Date(c.atualizadoEm).getTime() < agora.getTime() - 10 * 86_400_000)).toBe(true);
      expect(daEquipe.some((c) => c.etapa.endsWith(":feito"))).toBe(true);
    });

    it("o resumo do roteiro fala de todas as situações", () => {
      const s = situacoesDoPlano(p);
      expect(s).toHaveLength(5);
      expect(s.join(" ")).toContain("vence hoje");
    });
  });
}
