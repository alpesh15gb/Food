export default function MenuSkeleton() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero skeleton */}
      <div className="sf-shimmer h-[200px] rounded-b-2xl" />

      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        {/* Search bar skeleton */}
        <div className="mt-5">
          <div className="sf-shimmer h-11 rounded-full" />
        </div>

        {/* Menu card skeletons */}
        <div className="mt-6 space-y-4">
          {[1, 2, 3, 4, 5, 6].map((key) => (
            <div
              key={key}
              className="sf-card flex gap-4 p-4"
            >
              {/* Text content */}
              <div className="flex-1 space-y-3">
                <div className="sf-shimmer h-4 w-16 rounded" />
                <div className="sf-shimmer h-5 w-3/4 rounded" />
                <div className="sf-shimmer h-3 w-full rounded" />
                <div className="sf-shimmer h-3 w-2/3 rounded" />
                <div className="sf-shimmer h-4 w-20 rounded" />
              </div>
              {/* Image placeholder */}
              <div className="w-[120px] shrink-0">
                <div className="sf-shimmer aspect-[4/3] rounded-[12px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
