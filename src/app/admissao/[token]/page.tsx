import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { AdmissaoForm } from "@/components/admissao/AdmissaoForm";

export const metadata = { title: "Admissão" };

function TokenInvalido({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-semibold text-fg mb-2">{titulo}</h1>
        <p className="text-[13px] text-fg-muted">{texto}</p>
      </div>
    </div>
  );
}

export default async function AdmissaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = clientIp({ headers: h });

  const prisma = getPrisma();
  const link = await prisma.admissaoLink.findUnique({
    where: { token },
    include: {
      tenant: { select: { name: true } },
      person: {
        select: {
          name: true, cpf: true, rg: true, pis: true, ctps: true, ctpsSerie: true, education: true,
          birthDate: true, zipCode: true, addressStreet: true, addressNumber: true, addressComplement: true,
          neighborhood: true, city: true, stateCode: true,
          bankName: true, bankAgency: true, bankAccount: true, bankAccountType: true,
          currentCompany: { select: { name: true } },
        },
      },
    },
  });

  if (!link) {
    hit(`admissao-view-miss:${ip}`, 20, 10 * 60_000);
    return <TokenInvalido titulo="Link inválido" texto="Este link de admissão não existe ou foi digitado incorretamente. Solicite um novo ao RH." />;
  }
  if (link.status !== "PENDENTE") {
    return <TokenInvalido titulo="Admissão já enviada" texto="Seus dados já foram recebidos. Se precisar corrigir algo, entre em contato com o RH." />;
  }
  if (link.expiresAt < new Date()) {
    return <TokenInvalido titulo="Link expirado" texto="Este link de admissão expirou. Solicite um novo ao RH." />;
  }

  const p = link.person;
  const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Bem-vindo(a), {p.name}!</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            Preencha seus dados e envie seus documentos para concluir sua admissão
            {p.currentCompany ? ` na ${p.currentCompany.name}` : ""}. Leva poucos minutos.
          </p>
        </header>

        <AdmissaoForm
          token={token}
          defaults={{
            cpf: p.cpf ?? "",
            rg: p.rg ?? "",
            pis: p.pis ?? "",
            ctps: p.ctps ?? "",
            ctpsSerie: p.ctpsSerie ?? "",
            education: p.education ?? "",
            birthDate: toDateInput(p.birthDate),
            zipCode: p.zipCode ?? "",
            addressStreet: p.addressStreet ?? "",
            addressNumber: p.addressNumber ?? "",
            addressComplement: p.addressComplement ?? "",
            neighborhood: p.neighborhood ?? "",
            city: p.city ?? "",
            stateCode: p.stateCode ?? "",
            bankName: p.bankName ?? "",
            bankAgency: p.bankAgency ?? "",
            bankAccount: p.bankAccount ?? "",
            bankAccountType: p.bankAccountType ?? "",
          }}
        />

        <p className="text-[11px] text-fg-muted mt-6 text-center">
          Processo conduzido por {link.tenant.name}. Seus dados são usados apenas para sua admissão (LGPD).
        </p>
      </div>
    </div>
  );
}
