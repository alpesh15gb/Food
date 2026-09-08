export default function MenuSkeleton() {
  return (
    <div className="storefront">
      <main className="min-h-screen" style={{ background: "var(--sf-bg)" }}>
        {/* Hero skeleton */}
        <div className="mx-auto max-w-[1440px] px-4 pt-6 sm:px-6 lg:px-10">
          <div className="sf-shimmer h-8 w-48 rounded-lg" />
          <div className="mt-3 sf-shimmer h-4 w-72 rounded" />
          <div className="mt-4 sf-shimmer h-4 w-96 rounded" />
        </div>

        {/* Category pills skeleton */}
        <div className="mx-auto mt-8 max-w-[1440px] px-4 sm:px-6 lg:px-10">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((k) => (
              <div key={k} className="sf-shimmer h-10 w-24 shrink-0 rounded-full" />
            ))}
          </div>
        </div>

        {/* Grid card skeletons */}
        <div className="mx-auto mt-6 max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((key) => (
              <div key={key} className="sf-card overflow-hidden">
                <div className="sf-shimmer aspect-[4/3] w-full" />
                <div className="space-y-3 p-4">
                  <div className="sf-shimmer h-5 w-3/4 rounded" />
                  <div className="sf-shimmer h-3 w-full rounded" />
                  <div className="sf-shimmer h-3 w-2/3 rounded" />
                  <div className="flex items-end justify-between pt-2">
                    <div className="sf-shimmer h-5 w-16 rounded" />
                    <div className="sf-shimmer h-9 w-9 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
