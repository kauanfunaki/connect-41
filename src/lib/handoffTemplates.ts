// Os 16 modelos da nova transferência — lista fixa em código, como
// OPCOES_DE_REGIME em src/lib/taxRegime.ts (não são dados de tenant e não têm
// tela de edição).
//
// Desde 17/11/2026 (melhoria-705, escolha "A · Tarefas marcáveis e a
// coordenação como responsável" do Kauan) cada modelo é dado, e não texto:
// - `setores`: os setores que recebem e, por setor, as tarefas dele, que viram
//   itens marcáveis na parte do setor;
// - `campos`: o que o modelo precisa saber de quem pede (situação, valor,
//   datas…). Era o que ficava entre colchetes no texto, e aparecia cru para
//   quem pedia e para quem recebia.
// Empresa e CNPJ já vêm da transferência; regime e contato vêm do cadastro da
// empresa quando o campo fica em branco (`deCadastro`).
//
// Os setores e as tarefas são a proposta de 17/11/2026, para as coordenações
// validarem. Mudar um modelo é mudar este arquivo: as transferências já
// enviadas guardam as tarefas delas (HandoffSectorTask) e não mudam.

export type HandoffTemplateKey =
  | "BAIXA_CNPJ"
  | "REGULARIZACAO_BAIXA"
  | "ALTERACAO_CONTRATUAL"
  | "SETUP_MIGRACAO"
  | "ABERTURA_NOVA_EMPRESA"
  | "SETUP_ABERTURA"
  | "CONFIGURACAO_EMPRESA_NOVA"
  | "INCLUSAO_CNAE"
  | "ALTERACAO_CNAES"
  | "ALTERACAO_ENDERECO_ATIVIDADES"
  | "NOVO_CLIENTE_CONSTITUIDO"
  | "ENCERRAMENTO_EMPRESA"
  | "DISTRATO_VARIAS_EMPRESAS"
  | "REGULARIZACAO_MUNICIPAL_ESTADUAL"
  | "SOLICITACAO_MULTISSETORIAL"
  | "FECHAMENTO_MENSAL_BPO";

/** Uma pergunta do modelo. `longo` é texto de várias linhas; `opcoes`, um seletor. */
export type CampoDoModelo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "longo" | "opcoes" | "data";
  opcoes?: string[];
  /** Em branco, a transferência leva o dado do cadastro da empresa. */
  deCadastro?: "regime" | "contato";
};

/** Um setor do modelo: as palavras que acham o setor do escritório e as tarefas dele. */
export type SetorDoModelo = { setor: string[]; tarefas: string[] };

export type HandoffTemplate = {
  key: HandoffTemplateKey;
  label: string;
  campos: CampoDoModelo[];
  setores: SetorDoModelo[];
};

// As palavras de cada setor, comparadas sem acento com o código e o nome do
// setor do escritório (que são livres por tenant).
const SOCIETARIO = ["societario"];
const FISCAL = ["fiscal"];
const CONTABIL = ["contabil"];
const DP = ["dp", "pessoal"];
const FINANCEIRO = ["financeiro"];

const QUEM_PEDIU: CampoDoModelo = { chave: "quemPediu", rotulo: "Quem pediu", tipo: "texto" };
const CONTATO: CampoDoModelo = { chave: "contato", rotulo: "Contato do cliente", tipo: "texto", deCadastro: "contato" };
const REGIME: CampoDoModelo = { chave: "regime", rotulo: "Regime tributário", tipo: "texto", deCadastro: "regime" };
const VALOR: CampoDoModelo = { chave: "valor", rotulo: "Valor acordado", tipo: "texto" };
const REGIMES = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"];

export const HANDOFF_TEMPLATES: HandoffTemplate[] = [
  {
    key: "BAIXA_CNPJ",
    label: "Baixa de CNPJ",
    campos: [QUEM_PEDIU, { chave: "novaEmpresa", rotulo: "Depois da baixa", tipo: "opcoes", opcoes: ["Nada", "Abrir outra empresa", "Abrir MEI", "Ainda não sabe"] }],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Iniciar a baixa nos órgãos", "Acompanhar o encerramento até a conclusão", "Guardar os documentos finais na ficha"] },
      { setor: FISCAL, tarefas: ["Levantar as pendências fiscais", "Entregar as declarações em atraso e as de encerramento"] },
      { setor: CONTABIL, tarefas: ["Levantar o balanço de encerramento", "Entregar as obrigações contábeis pendentes"] },
      { setor: DP, tarefas: ["Conferir funcionários e pró-labores ativos", "Fazer as rescisões e encerrar a folha"] },
    ],
  },
  {
    key: "REGULARIZACAO_BAIXA",
    label: "Regularização seguida de baixa de CNPJ",
    campos: [
      { chave: "situacao", rotulo: "Situação da empresa", tipo: "opcoes", opcoes: ["Inapta", "Suspensa", "Com declarações omitidas", "Outra"] },
      VALOR,
      CONTATO,
      { chave: "depois", rotulo: "Depois da baixa", tipo: "opcoes", opcoes: ["Nada", "Abrir outra empresa", "Abrir MEI"] },
    ],
    setores: [
      {
        setor: FISCAL,
        tarefas: ["Identificar as declarações omitidas e os períodos pendentes", "Transmitir as obrigações em atraso", "Levantar os débitos e emitir as guias", "Acompanhar a regularização cadastral"],
      },
      { setor: CONTABIL, tarefas: ["Conferir as declarações contábeis pendentes", "Pedir os documentos que faltam", "Fechar balanços e demonstrativos pendentes"] },
      { setor: SOCIETARIO, tarefas: ["Iniciar a baixa depois da regularização", "Acompanhar o encerramento nos órgãos", "Abrir a nova empresa ou o MEI, se combinado"] },
    ],
  },
  {
    key: "ALTERACAO_CONTRATUAL",
    label: "Alteração contratual",
    campos: [QUEM_PEDIU, { chave: "mudancas", rotulo: "O que muda", tipo: "longo" }],
    setores: [
      {
        setor: SOCIETARIO,
        tarefas: ["Conferir os documentos dos sócios", "Redigir a alteração contratual", "Registrar na Junta e atualizar a Receita", "Guardar o contrato registrado na ficha"],
      },
      { setor: FISCAL, tarefas: ["Atualizar o cadastro fiscal depois do registro"] },
      { setor: CONTABIL, tarefas: ["Atualizar o capital social e o quadro de sócios na contabilidade"] },
    ],
  },
  {
    key: "SETUP_MIGRACAO",
    label: "Setup de migração de cliente",
    campos: [
      REGIME,
      { chave: "inicio", rotulo: "Início dos serviços", tipo: "data" },
      { chave: "antigoContador", rotulo: "Antigo contador (nome e contato)", tipo: "texto" },
      { chave: "funcionarios", rotulo: "Funcionários ativos", tipo: "texto" },
      { chave: "proLabores", rotulo: "Pró-labores ativos", tipo: "texto" },
      { chave: "estabelecimentos", rotulo: "Estabelecimentos", tipo: "texto" },
      { chave: "resumo", rotulo: "Sobre o cliente", tipo: "longo" },
    ],
    setores: [
      {
        setor: CONTABIL,
        tarefas: ["Confirmar com o antigo contador o que já foi entregue no ano", "Pedir balanços e demonstrações anteriores", "Orientar o cliente sobre o envio dos documentos"],
      },
      { setor: FISCAL, tarefas: ["Levantar débitos e pendências fiscais", "Confirmar as obrigações já transmitidas", "Orientar o cliente sobre o envio das notas"] },
      { setor: SOCIETARIO, tarefas: ["Conferir alterações cadastrais pendentes", "Confirmar as procurações", "Conferir inscrições, licenças e cadastros"] },
      { setor: DP, tarefas: ["Confirmar funcionários e pró-labores ativos", "Conferir admissões, rescisões e afastamentos", "Conferir folhas e obrigações pendentes"] },
    ],
  },
  {
    key: "ABERTURA_NOVA_EMPRESA",
    label: "Abertura de nova empresa",
    campos: [
      QUEM_PEDIU,
      { chave: "atividade", rotulo: "Ramo de atividade", tipo: "texto" },
      { chave: "socios", rotulo: "Sócios", tipo: "texto" },
      { chave: "endereco", rotulo: "Endereço pretendido", tipo: "texto" },
      { chave: "nome", rotulo: "Nome empresarial pretendido", tipo: "texto" },
      { chave: "fantasia", rotulo: "Nome fantasia", tipo: "texto" },
      { chave: "faltando", rotulo: "O que ainda falta", tipo: "longo" },
    ],
    setores: [
      {
        setor: SOCIETARIO,
        tarefas: ["Consultar a viabilidade do endereço", "Validar as atividades", "Confirmar os dados dos sócios", "Pedir as informações que faltam", "Iniciar a abertura"],
      },
    ],
  },
  {
    key: "SETUP_ABERTURA",
    label: "Setup completo de abertura",
    campos: [
      { chave: "nome", rotulo: "Nome empresarial", tipo: "texto" },
      { chave: "fantasia", rotulo: "Nome fantasia", tipo: "texto" },
      { chave: "regime", rotulo: "Regime pretendido", tipo: "opcoes", opcoes: REGIMES },
      { chave: "capital", rotulo: "Capital social", tipo: "texto" },
      { chave: "cnaePrincipal", rotulo: "Atividade principal (CNAE)", tipo: "texto" },
      { chave: "cnaesSecundarios", rotulo: "Atividades secundárias", tipo: "longo" },
      { chave: "atuacao", rotulo: "Formas de atuação", tipo: "longo" },
      { chave: "endereco", rotulo: "Endereço da empresa", tipo: "longo" },
      { chave: "responsavel", rotulo: "Responsável legal", tipo: "texto" },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Registrar a empresa na Junta e na Receita", "Tirar as inscrições municipal e estadual", "Tirar o alvará e as licenças"] },
      { setor: FISCAL, tarefas: ["Enquadrar o regime tributário", "Liberar a emissão de notas"] },
      { setor: CONTABIL, tarefas: ["Abrir a contabilidade da empresa", "Lançar o capital social"] },
    ],
  },
  {
    key: "CONFIGURACAO_EMPRESA_NOVA",
    label: "Configuração e parametrização de empresa nova",
    campos: [
      REGIME,
      { chave: "abertura", rotulo: "Data de abertura", tipo: "data" },
      { chave: "inicio", rotulo: "Início dos serviços", tipo: "data" },
      { chave: "capital", rotulo: "Capital social", tipo: "texto" },
      { chave: "procuracao", rotulo: "Procuração na Receita", tipo: "opcoes", opcoes: ["Ativa", "Pendente", "Não sei"] },
      { chave: "acessos", rotulo: "Acessos pendentes", tipo: "texto" },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Confirmar a procuração na Receita", "Conseguir os acessos municipal e estadual"] },
      { setor: FISCAL, tarefas: ["Cadastrar a empresa no sistema fiscal", "Conferir as obrigações do ano", "Orientar o cliente sobre o envio das notas"] },
      { setor: CONTABIL, tarefas: ["Cadastrar a empresa na contabilidade", "Conferir documentos e movimentos anteriores", "Orientar o cliente sobre o envio dos documentos"] },
      { setor: DP, tarefas: ["Confirmar se há funcionários e pró-labore", "Cadastrar a folha, quando houver"] },
    ],
  },
  {
    key: "INCLUSAO_CNAE",
    label: "Inclusão de CNAE",
    campos: [
      QUEM_PEDIU,
      { chave: "cnae", rotulo: "CNAE a incluir (código e descrição)", tipo: "texto" },
      { chave: "tipo", rotulo: "A atividade será", tipo: "opcoes", opcoes: ["Principal", "Secundária"] },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Consultar a viabilidade da atividade", "Ver se precisa de alteração contratual", "Atualizar na Junta, na Receita e nas inscrições"] },
      { setor: FISCAL, tarefas: ["Avaliar o impacto tributário da atividade", "Atualizar o cadastro fiscal"] },
    ],
  },
  {
    key: "ALTERACAO_CNAES",
    label: "Alteração de CNAEs ou atividades",
    campos: [
      QUEM_PEDIU,
      { chave: "incluir", rotulo: "Atividades a incluir", tipo: "longo" },
      { chave: "excluir", rotulo: "Atividades a excluir", tipo: "longo" },
      { chave: "principal", rotulo: "Atividade principal depois da alteração", tipo: "texto" },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Consultar a viabilidade das atividades novas", "Ver se precisa de alteração contratual", "Atualizar na Junta, na Receita e nas inscrições"] },
      { setor: FISCAL, tarefas: ["Avaliar o impacto tributário, municipal e estadual", "Atualizar o cadastro fiscal"] },
    ],
  },
  {
    key: "ALTERACAO_ENDERECO_ATIVIDADES",
    label: "Alteração de endereço e atividades",
    campos: [
      QUEM_PEDIU,
      { chave: "endereco", rotulo: "Novo endereço", tipo: "longo" },
      { chave: "incluir", rotulo: "Atividades a incluir", tipo: "longo" },
      { chave: "excluir", rotulo: "Atividades a excluir", tipo: "longo" },
      { chave: "referencia", rotulo: "Empresa de referência", tipo: "texto" },
    ],
    setores: [
      {
        setor: SOCIETARIO,
        tarefas: ["Consultar a viabilidade do endereço", "Validar as atividades permitidas no local", "Fazer a alteração contratual", "Atualizar as inscrições municipal e estadual"],
      },
      { setor: FISCAL, tarefas: ["Avaliar o impacto da mudança de município ou estado", "Atualizar o cadastro fiscal"] },
    ],
  },
  {
    key: "NOVO_CLIENTE_CONSTITUIDO",
    label: "Novo cliente constituído pelo próprio escritório",
    campos: [
      { chave: "comercial", rotulo: "Responsável comercial", tipo: "texto" },
      { chave: "origem", rotulo: "Origem do cliente", tipo: "texto" },
      { chave: "relacionada", rotulo: "Empresa relacionada", tipo: "texto" },
      { chave: "particularidades", rotulo: "Particularidades da abertura", tipo: "longo" },
    ],
    setores: [
      { setor: FISCAL, tarefas: ["Conferir o setup fiscal", "Cadastrar a empresa no sistema fiscal"] },
      { setor: CONTABIL, tarefas: ["Conferir o setup contábil", "Abrir a contabilidade da empresa"] },
      { setor: DP, tarefas: ["Confirmar se há funcionários e pró-labore"] },
    ],
  },
  {
    key: "ENCERRAMENTO_EMPRESA",
    label: "Encerramento de empresa",
    campos: [QUEM_PEDIU, { chave: "inicio", rotulo: "Data de início", tipo: "data" }, { chave: "previsao", rotulo: "Previsão de conclusão", tipo: "data" }],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Iniciar o encerramento", "Acompanhar a conclusão nos órgãos", "Guardar os documentos finais na ficha"] },
      { setor: FISCAL, tarefas: ["Levantar as pendências fiscais, municipais e estaduais", "Entregar as declarações de encerramento"] },
      { setor: CONTABIL, tarefas: ["Levantar as pendências contábeis", "Fechar o balanço de encerramento"] },
      { setor: DP, tarefas: ["Fazer as rescisões e encerrar a folha"] },
    ],
  },
  {
    key: "DISTRATO_VARIAS_EMPRESAS",
    label: "Distrato de várias empresas",
    campos: [
      { chave: "ultimoDia", rotulo: "Último dia da prestação dos serviços", tipo: "data" },
      { chave: "empresas", rotulo: "Empresas incluídas (nome e CNPJ)", tipo: "longo" },
      { chave: "aConfirmar", rotulo: "Empresas a confirmar com o cliente", tipo: "longo" },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Confirmar com o cliente as empresas pendentes", "Registrar o andamento de cada CNPJ"] },
      { setor: FISCAL, tarefas: ["Entregar as obrigações fiscais até o último dia"] },
      { setor: CONTABIL, tarefas: ["Entregar as obrigações contábeis até o último dia", "Separar os documentos para entregar ao cliente"] },
      { setor: DP, tarefas: ["Fechar a folha até o último dia"] },
      { setor: FINANCEIRO, tarefas: ["Encerrar a cobrança depois do último dia"] },
    ],
  },
  {
    key: "REGULARIZACAO_MUNICIPAL_ESTADUAL",
    label: "Regularização municipal e estadual",
    campos: [
      { chave: "bloqueio", rotulo: "O que está bloqueado", tipo: "texto" },
      { chave: "situacao", rotulo: "Situação", tipo: "opcoes", opcoes: ["Sem alvará", "Inscrição municipal pendente", "Inscrição estadual pendente", "Emissão de notas bloqueada", "Outra"] },
      { chave: "prazo", rotulo: "Prazo para atualizar", tipo: "data" },
    ],
    setores: [
      { setor: SOCIETARIO, tarefas: ["Consultar a Prefeitura e o protocolo existente", "Regularizar o alvará e a inscrição municipal", "Registrar protocolos e prazos"] },
      { setor: FISCAL, tarefas: ["Consultar a Secretaria da Fazenda e o motivo do bloqueio", "Regularizar a inscrição estadual", "Pedir a volta da emissão de notas"] },
    ],
  },
  {
    // O genérico: quem pede escolhe os setores e escreve as tarefas.
    key: "SOLICITACAO_MULTISSETORIAL",
    label: "Solicitação multissetorial (genérico)",
    campos: [QUEM_PEDIU, { chave: "prazo", rotulo: "Prazo", tipo: "data" }],
    setores: [],
  },
  {
    key: "FECHAMENTO_MENSAL_BPO",
    label: "Fechamento mensal BPO → Fiscal/Contábil",
    campos: [
      { chave: "competencia", rotulo: "Competência (mês/ano)", tipo: "texto" },
      { chave: "acessoBancario", rotulo: "Acesso bancário", tipo: "opcoes", opcoes: ["OK", "Pendente", "Bloqueado"] },
      { chave: "pendencias", rotulo: "Pendências da conciliação", tipo: "longo" },
    ],
    setores: [
      { setor: CONTABIL, tarefas: ["Receber os extratos conciliados", "Conferir a planilha de fechamento", "Lançar a competência"] },
      { setor: FISCAL, tarefas: ["Receber os XML e os relatórios de notas", "Conferir as guias pagas", "Apurar a competência"] },
    ],
  },
];

export function getHandoffTemplate(key: string): HandoffTemplate | undefined {
  return HANDOFF_TEMPLATES.find((t) => t.key === key);
}

// A ordem dos blocos de assunto na nova transferência (10/11/2026, pedido do
// Kauan): os mais usados no escritório primeiro, contados pela coluna
// `handoffs.templateKey`. Empate — e o começo, quando a coluna ainda está vazia
// — segue estes seis, os do desenho escolhido, e depois a ordem da lista.
const DESTAQUE_PADRAO: HandoffTemplateKey[] = [
  "BAIXA_CNPJ",
  "ALTERACAO_CONTRATUAL",
  "ABERTURA_NOVA_EMPRESA",
  "INCLUSAO_CNAE",
  "SETUP_MIGRACAO",
  "REGULARIZACAO_MUNICIPAL_ESTADUAL",
];

/** Os 16 modelos, do mais usado para o menos; `usos` é a contagem por `templateKey`. */
export function modelosPorUso(usos: Record<string, number>): HandoffTemplate[] {
  const padrao = (t: HandoffTemplate) => {
    const i = DESTAQUE_PADRAO.indexOf(t.key);
    return i === -1 ? DESTAQUE_PADRAO.length + HANDOFF_TEMPLATES.indexOf(t) : i;
  };
  return [...HANDOFF_TEMPLATES].sort((a, b) => (usos[b.key] ?? 0) - (usos[a.key] ?? 0) || padrao(a) - padrao(b));
}

/**
 * O assunto que a nova transferência grava (10/11/2026): com um modelo válido,
 * o rótulo dele e a chave; sem modelo ("Outro assunto"), o texto livre, sem
 * chave. Null quando não há nem um nem outro — o assunto é obrigatório. O texto
 * passa do tamanho da coluna (160) só se alguém montar o envio à mão; aí corta.
 */
export function assuntoParaGravar(
  textoLivre: string | null | undefined,
  chaveDoModelo: string | null | undefined,
  maximo = 160
): { subject: string; templateKey: HandoffTemplateKey | null } | null {
  const modelo = chaveDoModelo ? getHandoffTemplate(chaveDoModelo) : undefined;
  if (modelo) return { subject: modelo.label, templateKey: modelo.key };
  const texto = (textoLivre ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  return { subject: texto.slice(0, maximo).trimEnd(), templateKey: null };
}

export function normalizarTexto(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

type OpcaoDeSetor = { value: string; label: string };

/**
 * O setor do escritório que casa com as palavras do modelo (código e nome são
 * livres por tenant): compara sem acento e sem maiúscula, e aceita um dentro do
 * outro, para "DP" bater com "Departamento Pessoal". Null quando o escritório
 * não tem o setor (o modelo de migração cita setores que nem todo escritório tem).
 */
function setorDoEscritorio(palavras: string[], opcoes: OpcaoDeSetor[]): string | null {
  for (const opcao of opcoes) {
    const code = normalizarTexto(opcao.value);
    const label = normalizarTexto(opcao.label);
    const casa = palavras.some((p) => {
      const h = normalizarTexto(p);
      return code === h || label === h || code.includes(h) || label.includes(h) || h.includes(code);
    });
    if (casa) return opcao.value;
  }
  return null;
}

/**
 * Os setores que o modelo marca e as tarefas de cada um, na ordem do modelo,
 * com os setores do escritório. Setor do modelo que o escritório não tem fica
 * de fora; dois setores do modelo no mesmo setor do escritório juntam as tarefas.
 */
export function setoresDoModelo(key: string, opcoes: OpcaoDeSetor[]): { setor: string; tarefas: string[] }[] {
  const modelo = getHandoffTemplate(key);
  if (!modelo) return [];
  const porSetor = new Map<string, string[]>();
  for (const s of modelo.setores) {
    const codigo = setorDoEscritorio(s.setor, opcoes);
    if (!codigo) continue;
    porSetor.set(codigo, [...(porSetor.get(codigo) ?? []), ...s.tarefas]);
  }
  return [...porSetor.entries()].map(([setor, tarefas]) => ({ setor, tarefas }));
}

/** Só os códigos dos setores que o modelo marca. */
export function matchSectorsForTemplate(key: string, opcoes: OpcaoDeSetor[]): string[] {
  return setoresDoModelo(key, opcoes).map((s) => s.setor);
}

/** O tamanho de cada tarefa e quantas cabem numa parte. */
export const TAREFA_MAXIMA = 300;
export const TAREFAS_POR_SETOR = 30;

/** As tarefas que vão para a parte de um setor: sem repetição, sem vazio, no tamanho da coluna. */
export function tarefasParaGravar(textos: (string | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  const tarefas: string[] = [];
  for (const bruto of textos) {
    const texto = (bruto ?? "").replace(/\s+/g, " ").trim().slice(0, TAREFA_MAXIMA).trimEnd();
    if (!texto || vistas.has(texto.toLowerCase())) continue;
    vistas.add(texto.toLowerCase());
    tarefas.push(texto);
    if (tarefas.length === TAREFAS_POR_SETOR) break;
  }
  return tarefas;
}

/** Uma resposta do "O que este modelo precisa saber", como fica guardada em `handoffs.details`. */
export type DadoDoPedido = { rotulo: string; valor: string };

const VALOR_MAXIMO = 2000;

/**
 * As respostas aos campos do modelo, na ordem do modelo, para gravar. Campo em
 * branco com `deCadastro` leva o dado do cadastro da empresa (regime, contato);
 * o resto em branco fica de fora. Resposta de seletor que não é uma das opções
 * é ignorada. A data chega como AAAA-MM-DD e fica como DD/MM/AAAA.
 */
export function detalhesParaGravar(
  key: string | null | undefined,
  respostas: Record<string, string | null | undefined>,
  doCadastro: { regime?: string | null; contato?: string | null } = {}
): DadoDoPedido[] {
  const modelo = key ? getHandoffTemplate(key) : undefined;
  if (!modelo) return [];
  const dados: DadoDoPedido[] = [];
  for (const campo of modelo.campos) {
    let valor = (respostas[campo.chave] ?? "").trim();
    if (campo.tipo !== "longo") valor = valor.replace(/\s+/g, " ");
    if (campo.tipo === "opcoes" && valor && !campo.opcoes?.includes(valor)) valor = "";
    if (campo.tipo === "data" && valor) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
      valor = m ? `${m[3]}/${m[2]}/${m[1]}` : "";
    }
    if (!valor && campo.deCadastro) valor = (doCadastro[campo.deCadastro] ?? "").trim();
    if (!valor) continue;
    dados.push({ rotulo: campo.rotulo, valor: valor.slice(0, VALOR_MAXIMO) });
  }
  return dados;
}

/** Os dados do pedido gravados, lidos de volta do JSON (o que não tem a forma certa fica de fora). */
export function lerDetalhes(json: unknown): DadoDoPedido[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (d): d is DadoDoPedido => typeof d === "object" && d !== null && typeof (d as DadoDoPedido).rotulo === "string" && typeof (d as DadoDoPedido).valor === "string"
  );
}

/** O contato do cadastro da empresa, numa linha: telefone e e-mail. */
export function contatoDoCadastro(empresa: { phone?: string | null; email?: string | null } | null | undefined): string | null {
  const partes = [empresa?.phone?.trim(), empresa?.email?.trim()].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}
