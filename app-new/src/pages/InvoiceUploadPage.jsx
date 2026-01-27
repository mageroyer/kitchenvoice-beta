import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';
import { formatFileSize } from '../services/utils/pdfParser';
import { invoiceDB, invoiceLineDB, vendorDB, departmentDB } from '../services/database/indexedDB';
// Vision-based invoice processing
import {
  processInvoice as processInvoiceVision,
  getTypeIcon,
  isHighConfidence
} from '../services/invoice/vision';
// Invoice line service for inventory processing
import { processLinesToInventory } from '../services/inventory/invoiceLineService';
import {
  // Packaging utilities (from packagingDistributorHandler)
  buildPackageUnit
} from '../services/invoice/handlers';
// Category and pricing type constants
import { LINE_CATEGORY, PRICING_TYPE } from '../services/invoice/lineCategorizer';
// Line display components
import InvoiceLineList from '../components/invoice/InvoiceLineList';
import LineEditModal from '../components/invoice/LineEditModal';
// Training data consent
import { saveTrainingData } from '../services/training/trainingDataService';
import { getSetting, updateSetting } from '../services/settings/settingsStorage';
import styles from '../styles/pages/invoiceupload.module.css';

// Default color palette for departments (cycles through)
const DEPT_COLORS = ['#e9ecef', '#ffebee', '#e3f2fd', '#fff3e0', '#f3e5f5', '#e8f5e9', '#fce4ec', '#e0f2f1'];

/**
 * Convert Vision parser result to UI-friendly invoice format.
 * Maps the simplified Vision output to the existing review UI structure.
 * Supports V2 processed lines with validation, weight extraction, and pricing.
 *
 * @param {Object} result - Result from processInvoiceVision
 * @returns {Object} Converted invoice for display
 */
const convertVisionResultToInvoice = (result) => {
  const { invoice, lineItems, v2Available, processedLines } = result;

  // Use V2 processed lines if available, otherwise fall back to normalized lineItems
  const lines = v2Available ? processedLines : lineItems;

  return {
    vendor: {
      name: invoice?.vendorName,
      invoiceNumber: invoice?.invoiceNumber,
      invoiceDate: invoice?.date,
      address: invoice?.vendorAddress,
      phone: invoice?.vendorPhone,
      paymentTerms: invoice?.paymentTerms,
      poNumber: invoice?.poNumber
    },
    totals: {
      subtotal: invoice?.subtotal || 0,
      taxAmount: (invoice?.taxTPS || 0) + (invoice?.taxTVQ || 0),
      taxTPS: invoice?.taxTPS || 0,
      taxTVQ: invoice?.taxTVQ || 0,
      totalAmount: invoice?.total || 0,
      currency: 'CAD'
    },
    lineItems: lines?.map((item, index) => {
      // Helper to unwrap tracked fields
      // TrackedString/TrackedNumber: {value, source, valid} → value
      // FormatField: {raw, parsed, source, confidence, valid} → raw (for display)
      const unwrap = (field) => {
        if (field && typeof field === 'object') {
          // FormatField has 'raw' property
          if ('raw' in field) return field.raw;
          // TrackedString/TrackedNumber has 'value' property
          if ('value' in field) return field.value;
        }
        return field;
      };

      // V2 lines have _flat accessor for backward compatibility
      const flat = item._flat || {};

      // Check if this is a V2 processed line (has tracked fields)
      const isV2 = item.description && typeof item.description === 'object' && 'value' in item.description;

      // Extract V2 validation data if available
      const validation = item.validation || null;
      const pricing = item.pricing || null;
      const weight = item.weight || null;

      // For V2, unwrap tracked fields; for V1, use direct values
      const description = isV2 ? unwrap(item.description) : (flat.description || item.description);
      const sku = isV2 ? unwrap(item.sku) : (flat.sku || item.sku);
      const quantity = isV2 ? unwrap(item.quantity) : (flat.quantity || item.quantity);
      const unit = isV2 ? unwrap(item.unit) : (flat.unit || item.unit);
      const unitPrice = isV2 ? unwrap(item.unitPrice) : (flat.unitPrice || item.unitPrice);
      const totalPrice = isV2 ? unwrap(item.totalPrice) : (flat.totalPrice || item.totalPrice);
      const format = isV2 ? unwrap(item.format) : (flat.format || item.format);

      return {
        // Core display fields (unwrapped from V2 tracked fields)
        name: description,
        description: description,
        itemCode: sku,
        quantity: quantity,
        unit: unit,
        unitPrice: unitPrice,
        totalPrice: totalPrice,

        // Format/packaging
        format: format,
        boxingFormat: isV2 ? unwrap(item.boxingFormat) : (flat.boxingFormat || item.boxingFormat),

        // V2: Packaging units (for PACKAGING/SUPPLY categories)
        // units structure: { totalUnitsPerCase, totalUnitsOrdered, pricePerUnit, packCount, unitsPerPack }
        totalUnits: item.units?.totalUnitsOrdered ?? flat.totalUnitsOrdered ?? null,
        totalUnitsPerCase: item.units?.totalUnitsPerCase ?? flat.totalUnitsPerCase ?? null,
        packCount: item.units?.packCount ?? flat.packCount ?? null,
        unitsPerPack: item.units?.unitsPerPack ?? flat.unitsPerPack ?? null,

        // V2: Weight extraction with confidence
        // V2 weight structure: { perUnit, total, totalGrams, unit, confidence, valid }
        // Ensure we get a number, not an object
        weight: weight?.total ?? flat.weight ?? (typeof item.weight === 'number' ? item.weight : 0),
        weightInGrams: weight?.totalGrams ?? flat.totalWeightGrams ?? null,
        weightUnit: weight?.unit ?? flat.weightUnit ?? item.weightUnit ?? '',
        weightConfidence: weight?.confidence ?? null,
        weightSource: weight?.source ?? null,

        // V2: Calculated pricing (ensure numbers, not objects)
        // Food pricing uses pricing.pricePerG/pricePerML
        pricePerG: typeof pricing?.pricePerG === 'number' ? pricing.pricePerG : (flat.pricePerG ?? null),
        pricePerML: typeof pricing?.pricePerML === 'number' ? pricing.pricePerML : (flat.pricePerML ?? null),
        pricePerL: typeof pricing?.pricePerL === 'number' ? pricing.pricePerL : (flat.pricePerL ?? null),
        // pricePerUnit: Packaging uses units.pricePerUnit, FoodSupply uses pricing.pricePerUnit
        pricePerUnit: typeof item.units?.pricePerUnit === 'number' ? item.units.pricePerUnit
          : (typeof pricing?.pricePerUnit === 'number' ? pricing.pricePerUnit : (flat.pricePerUnit ?? null)),
        weightPerUnit: weight?.perUnit ?? (typeof pricing?.weightPerUnit === 'number' ? pricing.weightPerUnit : (flat.weightPerUnit ?? null)),
        isVolume: pricing?.isVolume ?? flat.isVolume ?? false,
        // Volume unit size info (e.g., "12 × 500ml" → unitsPerCase=12, unitSize=500, unitSizeUnit="ml")
        unitsPerCase: flat.unitsPerCase ?? null,
        unitSize: flat.unitSize ?? null,
        unitSizeUnit: flat.unitSizeUnit ?? null,
        totalWeightGrams: weight?.totalGrams ?? flat.totalWeightGrams ?? null,

        // V2: Validation status
        canBill: validation?.canBill ?? true,
        canProcess: validation?.canProcess ?? true,
        tier1Valid: validation?.tier1Valid ?? true,
        tier2Valid: validation?.tier2Valid ?? null,
        tier3Valid: validation?.tier3Valid ?? null,
        // Filter out INFO-level items from warnings (only show actual warnings/errors)
        lineWarnings: validation?.warnings?.filter(w => w.severity !== 'info') ?? [],

        // Order tracking
        quantityOrdered: item.quantityOrdered,
        quantityShipped: item.quantityShipped,

        // Line metadata
        lineNumber: item._lineNumber || item.lineNumber || index + 1,
        matchStatus: 'unmatched',
        _v2Processed: isV2,

        // AI Category (from lineCategorizer: FOOD, PACKAGING, SUPPLY, FEE, DIVERS)
        category: isV2 ? unwrap(item.category) : (flat.category || item.category),

        // Pricing type - derive from category if not set by handler
        // PACKAGING/SUPPLY → unit-based, FOOD → weight-based (unless handler says otherwise)
        pricingType: (() => {
          // Handler-provided pricingType takes precedence
          if (item.pricingType) return item.pricingType;
          if (pricing?.type) return pricing.type;

          // Derive from AI category
          const cat = isV2 ? unwrap(item.category) : (flat.category || item.category);
          if (cat === LINE_CATEGORY.PACKAGING || cat === LINE_CATEGORY.SUPPLY) {
            return PRICING_TYPE.UNIT;
          }
          if (cat === LINE_CATEGORY.FEE || cat === LINE_CATEGORY.DIVERS) {
            return PRICING_TYPE.UNIT;
          }
          // FOOD defaults to weight
          return PRICING_TYPE.WEIGHT;
        })(),

        // Line type from V2 handler (product, fee, credit, deposit)
        lineType: item.lineType || 'product',
        // Routing flags from V2 handler (for QuickBooks/Inventory)
        forInventory: item.forInventory ?? true,
        forAccounting: item.forAccounting ?? true,
        isDeposit: item.isDeposit ?? false,

        // Raw data for display columns
        rawColumns: [
          sku,
          description,
          format,
          quantity,
          unitPrice,
          totalPrice
        ].filter(v => v != null),

        // Math validation for display
        mathValid: validation?.canBill ?? true,
        confidence: validation?.overallConfidence ?? null,
        // Only show WARNING and ERROR level items as anomalies (not INFO)
        anomalies: validation?.warnings
          ?.filter(w => w.severity !== 'info')
          ?.map(w => ({
            type: w.code || 'warning',
            severity: w.severity || 'warning',
            message: w.message || w.code,
          })) || [],
      };
    }) || [],
    notes: ''
  };
};

/**
 * Invoice Upload Page
 *
 * Upload vendor invoices (PDF/image) and parse them with Claude AI
 * Extracted data populates ingredient database with current prices
 * Supports department assignment and invoice splitting
 */
function InvoiceUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'pdf' or 'image'
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedInvoice, setParsedInvoice] = useState(null);
  const [saved, setSaved] = useState(false);

  // Vision parser result
  const [visionResult, setVisionResult] = useState(null);

  // Department assignment state
  const [selectedItems, setSelectedItems] = useState(new Set()); // Set of selected item indices
  const [itemDepartments, setItemDepartments] = useState({}); // { index: departmentId }
  const [bulkDepartment, setBulkDepartment] = useState(''); // For bulk assignment

  // Manual vendor entry (when AI couldn't extract)
  const [manualVendorName, setManualVendorName] = useState('');

  // Dynamic departments from DB
  const [departments, setDepartments] = useState([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [showNewDeptInput, setShowNewDeptInput] = useState(false);

  // DEV: Raw JSON panel visibility
  const [showRawJson, setShowRawJson] = useState(false);

  // Invoice type detection/selection
  const [selectedType, setSelectedType] = useState(null); // User-selected type (overrides detection)

  // Line edit modal state
  const [editingLine, setEditingLine] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Training data contribution (static checkbox)
  const [contributeTraining, setContributeTraining] = useState(false);

  // Ref for timer cleanup
  const redirectTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Fetch departments from DB on mount
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const depts = await departmentDB.getAll();
        setDepartments(depts);
      } catch (err) {
        console.error('[InvoiceUpload] Failed to load departments:', err);
      }
    };
    loadDepartments();
  }, []);

  // Load training consent preference on mount
  useEffect(() => {
    const loadTrainingPreference = async () => {
      const consent = await getSetting('trainingDataConsent');
      setContributeTraining(consent === 'always');
    };
    loadTrainingPreference();
  }, []);

  // Validate file
  const validateFile = (selectedFile) => {
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ];

    if (!selectedFile) return { valid: false, error: 'No file selected' };

    if (!validTypes.includes(selectedFile.type)) {
      return { valid: false, error: 'Invalid file type. Please upload a PDF or image (JPEG, PNG, WebP).' };
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      return { valid: false, error: 'File too large. Maximum size is 10MB.' };
    }

    const type = selectedFile.type === 'application/pdf' ? 'pdf' : 'image';
    return { valid: true, type };
  };

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    setError('');
    setParsedInvoice(null);
    setSaved(false);

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setFile(selectedFile);
    setFileType(validation.type);
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // Sample invoices for testing
  const SAMPLE_INVOICES = [
    { id: 'packaging', name: 'Packaging', icon: '📦', file: '/samples/sample-packaging.pdf', vendor: 'Carrousel Emballage' },
    { id: 'produce', name: 'Produce', icon: '🥬', file: '/samples/sample-produce.pdf', vendor: 'Courchesne Larose' },
    { id: 'specialty', name: 'Specialty', icon: '🫒', file: '/samples/sample-specialty.pdf', vendor: 'Distributions Gourmet' },
    { id: 'foodservice', name: 'Food Service', icon: '🏢', file: '/samples/sample-foodservice.pdf', vendor: 'Gordon Food Service' },
  ];

  // Load a sample invoice
  const handleLoadSample = async (sample) => {
    setError('');
    setParsedInvoice(null);
    setSaved(false);
    setLoading(true);

    try {
      // Fetch the sample PDF
      const response = await fetch(sample.file);
      if (!response.ok) {
        throw new Error(`Failed to load sample: ${response.statusText}`);
      }

      const blob = await response.blob();
      const sampleFile = new File([blob], `${sample.vendor.replace(/\s+/g, '_')}_Sample.pdf`, {
        type: 'application/pdf'
      });

      setFile(sampleFile);
      setFileType('pdf');
    } catch (err) {
      console.error('Error loading sample:', err);
      setError(`Failed to load sample invoice: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Parse invoice with Vision AI
  const handleParseInvoice = async () => {
    if (!file) return;

    setLoading(true);
    setError('');
    setParsedInvoice(null);
    setVisionResult(null);

    try {
      setLoadingStep('vision');

      const result = await processInvoiceVision(file);

      // Store full result for later use (save, inventory processing)
      setVisionResult(result);

      // Convert to UI format
      setParsedInvoice(convertVisionResultToInvoice(result));

    } catch (err) {
      console.error('[InvoiceUpload] Parsing failed:', err);
      setError(err.message || 'Failed to parse invoice. Please try again.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Save invoice and update ingredient prices
  const handleSaveInvoice = async () => {
    if (!parsedInvoice) return;

    const finalLineItems = parsedInvoice.lineItems || [];

    // Get vendor name - from parsed vendor or manual entry
    const vendor = parsedInvoice.vendor || {};
    const vendorName = vendor.name?.trim() || manualVendorName.trim();

    // Vendor name is required - guide user if missing
    if (!vendorName) {
      setError('Vendor name is required. Please enter the vendor name above.');
      return;
    }

    setLoading(true);
    setLoadingStep('saving');
    setError('');

    try {
      // 1. Find or create vendor with extracted info (no assumed defaults)
      let vendorId = null;

      // Try to find existing vendor by name
      const existingVendor = await vendorDB.getByName(vendorName);

      if (existingVendor) {
        vendorId = existingVendor.id;

        // Update existing vendor with any new info from invoice (fill empty fields)
        const updates = {};
        if (!existingVendor.legalName && vendor.legalName) updates.legalName = vendor.legalName;
        if (!existingVendor.phone && vendor.phone) updates.phone = vendor.phone;
        if (!existingVendor.fax && vendor.fax) updates.fax = vendor.fax;
        if (!existingVendor.email && vendor.email) updates.email = vendor.email;
        if (!existingVendor.website && vendor.website) updates.website = vendor.website;
        if (!existingVendor.address && vendor.address) updates.address = vendor.address;
        if (!existingVendor.city && vendor.city) updates.city = vendor.city;
        if (!existingVendor.province && vendor.province) updates.province = vendor.province;
        if (!existingVendor.postalCode && vendor.postalCode) updates.postalCode = vendor.postalCode;
        if (!existingVendor.country && vendor.country) updates.country = vendor.country;
        if (!existingVendor.accountNumber && vendor.accountNumber) updates.accountNumber = vendor.accountNumber;
        if (!existingVendor.paymentTerms && vendor.paymentTerms) updates.paymentTerms = vendor.paymentTerms;
        if (!existingVendor.taxNumber && vendor.taxNumber) updates.taxNumber = vendor.taxNumber;

        // Update vendor if we have new info
        if (Object.keys(updates).length > 0) {
          await vendorDB.update(vendorId, updates);
        }
      } else {
        // Create new vendor with extracted info only (no assumed defaults)
        vendorId = await vendorDB.create({
          name: vendorName,
          legalName: vendor.legalName || '',
          phone: vendor.phone || '',
          fax: vendor.fax || '',
          email: vendor.email || '',
          website: vendor.website || '',
          address: vendor.address || '',
          city: vendor.city || '',
          province: vendor.province || '',
          postalCode: vendor.postalCode || '',
          country: vendor.country || '',
          accountNumber: vendor.accountNumber || '',
          paymentTerms: vendor.paymentTerms || '',
          taxNumber: vendor.taxNumber || '',
          isActive: true
        });
      }

      // 2. Save invoice
      const totals = parsedInvoice.totals || {};
      // Use matched vendor ID if available from Vision
      const matchedVendorId = visionResult?.vendor?.id || vendorId;
      const invoiceData = {
        vendorId: matchedVendorId,
        vendorName,
        invoiceNumber: vendor.invoiceNumber || '',
        invoiceDate: vendor.invoiceDate || new Date().toISOString().split('T')[0],
        subtotal: totals.subtotal || 0,
        taxGST: totals.taxAmount || 0,
        taxTPS: totals.taxTPS || 0,
        taxTVQ: totals.taxTVQ || 0,
        total: totals.totalAmount || 0,
        currency: totals.currency || 'CAD',
        status: 'extracted',
        lineCount: finalLineItems.length,
        rawText: '',
        notes: parsedInvoice.notes || '',
        parsingMode: 'vision'
      };

      const invoiceId = await invoiceDB.create(invoiceData);

      // 3. Save line items to invoiceLineItems table
      // V2 handlers already calculated pricePerG, weight, etc. in processLinesV2()
      let lineItemIds = [];
      if (finalLineItems.length > 0) {
        const lineItemsForDB = finalLineItems.map((item, index) => ({
          invoiceId,
          lineNumber: index + 1,
          // SKU/Item code
          sku: item.itemCode || item.sku || '',
          rawSku: item.itemCode || item.sku || '',
          description: item.name || item.description || '',
          rawDescription: item.rawDescription || item.name || item.description || '',
          // Raw data (preserve original values)
          rawQuantity: item.quantity != null ? String(item.quantity) : '',
          rawUnitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
          rawTotal: item.totalPrice != null ? String(item.totalPrice) : '',
          rawUnit: item.unit || item.quantityUnit || '',
          // Parsed/normalized data
          quantity: item.quantity || 0,
          unit: item.unit || buildPackageUnit(item),
          unitPrice: item.unitPrice || 0,
          totalPrice: item.totalPrice || 0,
          // Format/packaging info
          format: item.format || '',
          // V2: Weight extraction (already calculated)
          weight: item.weight || 0,
          weightPerUnit: item.weightPerUnit || 0,
          totalWeight: item.weightInGrams || item.weight || 0,
          weightUnit: item.weightUnit || '',
          // V2: Pricing calculations (already calculated)
          pricePerG: item.pricePerG || null,
          pricePerUnit: item.pricePerUnit || null,
          pricePerML: item.pricePerML || null,
          pricingType: item.pricingType || null,
          // V2: Validation status
          canBill: item.canBill ?? true,
          canProcess: item.canProcess ?? true,
          // V2: Confidence tracking
          weightConfidence: item.weightConfidence || null,
          weightSource: item.weightSource || null,
          // Base units: V2 provides weightInGrams for proper conversion
          totalBaseUnits: item.weightInGrams || item.totalBaseUnits || 0,
          baseUnit: item.baseUnit || (item.pricePerML ? 'ml' : 'g'),
          category: item.category || '',
          matchStatus: 'unmatched',
          // V2 processing flag
          v2Processed: item._v2Processed ?? false,
          // V2: Routing flags (for QuickBooks integration)
          lineType: item.lineType || 'product',
          forInventory: item.forInventory ?? true,
          forAccounting: item.forAccounting ?? true,
          isDeposit: item.isDeposit ?? false
        }));

        lineItemIds = await invoiceLineDB.bulkCreate(invoiceId, lineItemsForDB);
      }

      // 4. Update inventory items from line items using type-specific handlers
      // Get invoice type from selection or detection
      const invoiceType = selectedType || visionResult?.detectedType?.type || 'generic';

      const inventoryResult = await processLinesToInventory({
        lineItems: finalLineItems,
        lineItemIds,
        vendor: { id: vendorId, name: vendorName },
        invoiceId,
        invoiceDate: invoiceData.invoiceDate
      });

      setSaved(true);

      // Save training data if user opted in
      if (contributeTraining) {
        try {
          await saveTrainingData({
            pdfFile: file,
            pdfName: file?.name || 'invoice.pdf',
            visionResponse: visionResult?.rawJson || null,
            parsedLines: visionResult?.lineItems || [],
            correctedLines: finalLineItems,
            invoiceType: selectedType || visionResult?.detectedType?.type || 'foodSupply',
            invoiceHeader: {
              vendorName,
              invoiceNumber: invoiceData.invoiceNumber,
              invoiceDate: invoiceData.invoiceDate,
            },
            pageCount: visionResult?.pages || 1,
          });
          console.log('[InvoiceUpload] Training data saved');
        } catch (trainErr) {
          console.error('[InvoiceUpload] Failed to save training data:', trainErr);
        }
      }

      // Navigate to invoice list
      redirectTimerRef.current = setTimeout(() => {
        navigate('/invoices/list');
      }, 1500);

    } catch (err) {
      console.error('Save invoice error:', err);
      setError(err.message || 'Failed to save invoice.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileType(null);
    setParsedInvoice(null);
    setError('');
    setSaved(false);
    setSelectedItems(new Set());
    setItemDepartments({});
    setBulkDepartment('');
    setManualVendorName('');
    setVisionResult(null);
    setNewDeptName('');
    setShowNewDeptInput(false);
    setShowRawJson(false);
    setSelectedType(null);
    setEditingLine(null);
    setIsEditModalOpen(false);
  };

  // Handle training consent checkbox toggle
  const handleTrainingToggle = async (checked) => {
    setContributeTraining(checked);
    // Save preference: 'always' if checked, 'never' if unchecked
    await updateSetting('trainingDataConsent', checked ? 'always' : 'never');
  };

  // Open line edit modal
  const handleOpenLineEdit = (line) => {
    setEditingLine(line);
    setIsEditModalOpen(true);
  };

  // Close line edit modal
  const handleCloseLineEdit = () => {
    setEditingLine(null);
    setIsEditModalOpen(false);
  };

  // Save line edits back to parsedInvoice
  const handleSaveLineEdit = (updatedLine) => {
    if (!parsedInvoice || updatedLine.id === undefined) return;

    setParsedInvoice(prev => ({
      ...prev,
      lineItems: prev.lineItems.map((item, index) =>
        index === updatedLine.id ? { ...item, ...updatedLine } : item
      ),
    }));
  };

  // Department assignment helpers
  const assignDepartmentToSelected = () => {
    if (!bulkDepartment || selectedItems.size === 0) return;
    setItemDepartments(prev => {
      const next = { ...prev };
      selectedItems.forEach(index => {
        next[index] = bulkDepartment;
      });
      return next;
    });
    setSelectedItems(new Set()); // Clear selection after assignment
  };

  // Get department info by ID (with color from palette)
  const getDepartment = (id) => {
    const dept = departments.find(d => d.id === id);
    if (dept) {
      // Assign color based on index in departments array
      const colorIndex = departments.indexOf(dept) % DEPT_COLORS.length;
      return { ...dept, color: DEPT_COLORS[colorIndex] };
    }
    // Fallback for unassigned
    return { id: null, name: 'Unassigned', color: '#f5f5f5' };
  };

  // Create new department
  const handleCreateDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) return;

    try {
      const newId = await departmentDB.add(name);
      const newDept = { id: newId, name, isDefault: false };
      setDepartments(prev => [...prev, newDept]);
      setNewDeptName('');
      setShowNewDeptInput(false);
      setBulkDepartment(newId); // Auto-select the new department
    } catch (err) {
      console.error('[InvoiceUpload] Failed to create department:', err);
    }
  };

  // Calculate totals by department
  const departmentTotals = useMemo(() => {
    if (!parsedInvoice?.lineItems) return {};
    const totals = {};
    parsedInvoice.lineItems.forEach((item, index) => {
      const deptId = itemDepartments[index] || null; // null = unassigned
      if (!totals[deptId]) {
        totals[deptId] = { count: 0, total: 0 };
      }
      totals[deptId].count++;
      totals[deptId].total += item.totalPrice || 0;
    });
    return totals;
  }, [parsedInvoice, itemDepartments]);

  // Split invoice by department - saves separate invoices
  // Uses type-specific handlers for correct calculations
  const handleSplitByDepartment = async () => {
    if (!parsedInvoice) return;

    // Group items by department
    const itemsByDept = {};
    parsedInvoice.lineItems.forEach((item, index) => {
      const deptId = itemDepartments[index] || null; // null = unassigned
      if (!itemsByDept[deptId]) {
        itemsByDept[deptId] = [];
      }
      itemsByDept[deptId].push(item);
    });

    // Check if there are multiple departments
    const deptIds = Object.keys(itemsByDept);
    if (deptIds.length <= 1) {
      setError('Items are all in one department. Assign items to different departments first to split.');
      return;
    }

    // Get vendor name - either from AI extraction or manual entry
    const vendor = parsedInvoice.vendor || {};
    const vendorName = vendor.name?.trim() || manualVendorName.trim();

    // Vendor name is required
    if (!vendorName) {
      setError('Vendor name is required. Please enter the vendor name above.');
      return;
    }

    setLoading(true);
    setLoadingStep('saving');
    setError('');

    try {
      // Find or create vendor
      let vendorId = null;

      // Try to find existing vendor by name
      const existingVendor = await vendorDB.getByName(vendorName);

      if (existingVendor) {
        vendorId = existingVendor.id;
      } else {
        vendorId = await vendorDB.create({
          name: vendorName,
          isActive: true
        });
      }

      // Get vendor for handler selection
      const fullVendor = await vendorDB.getById(vendorId);
      const vendorObj = { id: vendorId, name: vendorName };
      const invoiceType = selectedType || fullVendor?.invoiceType || visionResult?.detectedType?.type || 'generic';

      // Create separate invoice for each department
      const savedInvoices = [];
      for (const deptId of deptIds) {
        const deptItems = itemsByDept[deptId];
        const dept = getDepartment(deptId);
        const deptTotal = deptItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

        const invoiceData = {
          vendorId,
          vendorName,
          invoiceNumber: `${parsedInvoice.vendor?.invoiceNumber || ''}-${dept.name.substring(0, 3).toUpperCase()}`,
          invoiceDate: parsedInvoice.vendor?.invoiceDate || new Date().toISOString().split('T')[0],
          total: deptTotal,
          currency: parsedInvoice.totals?.currency || 'CAD',
          department: deptId,
          departmentName: dept.name,
          status: 'extracted',
          lineCount: deptItems.length,
          parentInvoiceNumber: parsedInvoice.vendor?.invoiceNumber || '',
          notes: `Split from invoice ${parsedInvoice.vendor?.invoiceNumber || ''} - ${dept.name}`
        };

        const invoiceId = await invoiceDB.create(invoiceData);

        // Save line items to invoiceLineItems table
        // V2 handlers already calculated weight, pricePerG in processLinesV2()
        let lineItemIds = [];
        if (deptItems.length > 0) {
          const lineItemsForDB = deptItems.map((item, index) => ({
            invoiceId,
            lineNumber: index + 1,
            sku: item.itemCode || item.sku || '',
            description: item.name || item.description || '',
            rawDescription: item.rawDescription || item.name || '',
            rawQuantity: item.quantity != null ? String(item.quantity) : '',
            rawUnitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
            rawTotal: item.totalPrice != null ? String(item.totalPrice) : '',
            rawUnit: item.unit || item.quantityUnit || '',
            quantity: item.quantity || 0,
            unit: item.unit || buildPackageUnit(item),
            unitPrice: item.unitPrice || 0,
            totalPrice: item.totalPrice || 0,
            format: item.format || '',
            // V2: Weight extraction
            weight: item.weight || 0,
            weightPerUnit: item.weightPerUnit || 0,
            totalWeight: item.weightInGrams || item.weight || 0,
            weightUnit: item.weightUnit || '',
            // V2: Pricing calculations
            pricePerG: item.pricePerG || null,
            pricePerUnit: item.pricePerUnit || null,
            pricingType: item.pricingType || null,
            // V2: Validation
            canBill: item.canBill ?? true,
            canProcess: item.canProcess ?? true,
            // Base units in grams
            totalBaseUnits: item.weightInGrams || item.totalBaseUnits || 0,
            baseUnit: item.baseUnit || (item.pricePerML ? 'ml' : 'g'),
            category: item.category || '',
            matchStatus: 'unmatched',
            v2Processed: item._v2Processed ?? false,
            // V2: Routing flags (for QuickBooks integration)
            lineType: item.lineType || 'product',
            forInventory: item.forInventory ?? true,
            forAccounting: item.forAccounting ?? true,
            isDeposit: item.isDeposit ?? false
          }));
          lineItemIds = await invoiceLineDB.bulkCreate(invoiceId, lineItemsForDB);
        }

        savedInvoices.push({ invoiceId, department: dept.name, itemCount: deptItems.length, total: deptTotal });

        // Update inventory items using type-specific handlers
        const inventoryResult = await processLinesToInventory({
          lineItems: deptItems,
          lineItemIds,
          vendor: vendorObj,
          invoiceId,
          invoiceDate: invoiceData.invoiceDate
        });
      }

      setSaved(true);

      redirectTimerRef.current = setTimeout(() => {
        navigate('/invoices/list');
      }, 2000);

    } catch (err) {
      console.error('Split invoice error:', err);
      setError(err.message || 'Failed to split and save invoices.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Format currency
  const formatCurrency = (amount, currency = 'CAD') => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency
    }).format(amount || 0);
  };

  return (
    <div className={styles.invoicePage}>
      <div className={styles.header}>
        <h1>Upload Invoice</h1>
        <p>Upload vendor invoices to automatically extract items and update ingredient prices</p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {saved && (
        <Alert variant="success">
          Invoice saved! Ingredient prices updated. Redirecting...
        </Alert>
      )}

      {/* Parse Info Badge */}
      {visionResult && parsedInvoice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          background: visionResult.meta?.source === 'json-import' ? '#fef3c7' : '#f0f9ff',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: visionResult.meta?.source === 'json-import' ? '#92400e' : '#1e40af'
        }}>
          <span style={{ fontWeight: 600 }}>
            {visionResult.meta?.source === 'json-import' ? 'DEV: JSON Import' : 'Vision AI'}
          </span>
          <span>•</span>
          <span>{visionResult.meta?.pageCount || 1} page{(visionResult.meta?.pageCount || 1) > 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{visionResult.meta?.parseTimeMs ? `${(visionResult.meta.parseTimeMs / 1000).toFixed(1)}s` : '-'}</span>
          {visionResult.vendor && (
            <>
              <span>•</span>
              <span style={{ color: '#059669' }}>Vendor matched: {visionResult.vendor.name}</span>
            </>
          )}
          <span>•</span>
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            style={{
              background: 'none',
              border: 'none',
              color: '#6366f1',
              cursor: 'pointer',
              fontSize: '13px',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            {showRawJson ? 'Hide' : 'Show'} Raw JSON
          </button>
        </div>
      )}

      {/* Invoice Type Detection */}
      {visionResult?.detectedType && parsedInvoice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 16px',
          background: isHighConfidence(visionResult.detectedType.confidence) ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${isHighConfidence(visionResult.detectedType.confidence) ? '#bbf7d0' : '#fde68a'}`,
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>
              {getTypeIcon(selectedType || visionResult.detectedType.type)}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>
                {visionResult.detectedType.source === 'vendor_profile' ? 'Known Vendor Type' : 'Detected Type'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {visionResult.detectedType.confidence}% confidence
                {visionResult.detectedType.topMatches?.length > 0 && (
                  <span> ({visionResult.detectedType.topMatches.length} signals)</span>
                )}
              </div>
            </div>
          </div>

          <select
            value={selectedType || visionResult.detectedType.type}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              fontWeight: 500,
              background: '#fff',
              cursor: 'pointer',
              minWidth: '180px'
            }}
          >
            <option value="foodSupply">Food Supplier</option>
            <option value="packagingDistributor">Packaging Distributor</option>
            <option value="utilities">Utilities</option>
            <option value="services">Services</option>
            <option value="generic">General</option>
          </select>

          {selectedType && selectedType !== visionResult.detectedType.type && (
            <button
              onClick={() => setSelectedType(null)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#374151'
              }}
            >
              Reset to detected
            </button>
          )}

          {!isHighConfidence(visionResult.detectedType.confidence) && !selectedType && (
            <span style={{
              fontSize: '12px',
              color: '#d97706',
              fontStyle: 'italic'
            }}>
              Low confidence - please verify
            </span>
          )}
        </div>
      )}

      {/* V2 Processing Summary */}
      {visionResult?.v2Available && visionResult?.v2Summary && parsedInvoice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#059669',
            fontWeight: 600
          }}>
            <span>✓</span>
            <span>V2 Pipeline Active</span>
          </div>
          <span style={{ color: '#94a3b8' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#374151' }}>
              <strong>{visionResult.v2Summary.billable ?? visionResult.v2Summary.canBillCount ?? 0}</strong>/{visionResult.v2Summary.totalLines ?? visionResult.v2Summary.total ?? 0} ready to bill
            </span>
            <span style={{ color: '#374151' }}>
              <strong>{visionResult.v2Summary.valid ?? visionResult.v2Summary.canProcessCount ?? 0}</strong>/{visionResult.v2Summary.totalLines ?? visionResult.v2Summary.total ?? 0} fully processed
            </span>
            {(visionResult.v2Summary.warnings > 0 || visionResult.v2Summary.warningCount > 0) && (
              <span style={{ color: '#d97706' }}>
                ⚠ {visionResult.v2Summary.warnings ?? visionResult.v2Summary.warningCount} warning{(visionResult.v2Summary.warnings ?? visionResult.v2Summary.warningCount) > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span style={{ color: '#94a3b8' }}>|</span>
          <span style={{ color: '#6b7280', fontSize: '12px' }}>
            Handler: {visionResult.handlerLabel}
          </span>
        </div>
      )}

      {/* V2 Not Available Notice */}
      {visionResult && visionResult.v2Available === false && parsedInvoice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 16px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#92400e'
        }}>
          <span>ℹ</span>
          <span>
            V2 pipeline not yet implemented for <strong>{visionResult.handlerLabel}</strong>.
            Using basic processing.
          </span>
        </div>
      )}

      {/* DEV: Raw Vision JSON Panel */}
      {showRawJson && visionResult?._rawJson && (
        <div style={{
          marginBottom: '16px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>
              Raw Vision JSON
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(visionResult._rawJson, null, 2));
              }}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#374151'
              }}
            >
              Copy
            </button>
          </div>
          <pre style={{
            margin: 0,
            padding: '16px',
            background: '#1f2937',
            color: '#e5e7eb',
            fontSize: '12px',
            lineHeight: '1.5',
            overflow: 'auto',
            maxHeight: '400px',
            fontFamily: 'Monaco, Consolas, "Courier New", monospace'
          }}>
            {JSON.stringify(visionResult._rawJson, null, 2)}
          </pre>
        </div>
      )}

      {/* Upload Section */}
      {!parsedInvoice && (
        <Card>
          <h2>Upload Invoice File</h2>

          {!file ? (
            <div
              className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropIcon}>📄</div>
              <p className={styles.dropText}>Drag and drop an invoice here</p>
              <p className={styles.dropSubtext}>or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <p className={styles.dropHint}>Supports PDF and images (JPEG, PNG) up to 10MB</p>

              {/* Sample Invoices */}
              <div className={styles.sampleSection}>
                <p className={styles.sampleLabel}>Or try a sample invoice:</p>
                <div className={styles.sampleButtons}>
                  {SAMPLE_INVOICES.map((sample) => (
                    <div key={sample.id} className={styles.sampleButtonGroup}>
                      <button
                        className={styles.sampleButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadSample(sample);
                        }}
                        disabled={loading}
                        title={`Load ${sample.vendor} sample`}
                      >
                        <span className={styles.sampleIcon}>{sample.icon}</span>
                        <span className={styles.sampleName}>{sample.name}</span>
                      </button>
                      <a
                        href={sample.file}
                        download={`${sample.vendor.replace(/\s+/g, '_')}_Sample.pdf`}
                        className={styles.sampleDownload}
                        onClick={(e) => e.stopPropagation()}
                        title={`Download ${sample.vendor} PDF`}
                      >
                        ⬇
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.fileInfo}>
                <div className={styles.fileIcon}>
                  {fileType === 'pdf' ? '📄' : '🖼️'}
                </div>
                <div className={styles.fileDetails}>
                  <h3>{file.name}</h3>
                  <p>Size: {formatFileSize(file.size)} | Type: {fileType.toUpperCase()}</p>
                </div>
                <div className={styles.fileActions}>
                  <Button variant="secondary" onClick={handleReset} disabled={loading}>
                    Remove
                  </Button>
                  <Button variant="primary" onClick={handleParseInvoice} loading={loading}>
                    {loading ? 'Processing...' : 'Parse Invoice'}
                  </Button>
                </div>
              </div>

              {/* Progress */}
              {loading && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressSteps}>
                    <div className={`${styles.progressStep} ${loadingStep === 'vision' ? styles.active : ''} ${loadingStep === 'saving' ? styles.completed : ''}`}>
                      <div className={styles.stepIcon}>
                        {loadingStep === 'saving' ? '✓' : '1'}
                      </div>
                      <div className={styles.stepLabel}>Vision AI</div>
                    </div>
                    <div className={styles.progressLine}></div>
                    <div className={`${styles.progressStep} ${loadingStep === 'saving' ? styles.active : ''}`}>
                      <div className={styles.stepIcon}>2</div>
                      <div className={styles.stepLabel}>Save</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Training Data Contribution - Always visible */}
      <div className={styles.trainingConsent}>
        <label className={styles.trainingCheckbox}>
          <input
            type="checkbox"
            checked={contributeTraining}
            onChange={(e) => handleTrainingToggle(e.target.checked)}
          />
          <span className={styles.checkboxLabel}>
            Help improve KitchenCommand
          </span>
        </label>
        <p className={styles.trainingHint}>
          Contribute invoices to help train our AI parser. Your data helps improve accuracy for everyone.
        </p>
      </div>

      {/* Parsed Invoice Review */}
      {parsedInvoice && (
        <Card>
          <div className={styles.reviewHeader}>
            <h2>Review Parsed Invoice</h2>
            <div className={styles.reviewActions}>
              <Button variant="secondary" onClick={handleReset} disabled={loading}>
                Upload Different
              </Button>
              <Button variant="primary" onClick={handleSaveInvoice} loading={loading}>
                {loading ? 'Saving...' : 'Save Invoice'}
              </Button>
            </div>
          </div>

          {/* Vendor Info */}
          <div className={styles.section}>
            <h3>Vendor Information</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <label>Vendor {!parsedInvoice.vendor?.name && <span style={{ color: '#dc3545' }}>*</span>}</label>
                {parsedInvoice.vendor?.name ? (
                  <span>{parsedInvoice.vendor.name}</span>
                ) : (
                  <input
                    type="text"
                    value={manualVendorName}
                    onChange={(e) => setManualVendorName(e.target.value)}
                    placeholder="Enter vendor name (required)"
                    className={styles.vendorInput}
                    style={{
                      padding: '8px 12px',
                      border: '2px solid #dc3545',
                      borderRadius: '4px',
                      fontSize: '14px',
                      width: '100%',
                      maxWidth: '300px'
                    }}
                  />
                )}
              </div>
              <div className={styles.infoItem}>
                <label>Invoice #</label>
                <span>{parsedInvoice.vendor?.invoiceNumber || '-'}</span>
              </div>
              <div className={styles.infoItem}>
                <label>Date</label>
                <span>{parsedInvoice.vendor?.invoiceDate || '-'}</span>
              </div>
              <div className={styles.infoItem}>
                <label>PO #</label>
                <span>{parsedInvoice.vendor?.poNumber || '-'}</span>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className={styles.section}>
            <h3>Totals</h3>
            <div className={styles.totalsGrid}>
              <div className={styles.totalItem}>
                <label>Subtotal</label>
                <span>{formatCurrency(parsedInvoice.totals?.subtotal, parsedInvoice.totals?.currency)}</span>
              </div>
              <div className={styles.totalItem}>
                <label>Tax</label>
                <span>{formatCurrency(parsedInvoice.totals?.taxAmount, parsedInvoice.totals?.currency)}</span>
              </div>
              <div className={`${styles.totalItem} ${styles.totalHighlight}`}>
                <label>Total</label>
                <span>{formatCurrency(parsedInvoice.totals?.totalAmount, parsedInvoice.totals?.currency)}</span>
              </div>
            </div>
          </div>

          {/* Department Assignment Toolbar */}
          <div className={styles.section}>
            <div className={styles.departmentToolbar}>
              <div className={styles.toolbarLeft}>
                <h3>Line Items ({parsedInvoice.lineItems?.length || 0})</h3>
                {selectedItems.size > 0 && (
                  <span className={styles.selectedCount}>{selectedItems.size} selected</span>
                )}
              </div>
              <div className={styles.toolbarRight}>
                {showNewDeptInput ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      placeholder="Department name"
                      style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateDepartment()}
                      autoFocus
                    />
                    <Button variant="primary" onClick={handleCreateDepartment} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      Add
                    </Button>
                    <Button variant="secondary" onClick={() => { setShowNewDeptInput(false); setNewDeptName(''); }} style={{ padding: '6px 12px', fontSize: '13px' }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <select
                    value={bulkDepartment}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setShowNewDeptInput(true);
                      } else {
                        setBulkDepartment(e.target.value);
                      }
                    }}
                    className={styles.departmentSelect}
                  >
                    <option value="">Assign to department...</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                    <option value="__new__">+ Create new department...</option>
                  </select>
                )}
                <Button
                  variant="secondary"
                  onClick={assignDepartmentToSelected}
                  disabled={!bulkDepartment || selectedItems.size === 0}
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                >
                  Assign Selected
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSplitByDepartment}
                  disabled={loading || Object.keys(departmentTotals).length <= 1}
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                >
                  Split by Department
                </Button>
              </div>
            </div>

            {/* Department Summary */}
            {Object.keys(departmentTotals).length > 1 && (
              <div className={styles.departmentSummary}>
                {Object.entries(departmentTotals).map(([deptId, data]) => {
                  const dept = getDepartment(deptId);
                  return (
                    <div
                      key={deptId}
                      className={styles.departmentChip}
                      style={{ backgroundColor: dept.color }}
                    >
                      <span className={styles.chipName}>{dept.name}</span>
                      <span className={styles.chipCount}>{data.count} items</span>
                      <span className={styles.chipTotal}>{formatCurrency(data.total, parsedInvoice.totals?.currency)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Line Items - New Two-Row Layout with Tags */}
            <InvoiceLineList
              lines={parsedInvoice.lineItems?.map((item, index) => ({
                ...item,
                id: index,
                // Add weight display data
                weight: item.weight > 0 ? {
                  total: item.weight,
                  unit: item.weightUnit || 'lb',
                } : null,
                // Add pricing display data
                pricePerLb: item.pricePerG ? item.pricePerG * 453.592 : null,
                pricePerKg: item.pricePerG ? item.pricePerG * 1000 : null,
                // Volume display data (for liquids like olive oil, vinegar)
                totalVolume: item.isVolume ? (item.totalWeightGrams / 1000) : null, // Convert ML to L for display
                volumeUnit: item.isVolume ? 'L' : null,
                pricePerL: item.pricePerL || null,
                // Boxing format for volume items (e.g., "12 × 500ml")
                format: item.isVolume && item.unitsPerCase && item.unitSize
                  ? `${item.unitsPerCase} × ${item.unitSize}${item.unitSizeUnit || 'ml'}`
                  : item.format || item.lastBoxingFormat || null,
                totalUnits: item.totalBaseUnits || null,
                sku: item.itemCode,
              })) || []}
              onSelectionChange={(ids) => {
                setSelectedItems(new Set(ids));
              }}
              onLineEdit={handleOpenLineEdit}
              showFilters={true}
              showSummary={true}
              showSelectAll={true}
            />
          </div>

          {/* Notes */}
          {parsedInvoice.notes && (
            <div className={styles.section}>
              <h3>Notes</h3>
              <p className={styles.notes}>{parsedInvoice.notes}</p>
            </div>
          )}
        </Card>
      )}

      {/* Help */}
      <Card variant="outlined" style={{ marginTop: '20px' }}>
        <h3>How Invoice Parsing Works</h3>
        <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Upload:</strong> Drop a PDF or photo of your vendor invoice</li>
          <li><strong>AI Extract:</strong> Claude AI reads and extracts vendor, items, and prices</li>
          <li><strong>Review:</strong> Verify the extracted data before saving</li>
          <li><strong>Save:</strong> Data is saved and ingredient prices are automatically updated</li>
        </ol>
        <p style={{ marginTop: '15px', color: '#666', fontSize: '14px' }}>
          <strong>Tip:</strong> For best results, use clear photos or text-based PDFs.
          Handwritten invoices may not parse accurately.
        </p>
      </Card>

      {/* Line Edit Modal */}
      <LineEditModal
        line={editingLine}
        isOpen={isEditModalOpen}
        onClose={handleCloseLineEdit}
        onSave={handleSaveLineEdit}
      />
    </div>
  );
}

export default InvoiceUploadPage;
