import { redirect } from "next/navigation";

// O construtor dos campos, com criar e editar no painel ao lado, desde
// 20/10/2026 (escolhas 5A e 2B dos Ajustes de 15/10). Este endereço fica
// para os links antigos.
export default function NovoCampoPage() {
  redirect("/admin/campos?novo=1");
}
