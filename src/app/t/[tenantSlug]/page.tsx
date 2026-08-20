import { redirect } from "next/navigation";

/** Raiz do tenant nunca teve conteúdo próprio — landing natural agora é o Painel (spec §13.2 tela 1). */
export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  redirect(`/t/${tenantSlug}/dashboard`);
}
