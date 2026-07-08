import { Card } from "@/components/ui/Card";
import { SectorChip } from "@/components/ui/SectorChip";
import { InfoRow } from "@/components/empresas/InfoRow";
import type { ServiceStatus } from "@/generated/prisma/enums";

type CustomFieldValue = {
  id: string;
  label: string;
  fieldType: string;
  value: string | null;
};

type ServiceEntry = {
  id: string;
  sectorCode: string;
  status: ServiceStatus;
};

type Props = {
  company: {
    name: string;
    tradeName: string | null;
    cnpj: string | null;
    taxRegime: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    stateCode: string | null;
    zipCode: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    stateRegistration: string | null;
    municipalRegistration: string | null;
    nire: string | null;
    source: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  services: ServiceEntry[];
  sectorLabels: Record<string, string>;
  sectorColors: Record<string, string>;
  customFields: CustomFieldValue[];
};

export function CompanyOverviewSection({ company, services, sectorLabels, sectorColors, customFields }: Props) {
  const fullAddress = [
    company.addressStreet,
    company.addressNumber,
    company.addressComplement,
    company.neighborhood,
    company.city,
    company.stateCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Identificação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Razão Social" value={company.name} />
          <InfoRow label="Nome Fantasia" value={company.tradeName} />
          <InfoRow label="CNPJ" value={company.cnpj} mono />
          <InfoRow label="Regime Tributário" value={company.taxRegime} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="E-mail" value={company.email} />
          <InfoRow label="Telefone" value={company.phone} />
          <InfoRow label="Website" value={company.website} href={company.website ?? undefined} />
        </div>
      </Card>

      {fullAddress && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Endereço</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow
              label="Logradouro"
              value={[company.addressStreet, company.addressNumber].filter(Boolean).join(", ")}
            />
            <InfoRow label="Complemento" value={company.addressComplement} />
            <InfoRow label="Bairro" value={company.neighborhood} />
            <InfoRow label="Cidade / UF" value={[company.city, company.stateCode].filter(Boolean).join(" — ")} />
            <InfoRow label="CEP" value={company.zipCode} mono />
          </div>
        </Card>
      )}

      {(company.stateRegistration || company.municipalRegistration || company.nire) && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Dados Fiscais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3">
            <InfoRow label="Inscrição Estadual" value={company.stateRegistration} mono />
            <InfoRow label="Inscrição Municipal" value={company.municipalRegistration} mono />
            <InfoRow label="NIRE" value={company.nire} mono />
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">CRM</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Origem" value={company.source} />
          <InfoRow
            label="Criada em"
            value={company.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          />
          <InfoRow
            label="Atualizada"
            value={company.updatedAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">Serviços contratados</h2>
        {services.length === 0 ? (
          <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhum serviço cadastrado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <SectorChip
                key={s.id}
                label={`${sectorLabels[s.sectorCode] ?? s.sectorCode}${s.status !== "ACTIVE" ? " · inativo" : ""}`}
                color={s.status === "ACTIVE" ? (sectorColors[s.sectorCode] ?? "var(--c41-fg-muted)") : "var(--c41-fg-muted)"}
              />
            ))}
          </div>
        )}
      </Card>

      {customFields.length > 0 && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-4">Campos Adicionais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {customFields.map((f) => (
              <InfoRow
                key={f.id}
                label={f.label}
                value={f.fieldType === "BOOLEAN" ? (f.value === "true" ? "Sim" : "Não") : f.value}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
