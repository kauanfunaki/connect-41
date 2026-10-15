import { redirect } from "next/navigation";

// O "Novo workspace" virou janela na lista (P19, 15/10/2026). O endereço antigo
// continua valendo: leva à lista com a janela aberta.
export default function NovoWorkspacePage() {
  redirect("/admin/workspaces?novo=1");
}
