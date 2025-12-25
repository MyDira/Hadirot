import React, { useEffect, useState, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageZoomModalProps {
  images: Array<{ url: string; alt: string }>;
  initialIndex: number;
  onClose: () => void;
}

type AnimationState = 'idle' | 'dragging' | 'animating';

export function ImageZoomModal({ images, initialIndex, onClose }: ImageZoomModalProps) {
  // Clamp initial index to valid range
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, images.length - 1));
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [dragOffset, setDragOffset] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);
  const lastTouchX = useRef(0);
  const animationFrameRef = useRef<number>();

  // Helper function to get circular index
  const getCircularIndex = useCallback((index: number) => {
    const len = images.length;
    return ((index % len) + len) % len;
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && images.length > 1 && animationState === 'idle') {
        handlePrevious();
      } else if (e.key === "ArrowRight" && images.length > 1 && animationState === 'idle') {
        handleNext();
      } else if (e.key === 'Home' && images.length > 1 && animationState === 'idle') {
        e.preventDefault();
        handleNavigateTo(0);
      } else if (e.key === 'End' && images.length > 1 && animationState === 'idle') {
        e.preventDefault();
        handleNavigateTo(images.length - 1);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animationState, images.length]);

  const handlePrevious = useCallback(() => {
    if (animationState !== 'idle' || images.length <= 1) return;

    setAnimationState('animating');
    setCurrentIndex(prev => getCircularIndex(prev - 1));

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, images.length, getCircularIndex]);

  const handleNext = useCallback(() => {
    if (animationState !== 'idle' || images.length <= 1) return;

    setAnimationState('animating');
    setCurrentIndex(prev => getCircularIndex(prev + 1));

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, images.length, getCircularIndex]);

  const handleNavigateTo = useCallback((index: number) => {
    if (animationState !== 'idle' || index === currentIndex) return;

    setAnimationState('animating');
    setCurrentIndex(index);

    setTimeout(() => {
      setAnimationState('idle');
    }, 350);
  }, [animationState, currentIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (images.length <= 1 || animationState === 'animating') return;

    touchStartX.current = e.touches[0].clientX;
    lastTouchX.current = e.touches[0].clientX;
    touchStartTime.current = Date.now();
    setAnimationState('dragging');
  }, [images.length, animationState]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (animationState !== 'dragging' || !containerRef.current) return;

    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX.current;
    lastTouchX.current = currentX;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      setDragOffset(diff);
    });
  }, [animationState]);

  const handleTouchEnd = useCallback(() => {
    if (animationState !== 'dragging' || !containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const swipeDistance = lastTouchX.current - touchStartX.current;
    const swipePercent = Math.abs(swipeDistance) / containerWidth;
    const swipeTime = Date.now() - touchStartTime.current;
    const velocity = Math.abs(swipeDistance) / swipeTime;

    // Commit to navigation if:
    // 1. Swiped more than 50% of width, OR
    // 2. Fast swipe (velocity > 0.5) with at least 30% distance
    const shouldNavigate = swipePercent > 0.5 || (velocity > 0.5 && swipePercent > 0.3);

    if (shouldNavigate) {
      if (swipeDistance > 0) {
        // Swiped right, go to previous
        setCurrentIndex(prev => getCircularIndex(prev - 1));
      } else {
        // Swiped left, go to next
        setCurrentIndex(prev => getCircularIndex(prev + 1));
      }
    }

    // Reset
    setDragOffset(0);
    setAnimationState('animating');

    setTimeout(() => {
      setAnimationState('idle');
    }, shouldNavigate ? 350 : 200);

    touchStartX.current = 0;
    lastTouchX.current = 0;
    touchStartTime.current = 0;
  }, [animationState, getCircularIndex]);

  // Get the three slides for infinite loop (previous, current, next)
  const prevIndex = getCircularIndex(currentIndex - 1);
  const nextIndex = getCircularIndex(currentIndex + 1);

  const slides = [
    { image: images[prevIndex], position: -1, index: prevIndex },
    { image: images[currentIndex], position: 0, index: currentIndex },
    { image: images[nextIndex], position: 1, index: nextIndex }
  ];

  // Calculate transform based on drag offset
  const getTransform = (position: number) => {
    if (animationState === 'dragging' && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dragPercent = dragOffset / containerWidth;
      return `translate3d(${(position * 100 + dragPercent * 100)}%, 0, 0)`;
    }
    return `translate3d(${position * 100}%, 0, 0)`;
  };

  const getTransitionClass = () => {
    if (animationState === 'dragging') {
      return '';
    }
    return 'transition-transform duration-300 ease-out';
  };

  const renderImageSlide = (image: { url: string; alt: string }, position: number, index: number) => {
    const isCurrentSlide = position === 0;

    return (
      <div
        key={`zoom-slide-${index}-${position}`}
        className={`absolute top-0 left-0 w-full h-full flex items-center justify-center ${getTransitionClass()}`}
        style={{
          transform: getTransform(position),
          willChange: 'transform'
        }}
      >
        <img
          src={image.url}
          alt={image.alt || 'Listing image'}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
          loading={isCurrentSlide ? 'eager' : 'lazy'}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[110] p-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-all"
        aria-label="Close zoom view"
        type="button"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrevious();
            }}
            disabled={animationState !== 'idle'}
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-[110] p-3 bg-white bg-opacity-20 rounded-full transition-all ${
              animationState === 'idle'
                ? 'hover:bg-opacity-30 hover:scale-105 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            aria-label="Previous image"
            type="button"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            disabled={animationState !== 'idle'}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-[110] p-3 bg-white bg-opacity-20 rounded-full transition-all ${
              animationState === 'idle'
                ? 'hover:bg-opacity-30 hover:scale-105 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            aria-label="Next image"
            type="button"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[110] bg-black bg-opacity-50 px-4 py-2 rounded-full">
          <span className="text-white text-sm font-medium">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center p-4 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        {/* Render three slides for infinite loop */}
        {slides.map(slide => renderImageSlide(slide.image, slide.position, slide.index))}
      </div>
    </div>
  );
}
