/**
 * Vendor Profile Wizard Component
 *
 * Multi-step wizard for setting up vendor invoice parsing profiles.
 * Shown when a new vendor is detected or when a vendor has no parsing profile.
 *
 * Steps:
 * 1. Vendor Info - Confirm/edit vendor details
 * 2. Pricing Model - Select unit/weight/mixed pricing
 * 3. Column Mapping - Verify detected columns
 * 4. Sample Lines - Verify sample line extraction
 */

import { useState, useEffect, useRef } from 'react';
import Button from '../common/Button';
import Input from '../common/Input';
import Alert from '../common/Alert';
import { PROFILE_VERSION } from '../../services/invoice/types';
import parsingProfileManager from '../../services/invoice/parsingProfileManager';
import styles from '../../styles/components/vendorprofilewizard.module.css';

const STEPS = [
  { id: 1, title: 'Vendor Info', icon: '🏪' },
  { id: 2, title: 'Invoice Settings', icon: '⚙️' },
  { id: 3, title: 'Columns', icon: '📊' },
  { id: 4, title: 'Verify', icon: '✓' }
];

/**
 * Column type options for the dropdown
 * User can reassign what each column means
 */
const COLUMN_TYPES = [
  { key: 'skip', label: '— Skip this column —' },
  { key: 'sku', label: 'SKU / Item Code' },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Quantity (generic/delivered)' },
  { key: 'orderedQuantity', label: 'Qté Cmd - Ordered quantity' },
  { key: 'billingQuantity', label: 'Qté Fact - Billing qty (for pricing) ⭐' },
  { key: 'pieceCount', label: 'Qté Mcx - Piece count' },
  { key: 'unit', label: 'Unit of Measure (informational)' },
  { key: 'quantityUnit', label: 'U/M → linked to billing qty (kg=weight, UN=count)' },
  { key: 'weight', label: 'Weight (explicit column)' },
  { key: 'packageFormat', label: 'Package Format (weight embedded)' },
  { key: 'packageUnits', label: 'Package Format (units per case)' },
  { key: 'packFormat', label: 'Pack (distributor: 4/5LB, 1/50LB)' },
  { key: 'containerFormat', label: 'Container Format (10/100, 6/RL, 1/500)' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'totalPrice', label: 'Line Total' },
  { key: 'ignoreRow', label: '⚠️ Ignore rows (header/footer)' },
];

/**
 * Weight unit options - shown when column type is 'weight' or 'packageFormat'
 */
const WEIGHT_UNITS = [
  { key: 'lb', label: 'Pounds (lb)' },
  { key: 'kg', label: 'Kilograms (kg)' },
  { key: 'g', label: 'Grams (g)' },
  { key: 'oz', label: 'Ounces (oz)' },
];


/**
 * Canadian provinces/territories abbreviations
 */
const CANADIAN_PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

/**
 * Parse a combined address string into components
 * Handles formats like: "4520 rue Saint-Denis, Montréal QC H2J 2L3"
 *
 * @param {string} fullAddress - Combined address string
 * @returns {Object} Parsed address components
 */
function parseCanadianAddress(fullAddress) {
  if (!fullAddress) return { address: '', city: '', province: '', postalCode: '' };

  const result = { address: '', city: '', province: '', postalCode: '' };

  // Canadian postal code pattern: A1A 1A1 or A1A1A1
  const postalCodeMatch = fullAddress.match(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/i);
  if (postalCodeMatch) {
    result.postalCode = postalCodeMatch[0].toUpperCase();
    // Ensure proper format with space
    if (result.postalCode.length === 6) {
      result.postalCode = result.postalCode.slice(0, 3) + ' ' + result.postalCode.slice(3);
    }
  }

  // Province pattern: look for 2-letter province code
  const provincePattern = new RegExp(`\\b(${CANADIAN_PROVINCES.join('|')})\\b`, 'i');
  const provinceMatch = fullAddress.match(provincePattern);
  if (provinceMatch) {
    result.province = provinceMatch[1].toUpperCase();
  }

  // Remove postal code and province from the string for further parsing
  let remaining = fullAddress
    .replace(/[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d/i, '')
    .replace(provincePattern, '')
    .trim();

  // Try to split by comma - usually "street, city province"
  const parts = remaining.split(',').map(p => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    // First part is street address
    result.address = parts[0];
    // Second part is city (possibly with leftover province text)
    result.city = parts[1].replace(/\s+$/, '').trim();
  } else if (parts.length === 1) {
    // No comma - try to detect city by common patterns
    // This is harder, so just use the whole thing as address
    result.address = parts[0];
  }

  // Clean up city if it has trailing spaces or province remnants
  result.city = result.city.replace(/\s{2,}/g, ' ').trim();

  return result;
}

/**
 * @param {Object} props
 * @param {boolean} props.open - Whether wizard is open
 * @param {Object} props.vendorInfo - Extracted vendor information
 * @param {Object} props.suggestedProfile - AI-suggested profile structure
 * @param {Array} props.sampleLines - Sample extracted lines for verification
 * @param {Array} props.detectedColumns - Columns detected by AI with sample values
 *   Each item: { index, aiLabel, value, sampleValues[] }
 * @param {Array} props.autoCorrections - Auto-corrections made during parsing
 *   Each item: { lineNumber, description, before, after, reason }
 * @param {Function} props.onClose - Called when wizard is cancelled
 * @param {Function} props.onComplete - Called with (vendorData, profile, itemCorrections) on completion
 *   - itemCorrections: Object keyed by itemCode/description with Type 2 corrections from Step 4
 */
function VendorProfileWizard({
  open,
  vendorInfo = {},
  suggestedProfile = {},
  sampleLines = [],
  detectedColumns = [],
  autoCorrections = null,
  onClose,
  onComplete
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Vendor Info
  const [vendor, setVendor] = useState({
    name: '',
    legalName: '',
    vendorCode: '',
    taxNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    accountNumber: '',
    paymentTerms: 'Net 30'
  });

  // Step 2: Invoice Settings (quirks only - pricing is auto-detected per line)
  const [quirks, setQuirks] = useState({
    hasDeposits: false,
    weightInDescription: false,
    weightInPackageFormat: false,  // e.g., "Caisse 25lbs" in FORMAT column
    skuInDescription: false,
    multiplePages: false,
    // Container/packaging distributor settings
    isContainerDistributor: false,  // e.g., Carrousel Emballage - uses 10/100, 6/RL notation
    hasNestedUnits: false,          // Format uses nested unit notation (10/100)
    hasRollProducts: false,         // Vendor sells roll products (6/RL)
    hasContainerCapacity: false     // Products have capacity specs (2.25LB = capacity, not weight)
  });

  // Step 3: Column Mapping - tracks user's column assignments
  // Each item: { index, aiLabel, userLabel, value, sampleValues, wasChanged }
  const [columnMappings, setColumnMappings] = useState([]);

  // Weight unit for the weight column (lb, kg, g, oz)
  const [weightUnit, setWeightUnit] = useState('lb');

  // Step 4: Sample Lines
  const [verifiedLines, setVerifiedLines] = useState([]);
  const [corrections, setCorrections] = useState({});

  // Track last vendorInfo name to detect real changes
  const lastVendorNameRef = useRef('');

  // Initialize from props when wizard opens with new vendor data
  useEffect(() => {
    if (!open) return;

    // Check if we have new vendor data (by comparing name)
    const newVendorName = vendorInfo?.name || '';
    if (newVendorName && newVendorName !== lastVendorNameRef.current) {
      lastVendorNameRef.current = newVendorName;

      // Parse combined address if city/province/postalCode not already separated
      let address = vendorInfo.address || '';
      let city = vendorInfo.city || '';
      let province = vendorInfo.province || '';
      let postalCode = vendorInfo.postalCode || '';

      // If address exists but city/province/postalCode are empty, try to parse
      if (address && (!city || !province || !postalCode)) {
        const parsed = parseCanadianAddress(address);
        if (parsed.city && !city) city = parsed.city;
        if (parsed.province && !province) province = parsed.province;
        if (parsed.postalCode && !postalCode) postalCode = parsed.postalCode;
        // Update address to just the street portion if we extracted components
        if (parsed.address && (parsed.city || parsed.province || parsed.postalCode)) {
          address = parsed.address;
        }
      }

      // Initialize vendor info
      setVendor({
        name: vendorInfo.name || '',
        legalName: vendorInfo.legalName || '',
        vendorCode: vendorInfo.vendorCode || '',
        taxNumber: vendorInfo.taxNumber || '',
        phone: vendorInfo.phone || '',
        email: vendorInfo.email || '',
        address,
        city,
        province,
        postalCode,
        accountNumber: vendorInfo.accountNumber || '',
        paymentTerms: vendorInfo.paymentTerms || 'Net 30'
      });
    }
  }, [open, vendorInfo]);

  // Initialize suggested profile when wizard opens
  useEffect(() => {
    if (!open || !suggestedProfile) return;

    if (suggestedProfile.quirks) {
      setQuirks(prev => ({ ...prev, ...suggestedProfile.quirks }));
    }
  }, [open, suggestedProfile?.quirks]);

  // Initialize column mappings from detected columns
  useEffect(() => {
    if (!open) return;

    if (detectedColumns && detectedColumns.length > 0) {
      // Use detected columns from AI
      setColumnMappings(detectedColumns.map((col, idx) => ({
        ...col,
        originalIndex: idx,      // Track original position for key
        userLabel: col.aiLabel,  // Start with AI's guess
        wasChanged: false,
        wasReordered: false,
      })));
    } else if (sampleLines && sampleLines.length > 0) {
      // Fallback: Build columns from first sample line
      const firstLine = sampleLines[0];
      const columns = [];

      // Extract columns from parsed line
      if (firstLine.itemCode) columns.push({ index: columns.length, aiLabel: 'sku', value: firstLine.itemCode, userLabel: 'sku', wasChanged: false });
      if (firstLine.description || firstLine.rawDescription) columns.push({ index: columns.length, aiLabel: 'description', value: firstLine.description || firstLine.rawDescription, userLabel: 'description', wasChanged: false });
      if (firstLine.quantity != null) columns.push({ index: columns.length, aiLabel: 'quantity', value: String(firstLine.quantity), userLabel: 'quantity', wasChanged: false });
      if (firstLine.weight != null) columns.push({ index: columns.length, aiLabel: 'weight', value: String(firstLine.weight), userLabel: 'weight', wasChanged: false });
      if (firstLine.unitPrice != null) columns.push({ index: columns.length, aiLabel: 'unitPrice', value: String(firstLine.unitPrice), userLabel: 'unitPrice', wasChanged: false });
      if (firstLine.totalPrice != null) columns.push({ index: columns.length, aiLabel: 'totalPrice', value: String(firstLine.totalPrice), userLabel: 'totalPrice', wasChanged: false });

      setColumnMappings(columns);
    }
  }, [open, detectedColumns, sampleLines]);

  // Initialize sample lines when wizard opens
  useEffect(() => {
    if (!open || !sampleLines?.length) return;

    setVerifiedLines(sampleLines.map((line, index) => ({
      ...line,
      id: index,
      isCorrect: true
    })));
  }, [open, sampleLines]);

  // Reset when wizard closes
  useEffect(() => {
    if (!open) {
      lastVendorNameRef.current = '';
      setCurrentStep(1);
      setError('');
    }
  }, [open]);

  // Validate current step
  const validateStep = () => {
    setError('');

    if (currentStep === 1) {
      if (!vendor.name?.trim()) {
        setError('Vendor name is required');
        return false;
      }
    }

    if (currentStep === 3) {
      // At minimum, description and total columns should be mapped
      const hasDescription = columnMappings.some(c => c.userLabel === 'description');
      const hasTotal = columnMappings.some(c => c.userLabel === 'totalPrice');

      if (!hasDescription) {
        setError('Please identify which column contains the Description');
        return false;
      }
      if (!hasTotal) {
        setError('Please identify which column contains the Line Total');
        return false;
      }
    }

    return true;
  };

  // Handle next step
  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep(prev => prev + 1);
  };

  // Handle previous step
  const handleBack = () => {
    setError('');
    setCurrentStep(prev => prev - 1);
  };

  // Handle column type change (user correcting AI's detection)
  const handleColumnTypeChange = (columnIndex, newType) => {
    setColumnMappings(prev => prev.map((col, idx) => {
      if (idx === columnIndex) {
        return {
          ...col,
          userLabel: newType,
          wasChanged: newType !== col.aiLabel,
        };
      }
      return col;
    }));
  };

  // Move column up (swap with previous)
  const moveColumnUp = (index) => {
    if (index <= 0) return;
    setColumnMappings(prev => {
      const newMappings = [...prev];
      // Swap with previous column
      [newMappings[index - 1], newMappings[index]] = [newMappings[index], newMappings[index - 1]];
      // Mark both as reordered
      newMappings[index - 1].wasReordered = true;
      newMappings[index].wasReordered = true;
      return newMappings;
    });
  };

  // Move column down (swap with next)
  const moveColumnDown = (index) => {
    if (index >= columnMappings.length - 1) return;
    setColumnMappings(prev => {
      const newMappings = [...prev];
      // Swap with next column
      [newMappings[index], newMappings[index + 1]] = [newMappings[index + 1], newMappings[index]];
      // Mark both as reordered
      newMappings[index].wasReordered = true;
      newMappings[index + 1].wasReordered = true;
      return newMappings;
    });
  };

  // Count corrections made by user
  const columnCorrections = columnMappings.filter(c => c.wasChanged).length;
  const columnsReordered = columnMappings.some(c => c.wasReordered);

  // Handle line correction
  const handleLineCorrection = (lineId, field, value) => {
    setCorrections(prev => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] || {}),
        [field]: value
      }
    }));
    setVerifiedLines(prev => prev.map(line => {
      if (line.id === lineId) {
        return { ...line, isCorrect: false };
      }
      return line;
    }));
  };

  // Mark line as correct
  const markLineCorrect = (lineId) => {
    setVerifiedLines(prev => prev.map(line => {
      if (line.id === lineId) {
        return { ...line, isCorrect: true };
      }
      return line;
    }));
    // Clear corrections for this line
    setCorrections(prev => {
      const updated = { ...prev };
      delete updated[lineId];
      return updated;
    });
  };

  // Handle final submission
  const handleComplete = async () => {
    if (!validateStep()) return;

    setLoading(true);
    setError('');

    try {
      // Build vendor data
      const vendorData = {
        name: vendor.name.trim(),
        legalName: vendor.legalName?.trim() || '',
        vendorCode: vendor.vendorCode?.trim() || '',
        taxNumber: vendor.taxNumber?.trim() || '',
        phone: vendor.phone?.trim() || '',
        email: vendor.email?.trim() || '',
        address: vendor.address?.trim() || '',
        city: vendor.city?.trim() || '',
        province: vendor.province?.trim() || '',
        postalCode: vendor.postalCode?.trim() || '',
        accountNumber: vendor.accountNumber?.trim() || '',
        paymentTerms: vendor.paymentTerms?.trim() || ''
      };

      // Build parsing profile
      // Pricing model is 'auto' - detected per line using math verification
      // Column mappings are saved to guide future invoice parsing

      // Build column mapping for the profile
      // Format: { sku: { index: 0 }, description: { index: 1 }, ... }
      const columnMap = {};
      columnMappings.forEach((col, idx) => {
        if (col.userLabel && col.userLabel !== 'skip') {
          columnMap[col.userLabel] = {
            index: idx,
            aiOriginal: col.aiLabel,  // What AI detected
            wasChanged: col.wasChanged,
            sampleValue: col.value,   // Sample value for reference
          };
        }
      });

      // Track which corrections user made (for training AI in future)
      const columnCorrectionsDetail = columnMappings
        .filter(c => c.wasChanged)
        .map(c => ({
          index: c.index,
          aiDetected: c.aiLabel,
          userCorrected: c.userLabel,
          sampleValue: c.value,
        }));

      // Check if user has a weight column mapped
      const hasWeightColumn = columnMappings.some(c => c.userLabel === 'weight');

      // Check if user has a packageFormat column mapped (either weight embedded or units per case)
      const hasPackageFormatWeight = columnMappings.some(c => c.userLabel === 'packageFormat');
      const hasPackageFormatUnits = columnMappings.some(c => c.userLabel === 'packageUnits');
      // Distributor pack format: "4/5LB", "1/50LB", "12CT" - contains both pack count and unit weight
      const hasPackFormat = columnMappings.some(c => c.userLabel === 'packFormat');
      // Container format: "10/100", "6/RL", "1/500" - packaging distributor notation
      const hasContainerFormat = columnMappings.some(c => c.userLabel === 'containerFormat');

      const profile = {
        version: PROFILE_VERSION,
        pricingModel: 'auto',  // Auto-detected per line (weight × price vs qty × price)

        // Column mapping template - tells AI which column is which
        columns: columnMap,

        // Weight unit for this vendor (lb, kg, g, oz)
        // Used when weight column is present
        weightUnit: hasWeightColumn ? weightUnit : null,

        // Package format settings
        // - packageFormat: "Caisse 4lb" → weight embedded, bare numbers flagged
        // - packageUnits: "Caisse 24" → always units per case (count)
        // - packFormat: "4/5LB" → distributor style (packCount × unitWeight)
        packageFormat: (hasPackageFormatWeight || hasPackageFormatUnits || hasPackFormat) ? {
          enabled: true,
          type: hasPackFormat ? 'distributor' : (hasPackageFormatUnits ? 'units' : 'weight')
        } : null,

        // Explicit corrections for prompt hints
        columnCorrections: columnCorrectionsDetail,

        // promptHints will be generated after profile is built
        promptHints: null,

        quirks: {
          hasDeposits: quirks.hasDeposits,
          weightInDescription: quirks.weightInDescription,
          weightInPackageFormat: quirks.weightInPackageFormat,
          skuInDescription: quirks.skuInDescription,
          multiplePages: quirks.multiplePages,
          // Container/packaging distributor settings
          isContainerDistributor: quirks.isContainerDistributor || hasContainerFormat,
          hasNestedUnits: quirks.hasNestedUnits,
          hasRollProducts: quirks.hasRollProducts,
          hasContainerCapacity: quirks.hasContainerCapacity
        },

        // Store sample lines for future reference
        sampleLines: verifiedLines.slice(0, 3).map(line => ({
          raw: line.rawDescription,
          parsed: {
            description: corrections[line.id]?.description || line.description,
            quantity: corrections[line.id]?.quantity || line.quantity,
            unitPrice: corrections[line.id]?.unitPrice || line.unitPrice
          }
        })),

        stats: {
          timesUsed: 0,
          lastUsed: null,
          successRate: 0,
          columnCorrections: columnCorrectionsDetail.length,
          lineCorrections: Object.keys(corrections).length
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Generate prompt hints using the consolidated function
      // This creates hints from columns, quirks, weightUnit, packageFormat, etc.
      profile.promptHints = parsingProfileManager.generatePromptHints(profile);

      // If user made corrections, bump down auto-match confidence
      if (columnCorrectionsDetail.length > 0 || Object.keys(corrections).length > 0) {
        profile.confidenceAdjustment = -0.1;
      }

      // Build itemCorrections from Step 4 line corrections
      // These are Type 2 corrections (practical/value changes) that should be learned
      const itemCorrections = {};
      for (const [lineIdStr, corr] of Object.entries(corrections)) {
        const lineId = parseInt(lineIdStr, 10);
        const line = verifiedLines.find(l => l.id === lineId);
        if (!line) continue;

        // Use itemCode as key if available, otherwise use description
        const correctionKey = line.itemCode || line.description || `line_${lineId}`;
        if (!correctionKey) continue;

        // Build the correction object
        const correctionData = {
          itemCode: line.itemCode || null,
          itemName: line.description || line.name || null,
          learnedAt: new Date().toISOString(),
        };

        // If weight was corrected, store it
        if (corr.weight != null && corr.weight !== '') {
          const weightVal = parseFloat(corr.weight);
          if (!isNaN(weightVal)) {
            correctionData.unitType = 'weight';
            correctionData.value = weightVal;
            correctionData.totalValue = weightVal;
            correctionData.unit = line.weightUnit || weightUnit || 'kg';
            correctionData.format = `${weightVal}${correctionData.unit}`;
          }
        }

        // If quantity was corrected, store it (as count if no weight)
        if (!correctionData.unitType && corr.quantity != null && corr.quantity !== '') {
          const qtyVal = parseFloat(corr.quantity);
          if (!isNaN(qtyVal)) {
            correctionData.unitType = 'count';
            correctionData.value = qtyVal;
            correctionData.totalValue = qtyVal;
            correctionData.unit = 'ea';
            correctionData.format = `${qtyVal} units`;
          }
        }

        // Only add if we have meaningful correction data
        if (correctionData.unitType) {
          itemCorrections[correctionKey] = correctionData;
          console.log(`[VendorProfileWizard] Built itemCorrection for "${correctionKey}":`, correctionData);
        }
      }

      const hasItemCorrections = Object.keys(itemCorrections).length > 0;
      if (hasItemCorrections) {
        console.log(`[VendorProfileWizard] Passing ${Object.keys(itemCorrections).length} item corrections to save`);
      }

      // Pass itemCorrections as third parameter (or null if none)
      onComplete(vendorData, profile, hasItemCorrections ? itemCorrections : null);
    } catch (err) {
      console.error('[VendorProfileWizard] Error:', err);
      setError(err.message || 'Failed to save vendor profile');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const correctLines = verifiedLines.filter(l => l.isCorrect).length;
  const totalLines = verifiedLines.length;

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>New Vendor Setup</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Progress Steps */}
        <div className={styles.progressBar}>
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={`${styles.progressStep} ${
                currentStep === step.id ? styles.active : ''
              } ${currentStep > step.id ? styles.completed : ''}`}
            >
              <div className={styles.stepCircle}>
                {currentStep > step.id ? '✓' : step.icon}
              </div>
              <span className={styles.stepTitle}>{step.title}</span>
              {index < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <Alert variant="danger" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Step 1: Vendor Info */}
        {currentStep === 1 && (
          <div className={styles.stepContent}>
            <h3 className={styles.stepHeader}>Confirm Vendor Information</h3>
            <p className={styles.stepDescription}>
              {vendorInfo?.name
                ? 'We detected this vendor from the invoice. Please verify or correct the details.'
                : 'We could not detect vendor info automatically. Please enter the vendor details manually.'}
            </p>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Vendor Name *</label>
                <Input
                  value={vendor.name}
                  onChange={(e) => setVendor(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Sysco Montreal"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Legal Name</label>
                <Input
                  value={vendor.legalName}
                  onChange={(e) => setVendor(prev => ({ ...prev, legalName: e.target.value }))}
                  placeholder="Legal business name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Tax Number (TPS/TVQ)</label>
                <Input
                  value={vendor.taxNumber}
                  onChange={(e) => setVendor(prev => ({ ...prev, taxNumber: e.target.value }))}
                  placeholder="e.g., 123456789RT0001"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Vendor Code</label>
                <Input
                  value={vendor.vendorCode}
                  onChange={(e) => setVendor(prev => ({ ...prev, vendorCode: e.target.value }))}
                  placeholder="e.g., SYS-001"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Phone</label>
                <Input
                  type="tel"
                  value={vendor.phone}
                  onChange={(e) => setVendor(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(514) 555-1234"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email</label>
                <Input
                  type="email"
                  value={vendor.email}
                  onChange={(e) => setVendor(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="orders@vendor.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Account Number</label>
                <Input
                  value={vendor.accountNumber}
                  onChange={(e) => setVendor(prev => ({ ...prev, accountNumber: e.target.value }))}
                  placeholder="Your account # with vendor"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Payment Terms</label>
                <select
                  className={styles.select}
                  value={vendor.paymentTerms}
                  onChange={(e) => setVendor(prev => ({ ...prev, paymentTerms: e.target.value }))}
                >
                  <option value="COD">COD (Cash on Delivery)</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                </select>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Address</label>
                <Input
                  value={vendor.address}
                  onChange={(e) => setVendor(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Street address"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>City</label>
                <Input
                  value={vendor.city}
                  onChange={(e) => setVendor(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Province</label>
                <Input
                  value={vendor.province}
                  onChange={(e) => setVendor(prev => ({ ...prev, province: e.target.value }))}
                  placeholder="QC"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Postal Code</label>
                <Input
                  value={vendor.postalCode}
                  onChange={(e) => setVendor(prev => ({ ...prev, postalCode: e.target.value }))}
                  placeholder="H2J 2L3"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Invoice Settings */}
        {currentStep === 2 && (
          <div className={styles.stepContent}>
            <h3 className={styles.stepHeader}>Invoice Settings</h3>
            <p className={styles.stepDescription}>
              Help us understand this vendor's invoice format. Pricing type (unit vs weight) is auto-detected per line.
            </p>

            <div className={styles.autoDetectNote}>
              <span className={styles.autoDetectIcon}>✨</span>
              <div>
                <strong>Auto-Detection Enabled</strong>
                <p>We automatically detect pricing type for each line by verifying which formula matches the total:</p>
                <ul>
                  <li><strong>Qty × Price = Total</strong> → Unit-based pricing</li>
                  <li><strong>Weight × Price = Total</strong> → Weight-based pricing</li>
                </ul>
              </div>
            </div>

            <div className={styles.quirksSection}>
              <h4 className={styles.quirksTitle}>Invoice Quirks</h4>
              <p className={styles.quirksDesc}>Select any that apply to this vendor's invoices:</p>

              <div className={styles.quirksList}>
                <label className={styles.quirkItem}>
                  <input
                    type="checkbox"
                    checked={quirks.hasDeposits}
                    onChange={(e) => setQuirks(prev => ({ ...prev, hasDeposits: e.target.checked }))}
                  />
                  <span className={styles.quirkLabel}>Has deposit/consigne lines</span>
                </label>

                <label className={styles.quirkItem}>
                  <input
                    type="checkbox"
                    checked={quirks.weightInDescription}
                    onChange={(e) => setQuirks(prev => ({ ...prev, weightInDescription: e.target.checked }))}
                  />
                  <span className={styles.quirkLabel}>Weight embedded in description (e.g., "Beef 5.2kg")</span>
                </label>

                <label className={styles.quirkItem}>
                  <input
                    type="checkbox"
                    checked={quirks.weightInPackageFormat}
                    onChange={(e) => setQuirks(prev => ({ ...prev, weightInPackageFormat: e.target.checked }))}
                  />
                  <span className={styles.quirkLabel}>Weight embedded in package format (e.g., "Caisse 25lbs")</span>
                </label>

                <label className={styles.quirkItem}>
                  <input
                    type="checkbox"
                    checked={quirks.skuInDescription}
                    onChange={(e) => setQuirks(prev => ({ ...prev, skuInDescription: e.target.checked }))}
                  />
                  <span className={styles.quirkLabel}>SKU embedded in description</span>
                </label>

                <label className={styles.quirkItem}>
                  <input
                    type="checkbox"
                    checked={quirks.multiplePages}
                    onChange={(e) => setQuirks(prev => ({ ...prev, multiplePages: e.target.checked }))}
                  />
                  <span className={styles.quirkLabel}>Often spans multiple pages</span>
                </label>
              </div>
            </div>

            {/* Container/Packaging Distributor Section */}
            <div className={styles.containerDistributorSection}>
              <div className={styles.containerToggle}>
                <label className={styles.containerToggleLabel}>
                  <input
                    type="checkbox"
                    checked={quirks.isContainerDistributor}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setQuirks(prev => ({
                        ...prev,
                        isContainerDistributor: checked,
                        // Auto-enable sub-options when toggled on
                        hasNestedUnits: checked ? true : prev.hasNestedUnits,
                        hasRollProducts: checked ? true : prev.hasRollProducts,
                        hasContainerCapacity: checked ? true : prev.hasContainerCapacity
                      }));
                    }}
                  />
                  <span className={styles.containerToggleText}>
                    <span className={styles.containerToggleIcon}>📦</span>
                    <strong>Container/Packaging Distributor</strong>
                  </span>
                </label>
                <p className={styles.containerToggleDesc}>
                  Enable for vendors like Carrousel Emballage that use special packaging notation
                </p>
              </div>

              {quirks.isContainerDistributor && (
                <div className={styles.containerOptions}>
                  <div className={styles.containerInfo}>
                    <div className={styles.containerInfoHeader}>
                      <span className={styles.containerInfoIcon}>ℹ️</span>
                      <span>Container Format Parsing</span>
                    </div>
                    <p className={styles.containerInfoText}>
                      When enabled, the system will parse special format notations in the Format column:
                    </p>
                    <div className={styles.containerExamples}>
                      <div className={styles.containerExample}>
                        <code>10/100</code>
                        <span>→ 10 packs × 100 units = 1000 units/case</span>
                      </div>
                      <div className={styles.containerExample}>
                        <code>6/RL</code>
                        <span>→ 6 rolls per case</span>
                      </div>
                      <div className={styles.containerExample}>
                        <code>1/500</code>
                        <span>→ 500 units per case</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.containerSubOptions}>
                    <label className={styles.containerSubOption}>
                      <input
                        type="checkbox"
                        checked={quirks.hasNestedUnits}
                        onChange={(e) => setQuirks(prev => ({ ...prev, hasNestedUnits: e.target.checked }))}
                      />
                      <span>Nested unit notation (10/100, 4/250)</span>
                    </label>

                    <label className={styles.containerSubOption}>
                      <input
                        type="checkbox"
                        checked={quirks.hasRollProducts}
                        onChange={(e) => setQuirks(prev => ({ ...prev, hasRollProducts: e.target.checked }))}
                      />
                      <span>Roll products (6/RL, 4/RL)</span>
                    </label>

                    <label className={styles.containerSubOption}>
                      <input
                        type="checkbox"
                        checked={quirks.hasContainerCapacity}
                        onChange={(e) => setQuirks(prev => ({ ...prev, hasContainerCapacity: e.target.checked }))}
                      />
                      <span>Container capacity in description (2.25LB = capacity, not weight)</span>
                    </label>
                  </div>

                  <div className={styles.containerWarning}>
                    <span className={styles.containerWarningIcon}>⚠️</span>
                    <span>
                      For container products like lids/bowls, weight notation (e.g., "2.25LB") refers to the <strong>container capacity</strong>, not product weight.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Column Mapping */}
        {currentStep === 3 && (
          <div className={styles.stepContent}>
            <h3 className={styles.stepHeader}>Verify Column Detection</h3>
            <p className={styles.stepDescription}>
              We extracted these values from your invoice. Verify each column type is correct.
              <br />
              <strong>If AI got it wrong, select the correct type from the dropdown.</strong>
            </p>

            {/* Auto-correction notification - disabled, users fix manually via UI */}

            {columnMappings.length === 0 ? (
              <div className={styles.noColumns}>
                <span className={styles.noColumnsIcon}>📄</span>
                <p>No column data available. The system will use default detection.</p>
              </div>
            ) : (
              <>
                <div className={styles.columnsGrid}>
                  {columnMappings.map((col, idx) => (
                    <div
                      key={col.originalIndex ?? idx}
                      className={`${styles.columnMapCard} ${col.wasChanged ? styles.corrected : ''} ${col.wasReordered ? styles.reordered : ''}`}
                    >
                      <div className={styles.columnHeader}>
                        <div className={styles.columnMoveButtons}>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            onClick={() => moveColumnUp(idx)}
                            disabled={idx === 0}
                            title="Move left"
                          >
                            ←
                          </button>
                          <span className={styles.columnIndex}>Col {idx + 1}</span>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            onClick={() => moveColumnDown(idx)}
                            disabled={idx === columnMappings.length - 1}
                            title="Move right"
                          >
                            →
                          </button>
                        </div>
                        {(col.wasChanged || col.wasReordered) && (
                          <span className={styles.correctedBadge}>
                            {col.wasReordered ? 'Moved' : 'Corrected'}
                          </span>
                        )}
                      </div>

                      {/* Show the actual header text Claude read from invoice */}
                      {col.headerText && (
                        <div className={styles.invoiceHeader}>
                          <span className={styles.headerLabel}>Invoice header:</span>
                          <span className={styles.headerText}>"{col.headerText}"</span>
                        </div>
                      )}

                      <div className={styles.columnValue}>
                        <span className={styles.valueLabel}>Sample value:</span>
                        <span className={styles.valueText}>
                          {col.value?.length > 30 ? col.value.slice(0, 30) + '...' : col.value || '—'}
                        </span>
                      </div>

                      <div className={styles.columnTypeSelect}>
                        <label className={styles.typeLabel}>This column is:</label>
                        <select
                          className={`${styles.typeDropdown} ${col.wasChanged ? styles.changed : ''}`}
                          value={col.userLabel}
                          onChange={(e) => handleColumnTypeChange(idx, e.target.value)}
                        >
                          {COLUMN_TYPES.map(type => (
                            <option key={type.key} value={type.key}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Weight unit selector - shown when column type is 'weight' */}
                      {col.userLabel === 'weight' && (
                        <div className={styles.weightUnitSelect}>
                          <label className={styles.typeLabel}>Weight unit:</label>
                          <select
                            className={styles.unitDropdown}
                            value={weightUnit}
                            onChange={(e) => setWeightUnit(e.target.value)}
                          >
                            {WEIGHT_UNITS.map(unit => (
                              <option key={unit.key} value={unit.key}>
                                {unit.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Package format settings - shown when column type is 'packageFormat' */}
                      {col.userLabel === 'packageFormat' && (
                        <div className={styles.packageFormatSettings}>
                          <div className={styles.formatExplanation}>
                            <span className={styles.formatExplanationIcon}>✓</span>
                            <span>
                              Unit in format → applied automatically
                            </span>
                          </div>
                          <div className={styles.formatExamples}>
                            <code>Caisse 4lb → 4 lb</code>
                            <code>Sac 25kg → 25 kg</code>
                          </div>
                          <div className={styles.formatWarning}>
                            <span className={styles.formatWarningIcon}>⚠️</span>
                            <span>
                              Bare numbers (e.g., "Caisse 24") will be flagged for your review
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Package units settings - shown when column type is 'packageUnits' */}
                      {col.userLabel === 'packageUnits' && (
                        <div className={styles.packageFormatSettings}>
                          <div className={styles.formatExplanation}>
                            <span className={styles.formatExplanationIcon}>✓</span>
                            <span>
                              Numbers = units per case (count)
                            </span>
                          </div>
                          <div className={styles.formatExamples}>
                            <code>Caisse 24 → 24 units</code>
                            <code>Flat 12 → 12 units</code>
                          </div>
                          <div className={styles.formatInfo}>
                            <span className={styles.formatInfoIcon}>ℹ️</span>
                            <span>
                              All values treated as count, no weight conversion
                            </span>
                          </div>
                        </div>
                      )}

                      {col.wasChanged && (
                        <div className={styles.aiGuess}>
                          AI detected: <span className={styles.strikethrough}>
                            {COLUMN_TYPES.find(t => t.key === col.aiLabel)?.label || col.aiLabel}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {(columnCorrections > 0 || columnsReordered) && (
                  <div className={styles.correctionsSummary}>
                    <span className={styles.summaryIcon}>💡</span>
                    <span>
                      {columnsReordered && 'You reordered columns to match the invoice layout. '}
                      {columnCorrections > 0 && `You corrected ${columnCorrections} column type${columnCorrections > 1 ? 's' : ''}. `}
                      This will be saved to help parse future invoices from this vendor.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4: Sample Verification */}
        {currentStep === 4 && (
          <div className={styles.stepContent}>
            <h3 className={styles.stepHeader}>Verify Sample Lines</h3>
            <p className={styles.stepDescription}>
              Review how we parsed these lines. Click to edit if anything looks wrong.
            </p>

            <div className={styles.verifyStats}>
              <span className={styles.statsText}>
                {correctLines}/{totalLines} lines verified
              </span>
              {correctLines === totalLines && (
                <span className={styles.statsSuccess}>All lines look good!</span>
              )}
            </div>

            <div className={styles.sampleLines}>
              {verifiedLines.map(line => (
                <div
                  key={line.id}
                  className={`${styles.sampleLine} ${line.isCorrect ? styles.correct : styles.needsReview}`}
                >
                  <div className={styles.lineHeader}>
                    <span className={styles.lineRaw}>{line.rawDescription || line.description}</span>
                    {line.isCorrect ? (
                      <span className={styles.lineStatus}>✓ Correct</span>
                    ) : (
                      <button
                        className={styles.markCorrectBtn}
                        onClick={() => markLineCorrect(line.id)}
                      >
                        Mark as Correct
                      </button>
                    )}
                  </div>

                  <div className={styles.lineParsed}>
                    <div className={styles.parsedField}>
                      <label>Description</label>
                      <input
                        type="text"
                        value={corrections[line.id]?.description || line.description || ''}
                        onChange={(e) => handleLineCorrection(line.id, 'description', e.target.value)}
                      />
                    </div>

                    <div className={styles.parsedField}>
                      <label>Qty</label>
                      <input
                        type="text"
                        value={corrections[line.id]?.quantity || line.quantity || ''}
                        onChange={(e) => handleLineCorrection(line.id, 'quantity', e.target.value)}
                      />
                    </div>

                    {line.weight != null && (
                      <div className={styles.parsedField}>
                        <label>Weight</label>
                        <input
                          type="text"
                          value={corrections[line.id]?.weight || line.weight || ''}
                          onChange={(e) => handleLineCorrection(line.id, 'weight', e.target.value)}
                        />
                      </div>
                    )}

                    <div className={styles.parsedField}>
                      <label>Unit Price</label>
                      <input
                        type="text"
                        value={corrections[line.id]?.unitPrice || line.unitPrice || ''}
                        onChange={(e) => handleLineCorrection(line.id, 'unitPrice', e.target.value)}
                      />
                    </div>

                    <div className={styles.parsedField}>
                      <label>Total</label>
                      <input
                        type="text"
                        value={corrections[line.id]?.totalPrice || line.totalPrice || ''}
                        onChange={(e) => handleLineCorrection(line.id, 'totalPrice', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {verifiedLines.length === 0 && (
                <div className={styles.noLines}>
                  No sample lines available. The profile will be created based on your settings.
                </div>
              )}
            </div>

            {Object.keys(corrections).length > 0 && (
              <div className={styles.correctionNote}>
                <span className={styles.noteIcon}>💡</span>
                <span>
                  You made {Object.keys(corrections).length} correction(s).
                  Future invoices will use these corrections to improve matching.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className={styles.navigation}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>

          <div className={styles.navSpacer} />

          {currentStep > 1 && (
            <Button variant="secondary" onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}

          {currentStep < 4 ? (
            <Button variant="primary" onClick={handleNext}>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleComplete}
              loading={loading}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default VendorProfileWizard;
