import { Eyebrow } from "@/ui/components/Eyebrow";
import { CardSkeleton } from "@/ui/components/Skeleton";

export default function Loading() {
  return (
    <>
      <Eyebrow>Revisão</Eyebrow>
      <div className="grid grid-cols-1 gap-card-gap md:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
      <CardSkeleton lines={3} />
    </>
  );
}
