import Skeleton from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="mb-8">
        <Skeleton className="h-4 w-40 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <Skeleton className="h-4 w-36 mb-3" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <div>
          <Skeleton className="h-4 w-28 mb-3" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
