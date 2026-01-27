'use client';

import Image from 'next/image';
import { StoreData, MenuItem } from '@/lib/api';

interface MarcheTemplateProps {
  data: StoreData;
}

/**
 * Marche Template - Classic Quebec Style
 *
 * A warm, traditional design perfect for family grocery stores.
 * Features: card-based menu, prominent hero, category sections.
 */
export default function MarcheTemplate({ data }: MarcheTemplateProps) {
  const { store, menu, settings, seo } = data;

  // Set CSS variables for dynamic colors
  const cssVars = {
    '--color-primary': settings.primaryColor,
    '--color-accent': settings.accentColor,
  } as React.CSSProperties;

  return (
    <div style={cssVars} className="min-h-screen bg-marche-cream">
      {/* Header */}
      <header className="marche-header py-4 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {store.logo && (
              <Image
                src={store.logo}
                alt={store.name}
                width={60}
                height={60}
                className="rounded-full bg-white"
              />
            )}
            <div className="text-white">
              <h1 className="text-2xl font-display font-bold">{store.name}</h1>
              {store.tagline && (
                <p className="text-sm opacity-90">{store.tagline}</p>
              )}
            </div>
          </div>
          {store.phone && (
            <a
              href={`tel:${store.phone.replace(/\D/g, '')}`}
              className="hidden md:flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full transition"
            >
              <PhoneIcon />
              <span>{store.phone}</span>
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      {store.coverPhoto && (
        <div
          className="marche-hero"
          style={{ backgroundImage: `url(${store.coverPhoto})` }}
        >
          <div className="marche-hero-overlay flex items-center justify-center">
            <div className="text-center text-white px-4">
              <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
                {store.name}
              </h2>
              {store.tagline && (
                <p className="text-xl opacity-90">{store.tagline}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today's Menu Section */}
      <TodayMenuSection menu={menu} settings={settings} />

      {/* Menu Categories */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        {menu.categories.map((category) => (
          <CategorySection
            key={category}
            category={category}
            items={menu.items[category] || []}
            settings={settings}
          />
        ))}
      </main>

      {/* About Section */}
      <section className="bg-white py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-3xl font-display font-bold text-gray-800 mb-6">
            A Propos
          </h3>
          <div className="grid md:grid-cols-3 gap-8 text-gray-600">
            {store.address && (
              <div>
                <LocationIcon className="w-8 h-8 mx-auto mb-3 text-primary" />
                <p>{store.address}</p>
              </div>
            )}
            {store.hours && (
              <div>
                <ClockIcon className="w-8 h-8 mx-auto mb-3 text-primary" />
                <p className="whitespace-pre-line">{store.hours}</p>
              </div>
            )}
            {store.phone && (
              <div>
                <PhoneIcon className="w-8 h-8 mx-auto mb-3 text-primary" />
                <a href={`tel:${store.phone.replace(/\D/g, '')}`} className="hover:text-primary">
                  {store.phone}
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

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
            Propulse par{' '}
            <a
              href="https://kitchencommand.io"
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
          Appeler
        </a>
      )}
    </div>
  );
}

// Today's Menu Section
function TodayMenuSection({
  menu,
  settings,
}: {
  menu: StoreData['menu'];
  settings: StoreData['settings'];
}) {
  // Find items marked as available today
  const todayItems: MenuItem[] = [];
  Object.values(menu.items).forEach((items) => {
    items.forEach((item: any) => {
      if (item.isAvailableToday) {
        todayItems.push(item);
      }
    });
  });

  if (todayItems.length === 0) {
    return null;
  }

  return (
    <section className="bg-white py-8 px-4 border-b-4 border-accent">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <span className="today-badge">Menu du Jour</span>
          <span className="text-sm text-gray-500">
            Mis a jour: {new Date(menu.lastUpdated).toLocaleDateString('fr-CA')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {todayItems.slice(0, 8).map((item) => (
            <MenuCard key={item.id} item={item} settings={settings} compact />
          ))}
        </div>
      </div>
    </section>
  );
}

// Category Section
function CategorySection({
  category,
  items,
  settings,
}: {
  category: string;
  items: MenuItem[];
  settings: StoreData['settings'];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="marche-category-title text-2xl font-display font-bold text-gray-800 mb-6">
        {category}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {items.map((item) => (
          <MenuCard key={item.id} item={item} settings={settings} />
        ))}
      </div>
    </section>
  );
}

// Menu Item Card
function MenuCard({
  item,
  settings,
  compact = false,
}: {
  item: MenuItem;
  settings: StoreData['settings'];
  compact?: boolean;
}) {
  return (
    <div className="menu-card">
      {settings.showPhotos && (
        <>
          {item.photo ? (
            <Image
              src={item.photo}
              alt={item.name}
              width={400}
              height={180}
              className="menu-card-image"
            />
          ) : (
            <div className="menu-card-placeholder">
              <span>+</span>
            </div>
          )}
        </>
      )}

      <div className={`p-4 ${compact ? 'p-3' : ''}`}>
        <h3 className={`font-display font-bold text-gray-800 ${compact ? 'text-sm' : 'text-lg'} mb-1`}>
          {item.name}
        </h3>

        {!compact && item.description && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
            {item.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-2">
          {settings.showPrices && item.sellingPrice && (
            <span className="text-lg font-bold text-primary">
              ${item.sellingPrice.toFixed(2)}
            </span>
          )}

          {item.tags && item.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {item.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="tag-chip">
                  {formatTag(tag)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Format tag for display
function formatTag(tag: string): string {
  const labels: Record<string, string> = {
    'vegetarien': 'V',
    'vegan': 'VG',
    'sans-gluten': 'SG',
    'sans-lactose': 'SL',
    'bio': 'Bio',
    'local': 'Local',
    'fait-maison': 'Maison',
  };
  return labels[tag] || tag;
}

// Icons
function PhoneIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function LocationIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ClockIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
