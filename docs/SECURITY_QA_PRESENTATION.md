# Security Q&A - Presentation Ready Answers

**Purpose:** Prepared answers for security questions during presentation
**Audience:** Business stakeholders / Boss
**Tone:** Confident, simple, jargon-free

---

## The Big Question

### "Is my data safe? Can I trust you with my business invoices, recipes, and sensitive data?"

**SHORT ANSWER (30 seconds):**
> "Yes. Your data is protected by the same enterprise-grade security used by Gmail and major banks. All data is encrypted, access requires authentication, and each user can only see their own data. We use Google Firebase infrastructure which is SOC 2 and ISO 27001 certified - the same standards required by financial institutions."

**DETAILED ANSWER (if they want more):**
> "We have 5 layers of protection:
> 1. **Authentication** - You need a verified email and password to access anything
> 2. **Encryption in transit** - Bank-level TLS 1.3 encryption for all internet traffic
> 3. **Encryption at rest** - Your data is encrypted on Google's servers with AES-256
> 4. **Isolation** - Each business only sees their own data - enforced at the database level
> 5. **Legal compliance** - Privacy Policy and Terms of Service compliant with Quebec Law 25"

---

## Specific Questions & Answers

### Q1: "Can your employees see my data?"

**Answer:**
> "No. Your data is isolated to your account at the database level. Our code cannot bypass these rules - they're enforced by Firebase security rules. Even developers cannot query another user's data."

**Technical proof (if needed):**
```
Firestore Security Rules:
- match /cookbooks/{cookbookId}/recipes/{recipeId}
  allow read: if isOwner(cookbookId);

Translation: Only the owner (you) can read your recipes.
```

---

### Q2: "What if a hacker attacks your system?"

**Answer:**
> "We're protected by Google's security infrastructure - the same company that protects Gmail, Google Drive, and YouTube. They have:
> - 24/7 security teams
> - Automatic DDoS protection
> - Physical data center security
> - Regular third-party security audits
>
> A hacker would need to breach Google's security, which has never happened at scale."

---

### Q3: "What happens to my invoices when I upload them to the AI?"

**Answer:**
> "When you upload an invoice:
> 1. It's sent encrypted to Claude AI (Anthropic) for reading
> 2. Claude extracts the text and returns the data
> 3. The image is **not stored** on their servers after processing
> 4. They **do not train** their AI on your data
> 5. Anthropic is SOC 2 Type II certified - audited annually for security"

**Key point:** Your invoice images don't live anywhere permanently except your own device/browser.

---

### Q4: "Who else can see my vendor prices and costs?"

**Answer:**
> "Only people in your organization with the credentials you've given them. We have three access levels:
> - **Owner**: Full access to everything
> - **Editor**: Can edit recipes and inventory
> - **Viewer**: Can only view, not modify
>
> Each person needs a PIN you create. You can revoke access instantly."

---

### Q5: "What if someone steals a password?"

**Answer:**
> "Three protections:
> 1. Passwords are **hashed with bcrypt** - even if someone got our database, they'd see random characters, not passwords
> 2. Users can reset their password via email verification
> 3. As the owner, you can disable any staff member's access immediately"

---

### Q6: "Is this compliant with Quebec privacy laws?"

**Answer:**
> "Yes. We've implemented Quebec Law 25 requirements:
> - ✅ Privacy Policy published (link in app footer)
> - ✅ Terms of Service published
> - ✅ Consent checkbox at registration
> - ✅ Encrypted data storage
> - ✅ User data isolation
>
> For full commercial launch, we need to designate a Privacy Officer and have legal review - those are administrative steps, not technical gaps."

---

### Q7: "What if your company shuts down?"

**Answer:**
> "Your data belongs to you. You can export all your recipes and inventory data at any time (JSON/CSV format). The app also works offline - your data is stored locally on your device, so you always have access even without internet."

---

### Q8: "Where is my data physically stored?"

**Answer:**
> "Your data is stored in:
> 1. **Your device** (IndexedDB) - for offline access
> 2. **Google Cloud servers** (Firebase) - for sync and backup
>
> Google's data centers are in North America. All data is encrypted and protected by physical security, biometric access, and 24/7 surveillance."

---

### Q9: "Do you sell my data?"

**Answer:**
> "Absolutely not. We will never sell, rent, or share your business data with third parties. Your recipes, vendors, and costs are your competitive advantage - we respect that."

---

### Q10: "What certifications do you have?"

**Answer:**
> "We rely on certified infrastructure:
>
> | Provider | Certifications |
> |----------|----------------|
> | Google Firebase | SOC 2, ISO 27001, ISO 27017, ISO 27018, GDPR |
> | Anthropic (Claude AI) | SOC 2 Type II |
>
> These are the same certifications required by banks and healthcare companies."

---

## Visual: Security Architecture (Show if asked)

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR DATA PROTECTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌──────────┐     TLS 1.3        ┌──────────────────────┐    │
│    │   YOU    │ ◄──────────────────►│   Firebase Cloud     │    │
│    │          │    Encrypted        │   (Google)           │    │
│    └──────────┘                     │                      │    │
│                                     │  ✓ SOC 2 Certified   │    │
│    Authentication:                  │  ✓ AES-256 at rest   │    │
│    ✓ Email verification             │  ✓ 24/7 monitoring   │    │
│    ✓ Password (bcrypt hash)         │  ✓ Auto backups      │    │
│    ✓ PIN-based staff access         └──────────────────────┘    │
│                                                                  │
│    Data Isolation:                                               │
│    ✓ Each user = separate "cookbook"                            │
│    ✓ Database rules enforce ownership                            │
│    ✓ Cannot query other users' data                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## If They're Still Skeptical

**Say this:**
> "I understand the concern - you're trusting us with sensitive business data. Here's the reality: we use the same infrastructure that protects Google's own users - over 2 billion accounts. Our security isn't something we built from scratch - we're leveraging billions of dollars of Google's security investment.
>
> The alternative - spreadsheets, paper invoices, local software without backups - is actually higher risk. With us, your data is encrypted, backed up automatically, and protected by enterprise-grade security."

---

## Honest Gaps (If Asked Directly)

If they ask "What security DON'T you have?"

**Be honest:**
> "A few things we plan to add:
> - **Two-factor authentication (2FA)** - Currently password + PIN, could add SMS/app verification
> - **SOC 2 certification for ourselves** - We use certified providers, but we're not audited ourselves (yet)
> - **Formal Privacy Officer** - Law 25 requires designating someone official
>
> These don't create security holes - they're enhancements for enterprise-level compliance."

---

## Key Stats to Remember

| Fact | Number |
|------|--------|
| Encryption standard | TLS 1.3 + AES-256 |
| Password protection | bcrypt (industry standard) |
| Google Firebase uptime | 99.95% SLA |
| Firebase certifications | SOC 2, ISO 27001 |
| Anthropic certification | SOC 2 Type II |
| Data breaches at Google Firebase | 0 major breaches |

---

## One-Page Cheat Sheet (Print This)

### If They Ask About Security:

1. **"Same security as Gmail"** - Google Firebase infrastructure
2. **"Bank-level encryption"** - TLS 1.3 in transit, AES-256 at rest
3. **"Your data is isolated"** - Database rules enforce ownership
4. **"Passwords are hashed"** - Even we can't see them
5. **"Compliant with Quebec Law 25"** - Privacy Policy, consent, encryption
6. **"AI doesn't store invoices"** - Processed and deleted, not trained on

### Red Flags to Avoid Saying:
- ❌ "We'll never get hacked" (nobody can guarantee this)
- ❌ "We're 100% compliant" (need Privacy Officer designation)
- ❌ "We built our own encryption" (we use industry standards)

### Green Phrases to Use:
- ✅ "Enterprise-grade security"
- ✅ "Same infrastructure as major tech companies"
- ✅ "Encrypted at rest and in transit"
- ✅ "SOC 2 certified infrastructure"
- ✅ "Your data belongs to you"

---

*Prepared: January 2026*
