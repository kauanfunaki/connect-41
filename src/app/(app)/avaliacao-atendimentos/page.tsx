import { redirect } from "next/navigation";

// Rota antiga — Avaliação de Atendimentos virou uma visão dentro de
// /conversas (?view=avaliacao) em vez de item de menu à parte. Mantido como
// redirect só pra não quebrar links/favoritos antigos.
export default function AvaliacaoAtendimentosRedirect() {
  redirect("/conversas?view=avaliacao");
}
