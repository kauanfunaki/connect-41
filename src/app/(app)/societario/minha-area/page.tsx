import { redirect } from "next/navigation";

// A Minha área do Societário virou parte do Meu dia (fila única, lote 7,
// 28/10/2026): os processos da pessoa já vinham na lista do Meu dia, pela
// Gestão, e as exigências, taxas e licenças entram no bloco "No Societário,
// com você". Os prazos também aparecem na Agenda. Este endereço fica para os
// links antigos e para o atalho do menu.
export default function MinhaAreaPage() {
  redirect("/tarefas#societario");
}
