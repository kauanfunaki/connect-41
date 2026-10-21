import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { TELAS_DO_BPO_NAS_SOLICITACOES } from "@/lib/module-catalog";

export type AbaDoAtendimento = "solicitacoes" | "pedidos" | "comunicados" | "envios" | "pendencias" | "aprovacoes";

const ABAS: AbaDeLink[] = [
  { chave: "solicitacoes", rotulo: "Solicitações dos clientes", href: "/solicitacoes" },
  { chave: "pedidos", rotulo: "Pedidos ao cliente", href: "/solicitacoes/pedidos" },
  { chave: "comunicados", rotulo: "Comunicados", href: "/solicitacoes/comunicados" },
  { chave: "envios", rotulo: "Envios", href: "/solicitacoes/envios" },
];

/**
 * O canal com o cliente, na mesma tela do menu Geral (01/10): o que o cliente
 * pede à 41, o que a 41 pede a um cliente, o que ela avisa a vários de uma vez
 * e, desde 08/10/2026, os documentos que ela manda a um cliente para ler e
 * aceitar (os "Envios", que moravam na ficha da empresa).
 *
 * As telas do grupo "Cliente" do BPO (21/10/2026): Pendências ao cliente e
 * Aprovações saíram do menu do BPO e viraram abas daqui, só para quem vê o BPO
 * (e o administrador) — o mesmo desenho de Fornecedores e sacados nos
 * Cadastros. A porta é a da tela (`podeNoModulo`: setor que opera o módulo e
 * módulo ligado); para os outros a aba nem aparece, e o endereço dá 404.
 *
 * Aba, e não pílula (02/10): cada uma troca a tela — a regra de 30/09.
 */
export async function AbasDoAtendimento({ ativa }: { ativa: AbaDoAtendimento }) {
  const ctx = await getAuthContext();
  const doBpo = await Promise.all(
    TELAS_DO_BPO_NAS_SOLICITACOES.map(async (t) => ((await podeNoModulo(ctx, t.modulo, "ver")) ? [{ chave: t.chave, rotulo: t.rotulo, href: t.href }] : []))
  );
  return <AbasDeLink ativa={ativa} abas={[...ABAS, ...doBpo.flat()]} />;
}
