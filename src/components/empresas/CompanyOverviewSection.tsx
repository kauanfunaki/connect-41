import { Card } from "@/components/ui/Card";
import { InfoRow } from "@/components/empresas/InfoRow";
import { formatCalendarDate, formatInstantDate, formatDocumento, formatPhone, formatCep } from "@/lib/format";
import { rotuloDoDocumento } from "@/lib/companyTaxId";

type CustomFieldValue = {
  id: string;
  label: string;
  fieldType: string;
  value: string | null;
};

type Props = {
  company: {
    name: string;
    tradeName: string | null;
    displayName: string | null;
    kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
    cnpj: string | null;
    cpf: string | null;
    taxRegime: string | null;
    externalId: string | null;
    foundationDate: Date | null;
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
    cnaePrincipal: string | null;
    cnaeSecundarios: string | null;
    source: string | null;
    clientGroup: { id: string; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
  };
  customFields: CustomFieldValue[];
};

// Revisão de alinhamento (30/09): todos os cartões da ficha usam a mesma
// grade de quatro colunas (duas no tablet), então os rótulos de um cartão
// caem na mesma vertical dos do cartão de baixo. Antes cada um tinha a sua —
// duas colunas de meia tela aqui, três ali —, e com a ficha na largura toda
// um CNPJ ficava a 600px do rótulo vizinho. Nome e lista ocupam duas colunas.
const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4";
const TITULO = "text-section font-semibold text-fg mb-4";

export function CompanyOverviewSection({ company, customFields }: Props) {
  const ehPF = company.kind === "PESSOA_FISICA";
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
        <h2 className={TITULO}>Identificação</h2>
        <div className={GRADE}>
          <InfoRow
            label={company.kind === "PESSOA_FISICA" ? "Nome" : "Razão Social"}
            value={company.name}
            className="sm:col-span-2"
          />
          <InfoRow label="Nome fantasia" value={company.tradeName} className="sm:col-span-2" />
          <InfoRow
            label={rotuloDoDocumento(company.kind)}
            value={formatDocumento(company.kind, company.cnpj, company.cpf)}
            mono
          />
          <InfoRow
            label="Data de abertura"
            value={company.foundationDate ? formatCalendarDate(company.foundationDate, { day: "2-digit", month: "long", year: "numeric" }) : null}
          />
          <InfoRow label="Nome no sistema" value={company.displayName} />
          <InfoRow label="ID" value={company.externalId} mono />
          <InfoRow label="Regime tributário" value={company.taxRegime} className="sm:col-span-2" />
          <InfoRow label="Cliente" value={company.clientGroup?.name ?? null} className="sm:col-span-2" />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className={TITULO}>Contato</h2>
        <div className={GRADE}>
          <InfoRow label="E-mail" value={company.email} className="sm:col-span-2" />
          <InfoRow label="Telefone" value={formatPhone(company.phone)} />
          <InfoRow label="Website" value={company.website} href={company.website ?? undefined} />
        </div>
      </Card>

      {fullAddress && (
        <Card className="p-5">
          <h2 className={TITULO}>Endereço</h2>
          <div className={GRADE}>
            <InfoRow
              label="Logradouro"
              value={[company.addressStreet, company.addressNumber].filter(Boolean).join(", ")}
              className="sm:col-span-2"
            />
            <InfoRow label="Complemento" value={company.addressComplement} />
            <InfoRow label="CEP" value={formatCep(company.zipCode)} mono />
            <InfoRow label="Bairro" value={company.neighborhood} className="sm:col-span-2" />
            <InfoRow label="Cidade / UF" value={[company.city, company.stateCode].filter(Boolean).join(" — ")} />
          </div>
        </Card>
      )}

      {(company.municipalRegistration ||
        (!ehPF &&
          (company.stateRegistration || company.nire || company.cnaePrincipal || company.cnaeSecundarios))) && (
        <Card className="p-5">
          <h2 className={TITULO}>Dados Fiscais</h2>
          {/* Os mesmos campos que o formulário não pede para PF não aparecem
              aqui — senão a ficha de uma pessoa física mostraria quatro linhas
              com "—" logo abaixo da única que ela pode ter. */}
          <div className={GRADE}>
            {!ehPF && <InfoRow label="Inscrição Estadual" value={company.stateRegistration} mono />}
            <InfoRow label="Inscrição Municipal" value={company.municipalRegistration} mono />
            {!ehPF && (
              <>
                <InfoRow label="NIRE" value={company.nire} mono />
                <InfoRow label="CNAE Principal" value={company.cnaePrincipal} mono />
                <InfoRow label="CNAEs Secundários" value={company.cnaeSecundarios} mono className="sm:col-span-2 lg:col-span-4" />
              </>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className={TITULO}>CRM</h2>
        <div className={GRADE}>
          <InfoRow label="Origem" value={company.source} className="sm:col-span-2" />
          <InfoRow
            label="Criada em"
            value={formatInstantDate(company.createdAt, { day: "2-digit", month: "long", year: "numeric" })}
          />
          <InfoRow
            label="Atualizada"
            value={formatInstantDate(company.updatedAt, { day: "2-digit", month: "long", year: "numeric" })}
          />
        </div>
      </Card>

      {customFields.length > 0 && (
        <Card className="p-5">
          <h2 className={TITULO}>Campos Adicionais</h2>
          <div className={GRADE}>
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
