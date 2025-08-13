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
      <div className={clsx("relative w-full bg-neutral-100 rounded-xl aspect-[4/3] flex items-center justify-center", className)}>
        <span className="text-sm text-neutral-500">No images available</span>
      </div>
    );
  }

  const img = safeImages[current];

  return (
    <div className={clsx("relative w-full rounded-xl overflow-hidden", className)}>
      <div className="relative w-full bg-neutral-100 aspect-[4/3] flex items-center justify-center">
        {/* Navigation */}
        {safeImages.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={prev}
              className="absolute inset-y-0 left-2 my-auto rounded-full p-2 bg-black/40 hover:bg-black/60 text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={next}
              className="absolute inset-y-0 right-2 my-auto rounded-full p-2 bg-black/40 hover:bg-black/60 text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Image */}
        <img
          src={img.url}
          alt={img.alt ?? "Listing image"}
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* Dots */}
      {safeImages.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-3">
          {safeImages.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to image ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={clsx(
                "h-2.5 rounded-full transition-all",
                i === current ? "w-6 bg-neutral-800" : "w-2.5 bg-neutral-300 hover:bg-neutral-400"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

