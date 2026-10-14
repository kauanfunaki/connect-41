import { getPrisma } from "@/lib/prisma";
import { configDeCarreiras, ehDa41 } from "@/lib/carreiras/enderecoDeCarreiras";
import { imagemDeCompartilhamento41 } from "@/lib/carreiras/imagemDeCompartilhamento";
import { localLegivel } from "@/lib/carreiras/apresentacao";
import { CONTRATO_LABEL, MODALIDADE_LABEL, localDaVaga, whereDasVagasDoPortal } from "@/lib/carreiras/portal";
import { escritorioDoPortal } from "@/lib/carreiras/vagasDoPortal";

// A imagem de compartilhamento de uma vaga do 41 Carreiras (15/10/2026): o
// título, a empresa, a cidade, o modelo e o contrato, nas cores da 41
// Tallent. Vaga que saiu do portal (encerrada, fora do prazo) cai na imagem
// da capa — um link antigo no LinkedIn segue com uma prévia digna.
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; vagaId: string }> }) {
  const { slug, vagaId } = await params;
  const config = configDeCarreiras();
  if (!ehDa41(slug, config)) return new Response("Não encontrado", { status: 404 });

  const tenant = await escritorioDoPortal(slug);
  const vaga =
    tenant && ID.test(vagaId)
      ? await getPrisma().vaga.findFirst({
          where: { id: vagaId, ...whereDasVagasDoPortal(tenant.id, new Date()) },
          select: {
            title: true,
            workMode: true,
            contractType: true,
            workCity: true,
            workStateCode: true,
            company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
          },
        })
      : null;

  if (!vaga) {
    return imagemDeCompartilhamento41({
      selo: "Vagas abertas",
      titulo: "Encontre sua próxima vaga",
      linha: "Candidate-se em poucos minutos, sem criar conta nem senha.",
      etiquetas: [],
      endereco: config.principal,
    });
  }

  const onde = localDaVaga(vaga);
  const empresa = vaga.company.tradeName || vaga.company.name;
  const local = localLegivel(onde.cidade, onde.uf);
  return imagemDeCompartilhamento41({
    selo: "Vaga aberta",
    titulo: vaga.title,
    linha: [empresa, local].filter(Boolean).join(" · "),
    etiquetas: [vaga.workMode ? MODALIDADE_LABEL[vaga.workMode] : null, vaga.contractType ? CONTRATO_LABEL[vaga.contractType] : null].filter(
      (e): e is string => !!e,
    ),
    endereco: config.principal,
  });
}
