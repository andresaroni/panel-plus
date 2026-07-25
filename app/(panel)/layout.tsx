import { PanelShell } from "@/components/panel-shell";
import { requireUser } from "@/lib/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <PanelShell user={user}>{children}</PanelShell>;
}
