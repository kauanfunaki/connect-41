import { CascoDasConfiguracoes } from "@/components/configuracoes/CascoDasConfiguracoes";

// A trilha "Configurações › área" em volta da tela (escolha "Organização · A"
// do Kauan, 14/10/2026; o menu da esquerda saiu nos Ajustes de 15/10). Ver
// `CascoDasConfiguracoes`.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CascoDasConfiguracoes>{children}</CascoDasConfiguracoes>;
}
