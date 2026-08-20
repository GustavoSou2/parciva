import { Skeleton } from "@/ui/components/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-col gap-card-gap lg:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-card-gap md:grid-cols-6 lg:grid-cols-12">
          <Skeleton className="col-span-1 h-40 rounded-card md:col-span-4 lg:col-span-7" />
          <Skeleton className="col-span-1 h-40 rounded-card md:col-span-2 lg:col-span-5" />
          <Skeleton className="col-span-1 h-28 rounded-card md:col-span-2 lg:col-span-4" />
          <Skeleton className="col-span-1 h-28 rounded-card md:col-span-2 lg:col-span-4" />
          <Skeleton className="col-span-1 h-28 rounded-card md:col-span-2 lg:col-span-4" />
        </div>
        <div className="flex w-full flex-col gap-2 lg:w-rail lg:shrink-0">
          <Skeleton className="h-16 rounded-rail" />
          <Skeleton className="h-16 rounded-rail" />
          <Skeleton className="h-16 rounded-rail" />
        </div>
      </div>
    </>
  );
}
