// Os anexos da conversa livre ficam em `storage/company-messages`, separados dos
// das pendências: são coisas diferentes, e pasta por assunto deixa o disco
// legível quando alguém precisar olhar.
//
// As regras de entrada são as mesmas (tipo pelos bytes, nome sorteado, teto de
// tamanho e de quantidade) porque vêm do mesmo lugar — ver `criarArmazenamento`.

import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

export const anexosDaConversa = criarArmazenamento("company-messages");
