import { getAuthContext } from "@/lib/auth/context";
import { menuDasConfiguracoes } from "@/lib/configuracoes/areas";
import { quemConfigura } from "@/lib/configuracoes/quem";
import { MenuDasConfiguracoes } from "@/components/configuracoes/MenuDasConfiguracoes";
import { TrilhaDasConfiguracoes } from "@/components/configuracoes/TrilhaDasConfiguracoes";

/**
 * A moldura das telas de configuração: o menu das áreas à esquerda (no celular,
 * um botão no topo) e a trilha "Configurações › área" acima da tela. Usada pelos
 * layouts de /admin, /assinatura e /configuracoes — as telas em si não mudaram.
 *
 * Quem não tem nada a configurar além da própria conta (colaborador, Somente
 * leitura) vê a tela como sempre, sem menu.
 */
export async function CascoDasConfiguracoes({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const quem = await quemConfigura(ctx);
  const menu = menuDasConfiguracoes(quem);
  if (!menu) return <>{children}</>;

  return (
    <div className="lg:flex lg:items-start">
      <MenuDasConfiguracoes menu={menu} />
      <div className="flex-1 min-w-0">
        <TrilhaDasConfiguracoes quem={quem} />
        {children}
      </div>
    </div>
  );
}
