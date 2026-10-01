import { redirect } from "next/navigation";

// Até 01/10/2026 esta tela abria um chamado no Hub da 41 Tech pedindo acesso.
// Saiu: o formulário público virou canal de propaganda, e no Connect
// comercializado quem libera acesso é o administrador de cada escritório. O
// endereço fica, levando ao login, para um link antigo não cair num 404.
export default function CriarContaPage() {
  redirect("/login");
}
