import { CadastrosTabSync } from "@/components/shared/CadastrosTabSync";

// Envolve todas as rotas de /empresas/* sem alterá-las — só marca esta seção
// como a última aba de "Cadastros" visitada (ver src/lib/cadastrosNav.ts).
export default function EmpresasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CadastrosTabSync tab="empresas" />
      {children}
    </>
  );
}
