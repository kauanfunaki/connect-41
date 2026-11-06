import { GithubScreen } from "@/components/github/GithubScreen";

// Pessoas (06/11/2026): os desenvolvedores e os times, que eram abas do GitHub.
// "Agrupar por" troca entre um cartão por pessoa e um por time; montar os times
// e as cores fica em Times (botão no topo, só para quem gerencia o módulo).
export default function PessoasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GithubScreen view="developers" searchParams={searchParams} />;
}
