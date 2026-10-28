import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Props<T> {
  items: T[];
  itemKey: (item: T) => string;
  /** Lo que va en cada asiento; recibe el tamaño de ficha que cabe y el ángulo del asiento (radianes). */
  renderSeat: (item: T, size: number, angle: number) => ReactNode;
  center: ReactNode;
}

/** Asientos en círculo, como en la mesa, empezando arriba y en el sentido de las agujas del reloj. */
export function SeatCircle<T>({ items, itemKey, renderSeat, center }: Props<T>) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = Math.max(items.length, 1);
  // Las fichas crecen hasta donde caben sin pisarse, y el radio se encoge para que no se salgan por los lados.
  const size = Math.round(Math.max(38, Math.min(96, ((Math.PI * 2 * 0.4 * width) / n) * 0.62)));
  const radius = Math.min(0.4, 0.5 - (size / 2 + 6) / width);

  return (
    <div className="circle" ref={ref} style={{ "--size": `${size}px` } as CSSProperties}>
      <div className="circle__center">{center}</div>
      {items.map((item, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const left = 50 + Math.cos(angle) * radius * 100;
        const top = 50 + Math.sin(angle) * radius * 100;
        return (
          <div key={itemKey(item)} className="seat" style={{ left: `${left}%`, top: `${top}%` }}>
            {renderSeat(item, size, angle)}
          </div>
        );
      })}
    </div>
  );
}
