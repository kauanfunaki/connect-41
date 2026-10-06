import { describe, expect, it } from "vitest";
import {
  casarEmpresa,
  casarMembro,
  cartaoQueNaoEProcesso,
  cartoesJaImportados,
  criadoEm,
  empresasParecidas,
  escolherResponsavel,
  etapasDaFase,
  faseDaLista,
  indexarEmpresas,
  lerQuadro,
  lerTitulo,
  lerVinculos,
  mascararSenhas,
  montarObservacoes,
  normalizarNome,
  planejarImportacao,
  situacaoDaFase,
  tipoDoAssunto,
  tituloDoAssunto,
  LIMITE_DAS_OBSERVACOES,
  type CartaoDoTrello,
  type ContextoDoEscritorio,
  type EmpresaParaCasar,
  type EtapaDoModelo,
  type ModeloDoTipo,
  type QuadroDoTrello,
  type UsuarioParaCasar,
} from "./importar-trello";

// Tudo aqui é inventado — nomes, CNPJs e pessoas. O export real tem dado de
// cliente e não entra no repositório.

const empresa = (over: Partial<EmpresaParaCasar> & { id: string; name: string }): EmpresaParaCasar => ({
  displayName: null,
  tradeName: null,
  cnpj: null,
  parentCompanyId: null,
  ...over,
});

const EMPRESAS = [
  empresa({ id: "lumen", name: "LUMEN COMÉRCIO DE PEÇAS LTDA", cnpj: "11.222.333/0001-81" }),
  empresa({ id: "lumen-f2", name: "LUMEN COMÉRCIO DE PEÇAS LTDA", cnpj: "11.222.333/0002-62", parentCompanyId: "lumen" }),
  empresa({ id: "lumen-f4", name: "LUMEN COMÉRCIO DE PEÇAS LTDA", cnpj: "11.222.333/0004-24", parentCompanyId: "lumen" }),
  empresa({ id: "vento", name: "VENTO SUL TRANSPORTES EIRELI", cnpj: "22333444000150" }),
  empresa({ id: "cec", name: "C&C ADMINISTRADORA DE BENS S.A.", cnpj: "33.444.555/0001-09" }),
  empresa({ id: "pinho", name: "PINHO NOVO LOGISTICA LTDA - ME", tradeName: "PINHEIRAL", cnpj: "44.555.666/0001-20" }),
  // Dois clientes diferentes com o mesmo nome curto.
  empresa({ id: "aurora-a", name: "AURORA SERVIÇOS LTDA", cnpj: "55.666.777/0001-30" }),
  empresa({ id: "aurora-b", name: "AURORA SERVIÇOS LTDA", cnpj: "66.777.888/0001-40" }),
  empresa({ id: "mei", name: "12.345.678 JOANA PEREIRA DIAS", cnpj: "12.345.678/0001-90" }),
  empresa({ id: "dont", name: "DON'T PARE LOGISTICA LTDA", cnpj: "77.888.999/0001-50" }),
];
const indice = indexarEmpresas(EMPRESAS);

describe("normalizarNome", () => {
  it("tira acento, pontuação e o tipo societário do fim", () => {
    expect(normalizarNome("Lumen Comércio de Peças Ltda.")).toBe("LUMEN COMERCIO DE PECAS");
    expect(normalizarNome("PINHO NOVO LOGISTICA LTDA - ME")).toBe("PINHO NOVO LOGISTICA");
    expect(normalizarNome("Vento Sul Transportes EIRELI")).toBe("VENTO SUL TRANSPORTES");
  });

  it("S.A. e S/A somem; & vira E", () => {
    expect(normalizarNome("C&C ADMINISTRADORA DE BENS S.A.")).toBe("C E C ADMINISTRADORA DE BENS");
    expect(normalizarNome("C & C Administradora de Bens S/A")).toBe("C E C ADMINISTRADORA DE BENS");
  });

  it("tira MATRIZ, FILIAL 04 e o número do MEI", () => {
    expect(normalizarNome("LUMEN COMERCIO DE PECAS MATRIZ")).toBe("LUMEN COMERCIO DE PECAS");
    expect(normalizarNome("LUMEN FILIAL 04")).toBe("LUMEN");
    expect(normalizarNome("12.345.678 JOANA PEREIRA DIAS")).toBe("JOANA PEREIRA DIAS");
  });

  it("apóstrofo não separa a palavra", () => {
    expect(normalizarNome("DON'T PARE")).toBe(normalizarNome("DONT PARE"));
  });

  it("ME no meio do nome fica — só sai do fim", () => {
    expect(normalizarNome("ME AJUDA SERVICOS LTDA")).toBe("ME AJUDA SERVICOS");
  });
});

describe("lerTitulo", () => {
  it("separa empresa, assunto e número interno no padrão do quadro", () => {
    const t = lerTitulo("VENTO SUL TRANSPORTES | Alteração QSA (2198)");
    expect(t.empresa).toBe("VENTO SUL TRANSPORTES");
    expect(t.assunto).toBe("Alteração QSA (2198)");
    expect(t.numeroInterno).toBe("2198");
  });

  it("aceita dois números e o separador com traço", () => {
    expect(lerTitulo("LUMEN | Inclusão CNAE e Abertura Filial (2010 e 2388)").numeroInterno).toBe("2010 e 2388");
    const t = lerTitulo("PINHO NOVO - Baixa");
    expect(t.empresa).toBe("PINHO NOVO");
    expect(t.assunto).toBe("Baixa");
  });

  it("acha o CNPJ, a filial e tira o parêntese do nome da empresa", () => {
    const t = lerTitulo("LUMEN FILIAL 04 (cliente novo) | Alteração de endereço 11.222.333/0004-24");
    expect(t.empresa).toBe("LUMEN FILIAL 04");
    expect(t.filial).toBe(4);
    expect(t.cnpjs).toEqual(["11222333000424"]);
  });

  it("sem separador, o título inteiro é empresa e assunto", () => {
    const t = lerTitulo("DESENQUADRAMENTO EMPRESA FULANO");
    expect(t.empresa).toBe(t.assunto);
  });
});

describe("cartaoQueNaoEProcesso", () => {
  it("separa modelo e teste", () => {
    expect(cartaoQueNaoEProcesso("MODELO CHECK LIST ALTERAÇÃO")).toBe("modelo");
    expect(cartaoQueNaoEProcesso("TESTE")).toBe("teste");
    expect(cartaoQueNaoEProcesso(")")).toBe("teste");
    expect(cartaoQueNaoEProcesso("FULANO - TAREFA ERRO")).toBe("teste");
    expect(cartaoQueNaoEProcesso("VENTO SUL | Constituição")).toBeNull();
  });
});

describe("tipoDoAssunto", () => {
  const tipo = (a: string) => tipoDoAssunto(a)?.codigo ?? null;

  it("os atos do setor", () => {
    expect(tipo("Constituição (2499)")).toBe("constituicao");
    expect(tipo("ABERTURA (2358)")).toBe("constituicao");
    expect(tipo("Alteração QSA (1945)")).toBe("alteracao_contratual");
    expect(tipo("Inclusão CNAE")).toBe("alteracao_contratual");
    expect(tipo("Transformação Ltda (2296)")).toBe("alteracao_contratual");
    expect(tipo("Baixa (2429)")).toBe("baixa");
    expect(tipo("Distrato Social")).toBe("baixa");
    expect(tipo("Renovação Bombeiros")).toBe("alvara");
    expect(tipo("Licenciamento")).toBe("alvara");
    expect(tipo("Registro ANTT")).toBe("alvara");
    expect(tipo("Incorporação da controlada")).toBe("reorganizacao_societaria");
  });

  it("filial nova é alteração, não constituição", () => {
    expect(tipo("Abertura de Filial em Cidade/SC (2321)")).toBe("alteracao_contratual");
    expect(tipo("Constituição Filial ES")).toBe("alteracao_contratual");
  });

  it("vale o ato escrito primeiro", () => {
    expect(tipo("Alteração QSA e Baixa Filial")).toBe("alteracao_contratual");
    expect(tipo("Baixa Filial MS e Alteração QSA")).toBe("baixa");
  });

  it("baixa de inscrição é regularização, não baixa da empresa", () => {
    expect(tipo("Baixa Inscrição Estadual e Solicitação Enquadramento")).toBe("regularizacao");
  });

  it("cadastro que começa com 'Alteração' é demanda avulsa", () => {
    expect(tipoDoAssunto("Alteração Usuário Principal ISS")).toEqual({ codigo: "regularizacao", avulsa: true });
    expect(tipoDoAssunto("Alteração de Responsabilidade Técnica CREA-PR")).toEqual({ codigo: "regularizacao", avulsa: true });
  });

  it("senha, acesso e procuração viram regularização marcada como avulsa", () => {
    expect(tipoDoAssunto("Senha Posto Fiscal SP")).toEqual({ codigo: "regularizacao", avulsa: true });
    expect(tipoDoAssunto("Procuração e-CAC")).toEqual({ codigo: "regularizacao", avulsa: true });
    expect(tipoDoAssunto("Reativação IE")).toEqual({ codigo: "regularizacao", avulsa: false });
  });

  it("sem palavra conhecida, sem tipo", () => {
    expect(tipoDoAssunto("JANEIRO/2026")).toBeNull();
    expect(tipoDoAssunto("Distrato prestação serviços contábeis")).toBeNull();
  });
});

describe("faseDaLista e situacaoDaFase", () => {
  it("cada lista do quadro tem fase", () => {
    expect(faseDaLista("INICIAR")).toBe("INICIO");
    expect(faseDaLista("VERIFICAÇÕES INICIAIS")).toBe("VERIFICACAO");
    expect(faseDaLista("VIABILIDADE")).toBe("VIABILIDADE");
    expect(faseDaLista("ELABORAÇÃO MINUTA")).toBe("MINUTA");
    expect(faseDaLista("MINUTA EM VALIDAÇÃO INTERNA")).toBe("MINUTA");
    expect(faseDaLista("VALIDAÇÃO DO CLIENTE")).toBe("VALIDACAO_CLIENTE");
    expect(faseDaLista("AGUARDANDO ASSINATURA")).toBe("ASSINATURA");
    expect(faseDaLista("EM ANÁLISE COM ÓRGÃO")).toBe("ORGAO");
    expect(faseDaLista("DEMANDAS INTERNAS (APÓS REGISTRO)")).toBe("POS_REGISTRO");
    expect(faseDaLista("LICENCIAMENTO")).toBe("LICENCIAMENTO");
    expect(faseDaLista("CONCLUÍDOS")).toBe("CONCLUIDO");
    expect(faseDaLista("ARQUIVADO")).toBe("ARQUIVADO");
    expect(faseDaLista("DEMAIS CADASTROS")).toBeNull();
  });

  it("validação e assinatura esperam o cliente, com motivo nosso", () => {
    expect(situacaoDaFase("VALIDACAO_CLIENTE", false)).toEqual({ status: "AGUARDANDO_CLIENTE", motivo: "Validação da minuta pelo cliente" });
    expect(situacaoDaFase("ASSINATURA", false)).toEqual({ status: "AGUARDANDO_CLIENTE", motivo: "Assinatura do cliente" });
    expect(situacaoDaFase("ORGAO", false)).toEqual({ status: "EM_ANDAMENTO", motivo: null });
  });

  it("arquivado é cancelado, a não ser que estivesse marcado como feito", () => {
    expect(situacaoDaFase("ARQUIVADO", false).status).toBe("CANCELADO");
    expect(situacaoDaFase("ARQUIVADO", true)).toEqual({ status: "CONCLUIDO", motivo: null });
    expect(situacaoDaFase("CONCLUIDO", false).status).toBe("CONCLUIDO");
  });
});

// O roteiro de registro do seed, com ids inventados.
const REGISTRO: EtapaDoModelo[] = [
  { id: "r1", position: 1, label: "Reunir documentação", organId: null },
  { id: "r2", position: 2, label: "Viabilidade", organId: "junta" },
  { id: "r3", position: 3, label: "Elaboração da minuta", organId: null },
  { id: "r4", position: 4, label: "Sistemas da Junta", organId: "junta" },
  { id: "r5", position: 5, label: "Sistemas da Receita", organId: "rfb" },
  { id: "r6", position: 6, label: "Acompanhamento do registro", organId: "junta" },
  { id: "r7", position: 7, label: "Licenciamentos, cadastros, senhas e vínculos", organId: null },
  { id: "r8", position: 8, label: "Procurações Receita Federal", organId: null },
  { id: "r9", position: 9, label: "Cadastro e comunicação interna", organId: null },
  { id: "r10", position: 10, label: "Envio de documentação ao cliente", organId: null },
];
const ALVARA: EtapaDoModelo[] = [
  { id: "a1", position: 1, label: "Reunir informações da empresa, atividade e imóvel", organId: null },
  { id: "a2", position: 2, label: "Emissão da taxa / protocolo", organId: "pm" },
  { id: "a3", position: 3, label: "Qual licença é necessária?", organId: null },
  { id: "a4", position: 4, label: "Corpo de Bombeiros", organId: "cb" },
  { id: "a5", position: 4, label: "Meio Ambiente", organId: "ma" },
  { id: "a6", position: 4, label: "Vigilância Sanitária", organId: "visa" },
  { id: "a7", position: 5, label: "Acompanhamento até deferimento", organId: null },
  { id: "a8", position: 6, label: "Cadastro / comunicação interna", organId: null },
  { id: "a9", position: 7, label: "Envio ao cliente", organId: null },
];

const statusDe = (roteiro: EtapaDoModelo[], fase: Parameters<typeof etapasDaFase>[1]) => {
  const p = etapasDaFase(roteiro, fase);
  return roteiro.map((e) => p.status.get(e.id));
};

describe("etapasDaFase", () => {
  it("INICIAR: nada começou", () => {
    expect(statusDe(REGISTRO, "INICIO").every((s) => s === "PENDENTE")).toBe(true);
  });

  it("viabilidade: a documentação ficou para trás, a viabilidade está em andamento", () => {
    expect(statusDe(REGISTRO, "VIABILIDADE").slice(0, 3)).toEqual(["CONCLUIDA", "EM_ANDAMENTO", "PENDENTE"]);
  });

  it("assinatura: a minuta está feita, a etapa seguinte em andamento", () => {
    expect(statusDe(REGISTRO, "ASSINATURA").slice(2, 5)).toEqual(["CONCLUIDA", "EM_ANDAMENTO", "PENDENTE"]);
  });

  it("em análise no órgão: acompanhamento do registro, com o protocolo aguardando na Junta", () => {
    const p = etapasDaFase(REGISTRO, "ORGAO");
    expect(p.status.get("r5")).toBe("CONCLUIDA");
    expect(p.status.get("r6")).toBe("EM_ANDAMENTO");
    expect(p.status.get("r7")).toBe("PENDENTE");
    expect(p.protocolo).toEqual({ templateStepId: "r6", organId: "junta" });
  });

  it("licenciamento no registro cai na etapa 7", () => {
    expect(statusDe(REGISTRO, "LICENCIAMENTO").slice(5, 8)).toEqual(["CONCLUIDA", "EM_ANDAMENTO", "PENDENTE"]);
  });

  it("licenciamento no alvará abre as três licenças juntas", () => {
    expect(statusDe(ALVARA, "LICENCIAMENTO")).toEqual([
      "CONCLUIDA",
      "CONCLUIDA",
      "CONCLUIDA",
      "EM_ANDAMENTO",
      "EM_ANDAMENTO",
      "EM_ANDAMENTO",
      "PENDENTE",
      "PENDENTE",
      "PENDENTE",
    ]);
  });

  it("órgão no alvará: acompanhamento sem órgão, então sem protocolo", () => {
    const p = etapasDaFase(ALVARA, "ORGAO");
    expect(p.status.get("a7")).toBe("EM_ANDAMENTO");
    expect(p.protocolo).toBeNull();
  });

  it("roteiro sem a etapa da fase fica na primeira, marcado como aproximado", () => {
    const p = etapasDaFase([{ id: "x1", position: 1, label: "Fazer", organId: null }], "MINUTA");
    expect(p.aproximada).toBe(true);
    expect(p.status.get("x1")).toBe("EM_ANDAMENTO");
  });

  it("concluído: tudo feito", () => {
    expect(statusDe(REGISTRO, "CONCLUIDO").every((s) => s === "CONCLUIDA")).toBe(true);
  });
});

describe("casarEmpresa", () => {
  const casar = (titulo: string, desc = "") => casarEmpresa(lerTitulo(titulo), desc, indice);

  it("pelo CNPJ do título, antes de tudo", () => {
    expect(casar("QUALQUER NOME | Alteração 11.222.333/0002-62")).toEqual({ empresaId: "lumen-f2", como: "cnpj" });
  });

  it("pelo nome igual depois de normalizar, inclusive o fantasia", () => {
    expect(casar("VENTO SUL TRANSPORTES | Baixa")).toEqual({ empresaId: "vento", como: "nome" });
    expect(casar("C & C ADMINISTRADORA DE BENS | Alteração")).toEqual({ empresaId: "cec", como: "nome" });
    expect(casar("PINHEIRAL | Alteração")).toEqual({ empresaId: "pinho", como: "nome" });
    expect(casar("JOANA PEREIRA DIAS | Transformação Ltda")).toEqual({ empresaId: "mei", como: "nome" });
    expect(casar("DONT PARE LOGISTICA | Alteração")).toEqual({ empresaId: "dont", como: "nome" });
  });

  it("matriz e filiais com o mesmo nome: vai a matriz, ou a filial que o título disser", () => {
    expect(casar("LUMEN COMERCIO DE PECAS | Alteração")).toEqual({ empresaId: "lumen", como: "nome" });
    expect(casar("LUMEN COMERCIO DE PECAS FILIAL 04 | Alteração")).toEqual({ empresaId: "lumen-f4", como: "nome" });
  });

  it("filial ainda sem CNPJ conta como do cliente da matriz, não como outro cliente", () => {
    const comFilialNova = indexarEmpresas([
      empresa({ id: "sol", name: "SOL NASCENTE COMERCIO LTDA", cnpj: "88.999.000/0001-10" }),
      empresa({ id: "sol-nova", name: "SOL NASCENTE COMERCIO LTDA", cnpj: null, parentCompanyId: "sol" }),
    ]);
    expect(casarEmpresa(lerTitulo("SOL NASCENTE COMERCIO | Alteração"), "", comFilialNova)).toEqual({ empresaId: "sol", como: "nome" });
  });

  it("começo do nome casa quando só uma raiz de CNPJ começa assim", () => {
    expect(casar("LUMEN COMÉRCIO | Alteração Endereço")).toEqual({ empresaId: "lumen", como: "prefixo" });
    expect(casar("PINHO NOVO | Baixa")).toEqual({ empresaId: "pinho", como: "prefixo" });
  });

  it("nunca por aproximação duvidosa", () => {
    // Mesmo nome em dois CNPJs diferentes.
    expect(casar("AURORA SERVIÇOS | Alteração").empresaId).toBeNull();
    // Começo de uma palavra só, mesmo batendo com uma empresa só.
    expect(casar("C | Alteração").empresaId).toBeNull();
    expect(casar("LUMEN | Alteração").empresaId).toBeNull();
    expect(casar("VENTO | Alteração").empresaId).toBeNull();
    // Parecido não é igual.
    expect(casar("VENTO NORTE TRANSPORTES | Baixa").empresaId).toBeNull();
    // O nome entre parênteses não é usado.
    expect(casar("FULANO DE TAL (VENTO SUL TRANSPORTES) | Baixa").empresaId).toBeNull();
  });

  it("constituição só casa por CNPJ ou nome igual — o título é o nome da empresa nova", () => {
    const t = lerTitulo("VENTO SUL | Constituição");
    // "VENTO SUL" é o começo de "VENTO SUL TRANSPORTES", mas a constituição é de outra empresa.
    expect(casarEmpresa(t, "", indice, true).empresaId).toBeNull();
    expect(casarEmpresa(t, "", indice, false)).toEqual({ empresaId: "vento", como: "prefixo" });
    expect(casarEmpresa(lerTitulo("VENTO SUL TRANSPORTES | Constituição"), "", indice, true)).toEqual({ empresaId: "vento", como: "nome" });
    // Nem pelo CNPJ da descrição, que costuma ser o da empresa que já existe.
    expect(casarEmpresa(lerTitulo("VENTO SUL LOG | Constituição"), "Mesmo endereço da 22.333.444/0001-50", indice, true).empresaId).toBeNull();
  });

  it("parecidas só sugerem, uma por raiz de CNPJ, a matriz primeiro", () => {
    expect(empresasParecidas(lerTitulo("LUMEN | Alteração"), indice).map((e) => e.id)).toEqual(["lumen"]);
    expect(empresasParecidas(lerTitulo("AURORA | Alteração"), indice).map((e) => e.id).sort()).toEqual(["aurora-a", "aurora-b"]);
    expect(empresasParecidas(lerTitulo("GRUPO LUMEN | Levantamento"), indice)).toEqual([]);
  });

  it("pelo CNPJ da descrição só se a primeira palavra do nome bater", () => {
    expect(casar("VENTO SUL LOG | Alteração", "Empresa CNPJ 22.333.444/0001-50")).toEqual({
      empresaId: "vento",
      como: "cnpj_da_descricao",
    });
    // CNPJ de sócio pessoa jurídica, de outro nome: fica sem empresa.
    expect(casar("OUTRA COISA | Alteração", "Sócia: 22.333.444/0001-50").empresaId).toBeNull();
  });
});

const usuario = (over: Partial<UsuarioParaCasar> & { id: string; name: string }): UsuarioParaCasar => ({
  email: `${over.id}@exemplo.invalido`,
  doSetor: true,
  coordenador: false,
  ...over,
});
const USUARIOS = [
  usuario({ id: "u-bia", name: "Beatriz Fontes Moraes" }),
  usuario({ id: "u-carla", name: "Carla Ribeiro", coordenador: true }),
  usuario({ id: "u-dani", name: "Daniela Souza", doSetor: false }),
  usuario({ id: "u-eva1", name: "Eva Lima" }),
  usuario({ id: "u-eva2", name: "Eva Lima" }),
];

describe("casarMembro e escolherResponsavel", () => {
  const membro = (fullName: string) => ({ id: "m", fullName, username: "x" });

  it("nome igual, sem acento e sem caixa", () => {
    expect(casarMembro(membro("CARLA RIBEIRO"), USUARIOS)?.id).toBe("u-carla");
  });

  it("todas as palavras de um dentro do outro", () => {
    expect(casarMembro(membro("Beatriz Moraes"), USUARIOS)?.id).toBe("u-bia");
    expect(casarMembro(membro("Carla Mendes Ribeiro"), USUARIOS)?.id).toBe("u-carla");
  });

  it("nome solto, homônimo ou conta genérica não casam", () => {
    expect(casarMembro(membro("Beatriz"), USUARIOS)).toBeNull();
    expect(casarMembro(membro("Eva Lima"), USUARIOS)).toBeNull();
    expect(casarMembro(membro("gerencia"), USUARIOS)).toBeNull();
  });

  it("usuário cadastrado pelo apelido casa com o usuário do Trello e o primeiro nome juntos", () => {
    const comApelido = [...USUARIOS, usuario({ id: "u-lili", name: "Lili" })];
    expect(casarMembro({ id: "m", fullName: "LILIAN PRADO", username: "lili_prado" }, comApelido)?.id).toBe("u-lili");
    // Só o usuário do Trello, sem o primeiro nome começar igual: não.
    expect(casarMembro({ id: "m", fullName: "Joana Prado", username: "lili_prado" }, comApelido)).toBeNull();
    // Só o primeiro nome, sem o usuário do Trello: não.
    expect(casarMembro({ id: "m", fullName: "Lili Prado", username: "joana99" }, comApelido)).toBeNull();
  });

  it("responsável é do setor, e entre duas, a que executa", () => {
    const [bia, carla, dani] = USUARIOS;
    expect(escolherResponsavel([carla, bia])).toBe("u-bia");
    expect(escolherResponsavel([carla])).toBe("u-carla");
    expect(escolherResponsavel([dani])).toBeNull();
    expect(escolherResponsavel([null])).toBeNull();
  });
});

describe("observações", () => {
  it("senha, login e código de acesso escritos no cartão não vêm — a linha inteira sai", () => {
    const omitida = "(linha com senha ou acesso omitida — ver no cartão do Trello)";
    expect(mascararSenhas("Consulta AFU 123 e a senha: 9X8Y7Z")).toBe(omitida);
    expect(mascararSenhas("Senha Prefeitura: QW12ER34")).toBe(omitida);
    expect(mascararSenhas("Login: 111.222.333-44")).toBe(omitida);
    expect(mascararSenhas("Xy@z#2024 (com X maiúsculo) – SENHA GOV")).toBe(omitida);
    expect(mascararSenhas("Código de acesso criado e salvo na pasta (123456789012)")).toBe(omitida);
    expect(mascararSenhas("antes\nSenha: abc123!\ndepois")).toBe(`antes\n${omitida}\ndepois`);
  });

  it("falar de senha sem o valor fica", () => {
    expect(mascararSenhas("Conferir senha ISS da prefeitura")).toBe("Conferir senha ISS da prefeitura");
    expect(mascararSenhas("Senha ISS salva na pasta e no sistema.")).toBe("Senha ISS salva na pasta e no sistema.");
    expect(mascararSenhas("HABILITAR EMPRESA: nesse campo fazer o login")).toBe("HABILITAR EMPRESA: nesse campo fazer o login");
  });

  it("o link do cartão é a marca de importado", () => {
    expect(cartoesJaImportados(["Importado do Trello em 01/10/2026 — https://trello.com/c/AbC12345\nCartão: x", null, "nada"])).toEqual(
      new Set(["AbC12345"])
    );
  });

  it("monta descrição, checklist e comentários, e corta no limite do TEXT", () => {
    const texto = montarObservacoes({
      cartao: cartao({ desc: "**Pedido veio pelo cliente**\n\\- incluir CNAE", attachments: 3 }),
      lista: "VIABILIDADE",
      titulo: lerTitulo("VENTO SUL | Alteração (2001)"),
      membros: ["Beatriz Moraes"],
      checklists: [{ idCard: "c1", name: "Checklist", pos: 1, itens: [{ nome: "Criar pasta", feito: true, pos: 1 }, { nome: "Minuta", feito: false, pos: 2 }] }],
      comentarios: [{ idCard: "c1", data: "2026-10-01T15:00:00.000Z", autor: "Beatriz Moraes", texto: "Protocolado." }],
      prazoVencido: null,
      importadoEm: new Date("2026-10-06T15:00:00Z"),
    });
    expect(texto.split("\n")[0]).toBe("Importado do Trello em 06/10/2026 — https://trello.com/c/AbCd1234");
    expect(texto).toContain("nº interno 2001");
    expect(texto).toContain("Anexos no Trello: 3");
    expect(texto).toContain("Pedido veio pelo cliente\n- incluir CNAE");
    expect(texto).toContain("[x] Criar pasta\n[ ] Minuta");
    expect(texto).toContain("01/10/2026 Beatriz Moraes: Protocolado.");

    const enorme = montarObservacoes({
      cartao: cartao({ desc: "ção ".repeat(30_000) }),
      lista: "INICIAR",
      titulo: lerTitulo("X | Baixa"),
      membros: [],
      checklists: [],
      comentarios: [],
      prazoVencido: null,
      importadoEm: new Date(),
    });
    expect(Buffer.byteLength(enorme, "utf8")).toBeLessThanOrEqual(LIMITE_DAS_OBSERVACOES);
    expect(enorme).toContain("trello.com/c/AbCd1234");
  });

  it("título só com o ato, sem número interno nem recado", () => {
    expect(tituloDoAssunto("Abertura Filial Cidade/RS (2428) | Processo Urgente")).toBe("Abertura Filial Cidade/RS");
  });
});

describe("lerVinculos", () => {
  it("empresa, ignorar, tipo e erros", () => {
    const { vinculos, erros } = lerVinculos(
      [
        "# resolvidos à mão",
        "AbCd1234;22.333.444/0001-50",
        "EfGh5678;ignorar",
        "IjKl9012;;alvara",
        "MnOp3456;123",
        "QrSt7890;;inventado",
      ].join("\n")
    );
    expect(vinculos.get("AbCd1234")).toEqual({ ignorar: false, cnpj: "22333444000150", tipo: null });
    expect(vinculos.get("EfGh5678")).toEqual({ ignorar: true });
    expect(vinculos.get("IjKl9012")).toEqual({ ignorar: false, cnpj: null, tipo: "alvara" });
    expect(erros).toHaveLength(2);
  });
});

describe("criadoEm", () => {
  it("lê o instante de criação do id do cartão", () => {
    expect(criadoEm("68b9a1c00000000000000000")?.toISOString()).toBe("2025-09-04T14:27:12.000Z");
  });
});

// ─── O plano inteiro ─────────────────────────────────────────────────────────

function cartao(over: Partial<CartaoDoTrello> = {}): CartaoDoTrello {
  return {
    id: "68b9a1c00000000000000001",
    shortLink: "AbCd1234",
    name: "VENTO SUL TRANSPORTES | Alteração QSA (2001)",
    desc: "",
    closed: false,
    idList: "l-viab",
    idMembers: [],
    due: null,
    dateLastActivity: "2026-09-20T12:00:00.000Z",
    dateCompleted: null,
    attachments: 0,
    ...over,
  };
}

const modelo = (codigo: string, roteiro: EtapaDoModelo[]): ModeloDoTipo => ({
  typeId: `t-${codigo}`,
  templateId: `tpl-${codigo}`,
  nome: codigo,
  roteiro,
});

function contexto(over: Partial<ContextoDoEscritorio> = {}): ContextoDoEscritorio {
  return {
    empresas: indice,
    usuarios: USUARIOS,
    modelos: new Map([
      ["alteracao_contratual", modelo("alteracao_contratual", REGISTRO)],
      ["constituicao", modelo("constituicao", REGISTRO)],
      ["baixa", modelo("baixa", REGISTRO)],
    ]),
    jaImportados: new Set(),
    vinculos: new Map(),
    ...over,
  };
}

function quadro(cartoes: CartaoDoTrello[]): QuadroDoTrello {
  return {
    nome: "PROCESSOS",
    listas: [
      { id: "l-viab", name: "VIABILIDADE", closed: false },
      { id: "l-ass", name: "AGUARDANDO ASSINATURA", closed: false },
      { id: "l-conc", name: "CONCLUÍDOS", closed: false },
      { id: "l-arq", name: "ARQUIVADO", closed: false },
      { id: "l-velha", name: "DEMAIS CADASTROS", closed: true },
    ],
    cartoes,
    membros: [
      { id: "m-bia", fullName: "Beatriz Moraes", username: "bia" },
      { id: "m-carla", fullName: "Carla Ribeiro", username: "carla" },
    ],
    checklists: [],
    comentarios: [],
    movimentos: [{ idCard: "68b9a1c00000000000000003", data: "2026-09-15T12:00:00.000Z", paraLista: "l-conc" }],
  };
}

const AGORA = new Date("2026-10-06T15:00:00Z");
const OPCOES = { concluidos: false, arquivados: false, prazosVencidos: false, tituloDoCartao: false, agora: AGORA };

describe("planejarImportacao", () => {
  it("cartão aberto vira processo na etapa da lista, com responsável e sem texto do Trello no título", () => {
    const p = planejarImportacao(quadro([cartao({ idMembers: ["m-carla", "m-bia"] })]), contexto(), OPCOES);
    expect(p.fora).toEqual([]);
    const [proc] = p.processos;
    expect(proc.empresaId).toBe("vento");
    expect(proc.tipo.codigo).toBe("alteracao_contratual");
    expect(proc.status).toBe("EM_ANDAMENTO");
    expect(proc.responsavelId).toBe("u-bia");
    expect(proc.titulo).toBeNull();
    expect(proc.motivo).toBeNull();
    expect(proc.etapas.status.get("r2")).toBe("EM_ANDAMENTO");
    expect(proc.startedAt.toISOString()).toBe("2025-09-04T14:27:12.000Z");
    expect(proc.notas).toContain("https://trello.com/c/AbCd1234");
  });

  it("aguardando assinatura espera o cliente, desde a última atividade", () => {
    const [proc] = planejarImportacao(quadro([cartao({ idList: "l-ass" })]), contexto(), OPCOES).processos;
    expect(proc.status).toBe("AGUARDANDO_CLIENTE");
    expect(proc.motivo).toBe("Assinatura do cliente");
    expect(proc.statusChangedAt?.toISOString()).toBe("2026-09-20T12:00:00.000Z");
  });

  it("concluídos e arquivados só entram com as opções", () => {
    const cartoes = [
      cartao({ id: "68b9a1c00000000000000003", shortLink: "Conc0001", idList: "l-conc", dateCompleted: "2026-09-16T10:00:00.000Z" }),
      cartao({ id: "68b9a1c00000000000000004", shortLink: "Arq00001", idList: "l-arq" }),
      cartao({ id: "68b9a1c00000000000000005", shortLink: "Arq00002", idList: "l-velha" }),
      cartao({ id: "68b9a1c00000000000000006", shortLink: "Arq00003", idList: "l-viab", closed: true, dateCompleted: "2026-09-01T10:00:00.000Z" }),
    ];
    const sem = planejarImportacao(quadro(cartoes), contexto(), OPCOES);
    expect(sem.processos).toEqual([]);
    expect(sem.fora.map((f) => f.motivo)).toEqual(["concluido", "arquivado", "arquivado", "arquivado"]);
    // Fica de fora, mas a prévia sabe que casaria.
    expect(sem.fora[0].empresaId).toBe("vento");

    const com = planejarImportacao(quadro(cartoes), contexto(), { ...OPCOES, concluidos: true, arquivados: true });
    const [conc, arq, velha, feito] = com.processos;
    // A conclusão é quando foi para "Concluídos", que o export tem.
    expect(conc.concludedAt?.toISOString()).toBe("2026-09-15T12:00:00.000Z");
    expect([...conc.etapas.status.values()].every((s) => s === "CONCLUIDA")).toBe(true);
    expect(arq.status).toBe("CANCELADO");
    expect(arq.motivo).toBe("Encerrado antes do acompanhamento pelo portal");
    expect(velha.status).toBe("CANCELADO");
    expect(feito.status).toBe("CONCLUIDO");
    expect(feito.concludedAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");
  });

  it("idempotente: o cartão já importado fica de fora", () => {
    const p = planejarImportacao(quadro([cartao()]), contexto({ jaImportados: new Set(["AbCd1234"]) }), OPCOES);
    expect(p.processos).toEqual([]);
    expect(p.fora[0].motivo).toBe("ja_importado");
  });

  it("sem empresa, sem tipo e tipo sem roteiro ficam de fora com o motivo", () => {
    const p = planejarImportacao(
      quadro([
        cartao({ shortLink: "Sem00001", name: "AURORA SERVIÇOS | Alteração" }),
        cartao({ shortLink: "Sem00002", name: "VENTO SUL TRANSPORTES | JANEIRO/2026" }),
        cartao({ shortLink: "Sem00003", name: "VENTO SUL TRANSPORTES | Renovação Bombeiros" }),
        cartao({ shortLink: "Sem00004", name: "MODELO CHECK LIST CONSTITUIÇÃO" }),
      ]),
      contexto(),
      OPCOES
    );
    expect(p.fora.map((f) => f.motivo)).toEqual(["sem_empresa", "sem_tipo", "tipo_sem_roteiro", "modelo"]);
  });

  it("o arquivo de vínculos resolve empresa, tipo e ignorar", () => {
    const vinculos = lerVinculos("Sem00001;55.666.777/0001-30\nSem00002;;baixa\nSem00003;ignorar").vinculos;
    const p = planejarImportacao(
      quadro([
        cartao({ shortLink: "Sem00001", name: "AURORA SERVIÇOS | Alteração" }),
        cartao({ shortLink: "Sem00002", name: "VENTO SUL TRANSPORTES | JANEIRO/2026" }),
        cartao({ shortLink: "Sem00003" }),
      ]),
      contexto({ vinculos }),
      OPCOES
    );
    expect(p.processos.map((x) => [x.empresaId, x.casamento, x.tipo.codigo])).toEqual([
      ["aurora-a", "vinculo", "alteracao_contratual"],
      ["vento", "nome", "baixa"],
    ]);
    expect(p.fora.map((f) => f.motivo)).toEqual(["vinculo_ignorar"]);
  });

  it("prazo vencido do Trello não vira prazo combinado; o futuro vira, ao meio-dia UTC", () => {
    const p = planejarImportacao(
      quadro([
        cartao({ shortLink: "Prazo001", due: "2026-06-03T17:30:00.000Z" }),
        cartao({ shortLink: "Prazo002", due: "2026-10-28T16:49:00.000Z" }),
      ]),
      contexto(),
      OPCOES
    );
    expect(p.processos[0].dueAt).toBeNull();
    expect(p.processos[0].prazoVencido).toBe(true);
    expect(p.processos[0].notas).toContain("Prazo no Trello: 03/06/2026 (já vencido");
    expect(p.processos[1].dueAt?.toISOString()).toBe("2026-10-28T12:00:00.000Z");

    const com = planejarImportacao(quadro([cartao({ due: "2026-06-03T17:30:00.000Z" })]), contexto(), { ...OPCOES, prazosVencidos: true });
    expect(com.processos[0].dueAt?.toISOString()).toBe("2026-06-03T12:00:00.000Z");
  });

  it("urgente no título sobe a prioridade (que o cliente não vê)", () => {
    const [proc] = planejarImportacao(quadro([cartao({ name: "VENTO SUL TRANSPORTES | Constituição - URGENTE" })]), contexto(), OPCOES).processos;
    expect(proc.prioridade).toBe("ALTA");
  });
});

describe("lerQuadro", () => {
  it("recusa o que não é export do Trello", () => {
    expect(() => lerQuadro({ foo: 1 })).toThrow();
  });

  it("lê comentários e movimentos das ações", () => {
    const q = lerQuadro({
      name: "Q",
      lists: [{ id: "l1", name: "INICIAR", closed: false }],
      cards: [{ id: "c1", shortLink: "AbCd1234", name: "X | Baixa", idList: "l1", attachments: [{}, {}] }],
      actions: [
        { type: "commentCard", date: "2026-10-01T00:00:00Z", memberCreator: { fullName: "Bia" }, data: { card: { id: "c1" }, text: "oi" } },
        { type: "updateCard", date: "2026-10-02T00:00:00Z", data: { card: { id: "c1" }, listAfter: { id: "l1" } } },
        { type: "updateCard", date: "2026-10-03T00:00:00Z", data: { card: { id: "c1" }, old: { desc: "" } } },
      ],
    });
    expect(q.cartoes[0].attachments).toBe(2);
    expect(q.comentarios).toEqual([{ idCard: "c1", data: "2026-10-01T00:00:00Z", autor: "Bia", texto: "oi" }]);
    expect(q.movimentos).toEqual([{ idCard: "c1", data: "2026-10-02T00:00:00Z", paraLista: "l1" }]);
  });
});
