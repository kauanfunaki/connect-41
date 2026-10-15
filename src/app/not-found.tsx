import { Button } from "@/components/ui/Button";
import { FileQuestion } from "lucide-react";
import { TelaDeAvisoPublica } from "@/components/publico/TelaDeAvisoPublica";

// 404 global — cobre rotas que não batem em nenhum segmento (fora do shell
// autenticado, ex: usuário deslogado digitando uma URL qualquer). No aviso único
// das telas públicas (15/10/2026), como o "Vaga não encontrada": era mais uma
// cópia à mão da mesma moldura.
export default function NotFound() {
  return (
    <TelaDeAvisoPublica icone={<FileQuestion />} titulo="Página não encontrada" texto="O endereço que você tentou acessar não existe.">
      <Button href="/home" className="mt-1">
        Ir para o início
      </Button>
    </TelaDeAvisoPublica>
  );
}
