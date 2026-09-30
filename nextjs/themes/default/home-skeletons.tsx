const DEFAULT_ROWS = 5;

function rowWidth(index: number): string {
  return index % 3 === 1 ? "w-3/5" : index % 3 === 2 ? "w-2/3" : "w-4/5";
}

export function SolunePostRowsSkeleton({ rows = DEFAULT_ROWS }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="solune-latest-list">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index}>
          <div className="solune-latest-row">
            <div className={`skeleton h-4 ${rowWidth(index)}`} />
            <div className="skeleton h-3 w-12 shrink-0" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SolunePopularRowsSkeleton({ rows = DEFAULT_ROWS }: { rows?: number }) {
  return (
    <ol aria-hidden="true" className="solune-popular-list">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index}>
          <div className="solune-popular-item">
            <div className="skeleton h-3 w-4 shrink-0" />
            <div className={`skeleton h-4 ${rowWidth(index)} min-w-0`} />
            <div className="skeleton ml-auto h-3 w-8 shrink-0" />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SoluneCommentRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="solune-comment-list">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index}>
          <div className="solune-comment-link">
            <div className={`skeleton h-4 ${rowWidth(index)}`} />
            <div className="solune-comment-meta">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-3 w-12" />
              <div className="skeleton h-3 w-10" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SolunePanelSkeleton({ rows = DEFAULT_ROWS }: { rows?: number }) {
  return (
    <section className="solune-reference-panel" aria-hidden="true">
      <div className="solune-panel-head">
        <div className="skeleton h-5 w-28" />
        <div className="skeleton h-4 w-14" />
      </div>
      <div className="solune-panel-body">
        <SolunePostRowsSkeleton rows={rows} />
      </div>
    </section>
  );
}

export function SoluneSidebarWidgetSkeleton({ rows = DEFAULT_ROWS }: { rows?: number }) {
  return (
    <section className="solune-sidebar-widget" aria-hidden="true">
      <header className="solune-sidebar-widget-head">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-3 w-10" />
      </header>
      <div className="solune-sidebar-widget-body">
        <SolunePopularRowsSkeleton rows={rows} />
      </div>
    </section>
  );
}

export function SoluneGalleryPanelSkeleton() {
  return (
    <section className="solune-reference-panel solune-gallery-panel" aria-hidden="true">
      <div className="solune-panel-head">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-4 w-14" />
      </div>
      <div className="solune-panel-body">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="grid gap-2">
              <div className="skeleton aspect-square w-full rounded-lg" />
              <div className={`skeleton h-4 ${rowWidth(index)}`} />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SoluneVisitWidgetSkeleton() {
  return (
    <section className="solune-sidebar-widget" aria-hidden="true">
      <header className="solune-sidebar-widget-head">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-3 w-12" />
      </header>
      <div className="solune-sidebar-widget-body grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <div className="skeleton h-3 w-10" />
          <div className="skeleton h-6 w-16" />
        </div>
        <div className="grid gap-2">
          <div className="skeleton h-3 w-10" />
          <div className="skeleton h-6 w-16" />
        </div>
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-3 w-20" />
      </div>
    </section>
  );
}

export function SolunePollWidgetSkeleton() {
  return (
    <section className="solune-sidebar-widget" aria-hidden="true">
      <header className="solune-sidebar-widget-head">
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-3 w-12" />
      </header>
      <div className="solune-sidebar-widget-body grid gap-3">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-3/5" />
        <div className="skeleton h-9 w-full rounded-md" />
      </div>
    </section>
  );
}
