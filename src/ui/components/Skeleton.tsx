/**
 * Placeholder de carregamento (PROMPT_REFATORACAO.md — shimmer em vez de
 * spinner genérico). Usado pelos `loading.tsx` de cada rota — a forma é
 * genérica de propósito (não tenta prever o layout exato da página real,
 * só o "peso" — um Eyebrow + um cartão), igual a qualquer skeleton
 * screen: aproxima a silhueta, não o conteúdo.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-shimmer rounded-field ${className}`} />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card border-hairline border-line-hairline bg-surface-card p-card-pad shadow-card">
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === 0 ? "w-1/4" : i % 2 === 0 ? "w-1/2" : "w-2/3"}`} />
        ))}
      </div>
    </div>
  );
}
