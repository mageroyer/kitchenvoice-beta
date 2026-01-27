/**
 * PublicStorePage
 *
 * Public-facing store website that displays recipes marked as public.
 * No authentication required - anyone can view.
 *
 * URL: /s/{slug}
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../services/database/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import styles from '../styles/pages/publicstore.module.css';

// Template color schemes
const TEMPLATES = {
  marche: {
    name: 'Marché',
    fonts: {
      heading: "'Playfair Display', Georgia, serif",
      body: "'Source Sans Pro', -apple-system, sans-serif"
    }
  }
};

export default function PublicStorePage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [store, setStore] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (slug) {
      loadStoreData();
    }
  }, [slug]);

  const loadStoreData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Find the store by slug
      const slugRef = doc(db, 'slugs', slug);
      const slugSnap = await getDoc(slugRef);

      if (!slugSnap.exists()) {
        setError('Store not found');
        setLoading(false);
        return;
      }

      const storeId = slugSnap.data().storeId;

      // 2. Get website settings
      const settingsRef = doc(db, 'stores', storeId, 'settings', 'website');
      const settingsSnap = await getDoc(settingsRef);

      if (!settingsSnap.exists() || !settingsSnap.data().enabled) {
        setError('This store website is not available');
        setLoading(false);
        return;
      }

      const settingsData = settingsSnap.data();
      setSettings(settingsData);

      // 3. Get public recipes
      const recipesRef = collection(db, 'stores', storeId, 'publicRecipes');
      const recipesSnap = await getDocs(recipesRef);

      const recipeList = [];
      recipesSnap.forEach(doc => {
        const data = doc.data();
        if (data.public?.isVisible) {
          recipeList.push({ id: doc.id, ...data });
        }
      });

      // Sort by category and then by sortOrder
      recipeList.sort((a, b) => {
        const catA = a.public?.displayCategory || 'Other';
        const catB = b.public?.displayCategory || 'Other';
        if (catA !== catB) return catA.localeCompare(catB);
        return (a.public?.sortOrder || 0) - (b.public?.sortOrder || 0);
      });

      setRecipes(recipeList);
      setStore({ id: storeId, ...settingsData });

    } catch (err) {
      console.error('Error loading store:', err);
      setError('Failed to load store');
    } finally {
      setLoading(false);
    }
  };

  // Group recipes by category
  const getRecipesByCategory = () => {
    const categories = {};
    const categoryOrder = settings?.displayCategories || [];

    recipes.forEach(recipe => {
      const cat = recipe.public?.displayCategory || 'Other';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(recipe);
    });

    // Sort categories by displayCategories order
    const sortedCategories = [];
    categoryOrder.forEach(cat => {
      if (categories[cat]) {
        sortedCategories.push({ name: cat, recipes: categories[cat] });
        delete categories[cat];
      }
    });

    // Add remaining categories
    Object.keys(categories).sort().forEach(cat => {
      sortedCategories.push({ name: cat, recipes: categories[cat] });
    });

    return sortedCategories;
  };

  // Get today's menu items
  const getTodayMenu = () => {
    return recipes.filter(r => r.public?.isAvailableToday);
  };

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorPage}>
        <h1>404</h1>
        <p>{error}</p>
        <Link to="/" className={styles.backLink}>← Back to KitchenCommand</Link>
      </div>
    );
  }

  const template = TEMPLATES[settings?.template] || TEMPLATES.marche;
  const colors = settings?.colors || { primary: '#2C5530', accent: '#D4AF37' };
  const todayMenu = getTodayMenu();
  const categories = getRecipesByCategory();

  return (
    <div
      className={styles.storePage}
      style={{
        '--primary-color': colors.primary,
        '--accent-color': colors.accent,
        '--heading-font': template.fonts.heading,
        '--body-font': template.fonts.body
      }}
    >
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          {settings?.branding?.logo && (
            <img
              src={settings.branding.logo}
              alt="Store logo"
              className={styles.logo}
            />
          )}
          <div className={styles.headerText}>
            <h1 className={styles.storeName}>{settings?.seo?.title || slug}</h1>
            {settings?.branding?.tagline && (
              <p className={styles.tagline}>{settings.branding.tagline}</p>
            )}
          </div>
          {settings?.contact?.phone && (
            <a href={`tel:${settings.contact.phone}`} className={styles.phoneButton}>
              📞 {settings.contact.phone}
            </a>
          )}
        </div>
      </header>

      {/* Hero / Cover Photo */}
      {settings?.branding?.coverPhoto && (
        <div
          className={styles.hero}
          style={{ backgroundImage: `url(${settings.branding.coverPhoto})` }}
        >
          <div className={styles.heroOverlay}>
            <h2>{settings?.branding?.tagline || 'Welcome'}</h2>
          </div>
        </div>
      )}

      <main className={styles.main}>
        {/* Today's Menu */}
        {todayMenu.length > 0 && (
          <section className={styles.todaySection}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.todayBadge}>Menu du Jour</span>
              Available Today
            </h2>
            <div className={styles.todayGrid}>
              {todayMenu.map(recipe => (
                <MenuItemCard
                  key={recipe.id}
                  recipe={recipe}
                  showPrice={settings?.displayOptions?.showPrices}
                  showPhoto={settings?.displayOptions?.showPhotos}
                  featured
                />
              ))}
            </div>
          </section>
        )}

        {/* Categories */}
        {categories.map(category => (
          <section key={category.name} className={styles.categorySection}>
            <h2 className={styles.categoryTitle}>{category.name}</h2>
            <div className={styles.menuGrid}>
              {category.recipes.map(recipe => (
                <MenuItemCard
                  key={recipe.id}
                  recipe={recipe}
                  showPrice={settings?.displayOptions?.showPrices}
                  showPhoto={settings?.displayOptions?.showPhotos}
                />
              ))}
            </div>
          </section>
        ))}

        {recipes.length === 0 && (
          <div className={styles.emptyState}>
            <p>No items available yet. Check back soon!</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          {settings?.contact?.address && (
            <div className={styles.footerSection}>
              <h3>Location</h3>
              <p>{settings.contact.address}</p>
            </div>
          )}
          {settings?.contact?.hours && (
            <div className={styles.footerSection}>
              <h3>Hours</h3>
              <p>{settings.contact.hours}</p>
            </div>
          )}
          {settings?.contact?.phone && (
            <div className={styles.footerSection}>
              <h3>Contact</h3>
              <p>
                <a href={`tel:${settings.contact.phone}`}>{settings.contact.phone}</a>
              </p>
            </div>
          )}
        </div>
        <div className={styles.footerBrand}>
          <p>
            Powered by <a href="https://kitchencommand.io" target="_blank" rel="noopener noreferrer">KitchenCommand</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Menu Item Card Component
 */
function MenuItemCard({ recipe, showPrice = true, showPhoto = true, featured = false }) {
  const publicData = recipe.public || {};

  return (
    <div className={`${styles.menuItem} ${featured ? styles.featured : ''}`}>
      {showPhoto && publicData.photo && (
        <div className={styles.itemPhoto}>
          <img src={publicData.photo} alt={recipe.name} />
        </div>
      )}
      <div className={styles.itemContent}>
        <h3 className={styles.itemName}>{recipe.name}</h3>
        {publicData.description && (
          <p className={styles.itemDescription}>{publicData.description}</p>
        )}
        {publicData.tags?.length > 0 && (
          <div className={styles.itemTags}>
            {publicData.tags.map(tag => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        )}
        {showPrice && publicData.sellingPrice && (
          <p className={styles.itemPrice}>
            ${parseFloat(publicData.sellingPrice).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
