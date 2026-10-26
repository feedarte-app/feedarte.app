import { useEffect, useRef } from 'react';
import type { DesignDoc, ProductData } from '../../../src/shared/types';
import { renderPreview } from './browserRender';

export function DesignPreview({ doc, product, width }: { doc: DesignDoc; product: ProductData | null; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const c = ref.current;
    if (!c) return;
    renderPreview(c, doc, product, width).catch(() => {});
    return () => {
      alive = false;
      void alive;
    };
  }, [doc, product, width]);
  return <canvas ref={ref} className="block rounded-md" style={{ width, height: (width * doc.height) / doc.width }} />;
}
