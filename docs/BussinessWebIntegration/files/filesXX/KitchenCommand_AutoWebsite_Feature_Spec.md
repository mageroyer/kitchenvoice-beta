# KitchenCommand: Auto-Website Feature
## Product Specification & Implementation Guide

**Version:** 1.0  
**Date:** January 27, 2026  
**Status:** Proposed Feature  

---

## Executive Summary

KitchenCommand will offer **automatic website generation** for grocery stores with production kitchens. When a store marks a recipe as "public" and "available today," it instantly appears on their auto-generated website. Zero web skills required.

**Value Proposition:**
> "We don't just track your recipes — we turn them into a live website that updates itself."

---

## The Problem We Solve

### Current Reality for Small Grocery Production Kitchens

```
DAILY PAIN POINTS
═══════════════════════════════════════════════════════════════

❌ No website at all (or outdated one from 2015)
❌ PDF menus emailed to customers (always outdated)
❌ Chalkboard specials that customers can't see remotely
❌ Facebook posts that take 20 minutes to write
❌ Double/triple data entry:
   • Write recipe for kitchen
   • Write description for Facebook
   • Update website (if they have one)
   • Update Google Business listing

RESULT: Most don't bother. Customers don't know what's available.
```

### Why Existing Solutions Fail

| Solution | Problem |
|----------|---------|
| Wix/Squarespace | Too complex, requires manual updates |
| Facebook Page | Algorithm buries posts, not searchable |
| Google Business | Limited menu options, manual updates |
| No website | Invisible to new customers |

---

## Our Solution: One-Click Website Publishing

### The Magic Workflow

```
BEFORE (Multiple Steps, Multiple Platforms)
═══════════════════════════════════════════

Chef makes Pâté Chinois
       ↓
Writes on chalkboard ──────────────► In-store only
       ↓
Opens Facebook ─────────────────────► Takes 15 min
       ↓
Updates website ────────────────────► If they remember
       ↓
Updates Google ─────────────────────► Never happens

TOTAL TIME: 30-45 minutes
ACTUAL REACH: Maybe 10% of customers


AFTER (KitchenCommand Auto-Website)
═══════════════════════════════════

Chef makes Pâté Chinois
       ↓
Opens KitchenCommand app
       ↓
Toggles "Available Today" ✓
       ↓
[Optional] Snaps photo 📸
       ↓
DONE.

Website auto-updates in real-time.
Google can index it.
Customers see it immediately.

TOTAL TIME: 30 seconds
ACTUAL REACH: Anyone with internet
```

---

## Feature Specification

### 1. New Recipe Fields

```javascript
// Additions to existing Recipe model

const recipeSchema = {
  // ... existing fields (name, ingredients, method, etc.)
  
  // NEW: Public Website Fields
  public: {
    isVisible: Boolean,        // Show on public website?
    isAvailableToday: Boolean, // Show in "Today's Menu"?
    sellingPrice: Number,      // Customer-facing price (separate from cost)
    description: String,       // Customer-friendly description
    photo: String,             // URL to dish photo
    displayCategory: String,   // "Comptoir Chaud", "Boucherie", "Pâtisserie"
    tags: [String],            // ["végétarien", "sans gluten", "nouveau"]
    sortOrder: Number,         // Display order within category
  }
};
```

### 2. App UI Additions

```
┌─────────────────────────────────────────────────────────────────┐
│ RECIPE EDITOR - New "Website" Tab                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📸 Photo                                    [Add Photo]  │   │
│  │ ┌───────────────────┐                                   │   │
│  │ │                   │                                   │   │
│  │ │   [dish photo]    │                                   │   │
│  │ │                   │                                   │   │
│  │ └───────────────────┘                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Selling Price        [$] [  12.99  ]                          │
│                                                                 │
│  Public Description   (what customers see)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Pâté chinois traditionnel fait maison avec boeuf        │   │
│  │ haché, maïs en crème et purée de pommes de terre.       │   │
│  │ Servi avec salade verte.                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Display Category     [▼ Comptoir Chaud    ]                   │
│                                                                 │
│  Tags                 [végétarien] [sans gluten] [+]           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ ☑ Show on Website   │  │ ☑ Available Today   │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                 │
│  [Preview on Website →]                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Quick Toggle in Recipe List

```
┌─────────────────────────────────────────────────────────────────┐
│ RECIPES - List View with Quick Toggles                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Search: [________________]              [+ New Recipe]         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Recipe              │ Cost  │ Price │ 🌐 Web │ 📅 Today │   │
│  ├─────────────────────┼───────┼───────┼────────┼──────────┤   │
│  │ Pâté Chinois        │ $4.20 │ $12.99│  [✓]   │   [✓]    │   │
│  │ Tourtière           │ $3.80 │ $8.99 │  [✓]   │   [ ]    │   │
│  │ Lasagne maison      │ $5.10 │ $14.99│  [✓]   │   [✓]    │   │
│  │ Sauce à spaghetti   │ $2.40 │ $6.99 │  [ ]   │   [ ]    │   │
│  │ (internal recipe)   │       │       │        │          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Legend: 🌐 = Visible on website | 📅 = In today's menu        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Website Template Design

### Public Website Structure

```
URL: https://[store-slug].kitchencommand.io
     or custom: https://www.epiceriemarie.ca

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     HEADER                               │   │
│  │  🏪 [Store Logo]  ÉPICERIE CHEZ MARIE                   │   │
│  │                                                          │   │
│  │  📍 1234 Rue Saint-Denis, Montréal                      │   │
│  │  📞 514-555-1234                                         │   │
│  │  ⏰ Lun-Sam: 8h-19h | Dim: 9h-17h                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   HERO SECTION                           │   │
│  │                                                          │   │
│  │  [Store photo or daily special highlight]                │   │
│  │                                                          │   │
│  │  "Plats maison préparés avec amour depuis 1987"         │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ════════════════════════════════════════════════════════════  │
│                    📋 MENU DU JOUR                              │
│           Mis à jour: Aujourd'hui à 8h34                       │
│  ════════════════════════════════════════════════════════════  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🍲 COMPTOIR CHAUD                                       │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │                                                          │   │
│  │  ┌──────────┐  Pâté Chinois maison              12,99 $ │   │
│  │  │ [photo]  │  Boeuf haché, maïs en crème,              │   │
│  │  │          │  purée de pommes de terre                 │   │
│  │  └──────────┘  🏷️ Sans gluten                           │   │
│  │                                                          │   │
│  │  ┌──────────┐  Lasagne traditionnelle           14,99 $ │   │
│  │  │ [photo]  │  Boeuf et porc, béchamel maison,          │   │
│  │  │          │  trois fromages gratinés                  │   │
│  │  └──────────┘                                            │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🥩 BOUCHERIE - Spéciaux de la semaine                  │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │                                                          │   │
│  │  ┌──────────┐  Côtes levées BBQ               14,99 $/kg│   │
│  │  │ [photo]  │  Marinées maison, prêtes à cuire          │   │
│  │  └──────────┘                                            │   │
│  │                                                          │   │
│  │  ┌──────────┐  Bavette de boeuf marinée       18,99 $/kg│   │
│  │  │ [photo]  │  Marinade chimichurri                     │   │
│  │  └──────────┘                                            │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🥐 PÂTISSERIE                                           │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │                                                          │   │
│  │  [photo] Tarte aux pommes........... 18,99 $ (entière)  │   │
│  │  [photo] Gâteau au chocolat......... 5,99 $ (portion)   │   │
│  │  [photo] Biscuits à l'avoine........ 1,50 $ (chaque)    │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     FOOTER                               │   │
│  │                                                          │   │
│  │  📍 1234 Rue Saint-Denis, Montréal, QC H2X 3J6          │   │
│  │  📞 514-555-1234 | ✉️ info@epiceriemarie.ca             │   │
│  │                                                          │   │
│  │  [Facebook] [Instagram]                                  │   │
│  │                                                          │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Propulsé par KitchenCommand 🍳                         │   │
│  │  kitchencommand.io                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile-First Design

```
┌───────────────────────┐
│ 🏪 ÉPICERIE MARIE     │
│ ☰                     │
├───────────────────────┤
│                       │
│   📋 MENU DU JOUR     │
│   Mis à jour: 8h34    │
│                       │
├───────────────────────┤
│ 🍲 COMPTOIR CHAUD     │
├───────────────────────┤
│ ┌───────────────────┐ │
│ │                   │ │
│ │     [photo]       │ │
│ │                   │ │
│ └───────────────────┘ │
│ Pâté Chinois   12,99$ │
│ Boeuf, maïs, purée    │
│ 🏷️ Sans gluten        │
├───────────────────────┤
│ ┌───────────────────┐ │
│ │     [photo]       │ │
│ └───────────────────┘ │
│ Lasagne        14,99$ │
│ Boeuf, béchamel       │
├───────────────────────┤
│ 🥩 BOUCHERIE          │
├───────────────────────┤
│        ...            │
└───────────────────────┘
```

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    KITCHENCOMMAND ARCHITECTURE                  │
│                    With Auto-Website Addition                   │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────────┐
                         │   FIREBASE       │
                         │   FIRESTORE      │
                         │                  │
                         │ /stores/{id}/    │
                         │   - profile      │
                         │   - settings     │
                         │   - recipes      │
                         │     - public:{}  │◄─── New nested data
                         │                  │
                         └────────┬─────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  MAIN APP       │  │  PUBLIC API     │  │  WEBSITE        │
    │  (React)        │  │  (Cloud Func)   │  │  (Next.js)      │
    │                 │  │                 │  │                 │
    │  - Full CRUD    │  │  - Read-only    │  │  - SSR/Static   │
    │  - Voice input  │  │  - Public items │  │  - SEO ready    │
    │  - Auth required│  │  - No auth      │  │  - Fast loading │
    │                 │  │  - Cached       │  │                 │
    │  Port: 5173     │  │  (serverless)   │  │  *.kc.io        │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
         │                      │                     │
         │                      │                     │
         └──────────┬───────────┴──────────┬─────────┘
                    │                      │
                    ▼                      ▼
           ┌──────────────┐       ┌──────────────┐
           │   STORAGE    │       │     CDN      │
           │  (Photos)    │       │  (Caching)   │
           │              │       │              │
           │ Firebase     │       │ Cloudflare   │
           │ Storage      │       │ or Firebase  │
           └──────────────┘       └──────────────┘
```

### Database Schema Additions

```javascript
// Firestore Structure

/stores/{storeId}/
  profile: {
    name: "Épicerie Chez Marie",
    slug: "epicerie-marie",           // URL: epicerie-marie.kitchencommand.io
    customDomain: "epiceriemarie.ca", // Optional paid feature
    logo: "https://...",
    coverPhoto: "https://...",
    tagline: "Plats maison depuis 1987",
    address: {
      street: "1234 Rue Saint-Denis",
      city: "Montréal",
      province: "QC",
      postalCode: "H2X 3J6"
    },
    phone: "514-555-1234",
    email: "info@epiceriemarie.ca",
    hours: {
      monday: { open: "08:00", close: "19:00" },
      // ...
    },
    social: {
      facebook: "https://facebook.com/epiceriemarie",
      instagram: "@epiceriemarie"
    }
  },
  
  websiteSettings: {
    enabled: true,
    theme: "classic",              // Future: multiple themes
    primaryColor: "#2c5530",
    showPrices: true,
    showPhotos: true,
    categories: [                  // Display order
      "Comptoir Chaud",
      "Boucherie",
      "Pâtisserie",
      "Épicerie"
    ],
    seoTitle: "Épicerie Chez Marie | Plats Maison Montréal",
    seoDescription: "Découvrez nos plats cuisinés maison...",
    googleAnalyticsId: "UA-XXXXX"  // Optional
  },
  
  /recipes/{recipeId}/
    // ... existing fields ...
    public: {
      isVisible: true,
      isAvailableToday: true,
      sellingPrice: 12.99,
      description: "Pâté chinois traditionnel...",
      photo: "https://storage.../photo.jpg",
      displayCategory: "Comptoir Chaud",
      tags: ["sans gluten"],
      sortOrder: 1,
      lastPublished: Timestamp
    }
```

### Public API Endpoints

```javascript
// Cloud Functions - Public API (No Auth Required)

// GET /api/v1/stores/{slug}
// Returns: Store profile + enabled menu items
{
  "store": {
    "name": "Épicerie Chez Marie",
    "tagline": "Plats maison depuis 1987",
    "address": {...},
    "phone": "514-555-1234",
    "hours": {...},
    "logo": "https://...",
    "coverPhoto": "https://..."
  },
  "menu": {
    "lastUpdated": "2026-01-28T08:34:00Z",
    "categories": [
      {
        "name": "Comptoir Chaud",
        "items": [
          {
            "name": "Pâté Chinois",
            "description": "Boeuf haché, maïs...",
            "price": 12.99,
            "photo": "https://...",
            "tags": ["sans gluten"],
            "availableToday": true
          }
        ]
      }
    ]
  }
}

// GET /api/v1/stores/{slug}/today
// Returns: Only items marked "available today"
// Lighter payload for daily menu displays
```

### Website Technology Stack

```
PUBLIC WEBSITE OPTIONS
══════════════════════

Option A: Next.js (Recommended)
───────────────────────────────
✓ Server-side rendering (SEO)
✓ Incremental static regeneration
✓ Easy deployment (Vercel)
✓ React-based (matches main app)

Option B: Astro
───────────────────────────────
✓ Ultra-fast static sites
✓ Partial hydration
✓ Great for content-heavy sites

Option C: Static HTML + JS
───────────────────────────────
✓ Simplest deployment
✓ Firebase Hosting
✓ Client-side data fetching

RECOMMENDED: Next.js on Vercel
- Wildcard subdomain: *.kitchencommand.io
- Edge caching
- Automatic SSL
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

```
TASKS:
□ Add public fields to recipe schema
□ Create "Website" tab in recipe editor
□ Add quick toggles to recipe list view
□ Create store profile settings page
□ Set up Firebase Storage for photos
□ Build photo upload component

DELIVERABLE: App can mark recipes as public and upload photos
```

### Phase 2: Public API (Week 3)

```
TASKS:
□ Create Cloud Function for public API
□ Implement caching strategy
□ Add rate limiting
□ Create API documentation
□ Test with sample data

DELIVERABLE: Working API that returns public menu data
```

### Phase 3: Website Template (Week 4-5)

```
TASKS:
□ Set up Next.js project
□ Create responsive website template
□ Implement dynamic routing ([slug].kitchencommand.io)
□ Add SEO meta tags
□ Mobile optimization
□ Loading states and error handling

DELIVERABLE: Working website that displays store menu
```

### Phase 4: Polish & Launch (Week 6)

```
TASKS:
□ Website theme customization
□ Custom domain support (optional)
□ Analytics integration
□ Performance optimization
□ Documentation for users
□ Beta testing with real stores

DELIVERABLE: Production-ready feature
```

---

## User Stories

### Store Owner Stories

```
US-1: Mark Recipe as Public
─────────────────────────────
As a store owner,
I want to mark a recipe as visible on my website,
So that customers can see what I offer.

Acceptance Criteria:
- Toggle "Show on Website" in recipe editor
- Recipe appears on public website within 1 minute
- Can toggle off to hide immediately

US-2: Set Today's Menu
─────────────────────────────
As a store owner,
I want to quickly mark which items are available today,
So that customers know what's fresh.

Acceptance Criteria:
- Quick toggle in recipe list view
- Can toggle multiple items rapidly
- "Today's Menu" section on website updates

US-3: Add Dish Photo
─────────────────────────────
As a store owner,
I want to add photos to my dishes,
So that customers see what they're getting.

Acceptance Criteria:
- Can take photo with phone/tablet camera
- Can upload from gallery
- Auto-optimizes for web (compression, sizing)
- Shows on public website

US-4: Set Selling Prices
─────────────────────────────
As a store owner,
I want to set customer-facing prices (separate from cost),
So that I can manage margins while showing public prices.

Acceptance Criteria:
- Selling price field separate from calculated cost
- Margin calculation shown (Price - Cost = Profit)
- Price displayed on website

US-5: Customize My Website
─────────────────────────────
As a store owner,
I want to add my logo, hours, and contact info,
So that my website represents my brand.

Acceptance Criteria:
- Store profile settings page
- Logo upload
- Business hours editor
- Contact information
- Social media links
```

### Customer Stories

```
US-6: View Today's Menu
─────────────────────────────
As a customer,
I want to see what's available today at my local store,
So that I can decide what to buy.

Acceptance Criteria:
- Website shows "Menu du Jour" prominently
- Items marked "available today" are highlighted
- Last updated timestamp visible

US-7: Browse by Category
─────────────────────────────
As a customer,
I want to browse items by category (Comptoir Chaud, Boucherie, etc.),
So that I can find what I'm looking for.

Acceptance Criteria:
- Clear category sections
- Easy navigation on mobile
- Category counts or empty state

US-8: Find Store Information
─────────────────────────────
As a customer,
I want to see store hours, location, and contact info,
So that I can visit or call.

Acceptance Criteria:
- Address with map link
- Phone number (clickable on mobile)
- Business hours
- Social media links
```

---

## Business Model

### Pricing Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│                    KITCHENCOMMAND PRICING                       │
└─────────────────────────────────────────────────────────────────┘

TIER 1: ESSENTIAL                              $49/month
─────────────────────────────────────────────────────────
✓ Recipe management (unlimited)
✓ Voice input (French-Canadian)
✓ Cost calculation
✓ Cloud sync
✗ Public website
✗ Invoice parsing

TIER 2: PROFESSIONAL (Recommended)             $99/month
─────────────────────────────────────────────────────────
✓ Everything in Essential
✓ Public website (yourstore.kitchencommand.io)
✓ Photo uploads (5GB storage)
✓ Invoice parsing (AI-powered)
✓ Basic analytics

TIER 3: ENTERPRISE                             $199/month
─────────────────────────────────────────────────────────
✓ Everything in Professional
✓ Custom domain (yourepicerie.ca)
✓ Remove "Propulsé par" branding
✓ Priority support
✓ Multiple locations
✓ Advanced analytics
✓ API access


ADD-ONS:
─────────────────────────────────────────────────────────
• Extra storage (10GB)                    $10/month
• Custom domain setup                     $50 one-time
• Website theme customization             $200 one-time
```

---

## Competitive Advantage

### Why This Wins

```
COMPETITOR COMPARISON
═══════════════════════════════════════════════════════════════

                        │ Kitchen │ Auto    │ Voice  │ French
                        │ Costing │ Website │ Input  │ Canadian
────────────────────────┼─────────┼─────────┼────────┼──────────
KitchenCommand          │   ✓     │   ✓     │   ✓    │    ✓
────────────────────────┼─────────┼─────────┼────────┼──────────
Wix/Squarespace         │   ✗     │   ✓     │   ✗    │    ~
Recipe Costing Excel    │   ✓     │   ✗     │   ✗    │    ✗
ChefTec                 │   ✓     │   ✗     │   ✗    │    ✗
Generic POS             │   ~     │   ~     │   ✗    │    ~
────────────────────────┴─────────┴─────────┴────────┴──────────

UNIQUE VALUE: Only solution that connects kitchen operations 
              directly to customer-facing website.
```

### Sales Pitch Comparison

```
WITHOUT AUTO-WEBSITE:
─────────────────────────────────────────────
"We help you track recipe costs and manage your kitchen."

Response: "I already have Excel." 😐


WITH AUTO-WEBSITE:
─────────────────────────────────────────────
"We'll build you a professional website that updates 
automatically when you change your menu. Plus you get 
recipe costing and voice input for your kitchen."

Response: "Wait, you'll build my website?!" 🤩
```

---

## Success Metrics

### Key Performance Indicators

```
ADOPTION METRICS
─────────────────────────────────────────────
• % of users who enable website feature
• # of recipes marked as public
• # of photos uploaded
• Website visits per store

ENGAGEMENT METRICS
─────────────────────────────────────────────
• Daily active "toggle today's menu" usage
• Time to first public recipe
• Photo upload rate

BUSINESS METRICS
─────────────────────────────────────────────
• Conversion rate: Essential → Professional tier
• Churn rate comparison (with vs without website)
• Revenue from custom domains
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Store doesn't update menu | Website looks stale | Daily reminder notification, "Last updated" prominent |
| Poor quality photos | Unprofessional look | Photo quality guidance, optional stock photos |
| SEO takes time | Stores expect instant Google traffic | Set expectations, provide SEO tips |
| Custom domain complexity | Support burden | Clear documentation, optional managed service |
| Scaling issues | Slow websites | CDN caching, static generation |

---

## Next Steps

### Immediate Actions

1. **Validate with users**: Show mockups to 3-5 target stores
2. **Technical spike**: Test subdomain wildcard setup
3. **Design**: Create high-fidelity website template mockup
4. **Prioritize**: Confirm Phase 1 scope

### Questions to Resolve

- [ ] Subdomain vs path-based URLs? (store.kc.io vs kc.io/store)
- [ ] Photo storage limits per tier?
- [ ] Support multiple languages on website?
- [ ] Integration with Google Business Profile?

---

## Appendix: Voice Commands for Website

```
PROPOSED VOICE COMMANDS
═══════════════════════════════════════════════════════════════

"Ajouter au menu du jour"
  → Toggles isAvailableToday = true

"Retirer du menu"
  → Toggles isAvailableToday = false

"Publier sur le site"
  → Toggles isVisible = true

"Prix de vente douze quatre-vingt-dix-neuf"
  → Sets sellingPrice = 12.99

"Catégorie comptoir chaud"
  → Sets displayCategory = "Comptoir Chaud"
```

---

**Document Status:** Ready for Review  
**Next Review:** [Date]  
**Owner:** Mage  

---

*KitchenCommand — From kitchen to customer, automatically.* 🍳→🌐
