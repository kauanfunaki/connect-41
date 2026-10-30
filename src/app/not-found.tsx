import { FileQuestion } from "lucide-react";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";
import { BotaoDoNaoEncontrado } from "@/components/publico/BotaoDoNaoEncontrado";

// 404 global — cobre rotas que não batem em nenhum segmento (fora do shell
// autenticado, ex: usuário deslogado digitando uma URL qualquer). No aviso único
// das telas públicas (15/10/2026), como o "Vaga não encontrada": era mais uma
// cópia à mão da mesma moldura.
//
// O destino do botão depende de onde a pessoa estava (auditoria de UX,
// 30/10/2026): ia sempre ao /home, e o candidato ou o cliente que errava um
// endereço caía no login da equipe.
export default function NotFound() {
  return (
    <TelaDeAvisoPublica icone={<FileQuestion />} titulo="Página não encontrada" texto="O endereço que você tentou acessar não existe.">
      <BotaoDoNaoEncontrado />
    </TelaDeAvisoPublica>
  );
}
