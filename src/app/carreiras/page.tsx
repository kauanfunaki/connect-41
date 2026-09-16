import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal de vagas",
  // Página de passagem: sem conteúdo próprio, não precisa aparecer em busca.
  robots: { index: false, follow: false },
};

/**
 * `/carreiras` sem a empresa no endereço.
 *
 * O portal de vagas é por empresa (`/carreiras/<empresa>`). Até 16/09 este
 * endereço caía na tela de login do Connect — um candidato que apagasse o fim
 * do link via "Entrar" e achava que precisava de conta. Aqui ele lê o que falta.
 *
 * Não lista as empresas de propósito: a lista de clientes do Connect não é
 * pública. Quando a landing virar hub (ver o Quadro), é ela que decide o que
 * mostrar neste endereço.
 */
export default function CarreirasSemEmpresaPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[440px] text-center">
        <h1 className="text-[length:var(--fs-title)] font-semibold text-fg">Portal de vagas</h1>
        <p className="text-[length:var(--fs-body)] text-fg-muted mt-2">
          As vagas ficam na página de cada empresa. Use o link de carreiras que a empresa divulgou — ele termina com o
          nome dela, depois de <span className="font-mono">/carreiras/</span>.
        </p>
      </div>
    </main>
  );
}
