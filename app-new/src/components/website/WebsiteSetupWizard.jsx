/**
 * Website Setup Wizard
 *
 * Guides users through creating their public website for the first time.
 * Steps: Welcome → Choose URL → Select Template → Add Branding → Done
 */

import React, { useState, useEffect } from 'react';
import { checkSlugAvailable, reserveSlug, saveWebsiteSettings, DEFAULT_SETTINGS } from '../../services/database/websiteSettingsDB';
import styles from '../../styles/components/websitesetupwizard.module.css';

const STEPS = {
  WELCOME: 0,
  URL: 1,
  TEMPLATE: 2,
  BRANDING: 3,
  DONE: 4
};

const TEMPLATES = [
  {
    id: 'marche',
    name: 'Marché',
    description: 'Classic Quebec style - warm, traditional, family business feel',
    colors: { primary: '#2C5530', accent: '#D4AF37' },
    preview: '/templates/marche-preview.png'
  }
  // Future templates: urbain, chaleur
];

/**
 * @component
 * Website Setup Wizard - Guides users through creating their public website for the first time.
 * Multi-step process: Welcome → Choose URL → Select Template → Add Branding → Done
 * 
 * @param {Object} props - Component props
 * @param {Function} props.onComplete - Callback function called when wizard is completed
 * @param {string} [props.businessName=''] - Pre-filled business name for the setup process
 * @returns {JSX.Element} The website setup wizard component
 * 
 * @example
 * <WebsiteSetupWizard 
 *   onComplete={() => console.log('Setup complete!')} 
 *   businessName="My Restaurant" 
 * />
 */
export default function WebsiteSetupWizard({ onComplete, businessName = '' }) {
  const [step, setStep] = useState(STEPS.WELCOME);
  const [settings, setSettings] = useState({
    slug: '',
    template: 'marche',
    branding: {
      tagline: ''
    },
    colors: TEMPLATES[0].colors
  });

  const [slugStatus, setSlugStatus] = useState({ checking: false, available: null, error: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Generate suggested slug from business name
  useEffect(() => {
    if (businessName && !settings.slug) {
      const suggested = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
      setSettings(prev => ({ ...prev, slug: suggested }));
    }
  }, [businessName]);

  // Check slug availability with debounce
  useEffect(() => {
    if (step !== STEPS.URL || !settings.slug || settings.slug.length < 3) {
      setSlugStatus({ checking: false, available: null, error: '' });
      return;
    }

    const timer = setTimeout(async () => {
      setSlugStatus({ checking: true, available: null, error: '' });
      try {
        const available = await checkSlugAvailable(settings.slug);
        setSlugStatus({ checking: false, available, error: '' });
      } catch (err) {
        setSlugStatus({ checking: false, available: false, error: 'Error checking availability' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [settings.slug, step]);

  const handleSlugChange = (e) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);
    setSettings(prev => ({ ...prev, slug: value }));
  };

  const handleNext = () => {
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleTemplateSelect = (templateId) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    setSettings(prev => ({
      ...prev,
      template: templateId,
      colors: template?.colors || prev.colors
    }));
  };

  const handleFinish = async () => {
    setSaving(true);
    setError('');

    try {
      // Reserve the slug
      const reserved = await reserveSlug(settings.slug);
      if (!reserved) {
        setError('This URL is no longer available. Please choose another.');
        setSaving(false);
        setStep(STEPS.URL);
        return;
      }

      // Save full settings
      await saveWebsiteSettings({
        ...DEFAULT_SETTINGS,
        enabled: true,
        slug: settings.slug,
        template: settings.template,
        branding: {
          ...DEFAULT_SETTINGS.branding,
          tagline: settings.branding.tagline
        },
        colors: settings.colors
      });

      setStep(STEPS.DONE);
    } catch (err) {
      console.error('Error creating website:', err);
      setError('Failed to create website. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canProceedFromUrl = settings.slug.length >= 3 && slugStatus.available === true;

  return (
    <div className={styles.wizard}>
      {/* Progress bar */}
      <div className={styles.progress}>
        <div
          className={styles.progressBar}
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      {/* Step content */}
      <div className={styles.content}>
        {step === STEPS.WELCOME && (
          <div className={styles.step}>
            <div className={styles.icon}>🌐</div>
            <h1 className={styles.title}>Create Your Website</h1>
            <p className={styles.description}>
              Turn your recipes into a live website that updates automatically.
              Customers can see your menu, today's specials, and contact info.
            </p>
            <div className={styles.features}>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>✓</span>
                <span>Professional templates</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>✓</span>
                <span>Auto-updates when you change recipes</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>✓</span>
                <span>Mobile-friendly design</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>✓</span>
                <span>"Menu du Jour" feature</span>
              </div>
            </div>
            <button className={styles.primaryBtn} onClick={handleNext}>
              Get Started
            </button>
          </div>
        )}

        {step === STEPS.URL && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose Your URL</h2>
            <p className={styles.stepDescription}>
              This will be your website address. Keep it short and memorable.
            </p>

            <div className={styles.urlInput}>
              <span className={styles.urlPrefix}>{window.location.origin}/s/</span>
              <input
                type="text"
                value={settings.slug}
                onChange={handleSlugChange}
                placeholder="your-store-name"
                className={styles.slugInput}
                autoFocus
              />
            </div>

            <div className={styles.slugStatus}>
              {slugStatus.checking && (
                <span className={styles.checking}>Checking availability...</span>
              )}
              {!slugStatus.checking && slugStatus.available === true && (
                <span className={styles.available}>✓ Available</span>
              )}
              {!slugStatus.checking && slugStatus.available === false && (
                <span className={styles.unavailable}>✗ Not available</span>
              )}
              {settings.slug.length > 0 && settings.slug.length < 3 && (
                <span className={styles.hint}>Minimum 3 characters</span>
              )}
            </div>

            <div className={styles.urlPreview}>
              <span className={styles.previewLabel}>Your website will be at:</span>
              <span className={styles.previewUrl}>
                {window.location.origin}/s/{settings.slug || 'your-store'}
              </span>
            </div>

            <div className={styles.buttons}>
              <button className={styles.secondaryBtn} onClick={handleBack}>
                Back
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleNext}
                disabled={!canProceedFromUrl}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === STEPS.TEMPLATE && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Choose Your Style</h2>
            <p className={styles.stepDescription}>
              Select a template that matches your brand. You can customize colors later.
            </p>

            <div className={styles.templates}>
              {TEMPLATES.map(template => (
                <div
                  key={template.id}
                  className={`${styles.templateCard} ${settings.template === template.id ? styles.selected : ''}`}
                  onClick={() => handleTemplateSelect(template.id)}
                >
                  <div
                    className={styles.templatePreview}
                    style={{
                      background: `linear-gradient(135deg, ${template.colors.primary} 0%, ${template.colors.accent} 100%)`
                    }}
                  >
                    <span className={styles.templateIcon}>🏪</span>
                  </div>
                  <div className={styles.templateInfo}>
                    <h3 className={styles.templateName}>{template.name}</h3>
                    <p className={styles.templateDesc}>{template.description}</p>
                  </div>
                  {settings.template === template.id && (
                    <div className={styles.checkmark}>✓</div>
                  )}
                </div>
              ))}
            </div>

            <p className={styles.moreTemplates}>
              More templates coming soon!
            </p>

            <div className={styles.buttons}>
              <button className={styles.secondaryBtn} onClick={handleBack}>
                Back
              </button>
              <button className={styles.primaryBtn} onClick={handleNext}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === STEPS.BRANDING && (
          <div className={styles.step}>
            <h2 className={styles.stepTitle}>Add Your Tagline</h2>
            <p className={styles.stepDescription}>
              A short phrase that describes your business. This appears on your website header.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Tagline (optional)</label>
              <input
                type="text"
                value={settings.branding.tagline}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  branding: { ...prev.branding, tagline: e.target.value.slice(0, 100) }
                }))}
                placeholder="e.g., Fresh from our kitchen to your table"
                className={styles.textInput}
                maxLength={100}
              />
              <span className={styles.charCount}>
                {settings.branding.tagline.length}/100
              </span>
            </div>

            <div className={styles.examples}>
              <span className={styles.examplesLabel}>Examples:</span>
              <button
                className={styles.exampleBtn}
                onClick={() => setSettings(prev => ({
                  ...prev,
                  branding: { ...prev.branding, tagline: 'Fait maison, avec amour' }
                }))}
              >
                Fait maison, avec amour
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSettings(prev => ({
                  ...prev,
                  branding: { ...prev.branding, tagline: 'Quality meats since 1985' }
                }))}
              >
                Quality meats since 1985
              </button>
              <button
                className={styles.exampleBtn}
                onClick={() => setSettings(prev => ({
                  ...prev,
                  branding: { ...prev.branding, tagline: 'Your neighborhood kitchen' }
                }))}
              >
                Your neighborhood kitchen
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.buttons}>
              <button className={styles.secondaryBtn} onClick={handleBack} disabled={saving}>
                Back
              </button>
              <button
                className={styles.primaryBtn}
                onClick={handleFinish}
                disabled={saving}
              >
                {saving ? 'Creating...' : 'Create Website'}
              </button>
            </div>
          </div>
        )}

        {step === STEPS.DONE && (
          <div className={styles.step}>
            <div className={styles.successIcon}>🎉</div>
            <h2 className={styles.title}>Your Website is Ready!</h2>
            <p className={styles.description}>
              Your website is now live. Add recipes to your menu by marking them as "public" in the recipe editor.
            </p>

            <div className={styles.websiteLink}>
              <a
                href={`/s/${settings.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.visitLink}
              >
                Visit Your Website →
              </a>
              <span className={styles.linkUrl}>
                {window.location.origin}/s/{settings.slug}
              </span>
            </div>

            <div className={styles.nextSteps}>
              <h3>Next Steps:</h3>
              <ol>
                <li>Go to any recipe and click the "Website" tab</li>
                <li>Add a photo and selling price</li>
                <li>Toggle "Show on Website" to publish</li>
                <li>Use "Available Today" for daily specials</li>
              </ol>
            </div>

            <button className={styles.primaryBtn} onClick={onComplete}>
              Go to Website Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
