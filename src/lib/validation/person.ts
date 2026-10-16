import { z } from "zod";
import { isValidCPF } from "./common";

const optionalCpf = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidCPF(v), { message: "CPF inválido." })
  .optional();

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, { message: "E-mail inválido." })
  .optional();

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), { message: "Data inválida." })
  .optional();

const requiredName = z.string().trim().min(1, "Nome é obrigatório.").max(180, "Nome muito longo.");

// Schema comum a Candidato e Colaborador (campos de pessoa física básicos).
// Valida só o que importa para integridade; o resto dos campos é livre.
const personCoreSchema = z
  .object({
    name: requiredName,
    cpf: optionalCpf,
    email: optionalEmail,
    birthDate: optionalDate,
    admissionDate: optionalDate,
    dismissalDate: optionalDate,
  })
  .refine(
    (d) => {
      if (!d.admissionDate || !d.dismissalDate || d.admissionDate === "" || d.dismissalDate === "") {
        return true;
      }
      return Date.parse(d.dismissalDate) >= Date.parse(d.admissionDate);
    },
    { message: "A data de demissão não pode ser anterior à de admissão." }
  );

// Valida os campos-chave do FormData. Retorna a primeira mensagem de erro ou
// null se estiver tudo certo. Não substitui o assemble do `data` — só barra
// entrada inválida antes de tocar o banco.
export function validatePersonForm(form: FormData): string | null {
  const parsed = personCoreSchema.safeParse({
    name: (form.get("name") as string) ?? "",
    cpf: (form.get("cpf") as string) ?? "",
    email: (form.get("email") as string) ?? "",
    birthDate: (form.get("birthDate") as string) ?? "",
    admissionDate: (form.get("admissionDate") as string) ?? "",
    dismissalDate: (form.get("dismissalDate") as string) ?? "",
  });
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Dados inválidos.";
}

const PERSON_FIELDS = { name: requiredName, cpf: optionalCpf, email: optionalEmail, birthDate: optionalDate } as const;
export type PersonField = keyof typeof PERSON_FIELDS;

// Só os campos de um bloco da ficha — a edição no próprio bloco (ficha do
// candidato, 14/10/2026) manda o Contato sem o Nome, e o formulário inteiro
// barraria por "Nome é obrigatório.". Mesmas regras e mesma ordem do
// `validatePersonForm`; devolve a primeira mensagem, ou null.
export function validatePersonFields(form: FormData, fields: readonly PersonField[]): string | null {
  for (const field of Object.keys(PERSON_FIELDS) as PersonField[]) {
    if (!fields.includes(field)) continue;
    const parsed = PERSON_FIELDS[field].safeParse((form.get(field) as string) ?? "");
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Dados inválidos.";
  }
  return null;
}
