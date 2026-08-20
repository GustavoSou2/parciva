import { Eyebrow } from "@/ui/components/Eyebrow";
import { CardSkeleton, Skeleton } from "@/ui/components/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="flex items-center justify-between">
        <Eyebrow>Contratos</Eyebrow>
        <Skeleton className="h-9 w-32" />
      </div>
      <CardSkeleton lines={5} />
    </>
  );
}
