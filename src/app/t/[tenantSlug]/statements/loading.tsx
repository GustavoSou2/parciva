import { Eyebrow } from "@/ui/components/Eyebrow";
import { CardSkeleton } from "@/ui/components/Skeleton";

export default function Loading() {
  return (
    <>
      <Eyebrow>Extrato</Eyebrow>
      <CardSkeleton lines={5} />
    </>
  );
}
