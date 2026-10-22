import { getAuthContext } from "@/lib/auth/context";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { MotorIndisponivel } from "@/components/fiscal/motor/CascoDoMotor";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const conectado = await modoDoFiscal(ctx) === "motor";
  return <PageContainer>{conectado ? children : <MotorIndisponivel />}</PageContainer>;
}
