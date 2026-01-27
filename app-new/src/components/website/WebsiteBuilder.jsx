/**
 * Website Builder - Multi-Step Wizard
 *
 * A comprehensive 10-step wizard for creating a professional
 * food industry website.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BUSINESS_TYPES,
  CERTIFICATIONS,
  TEMPLATES,
  DAYS_OF_WEEK,
  DEFAULT_WEBSITE_DATA,
  WIZARD_STEPS,
} from '../../services/database/websiteSchema';
import {
  getWebsiteData,
  saveWebsiteData,
  checkSlugAvailable,
  reserveSlug,
  publishWebsite,
} from '../../services/database/websiteDB';
import { uploadDishPhoto } from '../../services/storage/imageStorage';
import styles from '../../styles/components/websitebuilder.module.css';

// Step components
import {
  StepBusinessType,
  StepIdentity,
  StepDesign,
  StepAbout,
  StepContact,
  StepServices,
  StepSocial,
  StepGallery,
  StepSEO,
  StepReview,
} from './steps';

export default function WebsiteBuilder({ onComplete }) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [websiteData, setWebsiteData] = useState(DEFAULT_WEBSITE_DATA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load existing data on mount
  useEffect(() => {
    loadWebsiteData();
  }, []);

  const loadWebsiteData = async () => {
    try {
      const data = await getWebsiteData();
      setWebsiteData(data);

      // If they already have a published site, go to review step
      if (data.status === 'published') {
        setCurrentStep(9);
      }
    } catch (err) {
      console.error('Error loading website data:', err);
      setError('Failed to load website data');
    } finally {
      setLoading(false);
    }
  };

  // Update a specific section of the data
  const updateSection = useCallback((section, data) => {
    setWebsiteData(prev => ({
      ...prev,
      [section]: typeof data === 'function' ? data(prev[section]) : data,
    }));
  }, []);

  // Update nested field
  const updateField = useCallback((path, value) => {
    setWebsiteData(prev => {
      const newData = { ...prev };
      const parts = path.split('.');
      let current = newData;

      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }

      current[parts[parts.length - 1]] = value;
      return newData;
    });
  }, []);

  // Save current progress
  const saveProgress = async () => {
    setSaving(true);
    try {
      await saveWebsiteData(websiteData);
    } catch (err) {
      console.error('Error saving progress:', err);
      setError('Failed to save progress');
    } finally {
      setSaving(false);
    }
  };

  // Go to next step
  const nextStep = async () => {
    await saveProgress();
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };

  // Go to previous step
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  // Go to specific step
  const goToStep = (index) => {
    if (index >= 0 && index < WIZARD_STEPS.length) {
      setCurrentStep(index);
      window.scrollTo(0, 0);
    }
  };

  // Publish the website
  const handlePublish = async () => {
    setSaving(true);
    setError(null);

    try {
      // Make sure slug is reserved
      if (websiteData.slug) {
        const reserved = await reserveSlug(websiteData.slug);
        if (!reserved) {
          setError('The chosen URL is no longer available. Please choose another.');
          goToStep(8); // Go to SEO step
          setSaving(false);
          return;
        }
      }

      // Save final data
      await saveWebsiteData({
        ...websiteData,
        status: 'published',
        publishedAt: new Date().toISOString(),
      });

      // Redirect to success or settings
      if (onComplete) {
        onComplete(websiteData);
      }
    } catch (err) {
      console.error('Error publishing website:', err);
      setError('Failed to publish website. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    const stepProps = {
      data: websiteData,
      updateSection,
      updateField,
      saving,
    };

    switch (currentStep) {
      case 0:
        return <StepBusinessType {...stepProps} />;
      case 1:
        return <StepIdentity {...stepProps} />;
      case 2:
        return <StepDesign {...stepProps} />;
      case 3:
        return <StepAbout {...stepProps} />;
      case 4:
        return <StepContact {...stepProps} />;
      case 5:
        return <StepServices {...stepProps} />;
      case 6:
        return <StepSocial {...stepProps} />;
      case 7:
        return <StepGallery {...stepProps} />;
      case 8:
        return <StepSEO {...stepProps} />;
      case 9:
        return <StepReview {...stepProps} onPublish={handlePublish} />;
      default:
        return null;
    }
  };

  // Check if current step is valid to proceed
  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!websiteData.businessType;
      case 1:
        return !!websiteData.identity?.name;
      case 8:
        return !!websiteData.slug && websiteData.slug.length >= 3;
      default:
        return true;
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner}></div>
        <p>Loading your website...</p>
      </div>
    );
  }

  return (
    <div className={styles.builder}>
      {/* Progress Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className={styles.headerTitle}>
          <h1>Website Builder</h1>
          <span className={styles.stepIndicator}>
            Step {currentStep + 1} of {WIZARD_STEPS.length}
          </span>
        </div>
        <button
          className={styles.saveBtn}
          onClick={saveProgress}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
      </header>

      {/* Progress Bar */}
      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          {WIZARD_STEPS.map((step, index) => (
            <button
              key={step.id}
              className={`${styles.progressStep} ${
                index === currentStep ? styles.active : ''
              } ${index < currentStep ? styles.completed : ''}`}
              onClick={() => goToStep(index)}
              title={step.title}
            >
              <span className={styles.stepIcon}>{step.icon}</span>
              <span className={styles.stepLabel}>{step.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <main className={styles.content}>
        <div className={styles.stepHeader}>
          <span className={styles.stepNumber}>{WIZARD_STEPS[currentStep].icon}</span>
          <div>
            <h2>{WIZARD_STEPS[currentStep].title}</h2>
            <p>{WIZARD_STEPS[currentStep].description}</p>
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className={styles.stepContent}>
          {renderStepContent()}
        </div>
      </main>

      {/* Navigation Footer */}
      <footer className={styles.footer}>
        <button
          className={styles.prevBtn}
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          ← Previous
        </button>

        <div className={styles.footerCenter}>
          <span className={styles.autoSave}>
            {saving ? '💾 Saving...' : '✓ Auto-saved'}
          </span>
        </div>

        {currentStep < WIZARD_STEPS.length - 1 ? (
          <button
            className={styles.nextBtn}
            onClick={nextStep}
            disabled={!canProceed() || saving}
          >
            Next →
          </button>
        ) : (
          <button
            className={styles.publishBtn}
            onClick={handlePublish}
            disabled={saving || !websiteData.slug}
          >
            {saving ? 'Publishing...' : '🚀 Publish Website'}
          </button>
        )}
      </footer>
    </div>
  );
}
