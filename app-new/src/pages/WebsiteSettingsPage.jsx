/**
 * WebsiteSettingsPage
 *
 * Store website configuration page where owners can:
 * - Enable/disable their public website
 * - Choose a URL slug
 * - Select a template
 * - Customize branding (logo, cover photo, tagline)
 * - Set colors
 * - Configure display categories
 * - Set contact info and SEO settings
 *
 * Shows WebsiteSetupWizard for first-time users who haven't created a website yet.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Dropdown from '../components/common/Dropdown';
import WebsiteSetupWizard from '../components/website/WebsiteSetupWizard';
import {
  getWebsiteSettings,
  saveWebsiteSettings,
  checkSlugAvailable,
  reserveSlug,
  releaseSlug,
  DEFAULT_SETTINGS
} from '../services/database/websiteSettingsDB';
import { uploadDishPhoto, deleteDishPhoto } from '../services/storage/imageStorage';
import { categoryDB } from '../services/database/indexedDB';
import styles from '../styles/pages/websitesettings.module.css';

// Template definitions
const TEMPLATES = [
  {
    id: 'marche',
    name: 'Marche',
    subtitle: 'Classic Quebec',
    description: 'Warm, traditional feel perfect for family grocers',
    colors: { primary: '#2C5530', accent: '#D4AF37' },
    preview: '/images/template-marche.jpg'
  }
  // Future templates:
  // { id: 'urbain', name: 'Urbain', subtitle: 'Modern Minimal', ... },
  // { id: 'chaleur', name: 'Chaleur', subtitle: 'Bold Vibrant', ... }
];

function WebsiteSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [slugInput, setSlugInput] = useState('');
  const [slugStatus, setSlugStatus] = useState(null); // 'checking' | 'available' | 'taken' | 'invalid'
  const [categories, setCategories] = useState([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const slugCheckTimeout = useRef(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadCategories();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getWebsiteSettings();
      setSettings(data);
      setSlugInput(data.slug || '');

      // Show wizard if user hasn't set up their website yet (no slug)
      if (!data.slug) {
        setShowWizard(true);
      }
    } catch (error) {
      console.error('Failed to load website settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const allCats = await categoryDB.getAll();
      const uniqueNames = [...new Set(allCats.map(c => c.name))];
      setCategories(uniqueNames);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  // Handle settings changes
  const updateSettings = useCallback((field, value) => {
    setSettings(prev => {
      // Handle nested fields like 'branding.tagline'
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return {
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        };
      }
      return { ...prev, [field]: value };
    });
  }, []);

  // Handle slug input with debounced availability check
  const handleSlugChange = (value) => {
    // Sanitize: lowercase, alphanumeric and hyphens only
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlugInput(sanitized);

    // Clear previous timeout
    if (slugCheckTimeout.current) {
      clearTimeout(slugCheckTimeout.current);
    }

    if (!sanitized || sanitized.length < 3) {
      setSlugStatus(sanitized ? 'invalid' : null);
      return;
    }

    setSlugStatus('checking');

    // Debounce the check
    slugCheckTimeout.current = setTimeout(async () => {
      const available = await checkSlugAvailable(sanitized);
      setSlugStatus(available ? 'available' : 'taken');
    }, 500);
  };

  // Reserve slug
  const handleReserveSlug = async () => {
    if (slugStatus !== 'available' || !slugInput) return;

    setSaving(true);
    try {
      // Release old slug if exists
      if (settings.slug && settings.slug !== slugInput) {
        await releaseSlug(settings.slug);
      }

      const success = await reserveSlug(slugInput);
      if (success) {
        updateSettings('slug', slugInput);
        setSlugStatus('reserved');
      } else {
        setSlugStatus('taken');
      }
    } catch (error) {
      console.error('Failed to reserve slug:', error);
      alert('Failed to reserve URL. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      // Delete old logo if exists
      if (settings.branding?.logo) {
        await deleteDishPhoto(settings.branding.logo);
      }

      const logoUrl = await uploadDishPhoto(file, 'logo', {
        maxWidth: 400,
        maxHeight: 400
      });
      updateSettings('branding.logo', logoUrl);
    } catch (error) {
      console.error('Logo upload failed:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Handle cover photo upload
  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      if (settings.branding?.coverPhoto) {
        await deleteDishPhoto(settings.branding.coverPhoto);
      }

      const coverUrl = await uploadDishPhoto(file, 'cover', {
        maxWidth: 1920,
        maxHeight: 600
      });
      updateSettings('branding.coverPhoto', coverUrl);
    } catch (error) {
      console.error('Cover upload failed:', error);
      alert('Failed to upload cover photo. Please try again.');
    } finally {
      setUploadingCover(false);
    }
  };

  // Toggle category in display list
  const toggleDisplayCategory = (catName) => {
    const current = settings.displayCategories || [];
    const newList = current.includes(catName)
      ? current.filter(c => c !== catName)
      : [...current, catName];
    updateSettings('displayCategories', newList);
  };

  // Move category up/down in order
  const moveCategoryOrder = (catName, direction) => {
    const current = [...(settings.displayCategories || [])];
    const index = current.indexOf(catName);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= current.length) return;

    [current[index], current[newIndex]] = [current[newIndex], current[index]];
    updateSettings('displayCategories', current);
  };

  // Save all settings
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveWebsiteSettings(settings);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Get website URL
  const getWebsiteUrl = () => {
    if (settings.slug) {
      return `${window.location.origin}/s/${settings.slug}`;
    }
    return null;
  };

  // Handle wizard completion
  const handleWizardComplete = () => {
    setShowWizard(false);
    loadSettings(); // Reload settings after wizard completes
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner}></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  // Show wizard for first-time users
  if (showWizard) {
    return (
      <div className={styles.settingsPage}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            Back
          </button>
          <h1>Create Your Website</h1>
          <div></div>
        </header>
        <WebsiteSetupWizard onComplete={handleWizardComplete} />
      </div>
    );
  }

  return (
    <div className={styles.settingsPage}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          Back
        </button>
        <h1>Website Settings</h1>
        <Button
          variant="primary"
          onClick={handleSave}
          loading={saving}
          disabled={saving}
        >
          Save Changes
        </Button>
      </header>

      <div className={styles.content}>
        {/* Enable/Disable Section */}
        <section className={styles.section}>
          <h2>Website Status</h2>
          <div className={styles.enableToggle}>
            <button
              className={`${styles.statusBtn} ${settings.enabled ? styles.active : ''}`}
              onClick={() => updateSettings('enabled', !settings.enabled)}
            >
              <span className={styles.statusIcon}>
                {settings.enabled ? 'ON' : 'OFF'}
              </span>
              <div className={styles.statusText}>
                <strong>{settings.enabled ? 'Website Enabled' : 'Website Disabled'}</strong>
                <span>{settings.enabled ? 'Your menu is live and public' : 'Click to enable your public website'}</span>
              </div>
            </button>
            {settings.enabled && getWebsiteUrl() && (
              <a
                href={getWebsiteUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.liveLink}
              >
                Visit your website: {getWebsiteUrl()}
              </a>
            )}
          </div>
        </section>

        {/* URL Setup Section */}
        <section className={styles.section}>
          <h2>Website URL</h2>
          <p className={styles.sectionDesc}>
            Choose a unique URL for your website. This cannot be changed easily, so choose wisely.
          </p>
          <div className={styles.slugInput}>
            <span className={styles.slugPrefix}>{window.location.origin}/s/</span>
            <Input
              value={slugInput}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="your-store-name"
              size="medium"
            />
          </div>
          <div className={styles.slugStatus}>
            {slugStatus === 'checking' && <span className={styles.checking}>Checking availability...</span>}
            {slugStatus === 'available' && (
              <>
                <span className={styles.available}>Available!</span>
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleReserveSlug}
                  disabled={saving}
                >
                  Reserve URL
                </Button>
              </>
            )}
            {slugStatus === 'taken' && <span className={styles.taken}>This URL is already taken</span>}
            {slugStatus === 'invalid' && <span className={styles.invalid}>URL must be at least 3 characters</span>}
            {slugStatus === 'reserved' && <span className={styles.reserved}>Reserved for you</span>}
          </div>
        </section>

        {/* Template Selection */}
        <section className={styles.section}>
          <h2>Template</h2>
          <p className={styles.sectionDesc}>
            Choose a design template for your website. More templates coming soon!
          </p>
          <div className={styles.templateGrid}>
            {TEMPLATES.map(template => (
              <button
                key={template.id}
                className={`${styles.templateCard} ${settings.template === template.id ? styles.selected : ''}`}
                onClick={() => {
                  updateSettings('template', template.id);
                  updateSettings('colors', template.colors);
                }}
              >
                <div
                  className={styles.templatePreview}
                  style={{ background: template.colors.primary }}
                >
                  <span className={styles.templateInitial}>{template.name[0]}</span>
                </div>
                <div className={styles.templateInfo}>
                  <strong>{template.name}</strong>
                  <span>{template.subtitle}</span>
                </div>
                {settings.template === template.id && (
                  <span className={styles.selectedBadge}>Selected</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Branding Section */}
        <section className={styles.section}>
          <h2>Branding</h2>

          <div className={styles.brandingGrid}>
            {/* Logo */}
            <div className={styles.uploadBox}>
              <label>Logo</label>
              <div
                className={`${styles.uploadArea} ${settings.branding?.logo ? styles.hasImage : ''}`}
                onClick={() => logoInputRef.current?.click()}
              >
                {uploadingLogo ? (
                  <div className={styles.uploading}>Uploading...</div>
                ) : settings.branding?.logo ? (
                  <img src={settings.branding.logo} alt="Logo" />
                ) : (
                  <span>Click to upload logo</span>
                )}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* Cover Photo */}
            <div className={styles.uploadBox}>
              <label>Cover Photo</label>
              <div
                className={`${styles.uploadArea} ${styles.coverArea} ${settings.branding?.coverPhoto ? styles.hasImage : ''}`}
                onClick={() => coverInputRef.current?.click()}
              >
                {uploadingCover ? (
                  <div className={styles.uploading}>Uploading...</div>
                ) : settings.branding?.coverPhoto ? (
                  <img src={settings.branding.coverPhoto} alt="Cover" />
                ) : (
                  <span>Click to upload cover photo (1920x600 recommended)</span>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Tagline */}
          <div className={styles.field}>
            <label>Tagline</label>
            <Input
              value={settings.branding?.tagline || ''}
              onChange={(e) => updateSettings('branding.tagline', e.target.value)}
              placeholder="Fresh from our kitchen to your table"
              maxLength={100}
            />
          </div>
        </section>

        {/* Colors Section */}
        <section className={styles.section}>
          <h2>Colors</h2>
          <div className={styles.colorPickers}>
            <div className={styles.colorField}>
              <label>Primary Color</label>
              <div className={styles.colorInput}>
                <input
                  type="color"
                  value={settings.colors?.primary || '#2C5530'}
                  onChange={(e) => updateSettings('colors.primary', e.target.value)}
                />
                <span>{settings.colors?.primary || '#2C5530'}</span>
              </div>
            </div>
            <div className={styles.colorField}>
              <label>Accent Color</label>
              <div className={styles.colorInput}>
                <input
                  type="color"
                  value={settings.colors?.accent || '#D4AF37'}
                  onChange={(e) => updateSettings('colors.accent', e.target.value)}
                />
                <span>{settings.colors?.accent || '#D4AF37'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Display Categories */}
        <section className={styles.section}>
          <h2>Display Categories</h2>
          <p className={styles.sectionDesc}>
            Select which categories to show on your website and arrange their order.
          </p>

          {/* Selected categories (sortable) */}
          {(settings.displayCategories?.length > 0) && (
            <div className={styles.selectedCategories}>
              <label>Display Order:</label>
              <div className={styles.categoryOrder}>
                {settings.displayCategories.map((cat, index) => (
                  <div key={cat} className={styles.categoryOrderItem}>
                    <span className={styles.categoryIndex}>{index + 1}</span>
                    <span className={styles.categoryName}>{cat}</span>
                    <div className={styles.categoryActions}>
                      <button
                        onClick={() => moveCategoryOrder(cat, 'up')}
                        disabled={index === 0}
                      >
                        Up
                      </button>
                      <button
                        onClick={() => moveCategoryOrder(cat, 'down')}
                        disabled={index === settings.displayCategories.length - 1}
                      >
                        Down
                      </button>
                      <button onClick={() => toggleDisplayCategory(cat)}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available categories */}
          <div className={styles.availableCategories}>
            <label>Available Categories:</label>
            <div className={styles.categoryChips}>
              {categories.filter(c => !(settings.displayCategories || []).includes(c)).map(cat => (
                <button
                  key={cat}
                  className={styles.categoryChip}
                  onClick={() => toggleDisplayCategory(cat)}
                >
                  + {cat}
                </button>
              ))}
              {categories.filter(c => !(settings.displayCategories || []).includes(c)).length === 0 && (
                <span className={styles.allSelected}>All categories are selected</span>
              )}
            </div>
          </div>
        </section>

        {/* Display Options */}
        <section className={styles.section}>
          <h2>Display Options</h2>
          <div className={styles.optionToggles}>
            <label className={styles.optionToggle}>
              <input
                type="checkbox"
                checked={settings.displayOptions?.showPrices ?? true}
                onChange={(e) => updateSettings('displayOptions.showPrices', e.target.checked)}
              />
              <span>Show prices on website</span>
            </label>
            <label className={styles.optionToggle}>
              <input
                type="checkbox"
                checked={settings.displayOptions?.showPhotos ?? true}
                onChange={(e) => updateSettings('displayOptions.showPhotos', e.target.checked)}
              />
              <span>Show dish photos</span>
            </label>
          </div>
        </section>

        {/* Contact Info */}
        <section className={styles.section}>
          <h2>Contact Information</h2>
          <div className={styles.contactFields}>
            <div className={styles.field}>
              <label>Phone</label>
              <Input
                value={settings.contact?.phone || ''}
                onChange={(e) => updateSettings('contact.phone', e.target.value)}
                placeholder="(514) 555-1234"
              />
            </div>
            <div className={styles.field}>
              <label>Address</label>
              <Input
                value={settings.contact?.address || ''}
                onChange={(e) => updateSettings('contact.address', e.target.value)}
                placeholder="123 Main St, Montreal, QC"
              />
            </div>
            <div className={styles.field}>
              <label>Hours</label>
              <Input
                value={settings.contact?.hours || ''}
                onChange={(e) => updateSettings('contact.hours', e.target.value)}
                placeholder="Mon-Sat 8am-8pm, Sun 9am-5pm"
              />
            </div>
          </div>
        </section>

        {/* SEO */}
        <section className={styles.section}>
          <h2>SEO Settings</h2>
          <p className={styles.sectionDesc}>
            Optimize how your website appears in search results.
          </p>
          <div className={styles.seoFields}>
            <div className={styles.field}>
              <label>Page Title</label>
              <Input
                value={settings.seo?.title || ''}
                onChange={(e) => updateSettings('seo.title', e.target.value)}
                placeholder="Your Store Name - Fresh Prepared Foods"
                maxLength={60}
              />
              <span className={styles.charCount}>{settings.seo?.title?.length || 0}/60</span>
            </div>
            <div className={styles.field}>
              <label>Meta Description</label>
              <textarea
                className={styles.textarea}
                value={settings.seo?.description || ''}
                onChange={(e) => updateSettings('seo.description', e.target.value)}
                placeholder="Discover fresh, homemade prepared foods at our store..."
                maxLength={160}
                rows={3}
              />
              <span className={styles.charCount}>{settings.seo?.description?.length || 0}/160</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default WebsiteSettingsPage;
