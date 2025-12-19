import { useState, useEffect, useCallback, useRef } from 'react';
import BubbleText from './BubbleText';
import SliderDots from './SliderDots';
import SliderArrows from './SliderArrows';
import styles from './featureslider.module.css';

/**
 * FeatureSlider Component
 *
 * A configurable image slider with animated bubble text overlays.
 * Perfect for showcasing features on landing/welcome pages.
 *
 * @param {Object} props
 * @param {Array} props.slides - Array of slide objects
 * @param {boolean} props.autoPlay - Enable auto-play (default: true)
 * @param {number} props.interval - Auto-play interval in ms (default: 5000)
 * @param {string} props.animation - Animation type: 'slide' | 'fade' | 'zoom' (default: 'slide')
 * @param {boolean} props.showDots - Show navigation dots (default: true)
 * @param {boolean} props.showArrows - Show prev/next arrows (default: true)
 * @param {boolean} props.pauseOnHover - Pause auto-play on hover (default: true)
 * @param {string} props.className - Additional CSS class
 */
function FeatureSlider({
  slides = [],
  autoPlay = true,
  interval = 5000,
  animation = 'slide',
  showDots = true,
  showArrows = true,
  pauseOnHover = true,
  className = ''
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState('next'); // 'next' or 'prev'
  const timerRef = useRef(null);
  const sliderRef = useRef(null);

  // Handle slide change
  const goToSlide = useCallback((index, dir = 'next') => {
    if (isTransitioning || slides.length === 0) return;

    setIsTransitioning(true);
    setDirection(dir);
    setActiveIndex(index);

    // Reset transitioning state after animation completes
    setTimeout(() => {
      setIsTransitioning(false);
    }, 500); // Match CSS transition duration
  }, [isTransitioning, slides.length]);

  // Navigate to next slide
  const nextSlide = useCallback(() => {
    const nextIndex = (activeIndex + 1) % slides.length;
    goToSlide(nextIndex, 'next');
  }, [activeIndex, slides.length, goToSlide]);

  // Navigate to previous slide
  const prevSlide = useCallback(() => {
    const prevIndex = (activeIndex - 1 + slides.length) % slides.length;
    goToSlide(prevIndex, 'prev');
  }, [activeIndex, slides.length, goToSlide]);

  // Handle dot click
  const handleDotClick = (index) => {
    const dir = index > activeIndex ? 'next' : 'prev';
    goToSlide(index, dir);
    // Pause auto-play briefly after user interaction
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 10000);
  };

  // Auto-play logic
  useEffect(() => {
    if (!autoPlay || isPaused || slides.length <= 1) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      nextSlide();
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoPlay, isPaused, interval, nextSlide, slides.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        prevSlide();
      } else if (e.key === 'ArrowRight') {
        nextSlide();
      }
    };

    const slider = sliderRef.current;
    if (slider) {
      slider.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (slider) {
        slider.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [nextSlide, prevSlide]);

  // Touch/swipe support
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;

    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 50) { // Minimum swipe distance
        if (diff > 0) {
          nextSlide();
        } else {
          prevSlide();
        }
      }
    };

    slider.addEventListener('touchstart', handleTouchStart, { passive: true });
    slider.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      slider.removeEventListener('touchstart', handleTouchStart);
      slider.removeEventListener('touchend', handleTouchEnd);
    };
  }, [nextSlide, prevSlide]);

  // Handle mouse enter/leave for pause on hover
  const handleMouseEnter = () => {
    if (pauseOnHover) {
      setIsPaused(true);
    }
  };

  const handleMouseLeave = () => {
    if (pauseOnHover) {
      setIsPaused(false);
    }
  };

  if (slides.length === 0) {
    return (
      <div className={`${styles.slider} ${styles.empty} ${className}`}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🖼️</span>
          <p>No slides configured</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={sliderRef}
      className={`${styles.slider} ${styles[animation]} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      role="region"
      aria-label="Feature showcase slider"
      aria-roledescription="carousel"
    >
      {/* Slides Container */}
      <div className={styles.slidesContainer}>
        <div
          className={styles.slidesTrack}
          style={
            animation === 'slide'
              ? { transform: `translateX(-${activeIndex * 100}%)` }
              : {}
          }
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id || index}
              className={`
                ${styles.slide}
                ${index === activeIndex ? styles.active : ''}
                ${index === activeIndex && direction === 'next' ? styles.slideInNext : ''}
                ${index === activeIndex && direction === 'prev' ? styles.slideInPrev : ''}
              `}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${index + 1} of ${slides.length}`}
              aria-hidden={index !== activeIndex}
            >
              {/* Slide Image */}
              <div className={styles.slideImageWrapper}>
                {slide.image ? (
                  <img
                    src={slide.image}
                    alt={slide.alt || slide.bubble?.text || `Feature ${index + 1}`}
                    className={styles.slideImage}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div className={styles.slidePlaceholder}>
                    <span className={styles.placeholderIcon}>
                      {slide.icon || '🍳'}
                    </span>
                    {slide.title && (
                      <span className={styles.placeholderTitle}>{slide.title}</span>
                    )}
                  </div>
                )}

                {/* Overlay gradient for text readability */}
                <div className={styles.slideOverlay}></div>
              </div>

              {/* Bubble Text */}
              {slide.bubble && (
                <BubbleText
                  text={slide.bubble.text}
                  position={slide.bubble.position || 'bottom-right'}
                  variant={slide.bubble.style || 'primary'}
                  isVisible={index === activeIndex}
                  delay={300}
                />
              )}

              {/* Optional slide title overlay */}
              {slide.title && !slide.bubble && (
                <div className={styles.slideTitle}>
                  <h3>{slide.title}</h3>
                  {slide.subtitle && <p>{slide.subtitle}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows */}
      {showArrows && slides.length > 1 && (
        <SliderArrows
          onPrev={prevSlide}
          onNext={nextSlide}
          disabled={isTransitioning}
        />
      )}

      {/* Navigation Dots */}
      {showDots && slides.length > 1 && (
        <SliderDots
          total={slides.length}
          activeIndex={activeIndex}
          onDotClick={handleDotClick}
        />
      )}

      {/* Progress bar (optional - shows auto-play progress) */}
      {autoPlay && !isPaused && slides.length > 1 && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ animationDuration: `${interval}ms` }}
            key={activeIndex} // Reset animation on slide change
          ></div>
        </div>
      )}
    </div>
  );
}

export default FeatureSlider;
