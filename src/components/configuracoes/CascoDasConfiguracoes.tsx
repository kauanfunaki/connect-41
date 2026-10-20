import { getAuthContext } from "@/lib/auth/context";
import { menuDasConfiguracoes } from "@/lib/configuracoes/areas";
import { quemConfigura } from "@/lib/configuracoes/quem";
import { TrilhaDasConfiguracoes } from "@/components/configuracoes/TrilhaDasConfiguracoes";

/**
 * A moldura das telas de configuração: a trilha "Configurações › área" acima da
 * tela, que volta aos cartões do início. Usada pelos layouts de /admin,
 * /assinatura e /configuracoes — as telas em si não mudaram.
 *
 * Até 19/10 havia também um menu das áreas à esquerda: com a lateral do app
 * ao lado e os cartões no início, eram três caminhos para o mesmo lugar, e o
 * Kauan pediu para ficar só com os cartões (Ajustes 15/10, G7).
 *
 * Quem não tem nada a configurar além da própria conta (colaborador, Somente
 * leitura) vê a tela como sempre, sem trilha.
 */
export async function CascoDasConfiguracoes({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const quem = await quemConfigura(ctx);
  const menu = menuDasConfiguracoes(quem);
  if (!menu) return <>{children}</>;

  return (
    <>
      <TrilhaDasConfiguracoes quem={quem} />
      {children}
    </>
  );
}
