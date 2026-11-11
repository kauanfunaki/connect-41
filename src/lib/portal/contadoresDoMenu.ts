// Os números do menu do portal (polimento do portal, 11/11/2026, P09): quantas
// pendências, aprovações, solicitações e comunicados esperam o cliente — o
// mesmo que o "O que precisa de você" do Início conta, ao lado do nome da tela.
//
// Este arquivo é puro (o menu, componente cliente, importa daqui). A consulta
// mora em `contadoresDoMenuServidor.ts`.

/** As telas do menu que levam número, pelo endereço. */
export const TELAS_COM_CONTADOR = ["/portal/pendencias", "/portal/aprovacoes", "/portal/solicitacoes", "/portal/comunicados"] as const;

export type TelaComContador = (typeof TELAS_COM_CONTADOR)[number];

/** Quantas coisas esperam o cliente em cada tela; a tela sem número fica de fora. */
export type ContadoresDoMenu = Partial<Record<TelaComContador, number>>;

/**
 * O que o leitor de tela lê depois do nome: "Pendências, 2 esperando você". O
 * número na tela é só o selo; sem esta frase, "2" não diz de quê.
 */
export function oQueOContadorDiz(href: string, n: number): string {
  const um = n === 1;
  switch (href) {
    case "/portal/pendencias":
      return `${n} esperando você`;
    case "/portal/aprovacoes":
      return `${n} para aprovar`;
    case "/portal/solicitacoes":
      return `${n} esperando sua resposta`;
    case "/portal/comunicados":
      return `${n} ${um ? "não lido" : "não lidos"}`;
    default:
      return `${n} ${um ? "nova" : "novas"}`;
  }
}
