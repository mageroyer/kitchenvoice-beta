# SmartCookBook - Pitch Presentation for Ashton

## Executive Summary

**SmartCookBook** is a voice-powered kitchen management platform designed specifically for high-volume restaurant operations. Built to eliminate paper recipes, streamline production, and provide real-time cost control - all hands-free.

---

## The Problem Ashton Faces

| Challenge | Impact |
|-----------|--------|
| Paper recipes get dirty, lost, inconsistent | Quality variance, training delays |
| Manual inventory counts are slow and error-prone | Stockouts, over-ordering, waste |
| No real-time food cost visibility | Margin erosion discovered too late |
| Staff training takes too long | High turnover costs |
| Order taking relies on separate systems | Disconnected data, manual reconciliation |

---

## The SmartCookBook Solution

### 1. Voice-Powered Recipe System

**Hands-free operation for busy kitchens**

- Dictate recipes directly - no typing required
- Voice search: "Show me poutine sauce recipe"
- Voice navigation through method steps
- Works in French Canadian (fr-CA) - native Quebec speech recognition
- Google Cloud Speech-to-Text V2 with 98%+ accuracy

**How it works:**
```
Chef speaks: "500 grammes de boeuf haché, 2 oignons émincés,
              3 gousses d'ail, sel et poivre au goût"

System automatically parses into:
  - 500g boeuf haché
  - 2 unt oignons (émincés)
  - 3 gousse ail
  - sel (au goût)
  - poivre (au goût)
```

---

### 2. Intelligent Recipe Scaling

**From prep cook to banquet - instant scaling**

| Feature | Benefit |
|---------|---------|
| Base Portion (BP) | Original recipe for 4 portions |
| Target Portion (TP) | Scale to 50 portions instantly |
| Metric measurements | Professional kitchen standards (g, kg, ml, L) |
| Tool measurements | Practical equivalents (cups, spoons, cans) |

**Example:**
- Recipe: Sauce Poutine (BP: 10 portions)
- Lunch rush needs 85 portions
- One tap: all ingredients scaled automatically
- No math errors, no recipe failures

---

### 3. Ingredient Database & Cost Control

**Real-time food cost at your fingertips**

```
Recipe: Classic Poutine
─────────────────────────────────────
Ingredient          Qty      Cost
─────────────────────────────────────
Frites maison       350g     $0.45
Fromage en grains   150g     $1.20
Sauce poutine       125ml    $0.35
─────────────────────────────────────
Food Cost/Portion:           $2.00
Menu Price:                  $12.95
Food Cost %:                 15.4%
```

**Features:**
- Link recipe ingredients to master database
- Prices update automatically from invoices
- Track cost fluctuations over time
- Identify margin erosion before it hurts

---

### 4. Invoice Processing & Price Updates

**Scan it, parse it, update prices automatically**

1. Upload supplier invoice (PDF or photo)
2. AI extracts all line items automatically
3. Prices update in ingredient database
4. Recipe costs recalculate instantly

**Supported suppliers:**
- Sysco, GFS, La Maison du Gibier
- Any supplier invoice format
- Claude AI adapts to new formats

---

### 5. Production & Task Management

**Assign, track, and measure kitchen production**

| Role | Capabilities |
|------|-------------|
| **Chef/Owner** | Assign tasks, view all departments, track costs |
| **Line Cook** | See assigned tasks, mark progress, log completion |
| **Prep Cook** | Prep lists with exact quantities needed |

**Task Flow:**
```
1. Chef assigns: "Prep 50 portions sauce poutine" → Prep Cook
2. Cook starts task → Timer begins
3. Cook completes → Production log auto-generated
4. System tracks: Labor time, food cost, total cost per batch
```

---

### 6. Multi-Department Support

**Perfect for Ashton's diverse operations**

- **Cuisine** - Hot kitchen production
- **Grill** - Burger and steak station
- **Friture** - Fry station (poutines, frites)
- **Préparation** - Prep kitchen
- **Bar** - Beverage recipes

Each department:
- Has its own recipe collection
- Separate staff assignments
- Independent production tracking
- Consolidated reporting for owners

---

### 7. Access Control & Security

**Right access for the right people**

| Level | Access | Authentication |
|-------|--------|----------------|
| Viewer | Read recipes only | None required |
| Editor | Create/edit recipes in assigned department | 4-digit PIN |
| Owner | Full access, control panel, all departments | 6-digit PIN |

- Staff can switch departments quickly
- No passwords to remember (PIN-based)
- Audit trail of all changes

---

## Coming Soon: Prise de Commande Console

### Voice-Powered Order Taking

**The next evolution: voice ordering for counter service**

```
Customer: "Je veux une poutine classique, une grosse,
           avec un pepsi"

System displays:
  ┌─────────────────────────────────┐
  │ COMMANDE #247                   │
  │ ─────────────────────────────── │
  │ 1x Poutine Classique (L)  12.95 │
  │ 1x Pepsi                   2.50 │
  │ ─────────────────────────────── │
  │ Sous-total:               15.45 │
  │ TPS (5%):                  0.77 │
  │ TVQ (9.975%):              1.54 │
  │ TOTAL:                    17.76 │
  └─────────────────────────────────┘
```

**Planned Features:**
- Voice order entry in French Canadian
- Menu item recognition with modifiers
- Combo detection and upselling prompts
- Direct kitchen ticket printing
- Integration with payment systems

---

## Coming Soon: Inventory Management

### Real-Time Stock Tracking

**Know what you have, what you need, when to order**

| Feature | Description |
|---------|-------------|
| **Par Levels** | Set minimum stock levels per ingredient |
| **Auto-Reorder Alerts** | Notification when stock drops below par |
| **Waste Tracking** | Log spoilage with reason codes |
| **Recipe Deduction** | Auto-deduct inventory when tasks complete |
| **Purchase Orders** | Generate POs from par level gaps |

**Voice-Powered Inventory Counts:**
```
Staff speaks: "Fromage en grains, 4 sacs de 2 kilos"

System logs:
  - Ingredient: Fromage en grains
  - Quantity: 8 kg
  - Timestamp: 2025-12-06 14:32
  - Counted by: Marc D.
```

---

## Technical Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│  React 19 + Vite | Progressive Web App | Touch-Optimized    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VOICE SERVICES                            │
│  Google Cloud Speech-to-Text V2 | French Canadian | 98%+    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     AI SERVICES                              │
│  Claude AI | Recipe Parsing | Invoice OCR | Smart Matching  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATABASE                                │
│  Firebase Firestore (Cloud) | IndexedDB (Offline)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRATIONS                              │
│  QuickBooks Online | Supplier APIs | POS Systems (planned)  │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Options

| Option | Description | Best For |
|--------|-------------|----------|
| **Cloud Hosted** | Firebase hosting, zero maintenance | Multi-location chains |
| **Hybrid** | Cloud sync + local tablets | Single location with reliability needs |
| **On-Premise** | Full local deployment | Enterprises with IT requirements |

---

## Why SmartCookBook for Ashton?

### 1. Built for Quebec
- Native French Canadian speech recognition
- Quebec terminology (poutine, smoked meat, etc.)
- Local supplier invoice formats
- TPS/TVQ tax handling

### 2. Built for Volume
- Scales from 10 to 10,000 portions
- Handles rush hour without lag
- Offline-capable for reliability
- Multi-station concurrent use

### 3. Built for Control
- Real-time food cost visibility
- Production tracking and labor costing
- Waste reduction through precision
- Audit trail for accountability

### 4. Built for Growth
- Add locations without complexity
- Centralized recipe management
- Consistent quality across locations
- Training time reduced by 60%

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1: Pilot** | 4 weeks | 1 location, recipe migration, staff training |
| **Phase 2: Optimization** | 4 weeks | Workflow refinement, invoice integration |
| **Phase 3: Rollout** | 8 weeks | Additional locations, full feature deployment |
| **Phase 4: Advanced** | Ongoing | Order console, inventory, custom features |

---

## Investment & ROI

### Projected Savings

| Area | Annual Savings |
|------|---------------|
| Food cost reduction (2-3%) | $15,000 - $25,000 per location |
| Labor efficiency (prep time -15%) | $8,000 - $12,000 per location |
| Training time reduction | $5,000 per location |
| Waste reduction | $3,000 - $5,000 per location |
| **Total per location** | **$31,000 - $47,000** |

### Pricing Model

| Tier | Features | Price |
|------|----------|-------|
| **Starter** | Recipes, voice, basic scaling | $199/month/location |
| **Professional** | + Costing, invoices, tasks | $399/month/location |
| **Enterprise** | + Inventory, ordering, API | Custom pricing |

*Volume discounts available for 5+ locations*

---

## Demo & Next Steps

### See It In Action

1. **Live Demo** - 30-minute walkthrough at your convenience
2. **Pilot Program** - 30-day trial at one location
3. **Custom Assessment** - Workflow analysis and ROI projection

### Contact

**Developer:** [Your Name]
**Referral:** [Brother's Name] - Ashton Team Member
**Email:** [Your Email]
**Phone:** [Your Phone]

---

## Appendix: Current Features

### Implemented & Production-Ready

- [x] Voice-powered recipe entry (French Canadian)
- [x] AI recipe parsing from PDF/images
- [x] Recipe scaling (BP/TP system)
- [x] Ingredient database with pricing
- [x] Invoice upload and parsing
- [x] Task assignment and tracking
- [x] Production logging
- [x] Multi-department support
- [x] PIN-based access control
- [x] Cloud sync across devices
- [x] Offline capability
- [x] QuickBooks integration
- [x] Mobile/tablet optimized

### In Development

- [ ] Voice order console (Prise de Commande)
- [ ] Real-time inventory tracking
- [ ] Par level management
- [ ] Auto-reorder alerts
- [ ] POS integration
- [ ] Advanced reporting dashboard
- [ ] Multi-language support

---

*SmartCookBook - La cuisine intelligente, propulsée par la voix.*
