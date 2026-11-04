import { Suspense } from "react";
import { Dashboard } from "../../features/dashboard/dashboard";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flow-loading">Carregando painel…</div>}>
      <Dashboard />
    </Suspense>
  );
}
