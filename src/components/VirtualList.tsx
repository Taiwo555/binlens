import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fixed-height windowed list. Rendering 20,000 rows directly stalls the page,
 * so only the visible slice plus a small overscan is in the DOM.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  className = "",
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => setViewport(element.clientHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const overscan = 6;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(items.length, start + visible);

  return (
    <div
      ref={ref}
      className={`vlist ${className}`}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="vlist-inner" style={{ height: items.length * rowHeight }}>
        <div style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {items.slice(start, end).map((item, index) => (
            <Fragment key={start + index}>{renderRow(item, start + index)}</Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
