import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function clsx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ImageCarouselProps = {
  images: { url: string; alt?: string }[];
  className?: string;
};

export default function ImageCarousel({ images, className }: ImageCarouselProps) {
  const safeImages = useMemo(() => images?.filter(Boolean) ?? [], [images]);
  const [current, setCurrent] = useState(0);

  const go = useCallback((idx: number) => {
    if (!safeImages.length) return;
    const next = (idx + safeImages.length) % safeImages.length;
    setCurrent(next);
  }, [safeImages.length]);

  const prev = useCallback(() => go(current - 1), [current, go]);
  const next = useCallback(() => go(current + 1), [current, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  if (!safeImages.length) {
    return (
      <div
        className={clsx(
          "relative w-full bg-neutral-100 rounded-xl aspect-[4/3] flex items-center justify-center",
          className
        )}
      >
        <span className="text-sm text-neutral-500">No images available</span>
      </div>
    );
  }

  const img = safeImages[current];

  return (
    <div className={clsx("relative w-full rounded-xl overflow-hidden", className)}>
      {/* Stage */}
      <div className="relative w-full bg-neutral-100 aspect-[4/3] flex items-center justify-center">
        {/* Left arrow */}
        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={prev}
              className="absolute top-1/2 -translate-y-1/2 left-2 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 text-white focus:outline-none focus:ring focus:ring-white/40"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {/* Right arrow */}
            <button
              type="button"
              aria-label="Next image"
              onClick={next}
              className="absolute top-1/2 -translate-y-1/2 right-2 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 text-white focus:outline-none focus:ring focus:ring-white/40"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Main image (no cropping) */}
        <img
          src={img.url}
          alt={img.alt ?? "Listing image"}
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* Thumbnail strip */}
      {safeImages.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-3 px-2 overflow-x-auto">
          {safeImages.map((thumb, i) => (
            <button
              key={i}
              aria-label={`Go to image ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={clsx(
                "relative flex-shrink-0 w-16 h-16 rounded-md border-2 transition-all",
                i === current ? "border-neutral-800" : "border-neutral-300 hover:border-neutral-400"
              )}
            >
              <img
                src={thumb.url}
                alt={thumb.alt ?? `Thumbnail ${i + 1}`}
                className="w-full h-full object-cover rounded-[6px]"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

