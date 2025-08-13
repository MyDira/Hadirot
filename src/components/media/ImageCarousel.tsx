import React, { useState, useRef, useEffect } from "react";

export type CarouselImage = { url: string; alt?: string | null };

interface ImageCarouselProps {
  images: CarouselImage[];
  initialIndex?: number;
  aspect?: string;
  className?: string;
}

export function ImageCarousel({
  images,
  initialIndex = 0,
  aspect = "aspect-[4/3]",
  className,
}: ImageCarouselProps) {
  const [index, setIndex] = useState(initialIndex);
  const startX = useRef<number | null>(null);
  const deltaX = useRef(0);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const clamp = (i: number) =>
    Math.max(0, Math.min(images.length - 1, i));

  const prev = () => setIndex((i) => clamp(i - 1));
  const next = () => setIndex((i) => clamp(i + 1));
  const goTo = (i: number) => setIndex(clamp(i));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        className={`relative w-full ${aspect} bg-gray-100 flex items-center justify-center text-gray-500 ${
          className || ""
        }`}
        role="region"
        aria-label="Listing images"
      >
        <svg
          className="w-10 h-10"
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
      className={`relative w-full ${className || ""}`}
      role="region"
      aria-label="Listing images"
    >
      <div
        className={`w-full overflow-hidden ${aspect}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-300"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {images.map((img, i) => (
            <div
              key={i}
              className="relative w-full h-full shrink-0 basis-full"
            >
              <img
                src={img.url}
                alt={img.alt || ""}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.classList.add("opacity-0");
                  const fallback =
                    e.currentTarget.nextElementSibling as HTMLElement;
                  if (fallback) fallback.classList.remove("hidden");
                }}
              />
              <div className="absolute inset-0 hidden items-center justify-center bg-gray-100 text-gray-500">
                No image
              </div>
            </div>
          ))}
        </div>
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
              className="w-5 h-5"
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
              className="w-5 h-5"
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

          <div className="flex items-center justify-center gap-2 pt-3">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`h-2.5 w-2.5 rounded-full bg-white/50 hover:bg-white/70 ring-1 ring-white/40 ${
                  i === index ? "bg-white" : ""
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

