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

// Schema comum a Candidato e Colaborador (campos de pessoa física básicos).
// Valida só o que importa para integridade; o resto dos campos é livre.
const personCoreSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório.").max(180, "Nome muito longo."),
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
