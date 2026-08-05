// JSON-LD schema.org/JobPosting — é o que faz a vaga ser indexada pelo Google
// for Jobs. Sem isso o portal existe mas é invisível para quem procura emprego
// fora do site.
// Ref: https://developers.google.com/search/docs/appearance/structured-data/job-posting

type JobPostingInput = {
  title: string;
  description: string;
  datePosted: Date;
  /** Sem data de expiração explícita, o Google usa ~30 dias. */
  validThrough?: Date | null;
  companyName: string;
  companyUrl?: string | null;
  city?: string | null;
  stateCode?: string | null;
  quantity: number;
};

export function buildJobPostingJsonLd(input: JobPostingInput): string {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: input.title,
    description: input.description,
    datePosted: input.datePosted.toISOString().slice(0, 10),
    employmentType: "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: input.companyName,
      ...(input.companyUrl ? { sameAs: input.companyUrl } : {}),
    },
    directApply: true,
  };

  if (input.validThrough) {
    schema.validThrough = input.validThrough.toISOString().slice(0, 10);
  }

  // addressCountry é o mínimo aceito quando não há cidade/UF cadastradas —
  // omitir jobLocation inteiro faz o Google descartar a vaga.
  schema.jobLocation = {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      ...(input.city ? { addressLocality: input.city } : {}),
      ...(input.stateCode ? { addressRegion: input.stateCode } : {}),
      addressCountry: "BR",
    },
  };

  if (input.quantity > 1) {
    schema.totalJobOpenings = input.quantity;
  }

  return JSON.stringify(schema);
}

// canonical/og:url exigem URL ABSOLUTA — uma relativa é descartada (ou pior,
// interpretada errado) por crawler e por scraper de rede social. Quando
// APP_PUBLIC_URL não está configurada, é melhor omitir as duas tags do que
// emitir tag inválida.
export function publicUrl(path: string): string | null {
  const base = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) return null;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// Descrição curta pra <meta description> e og:description (limite prático ~160
// caracteres nos resultados de busca).
export function buildJobSummary(
  title: string,
  companyName: string,
  local: string | null,
  description: string | null
): string {
  if (description?.trim()) {
    const plain = description.replace(/[#*_`>\-\r]/g, " ").replace(/\s+/g, " ").trim();
    if (plain.length > 0) return plain.length > 155 ? `${plain.slice(0, 152)}…` : plain;
  }
  return `Vaga de ${title} na ${companyName}${local ? ` em ${local}` : ""}. Candidate-se pelo portal de vagas.`;
}
