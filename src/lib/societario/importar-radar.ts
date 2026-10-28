// As licenças do Radar Societário para as Licenças do Connect (28/10/2026) —
// regras puras. A leitura da API do Radar e a gravação ficam em
// ./importar-radar-servidor.ts.
//
// ─── O que o Radar tem ──────────────────────────────────────────────────────
//
// O Radar (pasta `radar-societario`: Express + o MySQL do Aditiva Pronto,
// tabelas `rs_*`, sem login) guarda N licenças por empresa, inclusive do mesmo
// tipo, em 9 tipos fixos; `license_label` é o complemento que diferencia duas
// do mesmo tipo ("veicular"). O vencimento é data OU texto livre ("isento",
// "em andamento"); `applicable = false` é "não se aplica". Anexos em disco, um
// por licença ou mais.
//
// ─── Como entra no Connect ──────────────────────────────────────────────────
//
// - Empresa casada pelo CNPJ; sem par, fica de fora e aparece na prévia.
// - Tipo + complemento viram o `kind` ("Vigilância Sanitária — veicular"); em
//   "Outros", o complemento sozinho.
// - Texto livre no vencimento vai para as observações e a licença fica SEM
//   validade. No Connect "sem validade" é "não vence": por isso a prévia lista
//   cada uma, para o setor conferir.
// - "Não se aplica" não vira licença: o Connect não tem esse estado.
// - Órgão: ligado quando o tipo aponta para um, e só um, órgão do cadastro.
// - A marca "[Radar #id]" nas observações é o que impede trazer duas vezes.

export const TIPOS_DO_RADAR = [
  "alvara_funcionamento",
  "meio_ambiente",
  "vigilancia_sanitaria",
  "corpo_bombeiros",
  "ibama",
  "taxa_alvara_anual",
  "alvara_policia",
  "antt",
  "outros",
] as const;
export type TipoDoRadar = (typeof TIPOS_DO_RADAR)[number];

export const ROTULO_DO_TIPO_DO_RADAR: Record<TipoDoRadar, string> = {
  alvara_funcionamento: "Alvará de Funcionamento",
  meio_ambiente: "Meio Ambiente",
  vigilancia_sanitaria: "Vigilância Sanitária",
  corpo_bombeiros: "Corpo de Bombeiros",
  ibama: "IBAMA",
  taxa_alvara_anual: "Taxa de Alvará Anual",
  alvara_policia: "Alvará da Polícia",
  antt: "ANTT",
  outros: "Outros",
};

/** O nome do órgão que o tipo aponta, no cadastro do setor. Alvará fica de fora: há uma prefeitura por cidade. */
const ORGAO_DO_TIPO: Partial<Record<TipoDoRadar, RegExp>> = {
  meio_ambiente: /AMBIENT/,
  vigilancia_sanitaria: /VIGILANCIA|SANITARI/,
  corpo_bombeiros: /BOMBEIRO/,
  ibama: /IBAMA/,
  alvara_policia: /POLICIA/,
  antt: /\bANTT\b/,
};

export type EmpresaDoRadar = {
  id: string;
  razao_social: string;
  razao_social_manual?: string | null;
  cnpj: string | null;
};

export type LicencaDoRadar = {
  id: number;
  license_type: string;
  license_label: string | null;
  /** "AAAA-MM-DD": o Radar lê DATE como texto. */
  expiration_date: string | null;
  expiration_date_text: string | null;
  notes: string | null;
  applicable: boolean | number | null;
};

export type AnexoDoRadar = { id: number; license_id: number | null; original_name: string; mime_type: string | null };

export type DoRadar = { empresa: EmpresaDoRadar; licencas: LicencaDoRadar[]; anexos: AnexoDoRadar[] };

export type LicencaPlanejada = {
  radarId: number;
  companyId: string;
  empresa: string;
  kind: string;
  organId: string | null;
  expiresAt: Date | null;
  notes: string;
  /** O vencimento que veio em texto, para a prévia. */
  textoDoVencimento: string | null;
  anexos: AnexoDoRadar[];
};

export type PlanoDoRadar = {
  licencas: LicencaPlanejada[];
  semEmpresa: { empresa: string; cnpj: string | null; licencas: number }[];
  naoSeAplica: number;
  jaImportadas: number;
};

const MAX_TIPO = 120;
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export const marcaDoRadar = (id: number) => `[Radar #${id}]`;

/** As licenças do Radar já trazidas, pelas marcas nas observações. */
export function jaImportadasDoRadar(observacoes: (string | null)[]): Set<number> {
  const ids = new Set<number>();
  for (const o of observacoes) for (const m of (o ?? "").matchAll(/\[Radar #(\d+)\]/g)) ids.add(Number(m[1]));
  return ids;
}

export function tipoDaLicenca(tipo: string, complemento: string | null): string {
  const extra = (complemento ?? "").trim();
  const base = ROTULO_DO_TIPO_DO_RADAR[tipo as TipoDoRadar] ?? tipo;
  const kind = tipo === "outros" && extra ? extra : extra ? `${base} — ${extra}` : base;
  return kind.slice(0, MAX_TIPO);
}

/** "AAAA-MM-DD" como data-calendário: meia-noite UTC, como toda data do Connect. */
function dataDoRadar(v: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function orgaoDoTipo(tipo: string, orgaos: { id: string; name: string }[]): string | null {
  const re = ORGAO_DO_TIPO[tipo as TipoDoRadar];
  if (!re) return null;
  const achados = orgaos.filter((o) => re.test(semAcento(o.name)));
  return achados.length === 1 ? achados[0].id : null;
}

export function planejarDoRadar(
  radar: DoRadar[],
  connect: { empresas: { id: string; cnpj: string | null }[]; orgaos: { id: string; name: string }[]; jaImportadas: Set<number>; hoje: string }
): PlanoDoRadar {
  const porCnpj = new Map<string, string>();
  for (const e of connect.empresas) {
    const d = digitos(e.cnpj);
    if (d.length === 14 && !porCnpj.has(d)) porCnpj.set(d, e.id);
  }

  const plano: PlanoDoRadar = { licencas: [], semEmpresa: [], naoSeAplica: 0, jaImportadas: 0 };
  for (const { empresa, licencas, anexos } of radar) {
    const nome = (empresa.razao_social_manual ?? "").trim() || empresa.razao_social;
    const aplicaveis = licencas.filter((l) => l.applicable !== false && l.applicable !== 0);
    plano.naoSeAplica += licencas.length - aplicaveis.length;
    const companyId = porCnpj.get(digitos(empresa.cnpj));
    if (!companyId) {
      if (aplicaveis.length) plano.semEmpresa.push({ empresa: nome, cnpj: empresa.cnpj, licencas: aplicaveis.length });
      continue;
    }
    for (const l of aplicaveis) {
      if (connect.jaImportadas.has(l.id)) {
        plano.jaImportadas++;
        continue;
      }
      const expiresAt = dataDoRadar(l.expiration_date);
      const texto = (l.expiration_date_text ?? "").trim() || null;
      const notes = [
        (l.notes ?? "").trim(),
        texto && !expiresAt ? `Vencimento no Radar: ${texto}.` : "",
        `Trazida do Radar Societário em ${connect.hoje.split("-").reverse().join("/")} ${marcaDoRadar(l.id)}.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      plano.licencas.push({
        radarId: l.id,
        companyId,
        empresa: nome,
        kind: tipoDaLicenca(l.license_type, l.license_label),
        organId: orgaoDoTipo(l.license_type, connect.orgaos),
        expiresAt,
        notes,
        textoDoVencimento: !expiresAt ? texto : null,
        anexos: anexos.filter((a) => a.license_id === l.id),
      });
    }
  }
  plano.semEmpresa.sort((a, b) => a.empresa.localeCompare(b.empresa));
  return plano;
}

/** "Licença - Vigilância Sanitária - alvara.pdf": o nome do anexo nos Arquivos. */
export function nomeDoAnexo(kind: string, original: string): string {
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `Licença - ${limpo(kind).slice(0, 80)} - ${limpo(original).slice(0, 120) || "anexo"}`;
}
