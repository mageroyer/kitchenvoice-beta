import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import { compressToDataUrl, isValidImageType } from '../utils/imageCompression';
import { formatFileSize } from '../utils/format';
import { parseImageRecipeWithClaude } from '../services/ai/claudeAPI';
import { recipeDB, categoryDB, departmentDB } from '../services/database/indexedDB';
import { validateImageFile, sanitizeRecipe } from '../utils/sanitize';
import styles from '../styles/pages/imageimport.module.css';

/**
 * ImageImportPage
 *
 * Handles image upload via:
 * 1. File upload from device
 * 2. Camera capture
 *
 * Then processes with Claude API (OCR) to extract recipe
 */
function ImageImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // State
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingStep, setLoadingStep] = useState(''); // 'compressing', 'processing', 'saving'
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

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Handle file selection (from upload or camera)
  const handleFileSelect = async (file) => {
    setError('');

    // Comprehensive security validation
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    // Additional MIME type validation
    if (!isValidImageType(file)) {
      setError('Invalid file type. Please select a JPG, PNG, or WebP image.');
      return;
    }

    // Validate file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum size is 10MB.`);
      return;
    }

    // Revoke previous preview URL to prevent memory leak
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    // Validate image is readable before proceeding
    try {
      const previewUrl = URL.createObjectURL(file);

      // Verify image can be loaded
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image file is corrupted or unreadable.'));
        img.src = previewUrl;
      });

      setImagePreview(previewUrl);
      setSelectedFile(file);
    } catch (err) {
      setError(err.message || 'Failed to load image. Please try a different file.');
    }
  };

  // File upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Camera capture handler
  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Process image with Claude API
  const handleImport = async () => {
    if (!selectedFile) {
      setError('Please select an image first.');
      return;
    }

    // Validate categories exist before proceeding
    if (availableCategories.length === 0) {
      setError('No categories exist. Please create at least one category in Settings before importing recipes.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Compress image
      setLoadingStep('compressing');

      let compressedDataUrl;
      try {
        compressedDataUrl = await compressToDataUrl(selectedFile, {
          maxWidth: 1600,
          maxHeight: 1200,
          quality: 0.85
        });
      } catch (compressError) {
        throw new Error(`Image compression failed: ${compressError.message}`);
      }

      // Validate compressed image
      if (!compressedDataUrl || !compressedDataUrl.startsWith('data:image/')) {
        throw new Error('Compressed image data is invalid. Please try a different image.');
      }

      // Check compressed size (rough estimate)
      const base64Data = compressedDataUrl.split(',')[1];
      const compressedSize = base64Data ? base64Data.length * 0.75 : 0;
      if (compressedSize > 5 * 1024 * 1024) {
        throw new Error('Compressed image is still too large (>5MB). Please use a smaller or simpler image.');
      }

      // Step 2: Send to Claude API for OCR (API key handled server-side via Cloud Function)
      setLoadingStep('processing');
      const recipe = await parseImageRecipeWithClaude(compressedDataUrl);

      // Validate we got a recipe back
      if (!recipe || !recipe.name) {
        throw new Error('Could not extract recipe from image. Please ensure the image contains readable recipe text.');
      }

      // Step 3: Save recipe to database
      setLoadingStep('saving');

      // Determine category: use parsed if it exists in DB, otherwise use first available
      let validCategory = availableCategories[0]; // Default to first available
      if (recipe.category && availableCategories.includes(recipe.category)) {
        validCategory = recipe.category;
      }

      // Determine department: use parsed if it exists in DB, otherwise use 'Cuisine' or first available
      let validDepartment = 'Cuisine';
      if (availableDepartments.length > 0) {
        if (recipe.department && availableDepartments.includes(recipe.department)) {
          validDepartment = recipe.department;
        } else if (!availableDepartments.includes('Cuisine')) {
          validDepartment = availableDepartments[0];
        }
      }

      // Sanitize all recipe data before saving
      const recipeData = sanitizeRecipe({
        name: recipe.name || 'Untitled Recipe',
        category: validCategory,
        portions: recipe.portions || 4,
        department: validDepartment,
        ingredients: recipe.ingredients || [],
        method: Array.isArray(recipe.method) ? recipe.method : [recipe.method || ''],
        platingInstructions: recipe.platingInstructions || null,
        notes: recipe.notes || null,
        imageUrl: compressedDataUrl, // Store compressed image
        updatedAt: new Date().toISOString()
      });

      let newId;
      try {
        newId = await recipeDB.add(recipeData);
      } catch (dbError) {
        throw new Error(`Failed to save recipe to database: ${dbError.message}`);
      }

      // Navigate to editor
      navigate(`/recipes/${newId}/edit`);

    } catch (err) {
      console.error('Error importing image:', err);

      // Provide user-friendly error messages
      let userMessage = err.message;
      if (err.message.includes('timeout')) {
        userMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (err.message.includes('API key')) {
        userMessage = 'Invalid API key. Please check your Claude API key in Settings.';
      } else if (err.message.includes('rate limit')) {
        userMessage = 'API rate limit exceeded. Please wait a moment and try again.';
      } else if (err.message.includes('network') || err.message.includes('Network')) {
        userMessage = 'Network error. Please check your internet connection.';
      }

      setError(userMessage);
      setLoadingStep('');
    } finally {
      setLoading(false);
    }
  };

  // Clear selection
  const handleClear = () => {
    // Revoke object URL to prevent memory leak
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setSelectedFile(null);
    setImagePreview(null);
    setError('');
    setLoadingStep('');

    // Reset file inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className={styles.importPage}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>📷 Import Recipe from Image</h1>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate('/recipes')}
          >
            ← Back
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="danger" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Loading Progress */}
        {loading && (
          <div className={styles.progressPanel}>
            <div className={styles.progressSteps}>
              <div className={`${styles.progressStep} ${loadingStep === 'compressing' ? styles.active : loadingStep !== 'compressing' ? styles.completed : ''}`}>
                <div className={styles.stepIcon}>
                  {loadingStep === 'compressing' ? '⏳' : '✓'}
                </div>
                <div className={styles.stepLabel}>Compressing...</div>
              </div>

              <div className={`${styles.progressStep} ${loadingStep === 'processing' ? styles.active : loadingStep === 'saving' ? styles.completed : ''}`}>
                <div className={styles.stepIcon}>
                  {loadingStep === 'processing' ? '⏳' : loadingStep === 'saving' ? '✓' : '○'}
                </div>
                <div className={styles.stepLabel}>Processing with AI...</div>
              </div>

              <div className={`${styles.progressStep} ${loadingStep === 'saving' ? styles.active : ''}`}>
                <div className={styles.stepIcon}>
                  {loadingStep === 'saving' ? '⏳' : '○'}
                </div>
                <div className={styles.stepLabel}>Saving recipe...</div>
              </div>
            </div>
          </div>
        )}

        {/* Image Selection */}
        {!imagePreview ? (
          <div className={styles.uploadArea}>
            <div className={styles.uploadIcon}>🖼️</div>
            <h2 className={styles.uploadTitle}>Select an Image</h2>
            <p className={styles.uploadHint}>
              Take a photo of a recipe or upload from your device
            </p>

            <div className={styles.uploadButtons}>
              <Button
                variant="primary"
                size="large"
                onClick={() => cameraInputRef.current?.click()}
                disabled={loading}
              >
                📸 Take Photo
              </Button>

              <Button
                variant="secondary"
                size="large"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                📁 Upload Image
              </Button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              style={{ display: 'none' }}
            />

            <div className={styles.supportedFormats}>
              Supported formats: JPG, PNG, WebP (max 10MB)
            </div>
          </div>
        ) : (
          <div className={styles.previewArea}>
            <h2 className={styles.previewTitle}>Image Preview</h2>

            <div className={styles.imagePreview}>
              <img src={imagePreview} alt="Recipe preview" className={styles.previewImage} />
            </div>

            {selectedFile && (
              <div className={styles.fileInfo}>
                <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
              </div>
            )}

            <div className={styles.actionButtons}>
              <Button
                variant="secondary"
                onClick={handleClear}
                disabled={loading}
              >
                🔄 Choose Different Image
              </Button>

              <Button
                variant="primary"
                onClick={handleImport}
                loading={loading}
                disabled={loading}
              >
                🤖 Import Recipe with AI
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageImportPage;
