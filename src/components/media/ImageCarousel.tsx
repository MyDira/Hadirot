import React, { useState, useRef, useEffect } from "react";

export type CarouselImage = { url: string; alt?: string | null };

interface ImageCarouselProps {
  images: CarouselImage[];
  initialIndex?: number;
  fit?: "cover" | "contain";
  heightClass?: string;
  showThumbnails?: boolean;
  className?: string;
}

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function ImageCarousel({
  images,
  initialIndex = 0,
  fit = "contain",
  heightClass = "h-[48vh] lg:h-[56vh]",
  showThumbnails = true,
  className,
}: ImageCarouselProps) {
  const [current, setCurrent] = useState(initialIndex);
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  useEffect(() => {
    setCurrent(initialIndex);
  }, [initialIndex]);

  const clamp = (i: number) => Math.max(0, Math.min(images.length - 1, i));
  const prev = () => setCurrent((i) => clamp(i - 1));
  const next = () => setCurrent((i) => clamp(i + 1));
  const goTo = (i: number) => setCurrent(clamp(i));

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    deltaX.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current !== null) {
      deltaX.current = e.touches[0].clientX - startX.current;
    }
  };

  const onTouchEnd = () => {
    if (startX.current !== null) {
      if (Math.abs(deltaX.current) > 40) {
        if (deltaX.current > 0) prev();
        else next();
      }
    }
    startX.current = null;
    deltaX.current = 0;
  };

  if (!images || images.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-gray-100 text-gray-500",
          heightClass,
          className,
        )}
        role="region"
        aria-label="Listing images"
      >
        <svg
          className="h-10 w-10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 10.5L12 3l9 7.5v9A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5v-9z" />
          <path d="M9 21V12h6v9" />
        </svg>
        <span className="ml-2">No image</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        className,
      )}
    >
      <div
        role="region"
        aria-label="Listing images"
        tabIndex={0}
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-white",
          heightClass,
        )}
        onKeyDown={handleKey}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {images.map((img, i) => (
            <div key={i} className="relative h-full w-full shrink-0">
              <img
                src={img.url}
                alt={img.alt ?? "Listing image"}
                loading="lazy"
                decoding="async"
                className={cn(
                  "absolute inset-0 h-full w-full bg-neutral-900",
                  fit === "contain" ? "object-contain" : "object-cover",
                )}
                onError={(e) => (e.currentTarget.style.opacity = "0")}
              />
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full shadow bg-black/50 text-white hover:bg-black/60 focus:outline-none"
              aria-label="Previous image"
              title="Previous image"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex h-9 w-9 items-center justify-center rounded-full shadow bg-black/50 text-white hover:bg-black/60 focus:outline-none"
              aria-label="Next image"
              title="Next image"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {showThumbnails && images.length > 1 && (
        <div
          className="mt-2 flex gap-2 overflow-x-auto py-1 w-full"
          aria-label="Image thumbnails"
        >
          {images.map((img, i) => {
            const active = i === current;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className={cn(
                  "relative flex-shrink-0 overflow-hidden rounded-md",
                  "w-24 h-16",
                  active ? "ring-2 ring-accent-500" : "ring-1 ring-black/10",
                )}
                aria-current={active ? "true" : "false"}
                aria-label={`Go to image ${i + 1}`}
              >
                <img
                  src={img.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

