/**
 * Website Preview Page
 *
 * Shows a preview of what the public website will look like
 * based on the data entered in the Website Builder.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWebsiteData } from '../services/database/websiteDB';
import { BUSINESS_TYPES, TEMPLATES, DAYS_OF_WEEK, CERTIFICATIONS } from '../services/database/websiteSchema';
import styles from '../styles/pages/websitepreview.module.css';

export default function WebsitePreviewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, [slug]);

  const loadData = async () => {
    try {
      const websiteData = await getWebsiteData();
      setData(websiteData);
    } catch (err) {
      console.error('Error loading website data:', err);
      setError('Failed to load website data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner}></div>
        <p>Loading preview...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.errorState}>
        <h2>Preview Unavailable</h2>
        <p>{error || 'No website data found'}</p>
        <button onClick={() => navigate('/website-settings')}>
          Go to Website Builder
        </button>
      </div>
    );
  }

  const template = TEMPLATES.find(t => t.id === data.design?.template) || TEMPLATES[0];
  const colors = data.design?.colors || template.colors;
  const businessType = BUSINESS_TYPES.find(t => t.id === data.businessType);

  // Format hours for display
  const formatHours = (hours) => {
    if (!hours) return null;
    return DAYS_OF_WEEK.map(day => {
      const dayHours = hours[day.id];
      if (!dayHours || dayHours.closed) {
        return { day: day.label, hours: 'Closed' };
      }
      return { day: day.label, hours: `${dayHours.open} - ${dayHours.close}` };
    });
  };

  const formattedHours = formatHours(data.contact?.hours);

  return (
    <div className={styles.previewContainer}>
      {/* Preview Banner */}
      <div className={styles.previewBanner}>
        <span>Preview Mode</span>
        <button onClick={() => navigate('/website-settings')}>
          Back to Editor
        </button>
      </div>

      {/* Website Content */}
      <div
        className={styles.website}
        style={{
          '--primary-color': colors.primary,
          '--accent-color': colors.accent,
          '--background-color': colors.background,
          '--text-color': colors.text,
        }}
      >
        {/* Header */}
        <header className={styles.header} style={{ backgroundColor: colors.primary }}>
          <div className={styles.headerContent}>
            {data.identity?.logo ? (
              <img src={data.identity.logo} alt="Logo" className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>
                {businessType?.icon || '🏪'}
              </div>
            )}
            <div className={styles.headerText}>
              <h1>{data.identity?.name || 'Your Business Name'}</h1>
              {data.identity?.tagline && (
                <p className={styles.tagline}>{data.identity.tagline}</p>
              )}
            </div>
            {data.contact?.phone && (
              <a href={`tel:${data.contact.phone}`} className={styles.phoneBtn}>
                📞 {data.contact.phone}
              </a>
            )}
          </div>
        </header>

        {/* Hero Section */}
        {data.gallery?.hero?.homepage && (
          <section className={styles.hero}>
            <img src={data.gallery.hero.homepage} alt="Hero" />
            <div className={styles.heroOverlay}>
              <h2>{data.identity?.name}</h2>
              {data.identity?.tagline && <p>{data.identity.tagline}</p>}
            </div>
          </section>
        )}

        {/* About Section */}
        {(data.about?.story || data.about?.mission) && (
          <section className={styles.about}>
            <h2>About Us</h2>
            {data.identity?.yearEstablished && (
              <p className={styles.established}>
                Serving our community since {data.identity.yearEstablished}
              </p>
            )}
            {data.about?.story && <p className={styles.story}>{data.about.story}</p>}
            {data.about?.mission && (
              <div className={styles.mission}>
                <strong>Our Mission:</strong> {data.about.mission}
              </div>
            )}
          </section>
        )}

        {/* Certifications */}
        {data.about?.certifications?.length > 0 && (
          <section className={styles.certifications}>
            <div className={styles.certGrid}>
              {data.about.certifications.map(certId => {
                const cert = CERTIFICATIONS.find(c => c.id === certId);
                return cert ? (
                  <div key={certId} className={styles.certBadge}>
                    <span className={styles.certIcon}>{cert.icon}</span>
                    <span>{cert.label}</span>
                  </div>
                ) : null;
              })}
            </div>
          </section>
        )}

        {/* Services Section */}
        {Object.values(data.services || {}).some(s => s?.enabled) && (
          <section className={styles.services}>
            <h2>Our Services</h2>
            <div className={styles.serviceGrid}>
              {data.services?.catering?.enabled && (
                <div className={styles.serviceCard}>
                  <span className={styles.serviceIcon}>🍽️</span>
                  <h3>Catering</h3>
                  <p>{data.services.catering.description || 'Professional catering for all occasions'}</p>
                </div>
              )}
              {data.services?.delivery?.enabled && (
                <div className={styles.serviceCard}>
                  <span className={styles.serviceIcon}>🚚</span>
                  <h3>Delivery</h3>
                  <p>{data.services.delivery.description || 'Fresh delivery to your door'}</p>
                  {data.services.delivery.radius && (
                    <span className={styles.serviceNote}>
                      Delivery radius: {data.services.delivery.radius} km
                    </span>
                  )}
                </div>
              )}
              {data.services?.customOrders?.enabled && (
                <div className={styles.serviceCard}>
                  <span className={styles.serviceIcon}>📝</span>
                  <h3>Custom Orders</h3>
                  <p>{data.services.customOrders.description || 'Special orders made to your specifications'}</p>
                </div>
              )}
              {data.services?.wholesale?.enabled && (
                <div className={styles.serviceCard}>
                  <span className={styles.serviceIcon}>📦</span>
                  <h3>Wholesale</h3>
                  <p>{data.services.wholesale.description || 'Wholesale pricing for businesses'}</p>
                </div>
              )}
              {data.services?.giftCards?.enabled && (
                <div className={styles.serviceCard}>
                  <span className={styles.serviceIcon}>🎁</span>
                  <h3>Gift Cards</h3>
                  <p>The perfect gift for food lovers</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Gallery Section */}
        {(data.gallery?.products?.length > 0 || data.gallery?.storefront?.length > 0) && (
          <section className={styles.gallery}>
            <h2>Gallery</h2>
            <div className={styles.galleryGrid}>
              {data.gallery?.products?.map((photo, i) => (
                <div key={`product-${i}`} className={styles.galleryItem}>
                  <img src={photo.url} alt={photo.caption || 'Product'} />
                  {photo.caption && <span className={styles.caption}>{photo.caption}</span>}
                </div>
              ))}
              {data.gallery?.storefront?.map((photo, i) => (
                <div key={`store-${i}`} className={styles.galleryItem}>
                  <img src={photo.url} alt={photo.caption || 'Store'} />
                  {photo.caption && <span className={styles.caption}>{photo.caption}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Team Section */}
        {data.about?.team?.length > 0 && (
          <section className={styles.team}>
            <h2>Meet Our Team</h2>
            <div className={styles.teamGrid}>
              {data.about.team.map((member, i) => (
                <div key={i} className={styles.teamMember}>
                  {member.photo ? (
                    <img src={member.photo} alt={member.name} />
                  ) : (
                    <div className={styles.teamPhotoPlaceholder}>👤</div>
                  )}
                  <h3>{member.name}</h3>
                  {member.role && <p className={styles.role}>{member.role}</p>}
                  {member.bio && <p className={styles.bio}>{member.bio}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact Section */}
        <section className={styles.contact} style={{ backgroundColor: colors.primary + '10' }}>
          <h2>Contact Us</h2>
          <div className={styles.contactGrid}>
            {/* Contact Info */}
            <div className={styles.contactInfo}>
              {data.contact?.address?.street && (
                <div className={styles.contactItem}>
                  <span className={styles.contactIcon}>📍</span>
                  <div>
                    <p>{data.contact.address.street}</p>
                    <p>{data.contact.address.city}, {data.contact.address.province} {data.contact.address.postalCode}</p>
                  </div>
                </div>
              )}
              {data.contact?.phone && (
                <div className={styles.contactItem}>
                  <span className={styles.contactIcon}>📞</span>
                  <a href={`tel:${data.contact.phone}`}>{data.contact.phone}</a>
                </div>
              )}
              {data.contact?.email && (
                <div className={styles.contactItem}>
                  <span className={styles.contactIcon}>✉️</span>
                  <a href={`mailto:${data.contact.email}`}>{data.contact.email}</a>
                </div>
              )}
            </div>

            {/* Hours */}
            {formattedHours && (
              <div className={styles.hours}>
                <h3>Business Hours</h3>
                <div className={styles.hoursGrid}>
                  {formattedHours.map(({ day, hours }) => (
                    <div key={day} className={styles.hoursRow}>
                      <span className={styles.day}>{day}</span>
                      <span className={styles.time}>{hours}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Additional Info */}
          {(data.contact?.parking || data.contact?.publicTransit) && (
            <div className={styles.accessInfo}>
              {data.contact.parking && (
                <div className={styles.accessItem}>
                  <span>🅿️</span> {data.contact.parking}
                </div>
              )}
              {data.contact.publicTransit && (
                <div className={styles.accessItem}>
                  <span>🚌</span> {data.contact.publicTransit}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Social Links */}
        {(data.social?.facebook || data.social?.instagram || data.social?.googleBusiness) && (
          <section className={styles.social}>
            <h2>Follow Us</h2>
            <div className={styles.socialLinks}>
              {data.social?.facebook && (
                <a href={data.social.facebook} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                  📘 Facebook
                </a>
              )}
              {data.social?.instagram && (
                <a href={data.social.instagram} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                  📸 Instagram
                </a>
              )}
              {data.social?.googleBusiness && (
                <a href={data.social.googleBusiness} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                  🌟 Google Reviews
                </a>
              )}
              {data.social?.tiktok && (
                <a href={data.social.tiktok} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                  🎵 TikTok
                </a>
              )}
              {data.social?.youtube && (
                <a href={data.social.youtube} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                  ▶️ YouTube
                </a>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className={styles.footer} style={{ backgroundColor: colors.primary }}>
          <div className={styles.footerContent}>
            <p>&copy; {new Date().getFullYear()} {data.identity?.name || 'Your Business'}</p>
            <p className={styles.poweredBy}>
              Powered by <strong>KitchenCommand</strong>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
