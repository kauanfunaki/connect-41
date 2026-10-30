import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { urlDoHub } from "@/lib/carreiras/enderecoDeCarreiras";

// Dinâmica de propósito: o destino vem de variável de ambiente lida em
// runtime. Estática, a página seria gerada no build — onde as variáveis do
// EasyPanel não existem — e nunca redirecionaria.
export const dynamic = "force-dynamic";

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
 * pública.
 *
 * Com o 41 Carreiras configurado (14/10/2026), quem chega aqui vai para o
 * portal da 41 (o link "Vagas" do site levava para cá). Sem a configuração,
 * fica a página de passagem de antes.
 */
export default function CarreirasSemEmpresaPage() {
  const hub = urlDoHub();
  if (hub) redirect(hub);

  // No aviso único das telas públicas (15/10/2026), como o "Vaga não
  // encontrada": eram um título e um texto soltos.
  // O `<main>` vem da própria `TelaDeAvisoPublica` desde 30/10/2026.
  return (
    <TelaDeAvisoPublica
      titulo="Portal de vagas"
      texto="As vagas ficam na página de cada empresa. Use o link de carreiras que a empresa divulgou — ele termina com o nome dela, depois de “/carreiras/”."
      icone={<Briefcase />}
    />
  );
}
