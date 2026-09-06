import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Package, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function GalleryImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? (
    <span className={`flex flex-col items-center justify-center gap-2 text-muted-foreground ${className}`}>
      <Package className="h-10 w-10" />
      <span className="text-xs">Photo unavailable</span>
    </span>
  ) : <img src={src} alt={alt} className={className} draggable={false} onError={() => setFailed(true)} />;
}

export function ProductGallery({ name, images, imageUrl }: { name: string; images?: string[]; imageUrl?: string | null }) {
  const photos = [...new Set(images?.length ? images : imageUrl ? [imageUrl] : [])];
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const active = Math.min(selected, Math.max(0, photos.length - 1));
  const signature = photos.join('\n');

  useEffect(() => {
    setSelected(0);
    setOpen(false);
    setZoom(1);
  }, [signature]);
  useEffect(() => {
    if (stage.current) {
      stage.current.scrollLeft = (stage.current.scrollWidth - stage.current.clientWidth) / 2;
      stage.current.scrollTop = (stage.current.scrollHeight - stage.current.clientHeight) / 2;
    }
  }, [zoom]);

  const choose = (index: number) => {
    setSelected((index + photos.length) % photos.length);
    setZoom(1);
  };
  if (!photos.length) return (
    <div className="aspect-square rounded-lg border bg-muted flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Package className="h-24 w-24 opacity-30" />
      <p>No product photos available</p>
    </div>
  );

  return (
    <section aria-label="Product photos" className="min-w-0 space-y-3">
      <button type="button" onClick={() => { setZoom(1); setOpen(true); }}
        className="relative aspect-square w-full rounded-lg border bg-white p-6 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={`Enlarge photo ${active + 1} of ${name}`} data-testid="button-enlarge-product-photo">
        <GalleryImage src={photos[active]} alt={`${name} — photo ${active + 1}`} className="h-full w-full object-contain" />
        <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs">
          <ZoomIn className="h-4 w-4" /> View details
        </span>
      </button>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Choose product photo">
          {photos.map((url, index) => (
            <button key={url} type="button" onClick={() => choose(index)} aria-pressed={active === index}
              aria-label={`Show photo ${index + 1}`} data-testid={`product-thumbnail-${index}`}
              className={`h-20 w-20 shrink-0 rounded-md border-2 bg-white p-1 ${active === index ? 'border-primary' : 'border-border'}`}>
              <GalleryImage src={url} alt={`${name} — thumbnail ${index + 1}`} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Photo {active + 1} of {photos.length}. Click the image to enlarge.</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl max-h-[95dvh] overflow-hidden p-4"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') { event.preventDefault(); choose(active + 1); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); choose(active - 1); }
            if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((z) => Math.min(3, z + 0.5)); }
            if (event.key === '-') { event.preventDefault(); setZoom((z) => Math.max(1, z - 0.5)); }
          }}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">{name}</DialogTitle>
            <DialogDescription>Zoom in for details, then drag or scroll to inspect. Use arrow keys for other photos.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" disabled={photos.length < 2} aria-label="Previous photo" onClick={() => choose(active - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm tabular-nums" aria-live="polite">{active + 1} / {photos.length}</span>
              <Button type="button" variant="outline" size="icon" disabled={photos.length < 2} aria-label="Next photo" onClick={() => choose(active + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" disabled={zoom === 1} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><ZoomOut className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" className="tabular-nums" aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</Button>
              <Button type="button" variant="outline" size="icon" disabled={zoom === 3} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}><ZoomIn className="h-4 w-4" /></Button>
            </div>
          </div>
          <div ref={stage} className={`h-[60dvh] min-h-0 overflow-auto rounded-md border bg-white ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            data-testid="product-zoom-stage"
            onPointerDown={(event) => {
              if (zoom <= 1 || event.pointerType !== 'mouse') return;
              event.preventDefault();
              drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              event.currentTarget.scrollLeft = drag.current.left + drag.current.x - event.clientX;
              event.currentTarget.scrollTop = drag.current.top + drag.current.y - event.clientY;
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}>
            <div style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
              <GalleryImage src={photos[active]} alt={`${name} — enlarged photo ${active + 1}`} className="h-full w-full select-none object-contain" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}