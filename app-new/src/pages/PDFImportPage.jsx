import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';
import Input from '../components/common/Input';
import { extractTextFromPDF, isValidPDF, formatFileSize } from '../services/utils/pdfParser';
import { parsePDFRecipeWithClaude } from '../services/ai/claudeAPI';
import { recipeDB, categoryDB, departmentDB } from '../services/database/indexedDB';
import { validatePdfFile, sanitizeRecipe } from '../utils/sanitize';
import styles from '../styles/pages/pdfimport.module.css';

/**
 * PDF Import Page
 *
 * Upload PDF recipe files and parse them with Claude API
 */
function PDFImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(''); // Current step: 'extracting', 'parsing', 'saving'
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Load available categories and departments on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [categories, departments] = await Promise.all([
          categoryDB.getAll(),
          departmentDB.getAll()
        ]);
        setAvailableCategories(categories.map(cat => cat.name));
        setAvailableDepartments(departments.map(dept => dept.name));
      } catch (err) {
        console.error('Error loading categories/departments:', err);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadData();
  }, []);

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    setError('');

    // Comprehensive security validation
    const validation = validatePdfFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    // Additional validation
    if (!isValidPDF(selectedFile)) {
      setError('Invalid PDF file. Please upload a valid PDF (max 10MB).');
      return;
    }

    setFile(selectedFile);
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Automatic import: Extract → Parse → Save → Navigate to editor
  const handleImportPDF = async () => {
    if (!file) return;

    // Validate categories exist before proceeding
    if (availableCategories.length === 0) {
      setError('No categories exist. Please create at least one category in Settings before importing recipes.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Extract text from PDF
      setLoadingStep('extracting');
      let text;
      try {
        text = await extractTextFromPDF(file);
      } catch (extractError) {
        throw new Error(`PDF extraction failed: ${extractError.message}`);
      }

      // Validate extracted text
      if (!text || text.trim().length === 0) {
        throw new Error('PDF appears to be empty or contains only images. Please use a text-based PDF.');
      }

      if (text.trim().length < 50) {
        throw new Error('PDF content is too short. Please ensure it contains a complete recipe.');
      }

      // Step 2: Parse recipe with Claude (API key handled server-side via Cloud Function)
      setLoadingStep('parsing');
      const parsedRecipe = await parsePDFRecipeWithClaude(text);

      // Validate we got a recipe back
      if (!parsedRecipe || !parsedRecipe.name) {
        throw new Error('Could not parse recipe from PDF. Please ensure the PDF contains readable recipe text.');
      }

      // Step 3: Sanitize and save directly to database
      setLoadingStep('saving');

      // Determine category: use parsed if it exists in DB, otherwise use first available
      let validCategory = availableCategories[0]; // Default to first available
      if (parsedRecipe.category && availableCategories.includes(parsedRecipe.category)) {
        validCategory = parsedRecipe.category;
      }
      console.log(`📁 Using category: ${validCategory}`);

      // Determine department: use parsed if it exists in DB, otherwise use 'Cuisine' or first available
      let validDepartment = 'Cuisine';
      if (availableDepartments.length > 0) {
        if (parsedRecipe.department && availableDepartments.includes(parsedRecipe.department)) {
          validDepartment = parsedRecipe.department;
        } else if (!availableDepartments.includes('Cuisine')) {
          validDepartment = availableDepartments[0];
        }
      }
      console.log(`📁 Using department: ${validDepartment}`);

      // Ensure department and category are set before saving
      const recipeWithDefaults = {
        ...parsedRecipe,
        category: validCategory,
        department: validDepartment
      };
      const sanitizedRecipe = sanitizeRecipe(recipeWithDefaults);
      let id;
      try {
        id = await recipeDB.add(sanitizedRecipe);
      } catch (dbError) {
        throw new Error(`Failed to save recipe to database: ${dbError.message}`);
      }

      console.log('✅ Recipe imported and saved with ID:', id);

      // Step 4: Navigate to recipe editor immediately
      navigate(`/recipes/${id}/edit`);

    } catch (err) {
      console.error('❌ PDF import error:', err);

      // Provide user-friendly error messages
      let userMessage = err.message;
      if (err.message.includes('timeout')) {
        userMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (err.message.includes('API key') || err.message.includes('401') || err.message.includes('403')) {
        userMessage = 'Invalid API key. Please check your Claude API key in Settings.';
      } else if (err.message.includes('rate limit') || err.message.includes('429')) {
        userMessage = 'API rate limit exceeded. Please wait a moment and try again.';
      } else if (err.message.includes('network') || err.message.includes('Network') || err.message.includes('Failed to fetch')) {
        userMessage = 'Network error. Please check your internet connection.';
      } else if (err.message.includes('server error') || err.message.includes('500')) {
        userMessage = 'Server error. Please try again in a few minutes.';
      }

      setError(userMessage);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setError('');
  };

  return (
    <div className={styles.importPage}>
      <div className={styles.header}>
        <h1>📄 Import Recipe from PDF</h1>
        <p>Upload a PDF recipe file and let Claude AI extract the recipe data automatically.</p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Upload PDF and Import */}
      <Card>
        <h2>Upload PDF File</h2>

        {!file ? (
          <div
            className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className={styles.dropIcon}>📄</div>
            <p className={styles.dropText}>Drag and drop a PDF file here</p>
            <p className={styles.dropSubtext}>or</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              className={styles.fileInput}
              style={{ display: 'none' }}
            />
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
            <p className={styles.dropHint}>Maximum file size: 10MB</p>
          </div>
        ) : (
          <>
            <div className={styles.fileInfo}>
              <div className={styles.fileIcon}>📄</div>
              <div className={styles.fileDetails}>
                <h3>{file.name}</h3>
                <p>Size: {formatFileSize(file.size)}</p>
              </div>
              <div className={styles.fileActions}>
                <Button variant="secondary" onClick={handleReset} size="small" disabled={loading}>
                  Remove
                </Button>
                <Button variant="primary" onClick={handleImportPDF} loading={loading}>
                  {loading ? 'Importing...' : 'Import Recipe'}
                </Button>
              </div>
            </div>

            {/* Progress Indicator */}
            {loading && (
              <div className={styles.progressContainer}>
                <div className={styles.progressSteps}>
                  <div className={`${styles.progressStep} ${loadingStep === 'extracting' || loadingStep === 'parsing' || loadingStep === 'saving' ? styles.active : ''} ${loadingStep === 'parsing' || loadingStep === 'saving' ? styles.completed : ''}`}>
                    <div className={styles.stepIcon}>
                      {loadingStep === 'parsing' || loadingStep === 'saving' ? '✓' : '1'}
                    </div>
                    <div className={styles.stepLabel}>Extracting text</div>
                  </div>

                  <div className={styles.progressLine}></div>

                  <div className={`${styles.progressStep} ${loadingStep === 'parsing' || loadingStep === 'saving' ? styles.active : ''} ${loadingStep === 'saving' ? styles.completed : ''}`}>
                    <div className={styles.stepIcon}>
                      {loadingStep === 'saving' ? '✓' : '2'}
                    </div>
                    <div className={styles.stepLabel}>Parsing with AI</div>
                  </div>

                  <div className={styles.progressLine}></div>

                  <div className={`${styles.progressStep} ${loadingStep === 'saving' ? styles.active : ''}`}>
                    <div className={styles.stepIcon}>3</div>
                    <div className={styles.stepLabel}>Saving recipe</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>


      {/* Help Section */}
      <Card variant="outlined" style={{ marginTop: '20px' }}>
        <h3>How it works</h3>
        <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Save API Key:</strong> First, save your Claude API key in Settings (one-time setup)</li>
          <li><strong>Upload PDF:</strong> Select a PDF file containing a recipe (max 10MB)</li>
          <li><strong>Click Import:</strong> The app automatically extracts text, parses it with Claude AI, and saves the recipe</li>
          <li><strong>Review & Edit:</strong> You're taken directly to the recipe editor to review and correct any details</li>
        </ol>
        <p style={{ marginTop: '15px', color: '#666', fontSize: '14px' }}>
          <strong>Note:</strong> This works best with text-based PDFs. Scanned images may not extract correctly.
          Claude will do its best to parse the recipe, and you can correct any mistakes in the editor.
          Cost: ~$0.001 per recipe (Claude Haiku is very cheap!)
        </p>
      </Card>
    </div>
  );
}

export default PDFImportPage;
