import { Eyebrow } from "@/ui/components/Eyebrow";
import { CardSkeleton } from "@/ui/components/Skeleton";

export default function Loading() {
  return (
    <>
      <Eyebrow>Conta</Eyebrow>
      <CardSkeleton lines={4} />
    </>
  );
}
