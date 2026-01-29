# Website Builder - Auto-Generated Public Websites

**Version:** 1.0
**Last Updated:** 2026-01-27
**Status:** Deployed

---

## Overview

The Website Builder feature allows food businesses to create professional public websites through a 10-step wizard. Websites are automatically deployed to `kitchencommand-website.vercel.app/{slug}`.

## Quick Links

| Resource | URL |
|----------|-----|
| **Public Website** | https://kitchencommand-website.vercel.app/{slug} |
| **Vercel Dashboard** | https://vercel.com/dashboard |
| **Firebase Storage** | https://console.firebase.google.com/project/smartcookbook-2afe2/storage |

---

## 10-Step Wizard

### Step 1: Business Type
Select the type of food business:
- Butcher (Boucherie)
- Bakery (Boulangerie)
- Pastry Shop (Patisserie)
- Deli/Charcuterie
- Cheese Shop (Fromagerie)
- Grocery Store (Epicerie)
- Caterer (Traiteur)
- Restaurant
- Cafe/Bistro
- Food Truck
- Market Stall
- Specialty Store

### Step 2: Identity
- **Logo** - Upload store logo (Firebase Storage)
- **Business Name** - Display name on website
- **Tagline** - Short description/slogan
- **Year Established** - Optional founding year

### Step 3: Design
- **Template Selection**:
  - **Marche** - Classic Quebec, warm traditional feel
  - **Urbain** - Modern minimal, clean white
  - **Chaleur** - Bold vibrant colors
- **Color Customization**:
  - Primary color
  - Accent color
  - Background color

### Step 4: About
- **Story** - Business history and description
- **Mission** - Mission statement
- **Certifications** - Halal, Kosher, Organic, Local, Gluten-Free, Vegan, etc.
- **Team Members** - Name, role, photo
- **Awards** - Notable achievements

### Step 5: Contact
- **Phone Number** - Click-to-call on mobile
- **Email** - Contact email
- **Address** - Street, city, province, postal code
- **Business Hours** - Per-day open/close times

### Step 6: Services
Enable/disable with descriptions:
- **Catering** - Event catering services
- **Delivery** - Home delivery options
- **Custom Orders** - Special requests
- **Wholesale** - B2B sales
- **Gift Cards** - Gift card program

### Step 7: Social Media
- Facebook URL
- Instagram URL
- Google Business URL
- Newsletter signup toggle

### Step 8: Gallery
- **Hero Images** - Homepage, about page, menu page backgrounds
- **Store Photos** - Storefront, interior images
- **Product Photos** - Featured items gallery

### Step 9: SEO
- **URL Slug** - `kitchencommand-website.vercel.app/{slug}`
- **Meta Title** - Browser tab title
- **Meta Description** - Search engine description
- **Keywords** - SEO keywords

### Step 10: Review & Publish
- Completion status checklist
- Summary of all settings
- Preview button (in-app preview)
- Publish button

---

## Technical Architecture

### File Structure

```
app-new/src/
├── components/website/
│   ├── WebsiteBuilder.jsx        # Main wizard component
│   └── steps/
│       ├── StepBusinessType.jsx
│       ├── StepIdentity.jsx
│       ├── StepDesign.jsx
│       ├── StepAbout.jsx
│       ├── StepContact.jsx
│       ├── StepServices.jsx
│       ├── StepSocial.jsx
│       ├── StepGallery.jsx
│       ├── StepSEO.jsx
│       └── StepReview.jsx
├── pages/
│   ├── WebsiteBuilderPage.jsx    # Route wrapper
│   └── WebsitePreviewPage.jsx    # In-app preview
├── services/database/
│   ├── websiteSchema.js          # Data structures, constants
│   └── websiteDB.js              # Firestore CRUD operations
└── styles/components/
    └── websitebuilder.module.css

website/                           # Next.js public website
├── app/
│   ├── [slug]/page.tsx           # Dynamic store page
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── templates/
│       └── MarcheTemplate.tsx
├── lib/
│   ├── api.ts                    # Firestore API client
│   └── firebase.ts               # Firebase SDK init
└── .env.local                    # Firebase credentials
```

### Firestore Schema

```
/stores/{storeId}/
└── website/
    └── data                      # WebsiteData document

/slugs/{slug}
└── storeId: string               # Maps slug to store ID
```

### WebsiteData Structure

```typescript
interface WebsiteData {
  // Step 1
  businessType: string;

  // Step 2
  identity: {
    name: string;
    tagline: string;
    logo: string | null;
    yearEstablished: number | null;
  };

  // Step 3
  design: {
    template: 'marche' | 'urbain' | 'chaleur';
    colors: {
      primary: string;
      accent: string;
      background: string;
    };
  };

  // Step 4
  about: {
    story: string;
    mission: string;
    certifications: string[];
    team: TeamMember[];
    awards: Award[];
  };

  // Step 5
  contact: {
    phone: string;
    email: string;
    address: Address;
    hours: BusinessHours;
  };

  // Step 6
  services: {
    catering: ServiceConfig;
    delivery: ServiceConfig;
    customOrders: ServiceConfig;
    wholesale: ServiceConfig;
    giftCards: ServiceConfig;
  };

  // Step 7
  social: {
    facebook: string;
    instagram: string;
    googleBusiness: string;
    newsletter: boolean;
  };

  // Step 8
  gallery: {
    hero: { homepage: string; about: string; menu: string };
    storefront: string[];
    interior: string[];
    products: string[];
  };

  // Step 9
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  slug: string;

  // Metadata
  status: 'draft' | 'published';
  publishedAt: string | null;
  updatedAt: string;
}
```

---

## Firebase Storage

### Paths
- `store-assets/{userId}/logo_{timestamp}.webp` - Store logos
- `store-assets/{userId}/hero_{page}_{timestamp}.webp` - Hero images
- `store-assets/{userId}/gallery_{timestamp}.webp` - Gallery photos

### Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /store-assets/{userId}/{allPaths=**} {
      allow read: if true;  // Public read
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### CORS Configuration
Configured for:
- `http://localhost:5173` (dev)
- `http://localhost:5174` (dev alt)
- `https://smartcookbook-2afe2.web.app` (prod)
- `https://smartcookbook-2afe2.firebaseapp.com` (prod alt)

---

## Public Website (Next.js)

### Deployment
- **Platform**: Vercel
- **URL**: https://kitchencommand-website.vercel.app
- **Framework**: Next.js 14 with App Router
- **Rendering**: ISR (Incremental Static Regeneration) with 5-min revalidation

### Data Fetching
The public website fetches data directly from Firestore:

```typescript
// lib/api.ts
export async function getStoreData(slug: string): Promise<StoreData | null> {
  // 1. Look up slug in /slugs collection
  const slugDoc = await getDoc(doc(db, 'slugs', slug));
  if (!slugDoc.exists()) return null;

  // 2. Get storeId from slug document
  const storeId = slugDoc.data().storeId;

  // 3. Fetch website data from /stores/{storeId}/website/data
  const websiteDoc = await getDoc(doc(db, 'stores', storeId, 'website', 'data'));
  if (!websiteDoc.exists()) return null;

  return transformWebsiteData(websiteDoc.data());
}
```

### Templates

**Marche (Classic Quebec)**
- Colors: Forest green (#2C5530), Cream (#F5F1EB), Gold (#D4AF37)
- Fonts: Playfair Display (headings), Source Sans Pro (body)
- Style: Warm, traditional, family business feel

**Urbain (Modern Minimal)** - *Coming Soon*
- Colors: White, Black, minimal accent
- Fonts: Inter
- Style: Clean, minimal, contemporary

**Chaleur (Bold Vibrant)** - *Coming Soon*
- Colors: Bright, bold primary colors
- Fonts: Poppins
- Style: Energetic, colorful, playful

---

## Usage Flow

### Creating a Website

1. Navigate to Website Builder from Control Panel
2. Complete steps 1-9 (progress saved automatically)
3. Review settings in Step 10
4. Click "Publish Website"

### Publishing Process

When user clicks "Publish":

1. **Reserve Slug**: Create/update `/slugs/{slug}` document
2. **Save Website Data**: Write to `/stores/{storeId}/website/data`
3. **Update Status**: Set `status: 'published'`, `publishedAt: timestamp`
4. **Website Live**: ISR picks up changes within 5 minutes

### Updating a Published Website

1. Make changes in Website Builder
2. Click "Update Website" in Step 10
3. Changes propagate to public website within 5 minutes

---

## Pending Features

### To Resume Later
- [ ] Test full publish flow (slug reservation → public display)
- [ ] Register custom domain (kitchencommand.io)
- [ ] Configure wildcard subdomain on Vercel
- [ ] Add menu/recipes to public website template

### Future Enhancements
- [ ] Additional templates (Urbain, Chaleur)
- [ ] Menu integration (public recipes from app)
- [ ] "Today's Menu" feature
- [ ] Online ordering integration
- [ ] Google Business Profile sync
- [ ] Custom domain support ($199/mo tier)

---

## Troubleshooting

### "Store Not Found" Error
**Cause**: Slug not registered in Firestore `/slugs` collection

**Solution**: User must publish their website through the Website Builder (Step 10)

### Images Not Uploading
**Cause**: CORS configuration or Storage rules

**Solution**:
1. Verify `cors.json` is applied: `gcloud storage buckets describe gs://smartcookbook-2afe2.firebasestorage.app`
2. Verify storage.rules deployed: `firebase deploy --only storage`

### Website Not Updating
**Cause**: Vercel ISR cache (5-minute revalidation)

**Solution**: Wait up to 5 minutes, or trigger revalidation manually in Vercel dashboard

---

*Document maintained by SmartCookBook Development Team*
*Last Updated: 2026-01-27*
