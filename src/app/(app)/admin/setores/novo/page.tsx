import { redirect } from "next/navigation";

// Setores e módulos numa tela só, com criar e editar no painel ao lado, desde
// 20/10/2026 (escolhas 4A e 2B dos Ajustes de 15/10). Este endereço fica para
// os links antigos.
export default function NovoSetorPage() {
  redirect("/admin/setores?novo=1");
}
