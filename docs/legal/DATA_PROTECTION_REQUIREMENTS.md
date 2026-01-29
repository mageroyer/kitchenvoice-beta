# Data Protection Requirements for SmartCookBook

**Date:** December 30, 2025
**Purpose:** Legal requirements and security standards for protecting sensitive business data
**Scope:** Quebec-based restaurant inventory management SaaS

---

## Executive Summary

SmartCookBook handles sensitive data including:
- **Business financial data**: Invoice amounts, vendor pricing, cost calculations
- **Vendor information**: Contact details, account numbers, payment terms
- **Inventory data**: Stock levels, par levels, ordering patterns
- **User data**: Employee names, roles, login credentials
- **Potential future**: Customer data, payment information

This document outlines the legal requirements and security standards you **must** implement.

---

## 1. Applicable Laws (Priority Order for Quebec)

### 1.1 Quebec Law 25 (HIGHEST PRIORITY)

**Official Name:** Act to modernize legislative provisions as regards the protection of personal information
**Effective:** Fully in force as of September 2024
**Applies to:** All private-sector organizations operating in Quebec

#### Key Requirements:

| Requirement | Description | SmartCookBook Status |
|-------------|-------------|---------------------|
| **Privacy by Default** | Systems must have highest privacy settings by default | NOT IMPLEMENTED |
| **Explicit Consent** | Must obtain opt-in consent for tracking/cookies | NOT IMPLEMENTED |
| **Data Breach Notification** | Notify CAI + affected users of serious breaches | NOT IMPLEMENTED |
| **Privacy Officer** | Designate a person responsible for privacy | NOT ASSIGNED |
| **Privacy Impact Assessment** | Required for high-risk data processing | NOT DONE |
| **Data Portability** | Users can request their data in portable format | NOT IMPLEMENTED |
| **Right to Deletion** | Users can request data deletion | NOT IMPLEMENTED |

#### Penalties:
- **Administrative fines**: Up to 4% of worldwide sales
- **Private right of action**: Individuals can sue for minimum CAD $1,000 per violation
- **Class action**: Law specifically allows collective legal action

#### Unique to Quebec:
Quebec is the **only jurisdiction in North America** requiring explicit opt-in consent for cookies/tracking (similar to GDPR).

---

### 1.2 PIPEDA (Federal Canada)

**Applies to:** Commercial activities across Canada (Quebec businesses exempt for provincial activities but not interprovincial)

#### 10 Fair Information Principles:

1. **Accountability** - Designate someone accountable for compliance
2. **Identifying Purposes** - Explain why you collect data before/at collection
3. **Consent** - Obtain meaningful consent
4. **Limiting Collection** - Collect only what's necessary
5. **Limiting Use, Disclosure, Retention** - Use only for stated purposes
6. **Accuracy** - Keep data accurate and up-to-date
7. **Safeguards** - Protect data appropriately
8. **Openness** - Make privacy practices available
9. **Individual Access** - Let users see and correct their data
10. **Challenging Compliance** - Have a complaint process

#### Penalties:
- Up to CAD $100,000 per violation (federal prosecution)
- **Coming Soon (CPPA)**: Bill C-27 will increase to 5% of global revenue or CAD $25 million

---

### 1.3 PCI DSS (If Processing Payments)

**Applies if:** You accept credit/debit card payments or store payment data

#### The 12 Requirements:

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | Firewall | Install and maintain network firewall |
| 2 | No Defaults | Don't use vendor-supplied defaults for passwords |
| 3 | Protect Data | Protect stored cardholder data |
| 4 | Encrypt Transit | Encrypt transmission of cardholder data |
| 5 | Anti-Malware | Use and update anti-virus software |
| 6 | Secure Systems | Develop and maintain secure systems |
| 7 | Restrict Access | Restrict access on need-to-know basis |
| 8 | Unique IDs | Assign unique ID to each user |
| 9 | Physical Access | Restrict physical access to data |
| 10 | Monitor Access | Track and monitor all access |
| 11 | Test Security | Regularly test security systems |
| 12 | Security Policy | Maintain information security policy |

#### PCI DSS 4.0 (March 2024):
- **Mandatory MFA** for all access to cardholder data environment
- **Disk-level encryption** required for payment devices
- **No shared accounts** - each employee needs unique credentials
- **Quarterly vulnerability scans** by Approved Scanning Vendors

#### Penalties:
- Fines: $5,000 - $100,000 per month
- Loss of ability to process credit cards
- Potential blacklisting (Terminated Merchant File)

---

### 1.4 GDPR (If Serving EU Customers)

Even if based in Quebec, GDPR applies if you:
- Offer services to EU residents
- Monitor behavior of EU residents

#### Key Requirements:
- Explicit consent before processing
- Right to erasure ("right to be forgotten")
- Data portability (machine-readable format)
- 72-hour breach notification
- Data Protection Officer (if large-scale processing)

#### Penalties:
- Up to EUR 20 million or 4% of global annual revenue

---

## 2. Technical Security Requirements (OWASP 2025)

### 2.1 Encryption Standards

#### Data in Transit:
```
REQUIRED:
- TLS 1.2 minimum (TLS 1.3 preferred)
- Forward secrecy (FS) ciphers
- HSTS (HTTP Strict Transport Security) headers
- No HTTP - redirect all to HTTPS

AVOID:
- TLS 1.0, TLS 1.1, SSL
- CBC cipher modes
- FTP, SMTP for sensitive data
```

#### Data at Rest:
```
REQUIRED:
- AES-256 for symmetric encryption
- For asymmetric: ECC with Curve25519 (or RSA 2048-bit minimum)
- Encrypt database backups
- Encrypt sensitive fields (not just whole-disk)

AVOID:
- MD5, SHA1 for hashing
- DES, 3DES
- Hardcoded encryption keys
```

#### Password Storage:
```
REQUIRED:
- Argon2id (preferred) or
- bcrypt or
- PBKDF2-HMAC-SHA-512

NEVER:
- Plain text
- Simple hashing (MD5, SHA1)
- Encryption (passwords should be hashed, not encrypted)
```

### 2.2 SmartCookBook Current Status

| Requirement | Current State | Risk Level |
|-------------|---------------|------------|
| HTTPS/TLS | Firebase Hosting = TLS 1.3 | OK |
| HSTS | Firebase default | OK |
| Password Hashing | Firebase Auth (bcrypt) | OK |
| API Key Protection | FIXED - Cloud Functions | OK |
| Database Encryption at Rest | Firestore = encrypted | OK |
| IndexedDB Encryption | NOT ENCRYPTED | HIGH |
| Backup Encryption | No backup feature | MEDIUM |
| Field-level Encryption | NOT IMPLEMENTED | MEDIUM |

---

## 3. SOC 2 Compliance (For Enterprise Customers)

If targeting enterprise restaurant chains, they will likely require SOC 2 certification.

### Five Trust Services Criteria:

| Criteria | Required? | Description |
|----------|-----------|-------------|
| **Security** | MANDATORY | Protect systems from unauthorized access |
| **Availability** | Common | Systems remain operational |
| **Confidentiality** | Common | Protect sensitive information |
| Processing Integrity | Optional | Systems function correctly |
| Privacy | Optional | Personal information handling |

### SOC 2 Preparation Checklist:

1. **Documentation**
   - [ ] Security policies and procedures
   - [ ] Incident response plan
   - [ ] Business continuity plan
   - [ ] Change management procedures
   - [ ] Access control policies

2. **Technical Controls**
   - [ ] Multi-factor authentication (MFA)
   - [ ] Role-based access control (RBAC)
   - [ ] Encryption (transit + rest)
   - [ ] Web Application Firewall (WAF)
   - [ ] Intrusion detection/monitoring
   - [ ] Vulnerability scanning (quarterly)

3. **Operational Controls**
   - [ ] Security awareness training
   - [ ] Background checks
   - [ ] Vendor risk assessment
   - [ ] Regular access reviews

### Timeline & Cost:
- Preparation: ~6 months
- Type 1 Audit: Point-in-time assessment
- Type 2 Audit: 6-12 month observation period
- Cost: $20,000 - $100,000+ depending on scope

---

## 4. SmartCookBook Action Plan

### Phase 1: CRITICAL (Before Commercial Launch)

| Task | Law/Standard | Priority |
|------|--------------|----------|
| Create Privacy Policy | Law 25, PIPEDA | CRITICAL |
| Implement Cookie Consent Banner | Law 25 | CRITICAL |
| Add Data Export Feature (JSON/CSV) | Law 25, PIPEDA | CRITICAL |
| Add Account Deletion Feature | Law 25 | CRITICAL |
| Designate Privacy Officer | Law 25 | CRITICAL |
| Create Breach Response Plan | Law 25 | CRITICAL |

### Phase 2: HIGH (Within 3 Months)

| Task | Law/Standard | Priority |
|------|--------------|----------|
| Encrypt IndexedDB sensitive fields | OWASP | HIGH |
| Implement Audit Trail (immutable) | SOC 2, Compliance | HIGH |
| Add MFA Option | PCI DSS, SOC 2 | HIGH |
| Create Security Documentation | SOC 2 | HIGH |
| Implement Data Retention Policy | Law 25, PIPEDA | HIGH |

### Phase 3: MEDIUM (Within 6 Months)

| Task | Law/Standard | Priority |
|------|--------------|----------|
| Add Privacy Impact Assessment | Law 25 | MEDIUM |
| Implement Role-Based Access Control | SOC 2 | MEDIUM |
| Add Security Awareness for Users | SOC 2 | MEDIUM |
| Quarterly Vulnerability Scanning | PCI DSS | MEDIUM |
| Create Business Continuity Plan | SOC 2 | MEDIUM |

---

## 5. Specific Data Categories & Protection

### 5.1 What Data SmartCookBook Collects

| Category | Examples | Sensitivity | Required Protection |
|----------|----------|-------------|---------------------|
| **Authentication** | Email, password, user ID | HIGH | Hashing, secure storage |
| **Business Financial** | Invoice totals, costs, margins | HIGH | Encryption, access control |
| **Vendor Data** | Contact info, account numbers | MEDIUM | Encryption, access control |
| **Inventory Data** | Stock levels, par levels | MEDIUM | Access control |
| **Recipe Data** | Ingredients, methods, costs | MEDIUM | Backup, access control |
| **Usage Analytics** | Feature usage, errors | LOW | Anonymization |

### 5.2 Data Classification Policy

```
CONFIDENTIAL (encrypt at rest + transit, strict access):
- API keys (already fixed)
- User passwords (Firebase handles)
- Payment information (if added)
- Vendor banking details (if added)

INTERNAL (encrypt in transit, role-based access):
- Invoice data
- Cost calculations
- Vendor contact information
- Employee information

GENERAL (standard protection):
- Recipe names
- Category names
- Unit definitions
```

---

## 6. Privacy Policy Requirements

Your privacy policy MUST include (Law 25 + PIPEDA):

1. **Identity** - Who you are, contact information
2. **What You Collect** - Specific data types
3. **Why You Collect** - Purposes for each data type
4. **How You Use** - Processing activities
5. **Who You Share With** - Third parties (Firebase, Claude API, etc.)
6. **Retention Periods** - How long you keep data
7. **User Rights** - Access, correction, deletion, portability
8. **How to Exercise Rights** - Contact method, process
9. **Security Measures** - How you protect data
10. **International Transfers** - If data leaves Canada (yes - US servers)
11. **Updates** - How you notify of policy changes
12. **Complaints** - How to file, CAI contact info

---

## 7. Third-Party Services Compliance

SmartCookBook uses these third-party services:

| Service | Data Sent | Location | Compliance |
|---------|-----------|----------|------------|
| **Firebase Auth** | Email, password hash | US | SOC 2, ISO 27001, GDPR |
| **Firebase Firestore** | All synced data | US | SOC 2, ISO 27001, GDPR |
| **Firebase Hosting** | Static assets | Global CDN | SOC 2 |
| **Claude API (Anthropic)** | Invoice images, text | US | SOC 2 Type II |

### Data Processing Agreements:
You need DPAs (Data Processing Agreements) with each third-party processor. Firebase and Anthropic provide standard DPAs.

### Cross-Border Transfer:
Since data goes to US servers, you must:
1. Disclose this in privacy policy
2. Ensure adequate protection (contractual clauses)
3. For GDPR: Use Standard Contractual Clauses (SCCs)

---

## 8. Breach Response Plan Template

### Immediate Response (0-24 hours):
1. Contain the breach (isolate affected systems)
2. Preserve evidence
3. Assess scope and severity
4. Notify internal stakeholders

### Assessment (24-48 hours):
1. Determine what data was affected
2. Identify affected individuals
3. Assess risk of harm

### Notification (if serious harm risk):
1. **CAI (Quebec)**: Report immediately
2. **Affected individuals**: As soon as feasible
3. **Include**: What happened, what data, what you're doing, how to protect themselves

### Post-Incident:
1. Document everything
2. Review and improve security
3. Update policies if needed

---

## Sources

### Quebec Law 25:
- [Quebec Law 25 Guide 2024](https://secureprivacy.ai/blog/quebec-law-25-guide-2024)
- [OneTrust - Quebec Law 25](https://www.onetrust.com/blog/quebecs-law-25-what-is-it-and-what-do-you-need-to-know/)
- [BigID - Quebec Law 25 Requirements](https://bigid.com/blog/quebec-law-25-canada-new-privacy-law-requirements/)
- [Official Quebec Legislation](https://www.legisquebec.gouv.qc.ca/en/document/cs/p-39.1)

### PIPEDA:
- [PIPEDA Requirements - Privacy Commissioner](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/)
- [PIPEDA Compliance Guide 2025](https://geotargetly.com/blog/pipeda-compliance-guide-to-canada-privacy-law)
- [Law 25 and PIPEDA Compliance](https://webplify.ca/en/law-25-and-pipeda-how-to-comply-by-2025/)

### GDPR & CCPA:
- [Global Data Privacy Laws 2025](https://usercentrics.com/guides/data-privacy/data-privacy-laws/)
- [GDPR vs CCPA Comparison](https://www.entrust.com/resources/learn/ccpa-vs-gdpr)
- [Data Compliance Guide](https://codeit.us/blog/data-compliance-for-hipaa-gdpr-pipeda-ccpa)

### PCI DSS:
- [Restaurant PCI Compliance - Verizon](https://www.verizon.com/business/resources/articles/s/what-restaurants-need-to-know-about-pci-dss-4-0-compliance/)
- [Restaurant Data Privacy 2025](https://www.fishbowl.com/blog/restaurant-data-privacy)
- [PCI Compliance Guide - Lavu](https://lavu.com/ultimate-guide-to-pci-compliance-for-restaurants/)

### OWASP Security:
- [OWASP Cryptographic Failures 2025](https://owasp.org/Top10/2025/A04_2025-Cryptographic_Failures/)
- [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Web App Security Guide 2025](https://www.ateamsoftsolutions.com/web-application-security-checklist-2025-complete-owasp-top-10-implementation-guide-for-ctos/)

### SOC 2:
- [SOC 2 Checklist for SaaS 2025](https://www.secureleap.tech/blog/soc-2-compliance-checklist-saas)
- [SaaS Compliance Guide 2025](https://www.valencesecurity.com/saas-security-terms/the-complete-guide-to-saas-compliance-in-2025-valence)
- [SaaS Privacy Compliance Requirements](https://secureprivacy.ai/blog/saas-privacy-compliance-requirements-2025-guide)

---

*Last Updated: December 30, 2025*
