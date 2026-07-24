import { headers } from "next/headers";
import { getPrisma } from "@/lib/prisma";
import { hit, clientIp } from "@/lib/rateLimit";
import { DiscForm } from "@/components/teste/DiscForm";

export const metadata = { title: "Teste comportamental" };

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

export default async function TestePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = clientIp({ headers: h });

  const prisma = getPrisma();
  const link = await prisma.assessmentLink.findUnique({
    where: { token },
    include: {
      tenant: { select: { name: true } },
      person: { select: { name: true } },
    },
  });

  if (!link) {
    hit(`teste-view-miss:${ip}`, 20, 10 * 60_000);
    return <TokenInvalido titulo="Link inválido" texto="Este link de teste não existe ou foi digitado incorretamente. Solicite um novo ao recrutador." />;
  }
  if (link.status !== "PENDENTE") {
    return <TokenInvalido titulo="Teste já respondido" texto="Suas respostas já foram recebidas. Se precisar refazer o teste, entre em contato com o recrutador." />;
  }
  if (link.expiresAt < new Date()) {
    return <TokenInvalido titulo="Link expirado" texto="Este link de teste expirou. Solicite um novo ao recrutador." />;
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Olá, {link.person.name}!</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            {link.tenant.name} convidou você a responder um teste de perfil comportamental (DISC). Leva cerca de 10 minutos.
          </p>
        </header>

        <DiscForm token={token} />

        <p className="text-[11px] text-fg-muted mt-6 text-center">
          Processo conduzido por {link.tenant.name}. Suas respostas são usadas apenas para este processo seletivo (LGPD).
        </p>
      </div>
    </div>
  );
}
