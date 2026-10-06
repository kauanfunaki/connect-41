// Os textos do carrossel da entrada da equipe (06/10/2026).
//
// O do portal mostra ao cliente o que ele encontra lá dentro; este mostra à
// equipe o operacional do dia a dia no Connect. Cada slide fala de uma tela que
// existe — Meu dia, a fila de processos do Societário, contas a pagar e
// aprovações do BPO, a Agenda — e não promete o que o sistema não faz.
//
// Título curto e uma frase, no tom do portal. Separado das cenas
// (`CarrosselDaEquipe`) para a regra de texto ter teste.

export const SLIDES_DA_EQUIPE = [
  {
    chave: "meu-dia",
    titulo: "O seu dia, já em ordem",
    texto: "O Meu dia junta o que é seu: primeiro o atrasado, depois o que está andando e o que vem a seguir.",
  },
  {
    chave: "processos",
    titulo: "Os processos, etapa por etapa",
    texto: "A fila do Societário mostra o que está em exigência, no órgão ou com o cliente, e há quantos dias úteis.",
  },
  {
    chave: "contas",
    titulo: "Contas a pagar sem surpresa",
    texto: "O que vence hoje e o que já venceu ficam à vista, e a conta que depende do cliente só é paga depois do ok dele.",
  },
  {
    chave: "agenda",
    titulo: "A semana inteira numa agenda só",
    texto: "Vencimentos, prazos combinados, férias e exames dos seus setores entram sozinhos, ao lado das reuniões.",
  },
] as const;

export type ChaveDoSlideDaEquipe = (typeof SLIDES_DA_EQUIPE)[number]["chave"];
