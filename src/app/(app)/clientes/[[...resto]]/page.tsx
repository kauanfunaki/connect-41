import { redirect } from "next/navigation";

// Rota antiga — a tela Clientes saiu em 15/10/2026 (etapa 3 da saída do
// Cliente): o cadastro é por empresa, e o acesso ao portal se liga na ficha
// de cada uma. Fica como redirect para Empresas, para favorito e link antigo
// (a lista, a ficha, "Novo cliente", "Editar") não darem em página quebrada.
// O catch-all opcional pega /clientes e tudo abaixo dele.
export default function ClientesRedirect() {
  redirect("/empresas");
}
