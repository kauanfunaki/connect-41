import type { ReactNode } from "react";

// O invólucro do motor permanece no grupo (legado), sem mudar as URLs.
export default function FiscalLayout({ children }: { children: ReactNode }) { return children; }
