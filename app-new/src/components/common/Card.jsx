import PropTypes from 'prop-types';
import styles from '../../styles/components/card.module.css';

/**
 * Card Component
 *
 * A flexible container component with optional header, body, and footer sections.
 * Supports multiple visual variants, hover effects, and click interactions.
 *
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} [props.children] - Card body content
 * @param {React.ReactNode} [props.header] - Custom header content (overrides title/subtitle)
 * @param {React.ReactNode} [props.footer] - Footer content (typically action buttons)
 * @param {string} [props.title] - Card title text (used if no custom header)
 * @param {string} [props.subtitle] - Subtitle text shown below title
 * @param {boolean} [props.hoverable=false] - Add hover lift and shadow effect
 * @param {boolean} [props.clickable=false] - Add pointer cursor and click feedback
 * @param {Function} [props.onClick] - Click handler for the entire card
 * @param {'flat'|'outlined'|'elevated'} [props.variant='elevated'] - Visual style variant
 * @param {'none'|'small'|'medium'|'large'} [props.padding='medium'] - Internal padding size
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Rendered card element
 *
 * @example
 * // Basic card with title
 * <Card title="Recipe Details" subtitle="Main Course">
 *   <p>Delicious pasta recipe...</p>
 * </Card>
 *
 * @example
 * // Clickable recipe card
 * <Card
 *   title={recipe.name}
 *   subtitle={recipe.category}
 *   clickable
 *   hoverable
 *   onClick={() => navigate(`/recipe/${recipe.id}`)}
 *   footer={<Badge variant="success">Published</Badge>}
 * >
 *   <p>{recipe.description}</p>
 * </Card>
 *
 * @example
 * // Outlined card with custom header
 * <Card
 *   variant="outlined"
 *   padding="large"
 *   header={
 *     <div className="flex justify-between">
 *       <h3>Ingredients</h3>
 *       <Button size="small">Add</Button>
 *     </div>
 *   }
 * >
 *   <IngredientList items={ingredients} />
 * </Card>
 */
function Card({
  children,
  header,
  footer,
  title,
  subtitle,
  hoverable = false,
  clickable = false,
  onClick = () => {},
  variant = 'elevated',
  padding = 'medium',
  className = '',
}) {
  const cardClasses = [
    styles.card,
    styles[variant],
    styles[`padding-${padding}`],
    hoverable && styles.hoverable,
    clickable && styles.clickable,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (clickable || onClick) {
      onClick();
    }
  };

  const hasDefaultHeader = title || subtitle;

  return (
    <div className={cardClasses} onClick={handleClick}>
      {/* Header section */}
      {(header || hasDefaultHeader) && (
        <div className={styles.header}>
          {header ? (
            header
          ) : (
            <>
              {title && <h3 className={styles.title}>{title}</h3>}
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </>
          )}
        </div>
      )}

      {/* Body section */}
      <div className={styles.body}>{children}</div>

      {/* Footer section */}
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}

Card.propTypes = {
  /** Card body content */
  children: PropTypes.node,
  /** Card header content */
  header: PropTypes.node,
  /** Card footer content */
  footer: PropTypes.node,
  /** Card title (alternative to custom header) */
  title: PropTypes.string,
  /** Card subtitle (shown below title) */
  subtitle: PropTypes.string,
  /** Add hover effect (lift + shadow) */
  hoverable: PropTypes.bool,
  /** Add cursor pointer and click feedback */
  clickable: PropTypes.bool,
  /** Click handler */
  onClick: PropTypes.func,
  /** Card style variant */
  variant: PropTypes.oneOf(['flat', 'outlined', 'elevated']),
  /** Card padding size */
  padding: PropTypes.oneOf(['none', 'small', 'medium', 'large']),
  /** Additional CSS classes */
  className: PropTypes.string,
};

export default Card;
