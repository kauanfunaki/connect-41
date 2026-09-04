import { redirect } from "next/navigation";

// O cliente usa o MESMO formulário de recuperação da equipe: a action já procura
// nas duas tabelas e manda o link certo conforme onde o e-mail está. Uma tela só
// evita que o cliente precise saber que existem duas.
export default function EsqueciSenhaDoPortal() {
  redirect("/login/esqueci-senha");
}
