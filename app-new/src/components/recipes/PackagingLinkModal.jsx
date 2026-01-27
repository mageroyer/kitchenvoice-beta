/**
 * PackagingLinkModal Component
 *
 * Modal for linking packaging items to inventory.
 * Displays price per unit and calculates total cost.
 */

import { useState, useEffect } from 'react';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import { inventoryItemDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/ingredientlist.module.css';

/**
 * @param {Object} props
 * @param {string} props.packagingName - Current packaging name to search for
 * @param {number} props.quantity - Number of packaging items needed
 * @param {Object|null} props.currentLinked - Currently linked item data { itemId, itemName, unitPrice }
 * @param {Function} props.onLink - Called with { itemId, itemName, unitPrice, totalPrice } when linked
 * @param {Function} props.onUnlink - Called to remove the link
 * @param {Function} props.onClose - Called when modal is closed
 */
function PackagingLinkModal({
  packagingName,
  quantity = 1,
  currentLinked = null,
  onLink,
  onUnlink,
  onClose
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [searchTerm, setSearchTerm] = useState(packagingName || '');

  // Load matching inventory items
  useEffect(() => {
    loadMatchingItems();
  }, [searchTerm]);

  const loadMatchingItems = async () => {
    setLoading(true);
    setError('');

    try {
      // Get all active inventory items
      const allItems = await inventoryItemDB.getActive();

      if (allItems.length === 0) {
        setError('No items in inventory.');
        setLoading(false);
        return;
      }

      // Filter by search term - look for packaging-type items
      const searchLower = (searchTerm || '').toLowerCase().trim();
      const matchingItems = allItems.filter(item => {
        const itemName = (item.name || '').toLowerCase();
        const category = (item.category || '').toLowerCase();

        // Match by name
        if (searchLower && itemName.includes(searchLower)) return true;

        // Also include packaging category items if no search term
        if (!searchLower && (category.includes('packaging') || category.includes('emballage'))) return true;

        // Match partial words
        if (searchLower) {
          const words = searchLower.split(' ').filter(w => w.length > 1);
          return words.some(word => itemName.includes(word));
        }

        return false;
      });

      // Sort: exact matches first, then by name
      matchingItems.sort((a, b) => {
        const aExact = a.name.toLowerCase() === searchLower;
        const bExact = b.name.toLowerCase() === searchLower;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.name.localeCompare(b.name);
      });

      setMatches(matchingItems.slice(0, 20)); // Limit results

      if (matchingItems.length === 0 && searchTerm) {
        setError('No matching items found.');
      }
    } catch (err) {
      console.error('Error finding matches:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Parse units per case from format string (e.g., "200CT" -> 200)
  const parseUnitsFromFormat = (format) => {
    if (!format) return null;
    // Match patterns like "200CT", "50CT", "100/case"
    const ctMatch = format.match(/(\d+)\s*CT/i);
    if (ctMatch) return parseInt(ctMatch[1], 10);
    const caseMatch = format.match(/(\d+)\s*\/\s*case/i);
    if (caseMatch) return parseInt(caseMatch[1], 10);
    // Match "6x500ML" style - first number is units
    const multiMatch = format.match(/^(\d+)[x×]/i);
    if (multiMatch) return parseInt(multiMatch[1], 10);
    return null;
  };

  const handleSelectItem = (item) => {
    // Calculate price per SINGLE unit (not per case/box)
    let unitPrice = 0;
    let priceType = 'unit';

    // Get unitsPerCase - prefer field if > 1, otherwise parse from format
    const parsedUnits = parseUnitsFromFormat(item.packagingFormat || item.lastBoxingFormat);
    const unitsPerCase = (item.unitsPerCase > 1 ? item.unitsPerCase : null) || parsedUnits || 1;

    if (item.pricePerUnit > 0) {
      // pricePerUnit is typically per case - divide by units in case
      unitPrice = item.pricePerUnit / unitsPerCase;
      priceType = 'unit';
    } else if (item.currentPrice > 0) {
      // currentPrice is typically per case - divide by units in case
      unitPrice = item.currentPrice / unitsPerCase;
      priceType = 'unit';
    } else if (item.pricePerG > 0) {
      // For weight-based items, estimate per unit (assume 100g default)
      unitPrice = item.pricePerG * 100;
      priceType = 'weight';
    }

    const totalPrice = unitPrice * quantity;

    onLink({
      itemId: item.id,
      itemName: item.name,
      unitPrice,
      totalPrice,
      priceType,
      vendorName: item.vendorName,
      unitsPerCase, // Pass this for reference
    });
    onClose();
  };

  const handleUnlink = () => {
    onUnlink();
    onClose();
  };

  // Format price display - show per single unit
  const formatPrice = (item) => {
    // Get unitsPerCase - prefer field if > 1, otherwise parse from format
    const parsedUnits = parseUnitsFromFormat(item.packagingFormat || item.lastBoxingFormat);
    const unitsPerCase = (item.unitsPerCase > 1 ? item.unitsPerCase : null) || parsedUnits || 1;

    if (item.pricePerUnit > 0) {
      const pricePerPiece = item.pricePerUnit / unitsPerCase;
      // Show calculation if unitsPerCase > 1
      if (unitsPerCase > 1) {
        return `$${pricePerPiece.toFixed(4)}/ea (${unitsPerCase}/case)`;
      }
      return `$${pricePerPiece.toFixed(2)}/ea`;
    }
    if (item.currentPrice > 0) {
      const pricePerPiece = item.currentPrice / unitsPerCase;
      if (unitsPerCase > 1) {
        return `$${pricePerPiece.toFixed(4)}/ea (${unitsPerCase}/case)`;
      }
      return `$${pricePerPiece.toFixed(2)}/ea`;
    }
    if (item.pricePerG > 0) {
      return `$${(item.pricePerG * 1000).toFixed(2)}/kg`;
    }
    if (item.pricePerML > 0) {
      return `$${(item.pricePerML * 1000).toFixed(2)}/L`;
    }
    return null;
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.linkModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.linkModalHeader}>
          <h3>Link Packaging Item</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.linkModalContent}>
          {/* Current packaging info */}
          <div className={styles.ingredientToMatch}>
            <span className={styles.label}>Packaging:</span>
            <span className={styles.ingredientNameHighlight}>
              {packagingName || 'Unnamed'}
              <span className={styles.unitBadge}>×{quantity}</span>
            </span>
          </div>

          {/* Currently linked info */}
          {currentLinked?.itemId && (
            <div className={styles.linkedItemInfo}>
              <span className={styles.label}>Currently linked:</span>
              <span className={styles.linkedItemName}>{currentLinked.itemName}</span>
              {currentLinked.unitPrice > 0 && (
                <span className={styles.linkedItemVendor}>
                  — ${currentLinked.unitPrice.toFixed(4)}/ea × {quantity} = ${(currentLinked.unitPrice * quantity).toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Search input */}
          <div className={styles.searchSection}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search inventory..."
              className={styles.searchInput}
              autoFocus
            />
          </div>

          {/* Results */}
          {loading ? (
            <div className={styles.loadingState}>
              <Spinner size="medium" />
              <p>Searching...</p>
            </div>
          ) : error && matches.length === 0 ? (
            <div className={styles.errorState}>
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className={styles.matchesHeader}>
                <span>Found ({matches.length})</span>
              </div>

              <ul className={styles.matchesList}>
                {matches.map((item) => {
                  const isCurrent = currentLinked?.itemId === item.id;
                  const priceDisplay = formatPrice(item);

                  return (
                    <li
                      key={item.id}
                      className={`${styles.matchItem} ${isCurrent ? styles.currentlyLinked : ''}`}
                      onClick={() => handleSelectItem(item)}
                    >
                      <span className={styles.matchContent}>
                        <strong>{item.name}</strong>
                        {item.vendorName && (
                          <span className={styles.matchVendor}>— {item.vendorName}</span>
                        )}
                        {priceDisplay && (
                          <span className={styles.matchPrice}>
                            — {priceDisplay}
                          </span>
                        )}
                        {isCurrent && (
                          <span className={styles.linkedBadge}>Linked</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        <div className={styles.linkModalFooter}>
          {currentLinked?.itemId && (
            <Button variant="danger" size="small" onClick={handleUnlink}>
              Unlink
            </Button>
          )}
          <Button variant="secondary" size="small" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PackagingLinkModal;
