export default function MenuSkeleton() {
  return (
    <div className="storefront">
      <main className="sf-hero-bg min-h-screen" style={{ background: "var(--sf-bg)" }}>
        {/* Nav skeleton */}
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-2.5">
            <div className="sf-shimmer h-9 w-9 rounded-full" />
            <div className="sf-shimmer h-5 w-32 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="sf-shimmer h-9 w-9 rounded-full" />
            <div className="sf-shimmer h-9 w-9 rounded-full" />
            <div className="sf-shimmer hidden h-9 w-24 rounded-full sm:block" />
          </div>
        </div>

        {/* Hero skeleton */}
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-2 lg:px-10 lg:pb-20 lg:pt-16">
          <div className="space-y-4">
            <div className="sf-shimmer h-3 w-40 rounded-full" />
            <div className="sf-shimmer h-12 w-4/5 rounded" />
            <div className="sf-shimmer h-12 w-3/5 rounded" />
            <div className="sf-shimmer h-4 w-full rounded" />
            <div className="sf-shimmer h-4 w-2/3 rounded" />
            <div className="flex gap-3 pt-2">
              <div className="sf-shimmer h-11 w-32 rounded-full" />
              <div className="sf-shimmer h-11 w-32 rounded-full" />
            </div>
          </div>
          <div className="mx-auto">
            <div className="sf-shimmer h-64 w-64 rounded-full sm:h-80 sm:w-80" />
          </div>
        </div>

        {/* Menu header skeleton */}
        <div className="sf-menu-glow">
          <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-16 text-center sm:px-6 lg:px-10">
            <div className="sf-shimmer mx-auto h-3 w-24 rounded-full" />
            <div className="sf-shimmer mx-auto mt-4 h-10 w-72 rounded" />
            <div className="sf-shimmer mx-auto mt-4 h-4 w-96 max-w-full rounded" />
            <div className="mt-9 flex flex-wrap justify-center gap-2.5">
              {[1, 2, 3, 4, 5].map((key) => (
                <div key={key} className="sf-shimmer h-9 w-20 rounded-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Menu card skeletons — horizontal layout, 2 columns */}
        <div className="mx-auto max-w-[1100px] px-4 pb-16 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((key) => (
              <div key={key} className="sf-card flex items-center gap-4 p-4">
                <div className="sf-shimmer h-16 w-16 shrink-0 rounded-full sm:h-20 sm:w-20" />
                <div className="flex-1 space-y-2">
                  <div className="sf-shimmer h-4 w-2/3 rounded" />
                  <div className="sf-shimmer h-3 w-1/3 rounded" />
                  <div className="sf-shimmer h-3 w-full rounded" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="sf-shimmer h-4 w-14 rounded" />
                  <div className="sf-shimmer h-9 w-9 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
