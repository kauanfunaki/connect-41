import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";

// Os anexos das solicitações, na mesma régua da pendência e da conversa
// (tipos conferidos pelos bytes, 10 MB, 5 por mensagem), numa pasta própria
// sob `storage/` — que é o volume persistente do EasyPanel.
export const anexosDaSolicitacao = criarArmazenamento("service-requests");
