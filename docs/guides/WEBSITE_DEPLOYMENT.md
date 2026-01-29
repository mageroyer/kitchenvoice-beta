# KitchenCommand Website Deployment Guide

This document describes how to deploy and configure the auto-generated public websites feature.

## Architecture Overview

```
┌─────────────────────────┐      ┌──────────────────────┐
│  Next.js Website        │      │  Firebase Cloud      │
│  (Vercel)               │ ───> │  Functions           │
│  *.kitchencommand.io    │      │  /publicStore        │
└─────────────────────────┘      │  /publicStoreToday   │
                                 │  /checkSlug          │
                                 └──────────────────────┘
                                          │
                                          v
                                 ┌──────────────────────┐
                                 │  Firebase Firestore  │
                                 │  /stores/{storeId}   │
                                 │  /slugs/{slug}       │
                                 └──────────────────────┘
```

## Prerequisites

1. Vercel account
2. Domain: `kitchencommand.io`
3. Firebase project with Firestore and Cloud Functions

## Step 1: Deploy Cloud Functions

The public API endpoints must be deployed first:

```bash
cd functions
npm install
firebase deploy --only functions:publicStore,functions:publicStoreToday,functions:checkSlug
```

### Test the endpoints:

```bash
# Check slug availability
curl "https://us-central1-smartcookbook-2afe2.cloudfunctions.net/checkSlug?slug=demo-store"

# Should return: {"available": true} or {"available": false}
```

## Step 2: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

This adds rules for the `/stores` and `/slugs` collections.

## Step 3: Deploy Next.js Website to Vercel

### Option A: Via Vercel CLI

```bash
cd website
npm install
npx vercel
```

### Option B: Via GitHub Integration

1. Push the `website/` directory to GitHub
2. Import the project in Vercel Dashboard
3. Set root directory to `website`
4. Deploy

### Environment Variables

Set in Vercel Dashboard:
- `NEXT_PUBLIC_API_URL`: `https://us-central1-smartcookbook-2afe2.cloudfunctions.net`

## Step 4: Domain Configuration

### 4.1 Register Domain

Purchase `kitchencommand.io` from a registrar (Namecheap, Google Domains, etc.)

### 4.2 Configure DNS

Add these DNS records:

| Type  | Name | Value                    |
|-------|------|--------------------------|
| A     | @    | 76.76.21.21              |
| CNAME | *    | cname.vercel-dns.com.    |

Note: The wildcard CNAME enables `*.kitchencommand.io` subdomains.

### 4.3 Add Domain to Vercel

1. Go to Vercel Dashboard > Project > Settings > Domains
2. Add `kitchencommand.io`
3. Add `*.kitchencommand.io` (wildcard)
4. Verify DNS propagation

### 4.4 SSL Certificate

Vercel automatically provisions SSL certificates for:
- `kitchencommand.io`
- `*.kitchencommand.io`

## Step 5: Testing

### Test a store website:

1. In the app, enable website and set a slug (e.g., "demo-store")
2. Mark some recipes as public
3. Visit `https://demo-store.kitchencommand.io`

### Verify ISR (Incremental Static Regeneration):

- First visit generates the page
- Subsequent visits use cached version
- Cache invalidates every 5 minutes

## Monitoring

### Vercel Analytics

Enable in Vercel Dashboard > Analytics for:
- Page views
- Load times
- Errors

### Cloud Functions Logs

```bash
firebase functions:log --only publicStore
```

## Rate Limiting

The public API is protected by:
- Firestore read limits
- Cloud Functions CPU/memory limits
- Browser caching (5 minutes)

For high-traffic stores, consider:
- Increasing ISR revalidation time
- Adding a CDN layer

## Troubleshooting

### "Store not found" error

1. Check the slug exists in `/slugs` collection
2. Verify the store document exists at `/stores/store_{uid}`
3. Ensure `websiteSettings.enabled = true`

### Images not loading

1. Verify Firebase Storage URL format
2. Check `next.config.js` has correct `remotePatterns`
3. Confirm image exists in Storage

### Styles not applying

1. Clear browser cache
2. Check CSS variables are set
3. Verify TailwindCSS is processing correctly

## Security Considerations

- Public recipes only include display-safe fields
- Cost/pricing data is never exposed
- Recipe methods/ingredients are private
- Store owner UID is not exposed in public API

---

*Last Updated: 2026-01-27*
