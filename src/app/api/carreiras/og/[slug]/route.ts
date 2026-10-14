import { configDeCarreiras, ehDa41 } from "@/lib/carreiras/enderecoDeCarreiras";
import { imagemDeCompartilhamento41 } from "@/lib/carreiras/imagemDeCompartilhamento";

// A imagem de compartilhamento da capa do 41 Carreiras (15/10/2026) — a que o
// LinkedIn, o WhatsApp e o Pandapé mostram na prévia do link. Só da 41: nos
// outros escritórios, 404 (e as páginas deles não apontam para cá).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = configDeCarreiras();
  if (!ehDa41(slug, config)) return new Response("Não encontrado", { status: 404 });
  return imagemDeCompartilhamento41({
    selo: "Vagas abertas",
    titulo: "Encontre sua próxima vaga",
    linha: "Candidate-se em poucos minutos, sem criar conta nem senha.",
    etiquetas: [],
    endereco: config.principal,
  });
}
