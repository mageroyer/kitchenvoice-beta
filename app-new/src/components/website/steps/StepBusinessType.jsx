/**
 * Step 1: Business Type Selection
 */

import React from 'react';
import { BUSINESS_TYPES } from '../../../services/database/websiteSchema';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepBusinessType({ data, updateField }) {
  return (
    <div className={styles.stepBusinessType}>
      <p className={styles.stepIntro}>
        Select the type of food business that best describes your company.
        This helps us customize your website with relevant features and terminology.
      </p>

      <div className={styles.businessTypeGrid}>
        {BUSINESS_TYPES.map(type => (
          <button
            key={type.id}
            className={`${styles.businessTypeCard} ${
              data.businessType === type.id ? styles.selected : ''
            }`}
            onClick={() => updateField('businessType', type.id)}
          >
            <span className={styles.businessTypeIcon}>{type.icon}</span>
            <span className={styles.businessTypeLabel}>{type.label}</span>
            {data.businessType === type.id && (
              <span className={styles.checkmark}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
