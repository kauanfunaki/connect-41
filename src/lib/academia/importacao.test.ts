import { describe, expect, it } from "vitest";
import { lerCsvDoHub, planejarImportacao, questaoDoHub, resultadoDoHub, resumoEmLinhas, textoDoHub, type PessoaDoConnect } from "./importacao";

// A importação do histórico do 41 Hub (10/11/2026), com CSVs de mentira no
// formato do `\copy … CSV HEADER` do Postgres. Pessoas e e-mails fictícios.

const TEXTOS = `id,language,content,difficulty,is_active,created_at
t1,pt,"O razão mostra cada lançamento, um a um.",1,t,2026-08-01 10:00:00.123456
t2,pt,"Texto ""com aspas""
e quebra de linha.",3,f,2026-08-02 10:00:00
t3,en,"English text",4,t,2026-08-03 10:00:00
t4,pt,,2,t,2026-08-04 10:00:00
`;

const QUESTOES = `id,language,question,image_url,options,correct_index,difficulty,is_active,created_at
q1,pt,Quanto é 2 + 2?,,"[""3"",""4"",""5""]",1,1,t,2026-08-01 10:00:00
q2,pt,Qual figura vem depois?,/api/uploads/figura.png,"[""A"",""B""]",0,5,t,2026-08-01 10:00:00
q3,pt,Quebrada,,"[""só uma""]",0,3,t,2026-08-01 10:00:00
q4,pt,Índice fora,,"[""a"",""b""]",2,3,t,2026-08-01 10:00:00
`;

const DIGITACAO = `id,user_id,month_key,wpm,accuracy,duration_ms,difficulty,level,created_at
s1,u1,2026-09,62,96.50,60000,3,medium,2026-09-10 12:00:00
s2,u2,2026-09,55,90.00,60000,1,,2026-09-11 12:00:00
s3,u9,2026-09,70,99.00,60000,5,hard,2026-09-12 12:00:00
s4,u1,2026-13,40,80.00,60000,3,medium,2026-09-12 12:00:00
`;

const LOGICA = `id,user_id,month_key,correct_count,total_questions,accuracy,duration_ms,difficulty,level,created_at
l1,u1,2026-10,8,10,80.00,120000,4,hard,2026-10-01 09:00:00
l2,u2,2026-10,11,10,110.00,120000,1,easy,2026-10-01 09:00:00
`;

const USUARIOS = `id,email
u1,Pessoa.Um@Exemplo.com
u2,pessoa.dois@exemplo.com
u9,sem.conta@exemplo.com
`;

const pessoas = new Map<string, PessoaDoConnect>([
  ["pessoa.um@exemplo.com", { id: "c1", sectorCode: "fiscal" }],
  ["pessoa.dois@exemplo.com", { id: "c2", sectorCode: null }],
]);
const nada = { textos: new Set<string>(), questoes: new Set<string>(), resultados: new Set<string>() };

function plano(jaImportados = nada) {
  return planejarImportacao({
    textos: lerCsvDoHub(TEXTOS), questoes: lerCsvDoHub(QUESTOES), digitacao: lerCsvDoHub(DIGITACAO), logica: lerCsvDoHub(LOGICA),
    usuariosDoHub: lerCsvDoHub(USUARIOS), pessoasPorEmail: pessoas, jaImportados,
  });
}

describe("ler os CSVs do Hub", () => {
  it("aspas dobradas e quebra de linha dentro do campo", () => {
    const linhas = lerCsvDoHub(TEXTOS);
    expect(linhas).toHaveLength(4);
    expect(linhas[1].content).toBe('Texto "com aspas"\ne quebra de linha.');
  });

  it("texto: nível pela dificuldade, ativo pelo t/f; fora do português ou vazio sai", () => {
    const [t1, t2, t3, t4] = lerCsvDoHub(TEXTOS).map(textoDoHub);
    expect(t1).toMatchObject({ origemHubId: "t1", nivel: "facil", ativo: true });
    expect(t2).toMatchObject({ nivel: "medio", ativo: false });
    expect(t3).toBeNull();
    expect(t4).toBeNull();
  });

  it("questão: opções viram alternativas; com imagem entra desligada e sem ela", () => {
    const [q1, q2, q3, q4] = lerCsvDoHub(QUESTOES).map(questaoDoHub);
    expect(q1).toMatchObject({ nivel: "facil", correta: 1, ativo: true, tinhaImagem: false, alternativas: [{ texto: "3" }, { texto: "4" }, { texto: "5" }] });
    expect(q2).toMatchObject({ nivel: "dificil", ativo: false, tinhaImagem: true });
    expect(q3).toBeNull();
    expect(q4).toBeNull();
  });

  it("resultado: o nível gravado ganha; sem ele, o da dificuldade; mês e precisão conferidos", () => {
    const [s1, s2, , s4] = lerCsvDoHub(DIGITACAO);
    const p = { id: "c1", sectorCode: "fiscal" };
    expect(resultadoDoHub("digitacao", s1, p)).toMatchObject({ origemHubId: "typing:s1", nivel: "medio", mes: "2026-09", ppm: 62, precisao: 96.5 });
    expect(resultadoDoHub("digitacao", s2, p)?.nivel).toBe("facil");
    expect(resultadoDoHub("digitacao", s4, p)).toBeNull();
    const r = resultadoDoHub("digitacao", s1, p);
    expect(r?.createdAt.toISOString()).toBe("2026-09-10T12:00:00.000Z");
    const [l1, l2] = lerCsvDoHub(LOGICA);
    expect(resultadoDoHub("logica", l1, p)).toMatchObject({ origemHubId: "logic:l1", nivel: "dificil", acertos: 8, total: 10, ppm: null });
    expect(resultadoDoHub("logica", l2, p)).toBeNull();
  });
});

describe("o plano", () => {
  it("casa pelo e-mail sem diferença de maiúscula; quem não casa só conta", () => {
    const { resultados, resumo } = plano();
    expect(resultados.map((r) => [r.origemHubId, r.userId, r.sectorCode])).toEqual([
      ["typing:s1", "c1", "fiscal"],
      ["typing:s2", "c2", null],
      ["logic:l1", "c1", "fiscal"],
    ]);
    expect(resumo.resultados).toEqual({ novos: 3, jaImportados: 0, descartados: 2, semPessoa: 1 });
    expect(resumo.emailsSemPessoa).toBe(1);
    expect(resumo.textos).toEqual({ novos: 2, jaImportados: 0, descartados: 2 });
    expect(resumo.questoes).toEqual({ novas: 2, jaImportadas: 0, descartadas: 2, comImagem: 1 });
  });

  it("rodar de novo não duplica: o que já tem origemHubId fica de fora", () => {
    const { textos, questoes, resultados, resumo } = plano({
      textos: new Set(["t1", "t2"]), questoes: new Set(["q1", "q2"]), resultados: new Set(["typing:s1", "typing:s2", "logic:l1"]),
    });
    expect([textos.length, questoes.length, resultados.length]).toEqual([0, 0, 0]);
    expect(resumo.resultados.jaImportados).toBe(3);
  });

  it("o resumo do terminal não tem e-mail nem nome — só números", () => {
    const texto = resumoEmLinhas(plano().resumo).join("\n");
    expect(texto).not.toMatch(/@|exemplo\.com|pessoa\.(um|dois)|sem\.conta|\bu[129]\b|\bc[12]\b/i);
    expect(texto).toMatch(/E-mails do Hub sem pessoa da equipe no Connect: 1\./);
  });
});
