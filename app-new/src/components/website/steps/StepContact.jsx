/**
 * Step 5: Contact & Location
 */

import React from 'react';
import { DAYS_OF_WEEK } from '../../../services/database/websiteSchema';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepContact({ data, updateField }) {
  const updateHours = (day, field, value) => {
    const currentHours = data.contact?.hours || {};
    updateField('contact.hours', {
      ...currentHours,
      [day]: {
        ...currentHours[day],
        [field]: value,
      },
    });
  };

  const toggleDayClosed = (day) => {
    const currentHours = data.contact?.hours || {};
    const currentDay = currentHours[day] || {};
    updateField('contact.hours', {
      ...currentHours,
      [day]: {
        ...currentDay,
        closed: !currentDay.closed,
      },
    });
  };

  return (
    <div className={styles.stepContact}>
      <div className={styles.formSection}>
        <h3>Address</h3>
        <div className={styles.addressGrid}>
          <div className={styles.formField}>
            <label>Street Address *</label>
            <input
              type="text"
              className={styles.textInput}
              value={data.contact?.address?.street || ''}
              onChange={(e) => updateField('contact.address.street', e.target.value)}
              placeholder="123 Main Street"
            />
          </div>
          <div className={styles.formField}>
            <label>City *</label>
            <input
              type="text"
              className={styles.textInput}
              value={data.contact?.address?.city || ''}
              onChange={(e) => updateField('contact.address.city', e.target.value)}
              placeholder="Montreal"
            />
          </div>
          <div className={styles.formField}>
            <label>Province</label>
            <select
              className={styles.selectInput}
              value={data.contact?.address?.province || 'QC'}
              onChange={(e) => updateField('contact.address.province', e.target.value)}
            >
              <option value="QC">Quebec</option>
              <option value="ON">Ontario</option>
              <option value="BC">British Columbia</option>
              <option value="AB">Alberta</option>
              <option value="MB">Manitoba</option>
              <option value="SK">Saskatchewan</option>
              <option value="NS">Nova Scotia</option>
              <option value="NB">New Brunswick</option>
              <option value="NL">Newfoundland</option>
              <option value="PE">Prince Edward Island</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label>Postal Code</label>
            <input
              type="text"
              className={styles.textInput}
              value={data.contact?.address?.postalCode || ''}
              onChange={(e) => updateField('contact.address.postalCode', e.target.value.toUpperCase())}
              placeholder="H2X 1Y4"
              maxLength={7}
            />
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Contact Information</h3>
        <div className={styles.contactGrid}>
          <div className={styles.formField}>
            <label>Main Phone *</label>
            <input
              type="tel"
              className={styles.textInput}
              value={data.contact?.phone || ''}
              onChange={(e) => updateField('contact.phone', e.target.value)}
              placeholder="(514) 555-1234"
            />
          </div>
          <div className={styles.formField}>
            <label>Secondary Phone</label>
            <input
              type="tel"
              className={styles.textInput}
              value={data.contact?.phoneSecondary || ''}
              onChange={(e) => updateField('contact.phoneSecondary', e.target.value)}
              placeholder="(514) 555-5678"
            />
          </div>
          <div className={styles.formField}>
            <label>Email</label>
            <input
              type="email"
              className={styles.textInput}
              value={data.contact?.email || ''}
              onChange={(e) => updateField('contact.email', e.target.value)}
              placeholder="info@yourbusiness.com"
            />
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Business Hours</h3>
        <div className={styles.hoursGrid}>
          {DAYS_OF_WEEK.map(day => {
            const dayHours = data.contact?.hours?.[day.id] || {};
            return (
              <div key={day.id} className={styles.dayRow}>
                <span className={styles.dayLabel}>{day.label}</span>
                <label className={styles.closedToggle}>
                  <input
                    type="checkbox"
                    checked={dayHours.closed}
                    onChange={() => toggleDayClosed(day.id)}
                  />
                  <span>Closed</span>
                </label>
                {!dayHours.closed && (
                  <>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={dayHours.open || '09:00'}
                      onChange={(e) => updateHours(day.id, 'open', e.target.value)}
                    />
                    <span className={styles.timeSeparator}>to</span>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={dayHours.close || '18:00'}
                      onChange={(e) => updateHours(day.id, 'close', e.target.value)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Additional Information</h3>
        <div className={styles.formField}>
          <label>Parking Information</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.contact?.parking || ''}
            onChange={(e) => updateField('contact.parking', e.target.value)}
            placeholder="e.g., Free parking behind store, Street parking available"
          />
        </div>
        <div className={styles.formField}>
          <label>Public Transit</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.contact?.transit || ''}
            onChange={(e) => updateField('contact.transit', e.target.value)}
            placeholder="e.g., Metro Jarry (5 min walk), Bus 55"
          />
        </div>
        <div className={styles.formField}>
          <label>Accessibility</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.contact?.accessibility || ''}
            onChange={(e) => updateField('contact.accessibility', e.target.value)}
            placeholder="e.g., Wheelchair accessible, Step-free entrance"
          />
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Map Settings</h3>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={data.contact?.mapEnabled !== false}
            onChange={(e) => updateField('contact.mapEnabled', e.target.checked)}
          />
          <span>Show Google Map on contact page</span>
        </label>
      </div>
    </div>
  );
}
