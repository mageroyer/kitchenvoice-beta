'use client';

import Image from 'next/image';
import { StoreData, MenuItem } from '@/lib/api';

interface MarcheTemplateProps {
  data: StoreData;
}

// Certification data (matching the app)
const CERTIFICATIONS: Record<string, { icon: string; label: string }> = {
  'halal': { icon: '☪️', label: 'Halal' },
  'kosher': { icon: '✡️', label: 'Kosher' },
  'organic': { icon: '🌿', label: 'Organic' },
  'local': { icon: '📍', label: 'Local Products' },
  'fair-trade': { icon: '🤝', label: 'Fair Trade' },
  'sustainable': { icon: '♻️', label: 'Sustainable' },
  'family-owned': { icon: '👨‍👩‍👧‍👦', label: 'Family Owned' },
  'artisan': { icon: '🎨', label: 'Artisan' },
  'vegan-options': { icon: '🌱', label: 'Vegan Options' },
  'gluten-free': { icon: '🌾', label: 'Gluten-Free Options' },
};

// Days of week for hours formatting
const DAYS_OF_WEEK = [
  { id: 'monday', label: 'Monday' },
  { id: 'tuesday', label: 'Tuesday' },
  { id: 'wednesday', label: 'Wednesday' },
  { id: 'thursday', label: 'Thursday' },
  { id: 'friday', label: 'Friday' },
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday', label: 'Sunday' },
];

/**
 * Marche Template - Classic Quebec Style (Single Page)
 *
 * Sections: Hero → Certifications → Services → Gallery → Team → About → Contact → Footer
 * Navigation in header scrolls to each section.
 */
export default function MarcheTemplate({ data }: MarcheTemplateProps) {
  const { store, menu, settings, seo, _raw } = data;

  // Extract raw data for full sections
  const about = _raw?.about || {};
  const services = _raw?.services || {};
  const gallery = _raw?.gallery || {};
  const contact = _raw?.contact || {};
  const social = _raw?.social || {};
  const identity = _raw?.identity || {};

  // Set CSS variables for dynamic colors
  const cssVars = {
    '--color-primary': settings.primaryColor,
    '--color-accent': settings.accentColor,
  } as React.CSSProperties;

  // Format hours for display
  const formatHoursTable = (hours: any) => {
    if (!hours) return null;
    return DAYS_OF_WEEK.map(day => {
      const dayHours = hours[day.id];
      if (!dayHours || dayHours.closed) {
        return { day: day.label, hours: 'Closed' };
      }
      return { day: day.label, hours: `${dayHours.open} - ${dayHours.close}` };
    });
  };

  const formattedHours = formatHoursTable(contact?.hours);

  // Check which sections exist
  const hasServices = services?.catering?.enabled ||
    services?.delivery?.enabled ||
    services?.customOrders?.enabled ||
    services?.wholesale?.enabled ||
    services?.giftCards?.enabled;
  // Collect all gallery photos from all categories
  const allGalleryPhotos = [
    ...(gallery?.products || []).map((p: any) => ({ ...p, category: 'product' })),
    ...(gallery?.storefront || []).map((p: any) => ({ ...p, category: 'store' })),
    ...(gallery?.interior || []).map((p: any) => ({ ...p, category: 'interior' })),
    ...(gallery?.behindScenes || []).map((p: any) => ({ ...p, category: 'behind' })),
    ...(gallery?.events || []).map((p: any) => ({ ...p, category: 'event' })),
  ];
  const hasGallery = allGalleryPhotos.length > 0;
  const hasTeam = about?.team?.length > 0;
  const hasAbout = about?.story || about?.mission;
  const hasCertifications = about?.certifications?.length > 0;

  // Build navigation items based on what sections exist
  const navItems = [];
  if (hasServices) navItems.push({ id: 'services', label: 'Services' });
  if (hasGallery) navItems.push({ id: 'gallery', label: 'Gallery' });
  if (hasTeam) navItems.push({ id: 'team', label: 'Team' });
  if (hasAbout) navItems.push({ id: 'about', label: 'About' });
  navItems.push({ id: 'contact', label: 'Contact' });

  return (
    <div style={cssVars} className="min-h-screen bg-marche-cream">
      {/* Header - Sticky Navigation */}
      <header className="marche-header py-3 px-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo & Name */}
          <div className="flex items-center gap-3">
            {store.logo && (
              <Image
                src={store.logo}
                alt={store.name}
                width={50}
                height={50}
                className="rounded-full bg-white"
              />
            )}
            <span className="text-white font-display font-bold text-xl hidden sm:block">
              {store.name}
            </span>
          </div>

          {/* Navigation Menu */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-white/90 hover:text-white font-medium transition"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Phone Button */}
          {store.phone && (
            <a
              href={`tel:${store.phone.replace(/\D/g, '')}`}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full transition"
            >
              <PhoneIcon />
              <span className="hidden sm:inline">{store.phone}</span>
            </a>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero">
        {store.coverPhoto ? (
          <div
            className="marche-hero"
            style={{ backgroundImage: `url(${store.coverPhoto})` }}
          >
            <div className="marche-hero-overlay flex items-center justify-center">
              <div className="text-center text-white px-4">
                <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
                  {store.name}
                </h1>
                {store.tagline && (
                  <p className="text-xl opacity-90">{store.tagline}</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center bg-primary">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
              {store.name}
            </h1>
            {store.tagline && (
              <p className="text-xl text-white/90">{store.tagline}</p>
            )}
          </div>
        )}
      </section>

      {/* Certifications */}
      {hasCertifications && (
        <section className="py-6 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap justify-center gap-3">
              {about.certifications.map((certId: string) => {
                const cert = CERTIFICATIONS[certId];
                return cert ? (
                  <div
                    key={certId}
                    className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm"
                  >
                    <span className="text-lg">{cert.icon}</span>
                    <span className="text-gray-700 font-medium text-sm">{cert.label}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </section>
      )}

      {/* Services Section */}
      {hasServices && (
        <section id="services" className="scroll-mt-16">
          {/* Section Banner */}
          {gallery?.hero?.menu && (
            <SectionBanner image={gallery.hero.menu} title="Our Services" />
          )}
          <div className={`py-12 px-4 bg-white ${!gallery?.hero?.menu ? 'pt-16' : ''}`}>
            <div className="max-w-5xl mx-auto">
              {!gallery?.hero?.menu && (
                <h2 className="text-3xl font-display font-bold text-gray-800 mb-8 text-center">
                  Our Services
                </h2>
              )}
              <div className="grid md:grid-cols-3 gap-6">
                {services?.catering?.enabled && (
                  <ServiceCard
                    icon="🍽️"
                    title="Catering"
                    description={services.catering.description || 'Professional catering for all occasions'}
                  />
                )}
                {services?.delivery?.enabled && (
                  <ServiceCard
                    icon="🚚"
                    title="Delivery"
                    description={services.delivery.description || 'Fresh delivery to your door'}
                    note={services.delivery.radius ? `Delivery radius: ${services.delivery.radius} km` : undefined}
                  />
                )}
                {services?.customOrders?.enabled && (
                  <ServiceCard
                    icon="📝"
                    title="Custom Orders"
                    description={services.customOrders.description || 'Special orders made to your specifications'}
                  />
                )}
                {services?.wholesale?.enabled && (
                  <ServiceCard
                    icon="📦"
                    title="Wholesale"
                    description={services.wholesale.description || 'Wholesale pricing for businesses'}
                  />
                )}
                {services?.giftCards?.enabled && (
                  <ServiceCard
                    icon="🎁"
                    title="Gift Cards"
                    description="The perfect gift for food lovers"
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Gallery Section */}
      {hasGallery && (
        <section id="gallery" className="scroll-mt-16">
          {/* Section Banner */}
          {gallery?.hero?.about && (
            <SectionBanner image={gallery.hero.about} title="Gallery" />
          )}
          <div className={`py-12 px-4 bg-gray-50 ${!gallery?.hero?.about ? 'pt-16' : ''}`}>
            <div className="max-w-5xl mx-auto">
              {!gallery?.hero?.about && (
                <h2 className="text-3xl font-display font-bold text-gray-800 mb-8 text-center">
                  Gallery
                </h2>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {allGalleryPhotos.map((photo: any, i: number) => (
                  <div key={`${photo.category}-${i}`} className="aspect-square rounded-lg overflow-hidden shadow-md">
                    <Image
                      src={photo.url}
                      alt={photo.caption || photo.category}
                      width={300}
                      height={300}
                      className="w-full h-full object-cover hover:scale-105 transition duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Team Section */}
      {hasTeam && (
        <section id="team" className="scroll-mt-16">
          <div className="py-12 px-4 bg-white">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-display font-bold text-gray-800 mb-8 text-center">
                Meet Our Team
              </h2>
              <div className="grid md:grid-cols-3 gap-8 justify-items-center">
                {about.team.map((member: any, i: number) => (
                  <div key={i} className="text-center">
                    {member.photo ? (
                      <Image
                        src={member.photo}
                        alt={member.name}
                        width={150}
                        height={150}
                        className="w-32 h-32 rounded-full mx-auto mb-4 object-cover shadow-lg"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full mx-auto mb-4 bg-gray-200 flex items-center justify-center text-4xl text-gray-400 shadow-lg">
                        👤
                      </div>
                    )}
                    <h3 className="font-display font-bold text-lg text-primary">{member.name}</h3>
                    {member.role && <p className="text-gray-500">{member.role}</p>}
                    {member.bio && <p className="text-sm text-gray-600 mt-2">{member.bio}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* About Section (moved before Contact) */}
      {hasAbout && (
        <section id="about" className="scroll-mt-16">
          {/* Section Banner */}
          {gallery?.hero?.contact && (
            <SectionBanner image={gallery.hero.contact} title="About Us" />
          )}
          <div className={`py-12 px-4 bg-gray-50 ${!gallery?.hero?.contact ? 'pt-16' : ''}`}>
            <div className="max-w-4xl mx-auto text-center">
              {!gallery?.hero?.contact && (
                <h2 className="text-3xl font-display font-bold text-gray-800 mb-6">
                  About Us
                </h2>
              )}
              {identity?.yearEstablished && (
                <p className="text-primary font-medium mb-4">
                  Serving our community since {identity.yearEstablished}
                </p>
              )}
              {about?.story && (
                <p className="text-gray-600 text-lg mb-6 leading-relaxed">
                  {about.story}
                </p>
              )}
              {about?.mission && (
                <div className="bg-primary text-white py-4 px-6 rounded-lg inline-block">
                  <strong>Our Mission:</strong> {about.mission}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section id="contact" className="scroll-mt-16">
        <div className="py-12 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-display font-bold text-gray-800 mb-8 text-center">
              Contact Us
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Contact Info */}
              <div className="space-y-4">
                {contact?.address?.street && (
                  <div className="flex items-start gap-3">
                    <span className="text-2xl text-primary">📍</span>
                    <div>
                      <p className="font-medium">{contact.address.street}</p>
                      <p className="text-gray-600">
                        {contact.address.city}, {contact.address.province} {contact.address.postalCode}
                      </p>
                    </div>
                  </div>
                )}
                {contact?.phone && (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl text-primary">📞</span>
                    <a href={`tel:${contact.phone}`} className="text-primary hover:underline font-medium">
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact?.email && (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl text-primary">✉️</span>
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                      {contact.email}
                    </a>
                  </div>
                )}

                {/* Additional Info */}
                {(contact?.parking || contact?.publicTransit) && (
                  <div className="pt-4 border-t border-gray-200 space-y-2">
                    {contact.parking && (
                      <p className="text-sm text-gray-600">🅿️ {contact.parking}</p>
                    )}
                    {contact.publicTransit && (
                      <p className="text-sm text-gray-600">🚌 {contact.publicTransit}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Hours */}
              {formattedHours && (
                <div>
                  <h3 className="font-display font-bold text-lg mb-4 text-primary">Business Hours</h3>
                  <div className="space-y-2">
                    {formattedHours.map(({ day, hours }) => (
                      <div key={day} className="flex justify-between py-1 border-b border-gray-100">
                        <span className="text-gray-700">{day}</span>
                        <span className={hours === 'Closed' ? 'text-gray-400' : 'text-gray-800 font-medium'}>
                          {hours}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Social Links */}
      {(social?.facebook || social?.instagram || social?.googleBusiness || social?.tiktok || social?.youtube) && (
        <section className="py-8 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-xl font-display font-bold text-gray-800 mb-4">Follow Us</h3>
            <div className="flex flex-wrap justify-center gap-4">
              {social?.facebook && (
                <a
                  href={social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition"
                >
                  <FacebookIcon className="w-5 h-5" /> Facebook
                </a>
              )}
              {social?.instagram && (
                <a
                  href={social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-pink-600 text-white px-4 py-2 rounded-full hover:bg-pink-700 transition"
                >
                  <InstagramIcon className="w-5 h-5" /> Instagram
                </a>
              )}
              {social?.googleBusiness && (
                <a
                  href={social.googleBusiness}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-yellow-500 text-white px-4 py-2 rounded-full hover:bg-yellow-600 transition"
                >
                  🌟 Google Reviews
                </a>
              )}
              {social?.tiktok && (
                <a
                  href={social.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition"
                >
                  🎵 TikTok
                </a>
              )}
              {social?.youtube && (
                <a
                  href={social.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition"
                >
                  ▶️ YouTube
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="marche-footer py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <p className="font-display text-lg">{store.name}</p>
            {store.address && (
              <p className="text-sm opacity-80">{store.address}</p>
            )}
          </div>

          {(store.social?.facebook || store.social?.instagram) && (
            <div className="flex gap-4">
              {store.social.facebook && (
                <a
                  href={store.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80"
                >
                  <FacebookIcon className="w-6 h-6" />
                </a>
              )}
              {store.social.instagram && (
                <a
                  href={store.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80"
                >
                  <InstagramIcon className="w-6 h-6" />
                </a>
              )}
            </div>
          )}

          <p className="text-sm opacity-60">
            Powered by{' '}
            <a
              href="https://smartcookbook-2afe2.web.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-100"
            >
              KitchenCommand
            </a>
          </p>
        </div>
      </footer>

      {/* Mobile Call Button */}
      {store.phone && (
        <a
          href={`tel:${store.phone.replace(/\D/g, '')}`}
          className="call-button md:hidden"
        >
          <PhoneIcon className="w-5 h-5" />
          Call
        </a>
      )}

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40 pb-safe">
        <div className="flex justify-around py-2">
          {navItems.slice(0, 5).map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex flex-col items-center text-xs text-gray-600 hover:text-primary"
            >
              <span className="text-lg mb-1">
                {item.id === 'services' && '🍽️'}
                {item.id === 'gallery' && '📷'}
                {item.id === 'team' && '👥'}
                {item.id === 'about' && 'ℹ️'}
                {item.id === 'contact' && '📞'}
              </span>
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

// Section Banner Component
function SectionBanner({ image, title }: { image: string; title: string }) {
  return (
    <div
      className="h-48 md:h-56 bg-cover bg-center relative"
      style={{ backgroundImage: `url(${image})` }}
    >
      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-white">
          {title}
        </h2>
      </div>
    </div>
  );
}

// Service Card Component
function ServiceCard({
  icon,
  title,
  description,
  note,
}: {
  icon: string;
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-6 text-center hover:shadow-md transition">
      <span className="text-4xl mb-4 block">{icon}</span>
      <h3 className="font-display font-bold text-lg text-primary mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
      {note && <p className="text-xs text-gray-400 mt-2">{note}</p>}
    </div>
  );
}

// Icons
function PhoneIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function FacebookIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.5 3.44 9.5 5.32v2.15h-3v4h3v12h5v-12h3.85l.42-4z" />
    </svg>
  );
}

function InstagramIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}
