"use client";
import { Component } from "react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

/** O menu e a escolha de empresa ficam fora da fronteira de erro da área. */
export class LimiteDaAreaContabil extends Component<{ children: React.ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  render() {
    return this.state.erro ? <Aviso tom="atencao"><p>Não foi possível carregar esta área. As outras áreas continuam disponíveis.</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => window.location.reload()}>Tentar novamente</Button></Aviso> : this.props.children;
  }
}
