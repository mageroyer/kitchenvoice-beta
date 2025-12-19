import styles from './featureslider.module.css';

/**
 * SliderArrows Component
 *
 * Previous/Next navigation arrows for the feature slider.
 *
 * @param {Object} props
 * @param {Function} props.onPrev - Callback for previous button
 * @param {Function} props.onNext - Callback for next button
 * @param {boolean} props.disabled - Disable arrows during transitions
 */
function SliderArrows({ onPrev, onNext, disabled = false }) {
  return (
    <div className={styles.arrows}>
      <button
        className={`${styles.arrow} ${styles.arrowPrev}`}
        onClick={onPrev}
        disabled={disabled}
        aria-label="Previous slide"
        title="Previous slide"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.arrowIcon}
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <button
        className={`${styles.arrow} ${styles.arrowNext}`}
        onClick={onNext}
        disabled={disabled}
        aria-label="Next slide"
        title="Next slide"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.arrowIcon}
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  );
}

export default SliderArrows;
