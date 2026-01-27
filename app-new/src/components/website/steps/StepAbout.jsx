/**
 * Step 4: About Your Business
 */

import React, { useState } from 'react';
import { CERTIFICATIONS } from '../../../services/database/websiteSchema';
import { uploadDishPhoto } from '../../../services/storage/imageStorage';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepAbout({ data, updateField, updateSection }) {
  const [uploadingPhoto, setUploadingPhoto] = useState(null);

  const handleTeamPhotoUpload = async (e, index) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(index);
    try {
      const photoUrl = await uploadDishPhoto(file, `team-${index}`, {
        maxWidth: 400,
        maxHeight: 400,
      });

      const newTeam = [...(data.about?.team || [])];
      newTeam[index] = { ...newTeam[index], photo: photoUrl };
      updateField('about.team', newTeam);
    } catch (err) {
      console.error('Photo upload failed:', err);
      alert('Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const toggleCertification = (certId) => {
    const current = data.about?.certifications || [];
    const newCerts = current.includes(certId)
      ? current.filter(c => c !== certId)
      : [...current, certId];
    updateField('about.certifications', newCerts);
  };

  const addTeamMember = () => {
    const newTeam = [...(data.about?.team || []), { name: '', role: '', photo: null, bio: '' }];
    updateField('about.team', newTeam);
  };

  const updateTeamMember = (index, field, value) => {
    const newTeam = [...(data.about?.team || [])];
    newTeam[index] = { ...newTeam[index], [field]: value };
    updateField('about.team', newTeam);
  };

  const removeTeamMember = (index) => {
    const newTeam = (data.about?.team || []).filter((_, i) => i !== index);
    updateField('about.team', newTeam);
  };

  return (
    <div className={styles.stepAbout}>
      <div className={styles.formSection}>
        <h3>Your Story</h3>
        <p className={styles.sectionDesc}>
          Tell customers about your history, what makes you unique, and why they should choose you.
        </p>
        <textarea
          className={styles.textArea}
          value={data.about?.story || ''}
          onChange={(e) => updateField('about.story', e.target.value)}
          placeholder="Share your story... How did you get started? What's your passion? What makes your products special?"
          rows={6}
          maxLength={2000}
        />
        <span className={styles.charCount}>
          {(data.about?.story || '').length}/2000
        </span>
      </div>

      <div className={styles.formSection}>
        <h3>Mission Statement</h3>
        <textarea
          className={styles.textArea}
          value={data.about?.mission || ''}
          onChange={(e) => updateField('about.mission', e.target.value)}
          placeholder="What's your mission? What do you stand for?"
          rows={3}
          maxLength={500}
        />
      </div>

      <div className={styles.formSection}>
        <h3>Certifications & Badges</h3>
        <p className={styles.sectionDesc}>
          Highlight what makes your business special
        </p>
        <div className={styles.certificationGrid}>
          {CERTIFICATIONS.map(cert => (
            <button
              key={cert.id}
              className={`${styles.certificationBadge} ${
                (data.about?.certifications || []).includes(cert.id) ? styles.selected : ''
              }`}
              onClick={() => toggleCertification(cert.id)}
            >
              <span className={styles.certIcon}>{cert.icon}</span>
              <span className={styles.certLabel}>{cert.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Team Members</h3>
        <p className={styles.sectionDesc}>
          Introduce the people behind your business (optional)
        </p>

        <div className={styles.teamList}>
          {(data.about?.team || []).map((member, index) => (
            <div key={index} className={styles.teamMemberCard}>
              <div className={styles.teamPhotoSection}>
                <div
                  className={styles.teamPhotoUpload}
                  onClick={() => document.getElementById(`team-photo-${index}`).click()}
                >
                  {uploadingPhoto === index ? (
                    <span>Uploading...</span>
                  ) : member.photo ? (
                    <img src={member.photo} alt={member.name} />
                  ) : (
                    <span>📷 Add Photo</span>
                  )}
                </div>
                <input
                  id={`team-photo-${index}`}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleTeamPhotoUpload(e, index)}
                  style={{ display: 'none' }}
                />
              </div>
              <div className={styles.teamMemberInfo}>
                <input
                  type="text"
                  placeholder="Name"
                  value={member.name || ''}
                  onChange={(e) => updateTeamMember(index, 'name', e.target.value)}
                  className={styles.textInput}
                />
                <input
                  type="text"
                  placeholder="Role (e.g., Owner, Head Chef)"
                  value={member.role || ''}
                  onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                  className={styles.textInput}
                />
                <textarea
                  placeholder="Short bio (optional)"
                  value={member.bio || ''}
                  onChange={(e) => updateTeamMember(index, 'bio', e.target.value)}
                  className={styles.textArea}
                  rows={2}
                />
              </div>
              <button
                className={styles.removeBtn}
                onClick={() => removeTeamMember(index)}
                title="Remove team member"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button className={styles.addBtn} onClick={addTeamMember}>
          + Add Team Member
        </button>
      </div>

      <div className={styles.formSection}>
        <h3>Awards & Recognition</h3>
        <p className={styles.sectionDesc}>
          List any awards, media mentions, or recognition (optional)
        </p>
        <textarea
          className={styles.textArea}
          value={(data.about?.awards || []).map(a => `${a.year}: ${a.title}`).join('\n')}
          onChange={(e) => {
            const lines = e.target.value.split('\n').filter(l => l.trim());
            const awards = lines.map(line => {
              const match = line.match(/^(\d{4}):\s*(.+)$/);
              if (match) {
                return { year: match[1], title: match[2] };
              }
              return { year: '', title: line };
            });
            updateField('about.awards', awards);
          }}
          placeholder="2023: Best Local Butcher - Montreal Magazine&#10;2022: Reader's Choice Award"
          rows={4}
        />
        <p className={styles.hint}>
          Format: YEAR: Award name (one per line)
        </p>
      </div>
    </div>
  );
}
