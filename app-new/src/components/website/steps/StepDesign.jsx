/**
 * Step 3: Brand & Design
 */

import React from 'react';
import { TEMPLATES } from '../../../services/database/websiteSchema';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepDesign({ data, updateField }) {
  const handleTemplateSelect = (template) => {
    updateField('design.template', template.id);
    updateField('design.colors', template.colors);
    updateField('design.fonts', template.fonts);
    updateField('design.style', template.style);
  };

  return (
    <div className={styles.stepDesign}>
      <div className={styles.formSection}>
        <h3>Choose Your Template</h3>
        <p className={styles.sectionDesc}>
          Select a design style that matches your brand personality.
          You can customize colors after selecting.
        </p>

        <div className={styles.templateGrid}>
          {TEMPLATES.map(template => (
            <button
              key={template.id}
              className={`${styles.templateCard} ${
                data.design?.template === template.id ? styles.selected : ''
              }`}
              onClick={() => handleTemplateSelect(template)}
            >
              <div
                className={styles.templatePreview}
                style={{
                  background: `linear-gradient(135deg, ${template.colors.primary} 0%, ${template.colors.background} 100%)`,
                  borderColor: template.colors.accent,
                }}
              >
                <div
                  className={styles.templateAccent}
                  style={{ backgroundColor: template.colors.accent }}
                />
              </div>
              <div className={styles.templateInfo}>
                <h4>{template.name}</h4>
                <span className={styles.templateSubtitle}>{template.subtitle}</span>
                <p>{template.description}</p>
              </div>
              {data.design?.template === template.id && (
                <span className={styles.selectedBadge}>✓ Selected</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Customize Colors</h3>
        <p className={styles.sectionDesc}>
          Fine-tune your brand colors. Changes will preview on your website.
        </p>

        <div className={styles.colorPickers}>
          <div className={styles.colorField}>
            <label>Primary Color</label>
            <div className={styles.colorInputWrapper}>
              <input
                type="color"
                value={data.design?.colors?.primary || '#2C5530'}
                onChange={(e) => updateField('design.colors.primary', e.target.value)}
              />
              <span>{data.design?.colors?.primary || '#2C5530'}</span>
            </div>
            <p className={styles.colorHint}>Used for headers, buttons, and accents</p>
          </div>

          <div className={styles.colorField}>
            <label>Accent Color</label>
            <div className={styles.colorInputWrapper}>
              <input
                type="color"
                value={data.design?.colors?.accent || '#D4AF37'}
                onChange={(e) => updateField('design.colors.accent', e.target.value)}
              />
              <span>{data.design?.colors?.accent || '#D4AF37'}</span>
            </div>
            <p className={styles.colorHint}>Used for highlights and call-to-actions</p>
          </div>

          <div className={styles.colorField}>
            <label>Background Color</label>
            <div className={styles.colorInputWrapper}>
              <input
                type="color"
                value={data.design?.colors?.background || '#F5F1EB'}
                onChange={(e) => updateField('design.colors.background', e.target.value)}
              />
              <span>{data.design?.colors?.background || '#F5F1EB'}</span>
            </div>
            <p className={styles.colorHint}>Main page background color</p>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className={styles.formSection}>
        <h3>Preview</h3>
        <div
          className={styles.livePreview}
          style={{
            '--preview-primary': data.design?.colors?.primary || '#2C5530',
            '--preview-accent': data.design?.colors?.accent || '#D4AF37',
            '--preview-bg': data.design?.colors?.background || '#F5F1EB',
          }}
        >
          <div className={styles.previewHeader}>
            <span className={styles.previewLogo}>
              {data.identity?.logo ? (
                <img src={data.identity.logo} alt="Logo" />
              ) : '🏪'}
            </span>
            <span className={styles.previewName}>
              {data.identity?.name || 'Your Business'}
            </span>
          </div>
          <div className={styles.previewHero}>
            <h2>{data.identity?.tagline || 'Your Tagline Here'}</h2>
          </div>
          <div className={styles.previewContent}>
            <button className={styles.previewButton}>Call Now</button>
            <button className={styles.previewButtonSecondary}>View Menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}
