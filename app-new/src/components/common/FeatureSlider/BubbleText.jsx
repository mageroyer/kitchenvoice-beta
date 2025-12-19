import { useState, useEffect } from 'react';
import styles from './featureslider.module.css';

/**
 * BubbleText Component
 *
 * Animated speech bubble overlay for feature slides.
 * Appears with a float-up animation after the slide transitions.
 *
 * @param {Object} props
 * @param {string} props.text - The bubble text content
 * @param {string} props.position - Position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
 * @param {string} props.variant - Color variant: 'primary' | 'secondary' | 'dark' | 'light' | 'warning' | 'success'
 * @param {boolean} props.isVisible - Whether the bubble should be visible (triggers animation)
 * @param {number} props.delay - Animation delay in ms (default: 300)
 * @param {string} props.icon - Optional icon to display before text
 */
function BubbleText({
  text,
  position = 'bottom-right',
  variant = 'primary',
  isVisible = false,
  delay = 300,
  icon = null
}) {
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    let timer;
    if (isVisible) {
      // Delay bubble appearance for dramatic effect
      timer = setTimeout(() => {
        setShowBubble(true);
      }, delay);
    } else {
      setShowBubble(false);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isVisible, delay]);

  if (!text) return null;

  // Determine tail direction based on position
  const getTailDirection = () => {
    if (position.includes('bottom')) return 'down';
    if (position.includes('top')) return 'up';
    return 'down';
  };

  return (
    <div
      className={`
        ${styles.bubble}
        ${styles[`bubble${position.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')}`]}
        ${styles[`bubbleVariant${variant.charAt(0).toUpperCase() + variant.slice(1)}`]}
        ${showBubble ? styles.bubbleVisible : styles.bubbleHidden}
      `}
      role="tooltip"
      aria-hidden={!showBubble}
    >
      <div className={styles.bubbleContent}>
        {icon && <span className={styles.bubbleIcon}>{icon}</span>}
        <span className={styles.bubbleText}>{text}</span>
      </div>

      {/* Speech bubble tail */}
      <div
        className={`
          ${styles.bubbleTail}
          ${styles[`tail${getTailDirection().charAt(0).toUpperCase() + getTailDirection().slice(1)}`]}
        `}
      ></div>
    </div>
  );
}

export default BubbleText;
