import { useState, useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Alert from '../common/Alert';
// Dropdown not needed - using native select for cleaner display
import { GoogleCloudVoiceService } from '../../services/speech/googleCloudVoice';
import { parseBulkPlatingWithClaude } from '../../services/ai/claudeAPI';
import { inventoryItemDB } from '../../services/database/indexedDB';
import styles from '../../styles/components/platinginstructions.module.css';

/** Unit options for packages */
const PACKAGE_UNIT_OPTIONS = ['pc', 'm', 'ft', 'cm', 'in', 'rl'];

/** Roll-type units (show "Length" label instead of "Qty") */
const ROLL_UNITS = ['m', 'ft', 'cm', 'in', 'rl'];

/**
 * Calculate package price from linked inventory item
 *
 * Package qty equals basePortion (1 package per portion).
 * Total = basePortion × scalingFactor × pricePerUnit
 *
 * @param {Object} pkg - Package object with linkedPackageId
 * @param {Object} linkedItem - Linked inventory item
 * @param {number} basePortion - Recipe base portion count (this IS the qty)
 * @param {number} scalingFactor - Recipe scaling factor
 * @returns {Object} { price, totalQty, error }
 */
function calculatePackagePrice(pkg, linkedItem, basePortion = 1, scalingFactor = 1) {
  if (!pkg.linkedPackageId || !linkedItem) {
    return { price: null, totalQty: null, error: 'not_linked' };
  }

  // Get price per unit from inventory item
  const pricePerUnit = linkedItem.pricePerUnit || linkedItem.unitPrice || 0;

  if (pricePerUnit <= 0) {
    return { price: null, totalQty: null, error: 'no_price' };
  }

  // Qty = basePortion (1 package per portion)
  // Total qty = basePortion × scaling factor
  const totalQty = basePortion * scalingFactor;
  const price = Math.round(totalQty * pricePerUnit * 100) / 100;
  return { price, totalQty, error: null };
}

/**
 * PlatingInstructions Component
 *
 * Editable list of plating/presentation instructions with add/edit/delete.
 * Also supports package rows for tracking packaging materials used in plating.
 */
function PlatingInstructions({
  instructions: instructionsProp = [],
  onChange = () => {},
  editable = true,
  micFlag = false,
  showVoice = false,
  voiceActive = false,
  onVoiceClick = () => {},
  isOwner = false,
  basePortion = 1,
  scalingFactor = 1,
}) {
  // Ensure instructions is always an array (handles null, undefined, string, etc.)
  const instructions = Array.isArray(instructionsProp) ? instructionsProp : [];

  // Linked packaging inventory items cache
  const [linkedPackageItems, setLinkedPackageItems] = useState({});

  const [newInstruction, setNewInstruction] = useState('');
  const [newPackage, setNewPackage] = useState({ unit: 'pc', name: '' });
  const [fieldVoiceActive, setFieldVoiceActive] = useState(null); // { type: 'new'|'edit', index: number }
  const [fieldVoiceTranscript, setFieldVoiceTranscript] = useState('');
  const [packageLinkModalOpen, setPackageLinkModalOpen] = useState(false);
  const [packageLinkIndex, setPackageLinkIndex] = useState(null);

  // Bulk voice dictation state
  const [bulkVoiceActive, setBulkVoiceActive] = useState(false);
  const [bulkTranscript, setBulkTranscript] = useState({ fullTranscript: '', currentLine: '', lines: [] });
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const bulkVoiceRef = useRef(null);
  const fieldVoiceRef = useRef(null);

  // Ref to always have current instructions (avoid stale closure)
  const currentInstructionsRef = useRef(instructions);

  // Update ref when instructions change
  useEffect(() => {
    currentInstructionsRef.current = instructions;
  }, [instructions]);

  // Fetch linked package items for price calculation
  useEffect(() => {
    const fetchLinkedPackages = async () => {
      const packages = instructions.filter(item => item?.isPackage && item.linkedPackageId);
      if (packages.length === 0) {
        setLinkedPackageItems({});
        return;
      }

      try {
        const items = await Promise.all(
          packages.map(pkg => inventoryItemDB.getById(pkg.linkedPackageId).catch(() => null))
        );
        const itemsMap = {};
        packages.forEach((pkg, idx) => {
          if (items[idx]) {
            itemsMap[pkg.linkedPackageId] = items[idx];
          }
        });
        setLinkedPackageItems(itemsMap);
      } catch (err) {
        console.error('Error fetching linked package items:', err);
      }
    };

    fetchLinkedPackages();
  }, [instructions]);

  // Count instructions and packages separately for badge
  const instructionCount = useMemo(() => {
    return instructions.filter(item => typeof item === 'string').length;
  }, [instructions]);

  const packageCount = useMemo(() => {
    return instructions.filter(item => item?.isPackage).length;
  }, [instructions]);

  // Cleanup on unmount - use destroy() for full teardown including callback removal
  useEffect(() => {
    return () => {
      if (bulkVoiceRef.current) {
        bulkVoiceRef.current.cancel();
        bulkVoiceRef.current.destroy();
        bulkVoiceRef.current = null;
      }
      if (fieldVoiceRef.current) {
        fieldVoiceRef.current.cancel();
        fieldVoiceRef.current.destroy();
        fieldVoiceRef.current = null;
      }
    };
  }, []);

  // Handle input field focus for new instruction
  const handleNewInstructionFocus = async () => {
    if (!micFlag || fieldVoiceActive || bulkVoiceActive) return;

    if (!GoogleCloudVoiceService.isSupported()) {
      console.warn('Google Cloud Voice not supported');
      return;
    }

    const fieldInfo = { type: 'new' };
    setFieldVoiceActive(fieldInfo);
    setFieldVoiceTranscript('');

    fieldVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setFieldVoiceTranscript(data.currentLine || '');
      },
      onComplete: (result) => {
        if (result.fullTranscript) {
          setNewInstruction(result.fullTranscript);
        }
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      },
      onError: (error) => {
        console.error('Field voice error:', error);
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      }
    });

    try {
      await fieldVoiceRef.current.start();
    } catch (error) {
      console.error('Error starting field voice:', error);
      setFieldVoiceActive(null);
    }
  };

  // Handle input field focus for editing existing instruction
  const handleEditInstructionFocus = async (index) => {
    if (!micFlag || fieldVoiceActive || bulkVoiceActive) return;

    if (!GoogleCloudVoiceService.isSupported()) {
      console.warn('Google Cloud Voice not supported');
      return;
    }

    const fieldInfo = { type: 'edit', index };
    setFieldVoiceActive(fieldInfo);
    setFieldVoiceTranscript('');

    fieldVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setFieldVoiceTranscript(data.currentLine || '');
      },
      onComplete: (result) => {
        if (result.fullTranscript) {
          handleUpdateInstruction(index, result.fullTranscript);
        }
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      },
      onError: (error) => {
        console.error('Field voice error:', error);
        setFieldVoiceActive(null);
        setFieldVoiceTranscript('');
      }
    });

    try {
      await fieldVoiceRef.current.start();
    } catch (error) {
      console.error('Error starting field voice:', error);
      setFieldVoiceActive(null);
    }
  };

  // Handle voice stop
  const handleVoiceStop = () => {
    if (!fieldVoiceRef.current || !fieldVoiceActive) return;

    // Hide mic immediately when user clicks stop
    setFieldVoiceActive(null);
    fieldVoiceRef.current.stop();
  };

  const handleAddInstruction = () => {
    if (!newInstruction.trim()) return;

    const updatedInstructions = [...instructions, newInstruction.trim()];
    onChange(updatedInstructions);
    setNewInstruction('');
  };

  const handleRemoveInstruction = (index) => {
    const updatedInstructions = instructions.filter((_, i) => i !== index);

    // If no instructions left, set to null to hide component
    if (updatedInstructions.length === 0) {
      onChange(null);
    } else {
      onChange(updatedInstructions);
    }
  };

  const handleUpdateInstruction = (index, value) => {
    const updatedInstructions = instructions.map((instruction, i) =>
      i === index ? value : instruction
    );
    onChange(updatedInstructions);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAddInstruction();
    }
  };

  const handleMoveInstruction = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === instructions.length - 1)
    ) {
      return;
    }

    const updatedInstructions = [...instructions];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedInstructions[index], updatedInstructions[newIndex]] = [
      updatedInstructions[newIndex],
      updatedInstructions[index],
    ];
    onChange(updatedInstructions);
  };

  // Bulk voice dictation handlers
  const handleBulkVoiceStart = async () => {
    setBulkError('');

    if (!GoogleCloudVoiceService.isSupported()) {
      setBulkError('Voice recording not supported in this browser.');
      return;
    }

    // Create new Google Cloud Voice service for bulk dictation
    bulkVoiceRef.current = new GoogleCloudVoiceService({
      language: 'fr-CA',
      onTranscriptUpdate: (data) => {
        setBulkTranscript(data);
      },
      onComplete: handleBulkVoiceComplete,
      onError: (error) => {
        setBulkError(`Voice error: ${error}`);
        setBulkVoiceActive(false);
      },
      onRecordingStart: () => {
        // Recording started
      }
    });

    try {
      await bulkVoiceRef.current.start();
      setBulkVoiceActive(true);
    } catch (error) {
      setBulkError(error.message);
    }
  };

  const handleBulkVoiceStop = () => {
    // Hide mic immediately when user clicks stop
    setBulkVoiceActive(false);
    if (bulkVoiceRef.current) {
      bulkVoiceRef.current.stop();
    }
  };

  const handleBulkVoiceComplete = async (result) => {
    setBulkVoiceActive(false);

    const hasContent = result.lines.length > 0 || (result.fullTranscript && result.fullTranscript.trim());
    if (!hasContent) {
      setBulkError('No plating instructions detected. Please try again.');
      return;
    }

    // Parse with Claude API (API key handled server-side via Cloud Function)
    setBulkProcessing(true);
    setBulkError('');

    try {
      const fullText = result.lines.length > 0
        ? result.lines.join('\n')
        : result.fullTranscript;

      const parsedInstructions = await parseBulkPlatingWithClaude(fullText);

      // Use ref to get current instructions (avoid stale closure)
      const currentInstructions = currentInstructionsRef.current;

      // Add all instructions to the list
      const updatedInstructions = [...currentInstructions, ...parsedInstructions];
      onChange(updatedInstructions);

      // Reset bulk voice state
      setBulkTranscript({ fullTranscript: '', currentLine: '', lines: [] });
      setBulkProcessing(false);

    } catch (error) {
      console.error('❌ Error parsing bulk plating instructions:', error);
      setBulkError(`Failed to parse plating instructions: ${error.message}`);
      setBulkProcessing(false);
    }
  };

  const handleBulkVoiceToggle = () => {
    if (bulkVoiceActive) {
      handleBulkVoiceStop();
    } else {
      handleBulkVoiceStart();
    }
  };

  // ============================================
  // Package Handlers
  // ============================================

  const handleAddPackage = () => {
    if (!newPackage.name.trim()) return;

    // Qty is auto-calculated from basePortion (1 package per portion)
    const packageItem = {
      isPackage: true,
      unit: newPackage.unit || 'pc',
      name: newPackage.name.trim(),
      linkedPackageId: null,
      isRollType: ROLL_UNITS.includes(newPackage.unit),
    };

    const updatedInstructions = [...instructions, packageItem];
    onChange(updatedInstructions);
    setNewPackage({ unit: 'pc', name: '' });
  };

  const handleUpdatePackage = (index, field, value) => {
    const updatedInstructions = instructions.map((item, i) => {
      if (i === index && item?.isPackage) {
        const updated = { ...item, [field]: value };
        // Update isRollType when unit changes
        if (field === 'unit') {
          updated.isRollType = ROLL_UNITS.includes(value);
        }
        return updated;
      }
      return item;
    });
    onChange(updatedInstructions);
  };

  const handleOpenPackageLinkModal = (index) => {
    setPackageLinkIndex(index);
    setPackageLinkModalOpen(true);
  };

  const handleLinkPackage = async (inventoryItemId) => {
    if (packageLinkIndex === null) return;

    // Fetch the inventory item to get its details
    let linkedItem = null;
    try {
      linkedItem = await inventoryItemDB.getById(inventoryItemId);
    } catch (err) {
      console.error('Error fetching inventory item:', err);
    }

    const updatedInstructions = instructions.map((item, i) => {
      if (i === packageLinkIndex && item?.isPackage) {
        return {
          ...item,
          linkedPackageId: inventoryItemId,
          linkedName: linkedItem?.name || item.name,
          // Auto-detect roll type from inventory item
          isRollType: linkedItem?.itemType === 'roll' || ROLL_UNITS.includes(item.unit),
        };
      }
      return item;
    });
    onChange(updatedInstructions);

    // Update cache
    if (linkedItem) {
      setLinkedPackageItems(prev => ({
        ...prev,
        [inventoryItemId]: linkedItem
      }));
    }

    setPackageLinkModalOpen(false);
    setPackageLinkIndex(null);
  };

  const handleUnlinkPackage = (index) => {
    const pkg = instructions[index];
    if (!pkg?.isPackage) return;

    const linkedId = pkg.linkedPackageId;
    const updatedInstructions = instructions.map((item, i) => {
      if (i === index && item?.isPackage) {
        return {
          ...item,
          linkedPackageId: null,
          linkedName: undefined,
        };
      }
      return item;
    });
    onChange(updatedInstructions);

    // Remove from cache
    if (linkedId) {
      setLinkedPackageItems(prev => {
        const newCache = { ...prev };
        delete newCache[linkedId];
        return newCache;
      });
    }
  };

  return (
    <div className={styles.platingInstructions}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>
          Plating Instructions
          <Badge variant="info" size="small">
            {instructionCount}
          </Badge>
          {packageCount > 0 && (
            <Badge variant="secondary" size="small" title="Packages">
              📦 {packageCount}
            </Badge>
          )}
        </h3>
        {editable && (
          <Button
            variant={bulkVoiceActive ? 'danger' : 'primary'}
            size="small"
            onClick={handleBulkVoiceToggle}
            disabled={bulkProcessing}
          >
            {bulkVoiceActive ? '⏹️ Stop Dictation' : '🎤 Voice Dictation'}
          </Button>
        )}
      </div>

      {/* Bulk Voice Error */}
      {bulkError && (
        <Alert variant="danger" dismissible onDismiss={() => setBulkError('')}>
          {bulkError}
        </Alert>
      )}

      {/* Bulk Voice Active Indicator - Green flashing mic */}
      {bulkVoiceActive && (
        <div className={styles.bulkVoiceIndicator}>
          <button
            type="button"
            className={styles.bulkVoiceMic}
            onClick={handleBulkVoiceStop}
            title="Click to stop recording"
          >
            🎤
          </button>
        </div>
      )}

      {/* Instructions & Packages List */}
      {instructions.length > 0 ? (
        <ol className={styles.list}>
          {instructions.map((item, index) => (
            <li key={index} className={styles.listItem}>
              {/* Package Row */}
              {item?.isPackage ? (
                editable ? (
                  <div className={`${styles.editableItem} ${styles.packageItem} ${item.linkedPackageId ? styles.linkedPackage : ''}`}>
                    <div className={styles.packageIcon}>📦</div>
                    <div className={styles.packageQtyDisplay} title="Qty = base portions (1 per portion)">
                      {Math.round(basePortion * scalingFactor)}{item.unit || 'pc'}
                    </div>
                    <Input
                      value={item.linkedName || item.name}
                      onChange={(e) => handleUpdatePackage(index, item.linkedPackageId ? 'linkedName' : 'name', e.target.value)}
                      size="small"
                      compact
                      className={styles.packageNameInput}
                      placeholder="Package name"
                    />
                    {/* Price display for owner */}
                    {isOwner && (() => {
                      const linkedItem = linkedPackageItems[item.linkedPackageId];
                      const priceData = calculatePackagePrice(item, linkedItem, basePortion, scalingFactor);
                      return (
                        <div className={styles.packagePrice}>
                          {priceData.price !== null ? (
                            <span className={styles.priceValue}>${priceData.price.toFixed(2)}</span>
                          ) : priceData.error === 'not_linked' ? (
                            <span className={styles.priceNA}>—</span>
                          ) : priceData.error === 'no_price' ? (
                            <span className={styles.priceNA} title="No price in inventory">$?</span>
                          ) : (
                            <span className={styles.priceNA}>—</span>
                          )}
                        </div>
                      );
                    })()}
                    <div className={styles.actionButtons}>
                      {/* Link button */}
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => item.linkedPackageId ? handleUnlinkPackage(index) : handleOpenPackageLinkModal(index)}
                        className={`${styles.linkButton} ${item.linkedPackageId ? styles.linked : ''}`}
                        title={item.linkedPackageId ? 'Unlink from inventory' : 'Link to inventory'}
                      >
                        <span aria-hidden="true">{item.linkedPackageId ? '🔗' : '🔗'}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleMoveInstruction(index, 'up')}
                        className={styles.moveButton}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleMoveInstruction(index, 'down')}
                        className={styles.moveButton}
                        disabled={index === instructions.length - 1}
                        title="Move down"
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleRemoveInstruction(index)}
                        className={styles.removeButton}
                        title="Remove package"
                      >
                        <span aria-hidden="true">🗑️</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={`${styles.readOnlyItem} ${styles.packageItem}`}>
                    <div className={styles.packageIcon}>📦</div>
                    <span className={styles.packageQtyDisplay}>
                      {Math.round(basePortion * scalingFactor)}{item.unit || 'pc'}
                    </span>
                    <span className={styles.packageNameDisplay}>{item.linkedName || item.name}</span>
                    {isOwner && (() => {
                      const linkedItem = linkedPackageItems[item.linkedPackageId];
                      const priceData = calculatePackagePrice(item, linkedItem, basePortion, scalingFactor);
                      return priceData.price !== null ? (
                        <span className={styles.priceValue}>${priceData.price.toFixed(2)}</span>
                      ) : null;
                    })()}
                  </div>
                )
              ) : (
                /* Regular Instruction Row */
                editable ? (
                  <div className={styles.editableItem}>
                    <div className={styles.instructionNumber}>•</div>
                    <Input
                      value={item}
                      onChange={(e) => handleUpdateInstruction(index, e.target.value)}
                      onFocus={() => handleEditInstructionFocus(index)}
                      size="small"
                      compact
                      className={styles.instructionInput}
                      showVoice={micFlag}
                      voiceActive={
                        fieldVoiceActive?.type === 'edit' && fieldVoiceActive?.index === index
                      }
                      onVoiceClick={handleVoiceStop}
                    />
                    <div className={styles.actionButtons}>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleMoveInstruction(index, 'up')}
                        className={styles.moveButton}
                        disabled={index === 0}
                        aria-label={`Move instruction ${index + 1} up`}
                        title="Move up"
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleMoveInstruction(index, 'down')}
                        className={styles.moveButton}
                        disabled={index === instructions.length - 1}
                        aria-label={`Move instruction ${index + 1} down`}
                        title="Move down"
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleRemoveInstruction(index)}
                        className={styles.removeButton}
                        aria-label={`Remove instruction ${index + 1}`}
                        title="Remove instruction"
                      >
                        <span aria-hidden="true">🗑️</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.readOnlyItem}>
                    <div className={styles.instructionNumber}>•</div>
                    <p className={styles.instructionText}>{item}</p>
                  </div>
                )
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🍽️</span>
          <p className={styles.emptyText}>
            No plating instructions yet. Add your first instruction below!
          </p>
        </div>
      )}

      {/* Add New Instruction */}
      {editable && (
        <div className={styles.addSection}>
          <div className={styles.addInstructionNumber}>•</div>
          <Input
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            onFocus={handleNewInstructionFocus}
            onKeyPress={handleKeyPress}
            placeholder="Enter new plating instruction..."
            size="small"
            className={styles.instructionInput}
            showVoice={micFlag}
            voiceActive={fieldVoiceActive?.type === 'new'}
            onVoiceClick={handleVoiceStop}
          />
          <Button
            variant="primary"
            size="small"
            onClick={handleAddInstruction}
            disabled={!newInstruction.trim()}
            className={styles.addButton}
          >
            + Add Instruction
          </Button>
        </div>
      )}

      {/* Add New Package */}
      {editable && (
        <div className={`${styles.addSection} ${styles.addPackageSection}`}>
          <div className={styles.addPackageIcon}>📦</div>
          <div className={styles.packageQtyDisplay} title="Qty = base portions (1 per portion)">
            {basePortion}<select
              value={newPackage.unit}
              onChange={(e) => setNewPackage(prev => ({ ...prev, unit: e.target.value }))}
              className={styles.packageUnitSelectInline}
            >
              {PACKAGE_UNIT_OPTIONS.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <Input
            value={newPackage.name}
            onChange={(e) => setNewPackage(prev => ({ ...prev, name: e.target.value }))}
            onKeyPress={(e) => e.key === 'Enter' && handleAddPackage()}
            size="small"
            compact
            className={styles.packageNameInput}
            placeholder="Package name..."
          />
          <Button
            variant="secondary"
            size="small"
            onClick={handleAddPackage}
            disabled={!newPackage.name.trim()}
            className={styles.addButton}
          >
            + Add Package
          </Button>
        </div>
      )}

      {/* Package Link Modal - Simple search to link to inventory */}
      {packageLinkModalOpen && (
        <PackageLinkModal
          isOpen={packageLinkModalOpen}
          packageName={instructions[packageLinkIndex]?.name || ''}
          onLink={handleLinkPackage}
          onClose={() => {
            setPackageLinkModalOpen(false);
            setPackageLinkIndex(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Simple modal to search and link packages to inventory
 */
function PackageLinkModal({ isOpen, packageName, onLink, onClose }) {
  const [searchTerm, setSearchTerm] = useState(packageName);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Search for packaging items
  useEffect(() => {
    const searchPackages = async () => {
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        // Search inventory for packaging items
        const allItems = await inventoryItemDB.getAll();
        const results = allItems.filter(item => {
          const nameMatch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
          const isPackaging = item.itemType === 'packaging' || item.category?.toLowerCase().includes('emballage');
          return nameMatch || (isPackaging && nameMatch);
        }).slice(0, 10);
        setSearchResults(results);
      } catch (err) {
        console.error('Error searching packages:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchPackages, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Link Package to Inventory</h3>
          <Button variant="ghost" size="small" onClick={onClose}>✕</Button>
        </div>
        <div className={styles.modalBody}>
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search packaging inventory..."
            size="medium"
            autoFocus
          />
          {loading && <p className={styles.searchLoading}>Searching...</p>}
          {!loading && searchResults.length === 0 && searchTerm && (
            <p className={styles.noResults}>No packaging items found</p>
          )}
          {searchResults.length > 0 && (
            <ul className={styles.searchResults}>
              {searchResults.map(item => (
                <li
                  key={item.id}
                  className={styles.searchResultItem}
                  onClick={() => onLink(item.id)}
                >
                  <span className={styles.resultName}>{item.name}</span>
                  {item.pricePerUnit > 0 && (
                    <span className={styles.resultPrice}>${item.pricePerUnit.toFixed(2)}/ea</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

PlatingInstructions.propTypes = {
  /** Array of instruction strings or package objects */
  instructions: PropTypes.array,
  /** Change handler (receives updated instructions array) */
  onChange: PropTypes.func,
  /** Enable editing mode */
  editable: PropTypes.bool,
  /** Global voice mode enabled */
  micFlag: PropTypes.bool,
  /** Show voice input for bulk dictation */
  showVoice: PropTypes.bool,
  /** Voice input is active */
  voiceActive: PropTypes.bool,
  /** Voice button click handler */
  onVoiceClick: PropTypes.func,
  /** Whether user is owner (shows price) */
  isOwner: PropTypes.bool,
  /** Recipe base portion count */
  basePortion: PropTypes.number,
  /** Recipe scaling factor */
  scalingFactor: PropTypes.number,
};

export default PlatingInstructions;
