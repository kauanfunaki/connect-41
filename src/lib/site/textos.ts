// Os textos públicos do Connect que aparecem em mais de uma página (13/10/2026):
// o site de apresentação (a `/` do endereço principal) e a /sobre, a página que
// o Google confere na verificação do app.
//
// Moraram na /sobre até o site existir. Juntos aqui para as duas páginas não
// dizerem coisas diferentes sobre o mesmo produto. O texto descreve o que o
// Connect faz hoje: mudou o produto, muda aqui.

export const CONTATO = "marcos@41contabil.com.br";

/**
 * A empresa que desenvolve e opera o Connect, em partes: o "Sobre nós" do site
 * usa o nome e a cidade, e o rodapé (abaixo) a frase inteira.
 */
export const EMPRESA = {
  nome: "41 TEC LTDA",
  cnpj: "64.620.403/0001-16",
  endereco: "Rua Anne Frank, 2210, Boqueirão",
  cidade: "Curitiba/PR",
};

/** Quem desenvolve e opera o Connect — o rodapé das páginas públicas. */
export const QUEM_OPERA = `O Connect é desenvolvido e operado pela ${EMPRESA.nome} (CNPJ ${EMPRESA.cnpj}), ${EMPRESA.endereco}, ${EMPRESA.cidade}.`;

export const PARA_A_EQUIPE = [
  "Processos societários com etapas, exigências e prazos em dias úteis",
  "Financeiro dos clientes: contas a pagar e a receber, conciliação bancária e DRE",
  "Documentos fiscais das empresas atendidas",
  "Departamento pessoal e recrutamento",
  "Agenda, tarefas e o Meu dia, com a opção de conectar o Google Agenda para marcar reuniões",
];

export const PARA_O_CLIENTE = [
  "Documentos fiscais das suas empresas",
  "Pendências e pedidos do escritório, respondidos com o arquivo junto",
  "Aprovação de pagamentos",
  "Financeiro: contas, fluxo de caixa e DRE",
  "Solicitações ao escritório e comunicados",
  "Andamento dos processos da sua empresa",
];
