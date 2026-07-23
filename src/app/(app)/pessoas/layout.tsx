import { CadastrosTabSync } from "@/components/shared/CadastrosTabSync";

// Envolve todas as rotas de /pessoas/* sem alterá-las — só marca esta seção
// como a última aba de "Cadastros" visitada (ver src/lib/cadastrosNav.ts).
export default function PessoasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CadastrosTabSync tab="pessoas" />
      {children}
    </>
  );
}
