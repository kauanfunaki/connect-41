import { describe, expect, it } from "vitest";
import { isValidCNPJ, isValidCPF } from "@/lib/validation/common";
import { calcularNota, normalizarRequisitos } from "@/lib/recrutamento/triagem";
import { scoreDisc, validateDiscAnswers } from "@/lib/disc";
import { scoreQuiz, validateQuizAnswers } from "@/lib/quiz";
import { situacaoNoPortal } from "@/lib/recrutamento/fichaDaVaga";
import { resumoDaEmpresa } from "@/lib/colaboradores/resumoDaEmpresa";
import { validarPasso, CANDIDATURA_VAZIA } from "@/lib/carreiras/candidatura";
import { cnpjFicticio, cpfFicticio, emailFicticio, telefoneFicticio, ORDEM_DO_CNPJ, PREFIXO_DO_CNPJ, PREFIXO_DO_CPF } from "./documentos";
import { ETIQUETA_MARCADORA, FONTE_DA_DEMO, MARCA, montarDemonstracao, respostasDoDisc } from "./plano";

// O que se testa: a demonstração montada sem banco — sempre a mesma para o
// mesmo dia, só com dados que não podem ser de ninguém, e coerente com as
// regras do próprio Connect (portal, triagem, DISC, questionário, resumo de
// Colaboradores de clientes e os alertas do DP).

const AGORA = new Date("2026-10-14T15:00:00.000Z"); // 12h em São Paulo
const plano = montarDemonstracao(AGORA);
const DIA = 86_400_000;

describe("documentos fictícios", () => {
  it("CPF com dígitos verificadores válidos, na faixa 000.410.0xx", () => {
    for (let n = 1; n <= 99; n++) {
      const cpf = cpfFicticio(n);
      expect(cpf).toMatch(/^\d{11}$/);
      expect(cpf.startsWith(PREFIXO_DO_CPF)).toBe(true);
      expect(isValidCPF(cpf)).toBe(true);
    }
    expect(() => cpfFicticio(0)).toThrow();
    expect(() => cpfFicticio(100)).toThrow();
  });

  it("CNPJ com dígitos válidos e ordem 0000 — que a Receita nunca emite", () => {
    for (let n = 1; n <= 9; n++) {
      const cnpj = cnpjFicticio(n);
      expect(cnpj).toMatch(/^\d{14}$/);
      expect(cnpj.startsWith(PREFIXO_DO_CNPJ)).toBe(true);
      expect(cnpj.slice(8, 12)).toBe(ORDEM_DO_CNPJ);
      expect(isValidCNPJ(cnpj)).toBe(true);
    }
  });

  it("e-mail sem acento, só @exemplo.invalido; telefone que o portal aceita", () => {
    expect(emailFicticio("Vinícius Carvalho Borges")).toBe("vinicius.borges@exemplo.invalido");
    expect(emailFicticio("Rosângela Maria Kubiak")).toBe("rosangela.kubiak@exemplo.invalido");
    expect(telefoneFicticio(7)).toBe("(41) 90000-0007");
    expect(validarPasso("dados", { ...CANDIDATURA_VAZIA, name: "Ana Paula", email: "ana.ribeiro@exemplo.invalido", phone: telefoneFicticio(1) })).toEqual({});
  });
});

describe("a demonstração", () => {
  it("é determinística: o mesmo dia monta exatamente a mesma coisa", () => {
    expect(JSON.stringify(montarDemonstracao(AGORA))).toBe(JSON.stringify(plano));
    expect(JSON.stringify(montarDemonstracao(new Date("2026-10-14T23:59:00.000Z")))).toBe(JSON.stringify(plano));
  });

  it("tem os números combinados", () => {
    expect(plano.empresas).toHaveLength(4);
    expect(plano.vagas).toHaveLength(8);
    expect(plano.pessoas.filter((p) => p.type === "CANDIDATO")).toHaveLength(30);
    expect(plano.candidaturas.length).toBeGreaterThanOrEqual(30);
    expect(plano.pessoas.filter((p) => p.type === "COLABORADOR").length).toBeGreaterThanOrEqual(12);
    expect(plano.questionario.perguntas).toHaveLength(10);
  });

  it("empresas: razão social e nome no sistema com [demo], nome fantasia limpo para o portal, CNPJ fictício", () => {
    for (const e of plano.empresas) {
      expect(e.name.startsWith(`${MARCA} `)).toBe(true);
      expect(e.displayName.startsWith(`${MARCA} `)).toBe(true);
      expect(e.tradeName).not.toContain(MARCA);
      expect(e.cnpj.slice(8, 12)).toBe("0000");
      expect(isValidCNPJ(e.cnpj)).toBe(true);
      expect(e.stateCode).toBe("PR");
    }
    expect(new Set(plano.empresas.map((e) => e.cnpj)).size).toBe(4);
    expect(FONTE_DA_DEMO).toBeTruthy();
  });

  it("pessoas: CPF válido e único na faixa fictícia, e-mail só @exemplo.invalido, telefone 9 0000, a etiqueta marcadora", () => {
    const cpfs = plano.pessoas.map((p) => p.cpf);
    const emails = plano.pessoas.map((p) => p.email);
    const fones = plano.pessoas.map((p) => p.phone);
    expect(new Set(cpfs).size).toBe(cpfs.length);
    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(fones).size).toBe(fones.length);
    for (const p of plano.pessoas) {
      expect(isValidCPF(p.cpf)).toBe(true);
      expect(p.cpf.startsWith(PREFIXO_DO_CPF)).toBe(true);
      expect(p.email).toMatch(/^[a-z]+\.[a-z]+@exemplo\.invalido$/);
      expect(p.phone).toMatch(/^\(41\) 90000-00\d\d$/);
      expect(p.etiquetas).toContain(ETIQUETA_MARCADORA);
      for (const t of p.etiquetas) expect(t.startsWith(MARCA)).toBe(true);
    }
  });

  it("toda etiqueta e o questionário têm o prefixo [demo]", () => {
    for (const e of plano.etiquetas) expect(e.name.startsWith(`${MARCA} `)).toBe(true);
    expect(plano.etiquetas.map((e) => e.name)).toContain(ETIQUETA_MARCADORA);
    expect(plano.questionario.name.startsWith(`${MARCA} `)).toBe(true);
  });
});

describe("vagas", () => {
  const abertas = plano.vagas.filter((v) => v.status === "ABERTA");

  it("as abertas estão no portal: publicadas, prazo entre 10 e 20 dias, abertas nas últimas 3 semanas", () => {
    expect(abertas.length).toBeGreaterThanOrEqual(6);
    for (const v of abertas) {
      expect(v.isPublic).toBe(true);
      expect(situacaoNoPortal(v, AGORA)).toEqual({ publicada: true });
      const prazo = Math.round((v.applicationDeadline.getTime() - Date.parse("2026-10-14T00:00:00Z")) / DIA);
      expect(prazo).toBeGreaterThanOrEqual(10);
      expect(prazo).toBeLessThanOrEqual(20);
      expect(v.openedAt.getTime()).toBeLessThan(AGORA.getTime());
      expect(AGORA.getTime() - v.openedAt.getTime()).toBeLessThanOrEqual(21 * DIA);
      expect(v.publicDescription.length).toBeGreaterThan(80);
    }
  });

  it("uma encerrada, fora do portal", () => {
    const encerradas = plano.vagas.filter((v) => v.status === "ENCERRADA");
    expect(encerradas).toHaveLength(1);
    expect(encerradas[0]!.isPublic).toBe(false);
    expect(encerradas[0]!.closedAt).not.toBeNull();
    expect(situacaoNoPortal(encerradas[0]!, AGORA).publicada).toBe(false);
  });

  it("variedade: prioridades, quantidades de 1 a 3, salário mostrado e escondido, modalidades", () => {
    expect(new Set(plano.vagas.map((v) => v.priority))).toEqual(new Set(["BAIXA", "MEDIA", "ALTA"]));
    for (const v of plano.vagas) expect(v.quantity).toBeGreaterThanOrEqual(1);
    for (const v of plano.vagas) expect(v.quantity).toBeLessThanOrEqual(3);
    expect(abertas.some((v) => v.salaryMin !== null && v.showSalary)).toBe(true);
    expect(abertas.some((v) => v.salaryMin !== null && !v.showSalary)).toBe(true);
    expect(abertas.some((v) => v.salaryMin === null)).toBe(true);
    expect(new Set(plano.vagas.map((v) => v.workMode)).size).toBeGreaterThan(1);
  });

  it("requisitos válidos para o editor do Connect, com obrigatório e desejável; versões em ordem", () => {
    for (const v of plano.vagas) {
      v.requisitos.forEach((r, i) => {
        expect(r.versao).toBe(i + 1);
        const n = normalizarRequisitos({ itens: r.itens, corteCompativel: r.corteCompativel, corteParcial: r.corteParcial });
        expect(n).toEqual({ itens: r.itens, corteCompativel: r.corteCompativel, corteParcial: r.corteParcial });
        expect(r.itens.some((x) => x.tipo === "OBRIGATORIO")).toBe(true);
        expect(r.itens.some((x) => x.tipo === "DESEJAVEL")).toBe(true);
      });
    }
    expect(plano.vagas.some((v) => v.requisitos.length > 1)).toBe(true);
  });
});

describe("candidaturas", () => {
  const vaga = new Map(plano.vagas.map((v) => [v.chave, v]));
  const pessoa = new Map(plano.pessoas.map((p) => [p.chave, p]));

  it("uma por pessoa em cada vaga, sempre de candidato, depois de a vaga abrir", () => {
    const pares = plano.candidaturas.map((c) => `${c.vaga}|${c.pessoa}`);
    expect(new Set(pares).size).toBe(pares.length);
    for (const c of plano.candidaturas) {
      expect(pessoa.get(c.pessoa)?.type).toBe("CANDIDATO");
      expect(c.createdAt.getTime()).toBeGreaterThan(vaga.get(c.vaga)!.openedAt.getTime());
      expect(c.createdAt.getTime()).toBeLessThan(AGORA.getTime());
    }
  });

  it("todas as etapas, as quatro origens, reprovado e desistente com motivo", () => {
    expect(new Set(plano.candidaturas.map((c) => c.stage))).toEqual(new Set(["TRIAGEM", "ENTREVISTA", "TESTE", "PROPOSTA", "CONTRATADO"]));
    expect(new Set(plano.candidaturas.map((c) => c.origin))).toEqual(new Set(["PORTAL", "Indicação", "WhatsApp", "LinkedIn"]));
    for (const c of plano.candidaturas) {
      if (c.status === "REPROVADO") expect(c.rejectionReason).toBeTruthy();
      if (c.status === "DESISTENTE") expect(c.withdrawalReason).toBeTruthy();
    }
    expect(plano.candidaturas.some((c) => c.status === "REPROVADO")).toBe(true);
    expect(plano.candidaturas.some((c) => c.status === "DESISTENTE")).toBe(true);
  });

  it("contratados: 1 ou 2, e continuam candidatos — a demonstração não abre admissão", () => {
    const contratadas = plano.candidaturas.filter((c) => c.status === "CONTRATADO");
    expect(contratadas.length).toBeGreaterThanOrEqual(1);
    expect(contratadas.length).toBeLessThanOrEqual(2);
    for (const c of contratadas) {
      expect(c.stage).toBe("CONTRATADO");
      expect(c.hiredAt).not.toBeNull();
      const p = pessoa.get(c.pessoa)!;
      expect(p.type).toBe("CANDIDATO");
      expect(p.empresa).toBeNull();
    }
  });

  it("a nota é a que o Connect calcularia, na versão dos requisitos que ela aponta", () => {
    for (const c of plano.candidaturas) {
      for (const n of c.notas) {
        const req = vaga.get(c.vaga)!.requisitos.find((r) => r.versao === n.versao)!;
        expect(calcularNota(req, n.avaliacoes)).toMatchObject({ score: n.score, faixa: n.faixa });
        expect(n.avaliacoes.map((a) => a.requisitoId)).toEqual(req.itens.map((r) => r.id));
      }
    }
    const faixas = new Set(plano.candidaturas.map((c) => c.notas.at(-1)!.faixa));
    expect(faixas).toEqual(new Set(["COMPATIVEL", "PARCIAL", "INCOMPATIVEL"]));
  });

  it("a pontuação automática (IA) não pega nenhuma: toda candidatura já tem nota", () => {
    // O filtro do cron (`pontuarNovasCandidaturas`): em andamento, sem nenhuma nota.
    expect(plano.candidaturas.filter((c) => c.status === "EM_ANDAMENTO" && c.notas.length === 0)).toEqual([]);
    for (const c of plano.candidaturas) expect(c.notas.length).toBeGreaterThan(0);
  });

  it("uma nota fica desatualizada (versão antiga), para a tela mostrar", () => {
    const desatualizadas = plano.candidaturas.filter((c) => c.notas.at(-1)!.versao < vaga.get(c.vaga)!.requisitos.length);
    expect(desatualizadas.length).toBeGreaterThan(0);
  });

  it("respostas de pretensão, disponibilidade e deslocamento dentro das faixas do Connect, com a fonte", () => {
    for (const c of plano.candidaturas) {
      if (c.pretensaoSalarial !== null) expect(c.pretensaoSalarial).toBeGreaterThan(0);
      if (c.deslocamentoMinutos !== null) {
        expect(c.deslocamentoMinutos).toBeGreaterThanOrEqual(0);
        expect(c.deslocamentoMinutos).toBeLessThanOrEqual(600);
      }
      const campos = ["pretensaoSalarial", "disponibilidade", "deslocamentoMinutos"] as const;
      for (const campo of campos) expect(!!c.respostasFonte?.[campo]).toBe(c[campo] !== null);
    }
  });

  it("avaliações de entrevista: uma por avaliador em cada candidatura, notas de 1 a 5", () => {
    const chaves = plano.entrevistas.map((e) => `${e.candidatura}|${e.avaliador}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    const candidaturas = new Set(plano.candidaturas.map((c) => c.chave));
    for (const e of plano.entrevistas) {
      expect(candidaturas.has(e.candidatura)).toBe(true);
      for (const n of [e.comunicacao, e.tecnico, e.fitCultural, e.experiencia]) expect(n >= 1 && n <= 5).toBe(true);
    }
  });
});

describe("testes", () => {
  const perguntas = plano.questionario.perguntas.map((q, i) => ({ id: `q${i + 1}`, ...q }));

  it("DISC respondido: 24 blocos válidos, e a pontuação é a do Connect", () => {
    const disc = plano.testes.filter((t) => t.type === "DISC" && t.status === "RESPONDIDO");
    expect(disc.length).toBeGreaterThanOrEqual(2);
    for (const t of disc) {
      expect(validateDiscAnswers(t.disc!.answers)).not.toBeNull();
      const r = scoreDisc(t.disc!.answers);
      expect(t.disc).toMatchObject({ scores: r.scores, primaryProfile: r.primaryProfile, secondaryProfile: r.secondaryProfile });
    }
    // Perfis diferentes, um deles combinado.
    expect(new Set(disc.map((t) => t.disc!.primaryProfile)).size).toBe(disc.length);
    expect(disc.some((t) => t.disc!.secondaryProfile !== null)).toBe(true);
  });

  it("respostasDoDisc entrega exatamente as contagens pedidas", () => {
    const answers = respostasDoDisc({ D: 12, I: 6, S: 4, C: 2 }, { D: 1, I: 3, S: 8, C: 12 });
    const r = scoreDisc(answers);
    expect(r.scores.D).toMatchObject({ mais: 12, menos: 1, net: 11 });
    expect(r.scores.C).toMatchObject({ mais: 2, menos: 12, net: -10 });
    expect(validateDiscAnswers(answers)).not.toBeNull();
  });

  it("questionário: 10 perguntas com a certa entre as opções; respostas válidas e com erros", () => {
    for (const q of perguntas) {
      expect(q.options.length).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
    const respondidos = plano.testes.filter((t) => t.type === "MULTIPLA_ESCOLHA" && t.status === "RESPONDIDO");
    expect(respondidos.length).toBeGreaterThanOrEqual(1);
    expect(respondidos.length).toBeLessThanOrEqual(2);
    for (const t of respondidos) {
      const answers = perguntas.map((q, i) => ({ questionId: q.id, selectedIndex: t.escolhas![i]! }));
      expect(validateQuizAnswers(answers, perguntas)).toEqual(answers);
      const r = scoreQuiz(answers, perguntas);
      expect(r.correct).toBeLessThan(10);
      expect(r.correct).toBeGreaterThan(0);
    }
  });

  it("links: pendentes valendo 7 dias, um vencido, e o respondido antes de vencer", () => {
    for (const t of plano.testes) {
      expect(t.expiresAt.getTime() - t.createdAt.getTime()).toBe(7 * DIA);
      if (t.submittedAt) expect(t.submittedAt.getTime()).toBeLessThan(Math.min(t.expiresAt.getTime(), AGORA.getTime()));
    }
    const pendentes = plano.testes.filter((t) => t.status === "PENDENTE");
    expect(pendentes.filter((t) => t.expiresAt.getTime() > AGORA.getTime()).length).toBeGreaterThanOrEqual(1);
    expect(pendentes.filter((t) => t.expiresAt.getTime() > AGORA.getTime()).length).toBeLessThanOrEqual(2);
    expect(pendentes.filter((t) => t.expiresAt.getTime() <= AGORA.getTime())).toHaveLength(1);
  });

  it("cada teste é de uma candidatura da mesma pessoa", () => {
    const candidatura = new Map(plano.candidaturas.map((c) => [c.chave, c]));
    for (const t of plano.testes) expect(candidatura.get(t.candidatura)?.pessoa).toBe(t.pessoa);
  });
});

describe("colaboradores de clientes", () => {
  const colaboradores = plano.pessoas.filter((p) => p.type === "COLABORADOR");

  it("todas as situações, e números no resumo da empresa: admissões e desligamentos no mês", () => {
    expect(new Set(colaboradores.map((p) => p.employmentStatus))).toEqual(
      new Set(["ATIVO", "EM_FERIAS", "AFASTADO", "ADMISSAO_EM_ANDAMENTO", "DESLIGADO"])
    );
    for (const p of colaboradores) {
      expect(p.empresa).not.toBeNull();
      expect(p.cargo?.startsWith(`${p.empresa}.`)).toBe(true);
    }
    const r = resumoDaEmpresa(colaboradores, AGORA);
    expect(r.admissoesNoMes).toBeGreaterThan(0);
    expect(r.desligamentosNoMes).toBeGreaterThan(0);
    expect(r.ativos).toBeGreaterThan(0);
    expect(r.emFerias).toBeGreaterThan(0);
    expect(r.afastados).toBeGreaterThan(0);
    expect(r.admissoesEmAndamento).toBeGreaterThan(0);
  });

  it("no começo do mês, admissão e desligamento 'deste mês' não escapam para o mês anterior", () => {
    const dia1 = montarDemonstracao(new Date("2026-11-01T15:00:00.000Z"));
    const r = resumoDaEmpresa(dia1.pessoas.filter((p) => p.type === "COLABORADOR"), new Date("2026-11-01T15:00:00.000Z"));
    expect(r.admissoesNoMes).toBeGreaterThan(0);
    expect(r.desligamentosNoMes).toBeGreaterThan(0);
  });

  it("nenhum alerta de contrato de experiência (40, 45, 85 e 90 dias) nos próximos 20 dias", () => {
    const MARCOS = [40, 45, 85, 90];
    for (const p of colaboradores) {
      if (!p.admissionDate || (p.employmentStatus !== "ATIVO" && p.employmentStatus !== "ADMISSAO_EM_ANDAMENTO")) continue;
      for (let d = 0; d <= 20; d++) {
        const dias = Math.floor((Date.parse("2026-10-14T00:00:00Z") + d * DIA - p.admissionDate.getTime()) / DIA);
        expect(MARCOS).not.toContain(dias);
      }
    }
  });
});
