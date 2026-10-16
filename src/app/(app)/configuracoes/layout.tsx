import { CascoDasConfiguracoes } from "@/components/configuracoes/CascoDasConfiguracoes";

// O menu das configurações e a trilha "Configurações › área" em volta da tela
// (escolha "Organização · A" do Kauan, 14/10/2026). Ver `CascoDasConfiguracoes`.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CascoDasConfiguracoes>{children}</CascoDasConfiguracoes>;
}
