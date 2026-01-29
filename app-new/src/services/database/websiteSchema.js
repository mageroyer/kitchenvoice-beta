/**
 * Website Schema - Complete Food Industry Website Data Structure
 *
 * This schema defines all the data needed to generate a professional
 * food industry website (butcher, bakery, deli, grocery, etc.)
 */

/**
 * Business types supported by the website generator
 */
export const BUSINESS_TYPES = [
  { id: 'butcher', label: 'Butcher / Meat Shop', icon: '🥩' },
  { id: 'bakery', label: 'Bakery / Pastry Shop', icon: '🥐' },
  { id: 'grocery', label: 'Grocery Store', icon: '🛒' },
  { id: 'deli', label: 'Deli / Prepared Foods', icon: '🥪' },
  { id: 'caterer', label: 'Catering Company', icon: '🍽️' },
  { id: 'restaurant', label: 'Restaurant', icon: '🍴' },
  { id: 'foodtruck', label: 'Food Truck', icon: '🚚' },
  { id: 'seafood', label: 'Fish Market / Seafood', icon: '🐟' },
  { id: 'cheese', label: 'Cheese Shop / Fromagerie', icon: '🧀' },
  { id: 'produce', label: 'Produce / Farm Stand', icon: '🥬' },
  { id: 'specialty', label: 'Specialty Foods', icon: '🫒' },
];

/**
 * Certification badges for food businesses
 */
export const CERTIFICATIONS = [
  { id: 'organic', label: 'Certified Organic', icon: '🌿' },
  { id: 'local', label: 'Local Products', icon: '📍' },
  { id: 'halal', label: 'Halal Certified', icon: '☪️' },
  { id: 'kosher', label: 'Kosher Certified', icon: '✡️' },
  { id: 'vegan', label: 'Vegan Options', icon: '🌱' },
  { id: 'glutenfree', label: 'Gluten-Free Options', icon: '🌾' },
  { id: 'sustainable', label: 'Sustainable Practices', icon: '♻️' },
  { id: 'familyowned', label: 'Family Owned', icon: '👨‍👩‍👧‍👦' },
  { id: 'craftsman', label: 'Artisan / Handcrafted', icon: '🤲' },
  { id: 'awardwinning', label: 'Award Winning', icon: '🏆' },
];

/**
 * Template styles
 */
export const TEMPLATES = [
  {
    id: 'marche',
    name: 'Marché',
    subtitle: 'Classic Quebec',
    description: 'Warm, traditional feel perfect for family businesses',
    style: 'classic',
    colors: { primary: '#2C5530', accent: '#D4AF37', background: '#F5F1EB' },
    fonts: { heading: 'Playfair Display', body: 'Source Sans Pro' }
  },
  {
    id: 'moderne',
    name: 'Moderne',
    subtitle: 'Clean & Contemporary',
    description: 'Sleek, minimal design for urban food businesses',
    style: 'modern',
    colors: { primary: '#1A1A1A', accent: '#E63946', background: '#FFFFFF' },
    fonts: { heading: 'Inter', body: 'Inter' }
  },
  {
    id: 'rustique',
    name: 'Rustique',
    subtitle: 'Rustic & Warm',
    description: 'Earthy, handcrafted look for artisan producers',
    style: 'rustic',
    colors: { primary: '#5D4E37', accent: '#C17817', background: '#FAF6F1' },
    fonts: { heading: 'Libre Baskerville', body: 'Lato' }
  },
  {
    id: 'fraicheur',
    name: 'Fraîcheur',
    subtitle: 'Fresh & Vibrant',
    description: 'Bright, energetic design for produce and health foods',
    style: 'fresh',
    colors: { primary: '#2D936C', accent: '#FF6B35', background: '#FFFFFF' },
    fonts: { heading: 'Poppins', body: 'Open Sans' }
  },
];

/**
 * Days of the week for business hours
 */
export const DAYS_OF_WEEK = [
  { id: 'monday', label: 'Monday', labelFr: 'Lundi' },
  { id: 'tuesday', label: 'Tuesday', labelFr: 'Mardi' },
  { id: 'wednesday', label: 'Wednesday', labelFr: 'Mercredi' },
  { id: 'thursday', label: 'Thursday', labelFr: 'Jeudi' },
  { id: 'friday', label: 'Friday', labelFr: 'Vendredi' },
  { id: 'saturday', label: 'Saturday', labelFr: 'Samedi' },
  { id: 'sunday', label: 'Sunday', labelFr: 'Dimanche' },
];

/**
 * Default website data structure
 */
export const DEFAULT_WEBSITE_DATA = {
  // Meta
  version: 1,
  status: 'draft', // 'draft' | 'published' | 'disabled'
  slug: null,
  customDomain: null,
  language: 'fr', // 'fr' | 'en' | 'both'
  createdAt: null,
  updatedAt: null,
  publishedAt: null,

  // Step 1: Business Type
  businessType: null,

  // Step 2: Business Identity
  identity: {
    name: '',
    legalName: '',
    tagline: '',
    yearEstablished: null,
    logo: null,
    favicon: null,
  },

  // Step 3: Brand & Design
  design: {
    template: 'marche',
    colors: {
      primary: '#2C5530',
      accent: '#D4AF37',
      background: '#F5F1EB',
    },
    fonts: {
      heading: 'Playfair Display',
      body: 'Source Sans Pro',
    },
    style: 'classic', // 'classic' | 'modern' | 'rustic' | 'fresh'
  },

  // Step 4: About Section
  about: {
    story: '', // Rich text - company history
    mission: '', // Mission statement
    values: [], // Array of value statements
    established: '', // "Serving Montreal since 1985"

    // Team members
    team: [
      // { name: '', role: '', photo: '', bio: '' }
    ],

    // Certifications & badges
    certifications: [], // Array of certification IDs

    // Awards & recognition
    awards: [
      // { title: '', year: '', description: '' }
    ],
  },

  // Step 5: Contact & Location
  contact: {
    // Primary location
    address: {
      street: '',
      city: '',
      province: 'QC',
      postalCode: '',
      country: 'Canada',
    },

    // Contact methods
    phone: '',
    phoneSecondary: '',
    email: '',

    // Business hours
    hours: {
      monday: { open: '09:00', close: '18:00', closed: false },
      tuesday: { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday: { open: '09:00', close: '18:00', closed: false },
      friday: { open: '09:00', close: '18:00', closed: false },
      saturday: { open: '09:00', close: '17:00', closed: false },
      sunday: { open: null, close: null, closed: true },
    },

    // Special hours (holidays, etc.)
    specialHours: [
      // { date: '2024-12-25', note: 'Closed for Christmas', closed: true }
    ],

    // Location details
    parking: '', // "Free parking behind store"
    transit: '', // "Metro Jarry, Bus 55"
    accessibility: '', // "Wheelchair accessible"

    // Map settings
    mapEnabled: true,
    mapZoom: 15,
    coordinates: { lat: null, lng: null },
  },

  // Step 6: Services
  services: {
    // Catering
    catering: {
      enabled: false,
      description: '',
      minimumOrder: null,
      leadTime: '', // "48 hours notice required"
      menuUrl: null, // PDF or page link
    },

    // Delivery
    delivery: {
      enabled: false,
      description: '',
      areas: '', // "Montreal, Laval, South Shore"
      minimumOrder: null,
      fee: null,
      freeAbove: null, // Free delivery above this amount
    },

    // Custom orders
    customOrders: {
      enabled: false,
      description: '',
      examples: '', // "Custom cakes, party platters"
    },

    // Wholesale
    wholesale: {
      enabled: false,
      description: '',
      contactEmail: '',
    },

    // Gift cards
    giftCards: {
      enabled: false,
      description: '',
      purchaseUrl: '', // External link if applicable
    },

    // Loyalty program
    loyalty: {
      enabled: false,
      name: '', // "La Carte Fidélité"
      description: '',
    },
  },

  // Step 7: Social & Marketing
  social: {
    // Social media links
    facebook: '',
    instagram: '',
    twitter: '',
    youtube: '',
    tiktok: '',
    linkedin: '',

    // Google Business
    googleBusiness: '',
    googlePlaceId: '',

    // Review platforms
    yelp: '',
    tripadvisor: '',

    // Newsletter
    newsletter: {
      enabled: false,
      provider: '', // 'mailchimp' | 'constantcontact' | 'custom'
      formUrl: '',
      signupText: 'Subscribe to our newsletter for specials and updates!',
    },

    // Instagram feed embed
    instagramFeed: {
      enabled: false,
      username: '',
    },
  },

  // Step 8: Gallery
  gallery: {
    // Store photos
    storefront: [], // [{ url, caption, order }]
    interior: [],

    // Team photos
    team: [],

    // Product photos (separate from recipe photos)
    products: [],

    // Behind the scenes
    behindScenes: [],

    // Events
    events: [],

    // Featured/hero images
    hero: {
      homepage: null,
      about: null,
      menu: null,
      contact: null,
    },
  },

  // Step 9: Products & Menu Settings
  menu: {
    // How to display products
    displayStyle: 'grid', // 'grid' | 'list' | 'compact'
    showPrices: true,
    showPhotos: true,
    showDescriptions: true,

    // Categories to display (from recipe categories)
    categories: [], // Ordered list of category IDs

    // Featured products section
    featuredEnabled: true,
    featuredTitle: 'Nos Spécialités',

    // Daily specials
    dailySpecialsEnabled: true,
    dailySpecialsTitle: 'Menu du Jour',

    // Allergen disclaimer
    allergenDisclaimer: 'Please inform our staff of any allergies.',

    // Price format
    currency: 'CAD',
    priceFormat: '$0.00',
  },

  // Step 9: Promotions (Recipe-based)
  promotions: {
    // Recipe promotions (linked to recipes with W=green)
    items: [
      // {
      //   recipeId: number,
      //   recipeName: string,
      //   photo: string (URL),
      //   description: string (promo text),
      //   price: number,
      //   validFrom: string (ISO date),
      //   validTo: string (ISO date),
      //   sortOrder: number
      // }
    ],

    // Carousel settings
    carouselEnabled: true,
    carouselTitle: 'Promotions de la Semaine',
    autoPlay: true,
    autoPlayInterval: 5000, // ms

    // Announcement banner
    banner: {
      enabled: false,
      text: '',
      link: '',
      backgroundColor: '',
    },
  },

  // SEO Settings
  seo: {
    title: '', // "La Marmite | Boucherie & Charcuterie à Montréal"
    description: '', // Meta description
    keywords: [], // Array of keywords
    ogImage: null, // Open Graph image for social sharing

    // Structured data
    schema: {
      type: 'LocalBusiness', // or 'Restaurant', 'Store', etc.
    },
  },

  // Analytics & Tracking
  analytics: {
    googleAnalyticsId: '',
    facebookPixelId: '',
  },

  // Legal
  legal: {
    privacyPolicy: '', // Custom privacy policy text or use default
    termsOfService: '',
    allergenNotice: '',
  },

  // Homepage sections (order and visibility)
  homepage: {
    sections: [
      { id: 'hero', enabled: true, order: 1 },
      { id: 'announcement', enabled: false, order: 2 },
      { id: 'featured', enabled: true, order: 3 },
      { id: 'dailySpecials', enabled: true, order: 4 },
      { id: 'about', enabled: true, order: 5 },
      { id: 'services', enabled: true, order: 6 },
      { id: 'testimonials', enabled: true, order: 7 },
      { id: 'gallery', enabled: true, order: 8 },
      { id: 'location', enabled: true, order: 9 },
      { id: 'newsletter', enabled: false, order: 10 },
    ],
  },

  // Navigation
  navigation: {
    items: [
      { id: 'home', label: 'Accueil', labelEn: 'Home', enabled: true, order: 1 },
      { id: 'menu', label: 'Menu', labelEn: 'Menu', enabled: true, order: 2 },
      { id: 'about', label: 'À Propos', labelEn: 'About', enabled: true, order: 3 },
      { id: 'services', label: 'Services', labelEn: 'Services', enabled: true, order: 4 },
      { id: 'gallery', label: 'Galerie', labelEn: 'Gallery', enabled: true, order: 5 },
      { id: 'contact', label: 'Contact', labelEn: 'Contact', enabled: true, order: 6 },
    ],
    style: 'horizontal', // 'horizontal' | 'hamburger' | 'sidebar'
    sticky: true,
    transparent: false, // Transparent on hero
  },

  // Footer
  footer: {
    showHours: true,
    showMap: false,
    showNewsletter: true,
    showSocial: true,
    copyrightText: '', // Auto-generated if empty
    poweredBy: true, // Show "Powered by KitchenCommand"
  },
};

/**
 * Wizard step definitions
 */
export const WIZARD_STEPS = [
  {
    id: 'businessType',
    title: 'Business Type',
    titleFr: 'Type d\'entreprise',
    description: 'What type of food business do you have?',
    descriptionFr: 'Quel type d\'entreprise alimentaire avez-vous?',
    icon: '🏪',
  },
  {
    id: 'identity',
    title: 'Business Identity',
    titleFr: 'Identité',
    description: 'Your business name, logo, and tagline',
    descriptionFr: 'Nom, logo et slogan de votre entreprise',
    icon: '🏷️',
  },
  {
    id: 'design',
    title: 'Brand & Design',
    titleFr: 'Marque & Design',
    description: 'Choose your template and colors',
    descriptionFr: 'Choisissez votre modèle et couleurs',
    icon: '🎨',
  },
  {
    id: 'about',
    title: 'About Your Business',
    titleFr: 'À Propos',
    description: 'Tell your story and showcase your team',
    descriptionFr: 'Racontez votre histoire et présentez votre équipe',
    icon: '📖',
  },
  {
    id: 'contact',
    title: 'Contact & Location',
    titleFr: 'Contact & Emplacement',
    description: 'Address, hours, and how to reach you',
    descriptionFr: 'Adresse, horaires et coordonnées',
    icon: '📍',
  },
  {
    id: 'services',
    title: 'Services',
    titleFr: 'Services',
    description: 'Catering, delivery, custom orders',
    descriptionFr: 'Traiteur, livraison, commandes spéciales',
    icon: '🛎️',
  },
  {
    id: 'social',
    title: 'Social & Marketing',
    titleFr: 'Réseaux Sociaux',
    description: 'Connect your social media accounts',
    descriptionFr: 'Connectez vos réseaux sociaux',
    icon: '📱',
  },
  {
    id: 'gallery',
    title: 'Gallery',
    titleFr: 'Galerie',
    description: 'Upload photos of your store and products',
    descriptionFr: 'Téléchargez des photos de votre commerce',
    icon: '📸',
  },
  {
    id: 'promotions',
    title: 'Promotions',
    titleFr: 'Promotions',
    description: 'Set up weekly promotions from your recipes',
    descriptionFr: 'Configurez vos promotions de la semaine',
    icon: '🏷️',
  },
  {
    id: 'seo',
    title: 'SEO & Domain',
    titleFr: 'SEO & Domaine',
    description: 'Optimize for search and choose your URL',
    descriptionFr: 'Optimisez pour les moteurs de recherche',
    icon: '🔍',
  },
  {
    id: 'review',
    title: 'Review & Publish',
    titleFr: 'Révision & Publication',
    description: 'Preview and launch your website',
    descriptionFr: 'Prévisualisez et publiez votre site',
    icon: '🚀',
  },
];

export default {
  BUSINESS_TYPES,
  CERTIFICATIONS,
  TEMPLATES,
  DAYS_OF_WEEK,
  DEFAULT_WEBSITE_DATA,
  WIZARD_STEPS,
};
