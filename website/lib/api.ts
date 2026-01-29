/**
 * API Client for KitchenCommand Public Website
 *
 * Fetches store data directly from Firestore
 */

import { db } from './firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

export interface StoreData {
  store: {
    name: string;
    tagline: string;
    logo: string | null;
    coverPhoto: string | null;
    phone: string;
    address: string;
    hours: string;
    social: {
      facebook?: string;
      instagram?: string;
    };
  };
  menu: {
    lastUpdated: string;
    categories: string[];
    items: Record<string, MenuItem[]>;
  };
  settings: {
    showPrices: boolean;
    showPhotos: boolean;
    primaryColor: string;
    accentColor: string;
    template: string;
  };
  seo: {
    title: string;
    description: string;
  };
  _raw?: any; // Full website data for template rendering
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  sellingPrice?: number;
  photo?: string | null;
  displayCategory: string;
  tags: string[];
  sortOrder: number;
}

export interface TodayMenuData {
  storeName: string;
  lastUpdated: string;
  items: {
    id: number;
    name: string;
    description?: string;
    price: number | null;
    photo: string | null;
    category: string;
    tags: string[];
  }[];
  settings: {
    showPrices: boolean;
    showPhotos: boolean;
    primaryColor: string;
  };
}

/**
 * Fetch store data by slug from Firestore
 */
export async function getStoreData(slug: string): Promise<StoreData | null> {
  try {
    // First, look up the slug to find the store ID
    const slugDoc = await getDoc(doc(db, 'slugs', slug));

    if (!slugDoc.exists()) {
      console.log(`Slug '${slug}' not found`);
      return null;
    }

    const slugData = slugDoc.data();
    const storeId = slugData.storeId; // e.g., "store_abc123"

    if (!storeId) {
      console.log(`No storeId for slug '${slug}'`);
      return null;
    }

    // Fetch the website data
    const websiteDoc = await getDoc(doc(db, 'stores', storeId, 'website', 'data'));

    if (!websiteDoc.exists()) {
      console.log(`Website data not found for store '${storeId}'`);
      return null;
    }

    const websiteData = websiteDoc.data();

    // Transform to StoreData format
    return transformWebsiteData(websiteData, slug);
  } catch (error) {
    console.error('Failed to fetch store data:', error);
    return null;
  }
}

/**
 * Transform website data from Firestore to StoreData format
 */
function transformWebsiteData(data: any, slug: string): StoreData {
  const identity = data.identity || {};
  const contact = data.contact || {};
  const design = data.design || {};
  const seoData = data.seo || {};
  const gallery = data.gallery || {};
  const social = data.social || {};
  const about = data.about || {};
  const services = data.services || {};

  // Format address
  const address = contact.address || {};
  const formattedAddress = address.street
    ? `${address.street}, ${address.city || ''}, ${address.province || ''} ${address.postalCode || ''}`.trim()
    : '';

  // Format hours
  const hours = contact.hours || {};
  const hoursString = formatHours(hours);

  return {
    store: {
      name: identity.name || 'Untitled Store',
      tagline: identity.tagline || '',
      logo: identity.logo || null,
      coverPhoto: gallery.hero?.homepage || null,
      phone: contact.phone || '',
      address: formattedAddress,
      hours: hoursString,
      social: {
        facebook: social.facebook || undefined,
        instagram: social.instagram || undefined,
      },
    },
    menu: {
      lastUpdated: new Date().toISOString(),
      categories: [],
      items: {},
    },
    settings: {
      showPrices: true,
      showPhotos: true,
      primaryColor: design.colors?.primary || '#2C5530',
      accentColor: design.colors?.accent || '#D4AF37',
      template: design.template || 'marche',
    },
    seo: {
      title: seoData.title || identity.name || '',
      description: seoData.description || identity.tagline || '',
    },
    // Pass full data for template rendering
    _raw: {
      about,
      services,
      gallery,
      contact,
      social,
      identity,
      design,
      promotions: data.promotions || {},
      businessType: data.businessType,
    },
  };
}

/**
 * Format hours object to string
 */
function formatHours(hours: any): string {
  if (!hours) return '';

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const formatted: string[] = [];

  for (const day of days) {
    const dayHours = hours[day];
    if (dayHours && !dayHours.closed && dayHours.open && dayHours.close) {
      formatted.push(`${day.charAt(0).toUpperCase() + day.slice(1, 3)}: ${dayHours.open}-${dayHours.close}`);
    }
  }

  return formatted.join(', ');
}

/**
 * Fetch today's menu items (placeholder - will integrate with recipes later)
 */
export async function getTodayMenu(slug: string): Promise<TodayMenuData | null> {
  // For now, return null - will implement when recipes are integrated
  return null;
}

/**
 * Check if a slug is available
 */
export async function checkSlugAvailability(slug: string): Promise<boolean> {
  try {
    const slugDoc = await getDoc(doc(db, 'slugs', slug));
    return !slugDoc.exists();
  } catch (error) {
    console.error('Failed to check slug:', error);
    return false;
  }
}
