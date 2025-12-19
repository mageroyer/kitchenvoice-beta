import styles from './featureslider.module.css';

/**
 * SliderDots Component
 *
 * Navigation dots for the feature slider.
 * Shows current slide position and allows direct navigation.
 *
 * @param {Object} props
 * @param {number} props.total - Total number of slides
 * @param {number} props.activeIndex - Currently active slide index
 * @param {Function} props.onDotClick - Callback when dot is clicked (receives index)
 */
function SliderDots({ total, activeIndex, onDotClick }) {
  if (total <= 1) return null;

  return (
    <div className={styles.dots} role="tablist" aria-label="Slide navigation">
      {Array.from({ length: total }, (_, index) => (
        <button
          key={index}
          className={`${styles.dot} ${index === activeIndex ? styles.dotActive : ''}`}
          onClick={() => onDotClick(index)}
          role="tab"
          aria-selected={index === activeIndex}
          aria-label={`Go to slide ${index + 1}`}
          tabIndex={index === activeIndex ? 0 : -1}
        >
          <span className={styles.dotInner}></span>
        </button>
      ))}
    </div>
  );
}

export default SliderDots;
