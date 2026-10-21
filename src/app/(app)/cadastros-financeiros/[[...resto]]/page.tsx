import { redirect } from "next/navigation";
import { CAMINHO_DOS_FORNECEDORES } from "@/lib/cadastrosNav";

// Rota antiga — Fornecedores e sacados saiu do menu do BPO e virou uma aba de
// Cadastros em 21/10/2026 (pedido do Kauan de 15/10). Fica como redirect para
// favorito, link do sino e link copiado não darem em página quebrada. A busca
// vai junto: `?empresa=…&aba=projetos` continua abrindo a mesma empresa e aba.
// Quem não é do BPO cai no 404 da tela nova, como caía aqui.
export default async function CadastrosFinanceirosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) busca.append(chave, v);
  }
  const resto = busca.toString();
  redirect(resto ? `${CAMINHO_DOS_FORNECEDORES}?${resto}` : CAMINHO_DOS_FORNECEDORES);
}
