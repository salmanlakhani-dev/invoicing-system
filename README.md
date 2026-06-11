# 🧾 Elevate TM Invoicing — Full-Stack Invoicing System

> A GoHighLevel-inspired invoicing platform built with Next.js (JavaScript), Firebase, Stripe, and Nodemailer.

---

## 🎨 Brand

| Token | Value |
|---|---|
| Primary | `#2A2A6C` (deep navy) |
| Secondary | `#FE1D66` (hot pink-red) |
| Background | `#F5F6FA` |
| Surface | `#FFFFFF` |
| Text | `#1A1A2E` |
| Muted | `#6B7280` |
| Border | `#E5E7EB` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Error | `#EF4444` |

Font: **Inter** (Google Fonts)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router, **JavaScript**) |
| Backend | Firebase Cloud Functions (Node.js) |
| Database | Firestore |
| Auth | Firebase Auth (email/password) |
| Payments | Stripe (PaymentIntents, SetupIntents, Customer API) |
| Email | Nodemailer via SMTP |
| PDF Generation | Puppeteer (server-side via Cloud Function) |
| File Storage | Firebase Storage (PDFs, company logo) |
| Hosting | Firebase Hosting or Vercel |

---

## 📁 Project Structure

```
/app
  /dashboard                  → Home — metrics, charts, recent invoices
  /customers
    /[id]                     → Customer detail + saved cards
  /products                   → Product/service catalog
  /invoices
    /new                      → Invoice builder
    /[id]                     → Invoice detail + payment history
    /[id]/edit                → Edit invoice
  /pay/[token]                → Public payment page (no auth)
  /settings                   → Company, invoice config, SMTP, Stripe

/components
  /invoice                    → InvoiceBuilder, LineItems, TotalsPanel, PreviewModal
  /customers                  → CustomerForm, CustomerCard, SavedCards
  /ui                         → Button, Modal, Badge, Table, Input, Tabs, Toast

/lib
  /firebase.js                → Firebase app init
  /stripe.js                  → Stripe client init
  /nodemailer.js              → SMTP transporter setup

/functions                    → Firebase Cloud Functions
  /sendInvoiceEmail.js
  /generatePDF.js
  /chargeCard.js
  /stripeWebhook.js
```

---

## 🗂 Modules

### 1. Settings (`/settings`)

**Company Details**
- Company name, logo, address, phone, email, website, GST/HST number
- Default currency (USD or CAD)

**Invoice Settings**
- Invoice prefix (e.g. `ELV`) → generates `ELV-2026-001`
- Default due date offset: Net 7 / Net 15 / Net 30 / Due on Receipt
- Default notes, terms & conditions
- Tax label (e.g. "HST") and default tax rate (%)

**Email (SMTP)**
- Host, port, username, password (encrypted), from name, from email
- "Send Test Email" button

**Stripe**
- Publishable key (frontend)
- Secret key (Firebase environment config / Secret Manager only — never Firestore)
- Webhook secret
- "Test Connection" button

---

### 2. Customers (`/customers`)

**List View**
- Name, Email, Phone, Company, Total Invoiced, Outstanding Balance
- Search by name or email

**Customer Fields** (Firestore: `customers/{id}`)
- First name, last name, company, email, phone
- Billing address (line 1, line 2, city, province/state, postal code, country)
- Currency preference (USD / CAD)
- Internal notes
- `stripeCustomerId` (Stripe Customer object reference)

**Customer Detail** (`/customers/[id]`)
- Invoice history table
- Saved payment methods:
  - List cards (last4, brand, expiry)
  - "Add Card" → Stripe SetupIntent flow via Stripe Elements
  - Per-card toggle: **Allow off-session charges**
  - Delete card

> ⚠️ Raw card data is never stored. Cards are Stripe PaymentMethods attached to a Stripe Customer. Firestore stores only `paymentMethodId`, `last4`, `brand`, `expiry`, and `allowOffSession`.

---

### 3. Products (`/products`)

**Fields** (Firestore: `products/{id}`)
- Name, description, unit price, currency, type (Product / Service)
- Tax applicable toggle

---

### 4. Invoices (`/invoices`)

**List View**
- Invoice #, Customer, Issue Date, Due Date, Amount, Status
- Status badges: `Draft` `Sent` `Viewed` `Partially Paid` `Paid` `Overdue` `Void`
- Filter by status, customer, date range
- Bulk actions: Send, Void, Delete (drafts only)

**Invoice Builder**

| Section | Details |
|---|---|
| Header | Invoice #, title/name, issue date, due date, currency, status |
| From | Auto-filled from `settings/company` |
| To | Customer selector → auto-fills billing address and email |
| Line Items | Product selector or manual, qty, unit price, tax toggle per line |
| Totals | Subtotal → Discount (flat or %) → Tax → Total → Balance Due |
| Notes & Terms | Pre-filled from settings defaults, editable per invoice |

**Invoice Actions**
- Save as Draft
- Send Invoice (email + PDF)
- Preview (modal)
- Download PDF
- Record Manual Payment
- Charge Saved Card (off-session)
- Void
- Duplicate

---

### 5. Public Payment Page (`/pay/[token]`)

- Publicly accessible — no auth required
- Unique UUID token generated per invoice
- Displays: logo, invoice details, line items, totals, notes
- **"Pay Now"** button (`#FE1D66`) → inline Stripe Payment Element
- Supports: Card, Apple Pay, Google Pay
- On success: confirmation screen with receipt summary
- On already paid: "This invoice has been paid" screen
- Sets `viewedAt` in Firestore on first page load
- "Download Invoice PDF" button

---

### 6. PDF Generation (Cloud Function)

- Triggered on: send, manual download, public page access
- Puppeteer renders HTML invoice template to PDF
- PDF uploaded to Firebase Storage → signed URL stored in invoice doc

**PDF includes:**
- Company logo and details
- Invoice title and number
- From / To sections
- Line items table
- Totals (subtotal, discount, tax, total, balance due)
- Notes and terms
- Clickable **"Pay Now"** button → `/pay/[token]`
- Footer with company name and website

---

### 7. Email (Cloud Function — Nodemailer SMTP)

**Invoice Email**
- Subject: `Invoice [INV#] from [Company Name] — [Amount] Due [Due Date]`
- HTML body: logo, summary, large "View & Pay Invoice" CTA button
- PDF attached

**Payment Confirmation Email** (customer + business owner)
- Confirmation of payment received
- Invoice number, amount, date, link to invoice

---

### 8. Off-Session Card Charges

1. Owner clicks "Charge Saved Card" on invoice detail
2. Modal shows eligible cards (`allowOffSession: true`)
3. Owner selects card and confirms
4. Cloud Function: creates `PaymentIntent` with `confirm: true`, `off_session: true`
5. On success: invoice → Paid, payment logged, confirmation email sent
6. On failure: graceful error (handles `requires_action`, declines)

---

### 9. Dashboard (`/`)

**Metric Cards**
- Total Revenue (USD / CAD toggle)
- Outstanding Amount
- Overdue Amount
- Total Invoices This Month

**Charts**
- Revenue over time (line chart — last 6 months)
- Invoice status breakdown (donut chart)

**Tables**
- Recent Invoices (last 10)
- Overdue Invoices (with send reminder action)

---

## 🗄 Firestore Schema

```
/settings/company             → name, logo, address, phone, email, website, taxNumber, currency
/settings/smtp                → host, port, username, encryptedPassword, fromName, fromEmail
/settings/invoiceConfig       → prefix, currentCounter, defaultDueDays, taxLabel, taxRate, notes, terms

/customers/{id}
  name, email, phone, company, address, stripeCustomerId, currency, notes
  /paymentMethods/{pmId}
    paymentMethodId, last4, brand, expiry, allowOffSession

/products/{id}
  name, description, unitPrice, currency, type, taxApplicable

/invoices/{id}
  invoiceNumber, title, customerId, status, currency
  issueDate, dueDate
  lineItems[]           → { productId?, description, qty, unitPrice, taxApplicable, lineTotal }
  discount              → { type: 'flat'|'percent', value }
  taxRate, subtotal, taxAmount, discountAmount, total, amountPaid
  notes, terms
  token                 → UUID (public pay page)
  pdfUrl
  createdAt, sentAt, viewedAt, paidAt

/payments/{id}
  invoiceId, amount, currency, method
  stripePaymentIntentId, stripeChargeId
  paidAt, recordedBy
```

---

## 💳 Stripe Webhook Events

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Mark invoice Paid, log payment, send confirmation email |
| `payment_intent.payment_failed` | Update invoice status, notify owner |
| `setup_intent.succeeded` | Confirm card saved successfully |

---

## 🔐 Security

- Firestore rules: only authenticated owner can read/write all collections
- Public pay page: Cloud Function validates token, returns only necessary invoice data
- SMTP password: encrypted in Firestore, decrypted only inside Cloud Functions
- Stripe secret key: stored in Firebase environment config or Google Secret Manager — **never in Firestore**
- Card data: never stored raw — only Stripe PaymentMethod references

---

## 💰 Currency & Formatting

- Supported: **USD** and **CAD**
- Format: `$1,234.56 USD` / `$1,234.56 CAD`
- Dates: `MMM DD, YYYY` (e.g. `Jun 04, 2026`)

---

## 🧾 Invoice Numbering

- Format: `{PREFIX}-{YEAR}-{COUNTER}` → e.g. `ELV-2026-001`
- Prefix configurable in Settings
- Counter auto-increments per year, resets each new year
- Editable manually per invoice

---

## 🚀 Build Order (Recommended)

1. Firebase project setup + Auth + Firestore rules
2. Settings module (company details, invoice config, SMTP, Stripe keys)
3. Customers module (CRUD + Stripe Customer creation + saved cards)
4. Products module (CRUD)
5. Invoice Builder (line items, totals, draft/send flow)
6. PDF generation Cloud Function (Puppeteer)
7. Email sending Cloud Function (Nodemailer SMTP)
8. Public payment page + Stripe Payment Element
9. Off-session card charge Cloud Function
10. Stripe Webhook handler
11. Dashboard (metrics + charts)

---

## 📦 Key Dependencies

```json
{
  "next": "^14.0.0",
  "firebase": "^10.0.0",
  "firebase-admin": "^12.0.0",
  "firebase-functions": "^4.0.0",
  "stripe": "^14.0.0",
  "@stripe/stripe-js": "^3.0.0",
  "@stripe/react-stripe-js": "^2.0.0",
  "nodemailer": "^6.9.0",
  "puppeteer": "^22.0.0",
  "tailwindcss": "^3.4.0",
  "recharts": "^2.10.0",
  "date-fns": "^3.0.0",
  "uuid": "^9.0.0",
  "react-hook-form": "^7.50.0",
  "react-hot-toast": "^2.4.0"
}
```

---

*Built for Elevate Talent & Marketing — Elevate TM Invoicing v1.0*
