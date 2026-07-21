// Modelos de texto para o campo "Descrição" da Transferência — mesmos padrões
// usados no Acessórias, portados como referência de conteúdo (não são dados
// de tenant, não têm tela de edição — lista fixa em código, como
// TAX_REGIME_OPTIONS em EmpresaForm.tsx). [EMPRESA] e [CNPJ] são substituídos
// automaticamente pela empresa/pessoa selecionada no formulário quando
// possível; os demais placeholders ficam para o usuário preencher manualmente.
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
  | "SOLICITACAO_MULTISSETORIAL";

export type HandoffTemplate = { key: HandoffTemplateKey; label: string; body: string };

export const HANDOFF_TEMPLATES: HandoffTemplate[] = [
  {
    key: "BAIXA_CNPJ",
    label: "Baixa de CNPJ",
    body: `BAIXA DE CNPJ

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Origem da solicitação: [SOLICITANTE OU CANAL]

O cliente confirmou que deseja prosseguir com a baixa do CNPJ.

Orientações:

- iniciar o processo de encerramento;
- seguir as etapas aplicáveis ao processo de baixa;
- verificar pendências fiscais, contábeis, municipais, estaduais e societárias;
- verificar se existem obrigações ou documentos pendentes;
- não realizar cobrança adicional, quando aplicável;
- após a conclusão, verificar se haverá abertura de uma nova empresa.

Responsável pelo processo: [RESPONSÁVEL]

Anexos ou comprovações:

- [DOCUMENTO OU CONFIRMAÇÃO]

Observações:

[OBSERVAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "REGULARIZACAO_BAIXA",
    label: "Regularização seguida de baixa de CNPJ",
    body: `REGULARIZAÇÃO E BAIXA DE CNPJ

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Breve resumo:

A empresa encontra-se [INAPTA, SUSPENSA, COM OMISSÃO DE DECLARAÇÕES OU OUTRA SITUAÇÃO].

É necessário regularizar a situação cadastral e fiscal antes de realizar a baixa do CNPJ.

Demanda fiscal:

- identificar declarações e obrigações omitidas;
- verificar os períodos pendentes;
- transmitir as obrigações necessárias;
- levantar débitos e pendências fiscais;
- acompanhar a regularização da situação cadastral.

Responsável fiscal: [RESPONSÁVEL]

Demanda contábil:

- verificar declarações contábeis pendentes;
- confirmar quais obrigações já foram entregues;
- solicitar documentos necessários;
- analisar balanços, demonstrativos e movimentos pendentes.

Responsável contábil: [RESPONSÁVEL]

Demanda societária:

- iniciar a baixa após a conclusão da regularização;
- acompanhar o encerramento nos órgãos competentes;
- após a baixa, iniciar a abertura de [NOVA EMPRESA OU MEI], quando aplicável.

Responsável societário: [RESPONSÁVEL]

Valor acordado:

[VALOR E CONDIÇÃO COMERCIAL]

Contato do cliente:

Telefone: [TELEFONE]
E-mail: [EMAIL]
Canal de atendimento: [CANAL]

Observações:

[DEPENDÊNCIAS, PRAZOS OU PARTICULARIDADES]`,
  },
  {
    key: "ALTERACAO_CONTRATUAL",
    label: "Alteração contratual",
    body: `ALTERAÇÃO CONTRATUAL

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Solicitação recebida de: [SOLICITANTE]

Alterações solicitadas:

- entrada do sócio [NOME];
- saída do sócio [NOME];
- participação societária de [PERCENTUAL];
- redistribuição das quotas da seguinte forma: [DESCRIÇÃO];
- administrador da empresa: [NOME];
- capital social após a alteração: [VALOR];
- demais alterações: [DESCRIÇÃO].

Dados dos envolvidos:

Nome: [NOME]
Participação: [PERCENTUAL]
Função: [SÓCIO, ADMINISTRADOR OU OUTRA]
E-mail: [EMAIL]
Telefone: [TELEFONE]

Documentos recebidos:

- documento de identificação;
- comprovante de endereço;
- dados pessoais e cadastrais;
- autorização ou confirmação da solicitação;
- demais documentos aplicáveis.

Responsável pelo processo: [RESPONSÁVEL]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "SETUP_MIGRACAO",
    label: "Setup de migração de cliente",
    body: `SETUP DE MIGRAÇÃO

Empresa: [EMPRESA]
CNPJ: [CNPJ]
Regime tributário: [REGIME]
Data de início da prestação dos serviços: [DATA]

Dados do antigo contador:

Nome ou escritório: [ANTIGO CONTADOR]
Telefone: [TELEFONE]
E-mail: [EMAIL]

Informações operacionais:

Quantidade de funcionários ativos: [QUANTIDADE]
Quantidade de pró-labores ativos: [QUANTIDADE]
Quantidade de estabelecimentos: [QUANTIDADE]
Empresas vinculadas: [LISTA]

Breve resumo do cliente:

- porte da empresa;
- atividade principal;
- quantidade de unidades ou veículos, quando aplicável;
- nível atual de organização documental;
- situação perante o antigo contador;
- particularidades da operação;
- informações comerciais relevantes.

Instruções — Contábil:

- verificar com o antigo contador quais obrigações já foram executadas no exercício;
- confirmar a existência de balanços e demonstrações contábeis anteriores;
- verificar lançamentos e movimentos pendentes;
- solicitar os documentos contábeis necessários;
- orientar o cliente quanto ao envio periódico da documentação.

Responsável contábil: [RESPONSÁVEL]

Instruções — Fiscal:

- levantar débitos e pendências fiscais;
- verificar a situação fiscal da empresa nos órgãos competentes;
- confirmar quais obrigações foram transmitidas;
- identificar documentos fiscais pendentes;
- orientar o cliente sobre o envio dos documentos fiscais.

Responsável fiscal: [RESPONSÁVEL]

Instruções — Societário:

- verificar alterações cadastrais ou societárias pendentes;
- confirmar a situação das procurações;
- verificar inscrições, licenças e cadastros;
- registrar demandas societárias identificadas.

Responsável societário: [RESPONSÁVEL]

Instruções — Departamento Pessoal:

- confirmar a quantidade de funcionários ativos;
- confirmar os pró-labores ativos;
- verificar admissões, rescisões e afastamentos;
- verificar folhas e obrigações trabalhistas pendentes;
- registrar quando não houver funcionários ou folha ativa.

Responsável pelo departamento pessoal: [RESPONSÁVEL]

Instruções — Onboarding:

- solicitar a documentação inicial da empresa;
- entrar em contato com o antigo contador;
- confirmar o status das obrigações e entregas;
- apresentar ao cliente os canais de atendimento;
- orientar sobre os fluxos e prazos de envio de documentos;
- acompanhar o início da prestação dos serviços.

Responsável pelo onboarding: [RESPONSÁVEL]

Instruções — Customer Success:

- acompanhar de perto o início da operação;
- realizar contatos frequentes nos primeiros meses;
- reforçar orientações sobre organização documental;
- acompanhar dificuldades de adaptação;
- registrar os principais riscos identificados.

Responsável por Customer Success: [RESPONSÁVEL]

Observações gerais:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "ABERTURA_NOVA_EMPRESA",
    label: "Abertura de nova empresa",
    body: `ABERTURA DE NOVA EMPRESA

Solicitante: [SOLICITANTE]

Dados iniciais:

Ramo de atividade: [ATIVIDADE]
Sócio ou sócios: [NOMES]
Endereço pretendido: [ENDEREÇO]
Nome empresarial pretendido: [NOME]
Nome fantasia pretendido: [NOME]
Empresa relacionada: [EMPRESA RELACIONADA]

Informações já confirmadas:

- [INFORMAÇÃO]
- [INFORMAÇÃO]

Informações pendentes:

- [DADO PENDENTE]
- [DADO PENDENTE]

Observações:

- verificar a disponibilidade do endereço;
- validar as atividades informadas;
- confirmar os dados dos sócios;
- verificar se existem empresas relacionadas;
- confirmar as informações faltantes antes do início do processo.

Responsável: [RESPONSÁVEL]`,
  },
  {
    key: "SETUP_ABERTURA",
    label: "Setup completo de abertura",
    body: `SETUP DE ABERTURA

Nome empresarial pretendido: [NOME]
Nome fantasia: [NOME]
Regime tributário pretendido: [REGIME]
Capital social pretendido: [VALOR]

Atividade principal:

Código CNAE: [CÓDIGO]
Descrição: [DESCRIÇÃO]

Atividades secundárias:

- [CÓDIGO] — [DESCRIÇÃO]
- [CÓDIGO] — [DESCRIÇÃO]

Formas de atuação:

- fabricação própria;
- prestação de serviços;
- comércio físico;
- venda direta ao consumidor;
- comércio eletrônico;
- marketplaces;
- distribuição;
- venda para lojistas;
- revenda de produtos de terceiros;
- importação;
- exportação;
- desenvolvimento de marca própria;
- outras formas de atuação: [DESCRIÇÃO].

Endereço da empresa:

Logradouro: [LOGRADOURO]
Número: [NÚMERO]
Complemento: [COMPLEMENTO]
Bairro: [BAIRRO]
Cidade/UF: [CIDADE/UF]
CEP: [CEP]
Inscrição imobiliária: [INSCRIÇÃO]
Indicação fiscal: [INDICAÇÃO]

Contato da empresa:

Telefone: [TELEFONE]
E-mail: [EMAIL]

Responsável legal:

Nome: [NOME]
E-mail: [EMAIL]
Telefone: [TELEFONE]

Dados dos sócios:

Sócio: [NOME]
Estado civil: [ESTADO CIVIL]
Participação societária: [PERCENTUAL]
Endereço residencial: [ENDEREÇO]
Documentos recebidos: [DOCUMENTOS]

(Repetir o bloco acima para cada sócio.)

Documentos anexados:

- documento de identificação;
- comprovante de endereço;
- documento do imóvel;
- autorização de uso do endereço;
- documentos relacionados às atividades;
- outros documentos: [DOCUMENTOS].

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "CONFIGURACAO_EMPRESA_NOVA",
    label: "Configuração e parametrização de empresa nova",
    body: `CONFIGURAÇÃO E PARAMETRIZAÇÃO DE EMPRESA NOVA

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Data de abertura: [DATA]
Data de início da prestação dos serviços: [DATA]
Regime tributário: [REGIME]
Capital social: [VALOR]

Procurações e acessos:

- situação da procuração na Receita Federal: [SITUAÇÃO];
- situação dos acessos municipais: [SITUAÇÃO];
- situação dos acessos estaduais: [SITUAÇÃO];
- acessos já disponíveis: [LISTA];
- acessos pendentes: [LISTA];
- necessidade de solicitar autorização ao cliente: [SIM OU NÃO].

Instruções do setor:

- verificar quais obrigações já foram realizadas no exercício;
- confirmar a existência de balanços e demonstrações;
- verificar documentos e movimentos anteriores;
- orientar o cliente sobre o envio periódico da documentação;
- identificar documentos ainda pendentes;
- confirmar as responsabilidades do setor.

Responsável: [RESPONSÁVEL]

Observações importantes:

[OBSERVAÇÕES]`,
  },
  {
    key: "INCLUSAO_CNAE",
    label: "Inclusão de CNAE",
    body: `INCLUSÃO DE CNAE

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Solicitante: [SOLICITANTE]

CNAE a incluir:

Código: [CÓDIGO CNAE]
Descrição: [DESCRIÇÃO DA ATIVIDADE]

Orientações:

- manter os CNAEs atuais, quando aplicável;
- verificar se a atividade será principal ou secundária;
- verificar impactos cadastrais e tributários;
- verificar a necessidade de alteração contratual;
- consultar a viabilidade da atividade;
- confirmar eventuais exigências municipais, estaduais ou profissionais.

Documentos ou anexos:

- aprovação do cliente;
- confirmação da solicitação;
- documentos relacionados à atividade.

Responsável: [RESPONSÁVEL]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "ALTERACAO_CNAES",
    label: "Alteração de CNAEs ou atividades",
    body: `ALTERAÇÃO DE ATIVIDADES

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Origem da solicitação: [SOLICITANTE OU CANAL]

Atividades a incluir:

- [CÓDIGO CNAE] — [DESCRIÇÃO]
- [CÓDIGO CNAE] — [DESCRIÇÃO]

Atividades a excluir:

- [CÓDIGO CNAE] — [DESCRIÇÃO]

Atividade principal após a alteração:

[CÓDIGO CNAE] — [DESCRIÇÃO]

Orientações:

- manter as atividades atuais não mencionadas, quando aplicável;
- validar qual será a atividade principal;
- verificar a necessidade de alteração contratual;
- verificar os impactos tributários;
- verificar os impactos municipais e estaduais;
- consultar a viabilidade das novas atividades.

Documentos ou anexos:

- confirmação do cliente;
- autorização para alteração;
- documentos complementares.

Responsável: [RESPONSÁVEL]

Observações:

[OBSERVAÇÕES]`,
  },
  {
    key: "ALTERACAO_ENDERECO_ATIVIDADES",
    label: "Alteração de endereço e atividades",
    body: `ALTERAÇÃO DE ENDEREÇO E ATIVIDADES

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Origem da solicitação: [SOLICITANTE OU SETUP]

Novo endereço:

Logradouro: [LOGRADOURO]
Número: [NÚMERO]
Complemento: [COMPLEMENTO]
Bairro: [BAIRRO]
Cidade/UF: [CIDADE/UF]
CEP: [CEP]

Atividades a incluir:

- [CÓDIGO CNAE] — [DESCRIÇÃO]
- [CÓDIGO CNAE] — [DESCRIÇÃO]

Atividades a excluir:

- [CÓDIGO CNAE] — [DESCRIÇÃO]

Orientações adicionais:

- utilizar como referência cadastral a empresa [EMPRESA DE REFERÊNCIA], quando aplicável;
- verificar a viabilidade do novo endereço;
- verificar restrições municipais;
- validar as atividades permitidas no local;
- verificar a necessidade de alteração contratual;
- verificar reflexos nas inscrições municipal e estadual.

Documentos ou anexos:

- comprovante do endereço;
- documento do imóvel;
- autorização de uso;
- confirmação da solicitação;
- documentação complementar.

Responsável: [RESPONSÁVEL]

Observações:

[OBSERVAÇÕES]`,
  },
  {
    key: "NOVO_CLIENTE_CONSTITUIDO",
    label: "Novo cliente constituído pelo próprio escritório",
    body: `NOVO CLIENTE CONSTITUÍDO PELO ESCRITÓRIO

Empresa: [EMPRESA]
CNPJ: [CNPJ]

O processo de abertura da empresa foi concluído.

As informações necessárias para o início das atividades estão disponíveis no setup e nos documentos anexados.

Informações adicionais:

- empresa relacionada: [EMPRESA];
- vínculo com outros clientes: [DESCRIÇÃO];
- responsável comercial: [RESPONSÁVEL];
- origem do cliente: [ORIGEM];
- particularidades identificadas durante a abertura: [DESCRIÇÃO];
- setores que devem iniciar a configuração: [SETORES].

Documentos disponíveis:

- setup fiscal;
- setup contábil;
- documentos constitutivos;
- cartão do CNPJ;
- inscrições;
- comprovantes;
- documentos dos sócios;
- demais documentos aplicáveis.

Responsáveis envolvidos:

- [RESPONSÁVEL]
- [RESPONSÁVEL]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "ENCERRAMENTO_EMPRESA",
    label: "Encerramento de empresa",
    body: `ENCERRAMENTO DE EMPRESA

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Solicitante: [SOLICITANTE]

Solicitação:

Realizar a baixa e o encerramento formal da empresa.

Orientações:

- iniciar o processo de encerramento;
- verificar pendências fiscais;
- verificar pendências contábeis;
- verificar pendências societárias;
- verificar pendências municipais e estaduais;
- solicitar os documentos faltantes;
- acompanhar a conclusão nos órgãos envolvidos;
- armazenar os documentos finais após a conclusão.

Data de início: [DATA]
Previsão de conclusão: [DATA]
Responsável: [RESPONSÁVEL]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "DISTRATO_VARIAS_EMPRESAS",
    label: "Distrato de várias empresas",
    body: `DISTRATO DE EMPRESAS

Data da solicitação: [DATA]
Último dia da prestação dos serviços: [DATA]

Empresas incluídas no distrato:

1. [EMPRESA] — [CNPJ]
2. [EMPRESA] — [CNPJ]
3. [EMPRESA] — [CNPJ]

Empresas pendentes de confirmação:

1. [EMPRESA] — [CNPJ]
2. [EMPRESA] — [CNPJ]

Observação importante:

Confirmar com o cliente se as empresas pendentes também deverão ser encerradas ou se ficaram de fora da solicitação por engano.

Orientações:

- realizar o processo individual de encerramento de cada empresa;
- acompanhar as obrigações e pendências separadamente;
- registrar o andamento de cada CNPJ;
- salvar os documentos finais após cada conclusão;
- comunicar os responsáveis conforme os processos forem finalizados.

Responsáveis envolvidos:

- [RESPONSÁVEL]
- [RESPONSÁVEL]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "REGULARIZACAO_MUNICIPAL_ESTADUAL",
    label: "Regularização municipal e estadual",
    body: `REGULARIZAÇÃO MUNICIPAL E ESTADUAL

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Breve resumo:

A empresa encontra-se impedida de [DESCREVER A OPERAÇÃO BLOQUEADA] devido a pendências municipais ou estaduais.

Situação identificada:

- ausência ou pendência de alvará;
- solicitação anterior ainda não concluída;
- bloqueio da emissão de documentos fiscais;
- pendência na inscrição municipal;
- pendência na inscrição estadual;
- necessidade de contato com Prefeitura ou Secretaria da Fazenda;
- outra situação: [DESCRIÇÃO].

Demanda municipal:

- entrar em contato com a Prefeitura responsável;
- identificar os documentos e procedimentos necessários;
- consultar a situação do protocolo existente;
- verificar se será necessário abrir processo presencial ou eletrônico;
- prosseguir com a emissão ou regularização do alvará;
- registrar protocolos, orientações e prazos recebidos.

Responsável pela demanda municipal: [RESPONSÁVEL]

Demanda estadual:

- entrar em contato com a Secretaria da Fazenda;
- identificar o motivo do bloqueio;
- verificar a situação da inscrição estadual;
- informar sobre o processo de regularização em andamento;
- solicitar a retomada da emissão de documentos fiscais, quando cabível;
- acompanhar o processo até a regularização.

Responsável pela demanda estadual: [RESPONSÁVEL]

Atualizações — registrar:

- contatos realizados;
- órgãos consultados;
- protocolos;
- documentos solicitados;
- respostas recebidas;
- prazos informados;
- evolução do processo;
- próximos passos.

Prazo para atualização: [DATA]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
  {
    key: "SOLICITACAO_MULTISSETORIAL",
    label: "Solicitação multissetorial (genérico)",
    body: `[TÍTULO DA SOLICITAÇÃO]

Empresa: [EMPRESA]
CNPJ: [CNPJ]

Origem da solicitação: [ORIGEM]

Breve resumo:

[CONTEXTO DO PEDIDO]

Demanda — Fiscal:

- [AÇÃO]
- [AÇÃO]

Responsável fiscal: [RESPONSÁVEL]

Demanda — Contábil:

- [AÇÃO]
- [AÇÃO]

Responsável contábil: [RESPONSÁVEL]

Demanda — Societário:

- [AÇÃO]
- [AÇÃO]

Responsável societário: [RESPONSÁVEL]

Demanda — Departamento Pessoal:

- [AÇÃO]
- [AÇÃO]

Responsável pelo departamento pessoal: [RESPONSÁVEL]

Demanda — Onboarding:

- [AÇÃO]
- [AÇÃO]

Responsável pelo onboarding: [RESPONSÁVEL]

Demanda — Customer Success:

- [AÇÃO]
- [AÇÃO]

Responsável por Customer Success: [RESPONSÁVEL]

Ordem de execução:

1. [PRIMEIRA ETAPA]
2. [SEGUNDA ETAPA]
3. [TERCEIRA ETAPA]

Dependências:

- [DEPENDÊNCIA]

Prazo ou previsão: [DATA]

Documentos ou anexos:

- [DOCUMENTO]

Observações:

[INFORMAÇÕES COMPLEMENTARES]`,
  },
];

export function getHandoffTemplate(key: string): HandoffTemplate | undefined {
  return HANDOFF_TEMPLATES.find((t) => t.key === key);
}

// Substitui só [EMPRESA]/[CNPJ] pelo que já está selecionado no formulário —
// os demais placeholders (responsável, prazo, valor...) não são deriváveis de
// nenhum campo existente e ficam para preenchimento manual, por design.
export function renderHandoffTemplate(key: string, entity: { name?: string; cnpj?: string | null }): string {
  const template = getHandoffTemplate(key);
  if (!template) return "";

  let body = template.body;
  if (entity.name) body = body.replaceAll("[EMPRESA]", entity.name);
  if (entity.cnpj) body = body.replaceAll("[CNPJ]", entity.cnpj);
  return body;
}
