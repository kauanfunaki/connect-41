// O que a caixa do WhatsApp (o layout de /whatsapp) reparte entre a lista da
// esquerda e o painel da direita — ver `CaixaDoWhatsapp`.

import { createContext, useContext } from "react";
import type { RecorteDaLista } from "@/lib/whatsapp/conversas";
import type { LinhaDeConversa } from "@/lib/whatsapp/data";
import type { PessoaDoAtendimento } from "@/lib/whatsapp/equipe";

export type DadosDaCaixa = {
  /** Todas as conversas, na ordem da fila — sem recorte. */
  conversas: LinhaDeConversa[];
  /** Agora, do servidor — o relógio do navegador pode estar noutro fuso. */
  agora: Date;
  /** Quem está olhando. */
  userId: string;
  /** Para quem dá para transferir — quem atende o WhatsApp do setor. */
  pessoas: PessoaDoAtendimento[];
};

export type ContextoDaCaixa = DadosDaCaixa & {
  recorte: RecorteDaLista;
  /** O recorte da URL, já aplicado. */
  doRecorte: LinhaDeConversa[];
  busca: string;
  setBusca: (busca: string) => void;
  /** O que está à esquerda agora: o recorte e a busca. É por aqui que o ↑↓ anda. */
  visiveis: LinhaDeConversa[];
  /** A conversa aberta no painel (da URL), ou nenhuma. */
  abertaId: string | null;
};

export const ContextoDaCaixaDoWhatsapp = createContext<ContextoDaCaixa | null>(null);

export function useCaixaDoWhatsapp(): ContextoDaCaixa {
  const c = useContext(ContextoDaCaixaDoWhatsapp);
  if (!c) throw new Error("useCaixaDoWhatsapp fora da CaixaDoWhatsapp (o layout de /whatsapp).");
  return c;
}
