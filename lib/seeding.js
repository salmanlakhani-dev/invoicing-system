import { db } from "./firebase";
import { doc, writeBatch, collection, addDoc } from "firebase/firestore";

const generateToken = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
};

/**
 * Seeds Firestore with standard company, SMTP, and invoicing defaults,
 * along with mock products, customers, cards, payments, and 6 months of invoice history
 * to immediately render dashboard graphs and list details.
 */
export async function seedMockData() {
  const batch = writeBatch(db);

  // 1. Settings Company
  const companyRef = doc(db, "settings", "company");
  batch.set(companyRef, {
    companyName: "Elevate Marketing Group",
    logoUrl: "", 
    addressLine1: "123 Innovation Drive",
    addressLine2: "Suite 400",
    city: "Toronto",
    stateProvince: "ON",
    postalCode: "M5V 2M2",
    country: "Canada",
    phone: "+1 (416) 555-0199",
    email: "billing@elevatetalent.co",
    website: "www.elevatetalent.co",
    gstHstNumber: "GST-123456789RT0001",
    defaultCurrency: "CAD"
  });

  // 2. Settings InvoiceConfig
  const invoiceConfigRef = doc(db, "settings", "invoiceConfig");
  batch.set(invoiceConfigRef, {
    prefix: "ELV",
    currentCounter: 10,
    defaultDueDays: 15,
    defaultNotes: "Thank you for your business. Please reach out to billing@elevatetalent.co for any queries.",
    defaultTerms: "Payment is due within 15 days of invoice date. Overdue balances are subject to a 1.5% monthly late fee.",
    taxLabel: "HST",
    taxRate: 13,
    taxEnabledByDefault: true
  });

  // 3. Settings SMTP
  const smtpRef = doc(db, "settings", "smtp");
  batch.set(smtpRef, {
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    username: "smtp_user_placeholder",
    encryptedPassword: Buffer.from("smtp_pass_placeholder").toString('base64'),
    fromName: "Elevate Billing",
    fromEmail: "billing@elevatetalent.co"
  });

  // Execute settings batch
  await batch.commit();

  // 4. Products list
  const products = [
    { name: "Monthly SEO Management", description: "Comprehensive on-page, off-page SEO, and keyword monitoring", unitPrice: 1200, currency: "USD", type: "Service", taxApplicable: false },
    { name: "SaaS Platform Development", description: "Full-stack development services hourly rate", unitPrice: 150, currency: "USD", type: "Service", taxApplicable: true },
    { name: "Social Media Advertising", description: "Facebook, Instagram, and TikTok ad campaign execution", unitPrice: 850, currency: "CAD", type: "Service", taxApplicable: true },
    { name: "Enterprise Brand Strategy Pack", description: "Brand identity design, style guides, and collateral suite", unitPrice: 3500, currency: "CAD", type: "Product", taxApplicable: true }
  ];

  const productIds = [];
  for (const prod of products) {
    const docRef = await addDoc(collection(db, "products"), prod);
    productIds.push({ id: docRef.id, ...prod });
  }

  // 5. Customers list
  const customers = [
    {
      firstName: "Sarah",
      lastName: "Jenkins",
      companyName: "Acme Tech Solutions",
      email: "sarah.j@acmetech.io",
      phone: "+1 (650) 443-8891",
      billingAddressLine1: "500 Redwood Pkwy",
      billingAddressLine2: "Bldg 3",
      city: "Redwood City",
      stateProvince: "CA",
      postalCode: "94065",
      country: "USA",
      currencyPreference: "USD",
      notes: "VIP Client. Standard USD billing. Prefers off-session automated charging.",
      stripeCustomerId: "cus_mock_acme123"
    },
    {
      firstName: "David",
      lastName: "Chen",
      companyName: "Zenith Retail Corp",
      email: "dchen@zenithretail.ca",
      phone: "+1 (778) 998-0012",
      billingAddressLine1: "888 Robson St",
      billingAddressLine2: "",
      city: "Vancouver",
      stateProvince: "BC",
      postalCode: "V6Z 1A1",
      country: "Canada",
      currencyPreference: "CAD",
      notes: "Wants invoices in CAD. Always pays via manual e-transfer or credit card on public page.",
      stripeCustomerId: "cus_mock_zenith456"
    },
    {
      firstName: "Marcus",
      lastName: "Vance",
      companyName: "Apex Logistics",
      email: "marcus@apexlogistics.com",
      phone: "+1 (312) 555-4009",
      billingAddressLine1: "401 N Michigan Ave",
      billingAddressLine2: "Suite 1200",
      city: "Chicago",
      stateProvince: "IL",
      postalCode: "60611",
      country: "USA",
      currencyPreference: "USD",
      notes: "Check invoices carefully. Needs PO numbers referenced in notes.",
      stripeCustomerId: "cus_mock_apex789"
    }
  ];

  const customerIds = [];
  for (const cust of customers) {
    const custRef = await addDoc(collection(db, "customers"), cust);
    customerIds.push({ id: custRef.id, ...cust });

    // Seed Saved Payment Methods for customers
    if (cust.stripeCustomerId === "cus_mock_acme123") {
      const pmBatch = writeBatch(db);
      const pmRef = doc(collection(db, "customers", custRef.id, "paymentMethods"));
      pmBatch.set(pmRef, {
        paymentMethodId: "pm_mock_visa",
        last4: "4242",
        brand: "visa",
        expiry: "12/28",
        allowOffSession: true
      });
      await pmBatch.commit();
    }
    if (cust.stripeCustomerId === "cus_mock_apex789") {
      const pmBatch = writeBatch(db);
      const pmRef = doc(collection(db, "customers", custRef.id, "paymentMethods"));
      pmBatch.set(pmRef, {
        paymentMethodId: "pm_mock_mastercard",
        last4: "5555",
        brand: "mastercard",
        expiry: "09/27",
        allowOffSession: false
      });
      await pmBatch.commit();
    }
  }

  // 6. Invoices list spanning last 6 months to feed charts
  const invoices = [
    {
      invoiceNumber: "ELV-2026-001",
      title: "Monthly SEO Setup",
      customerId: customerIds[0].id,
      status: "Paid",
      currency: "USD",
      issueDate: "2026-01-10",
      dueDate: "2026-01-25",
      lineItems: [
        { productId: productIds[0].id, description: productIds[0].name, qty: 1, unitPrice: 1200, taxApplicable: false, lineTotal: 1200 }
      ],
      discount: { type: "percent", value: 10 },
      taxRate: 0,
      subtotal: 1200,
      taxAmount: 0,
      discountAmount: 120,
      total: 1080,
      amountPaid: 1080,
      notes: "SEO setup completed for Q1.",
      terms: "Paid in full.",
      token: generateToken(),
      createdAt: new Date("2026-01-10T10:00:00Z").toISOString(),
      sentAt: new Date("2026-01-10T10:05:00Z").toISOString(),
      viewedAt: new Date("2026-01-11T12:30:00Z").toISOString(),
      paidAt: new Date("2026-01-15T15:45:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-002",
      title: "Consulting and Custom Strategy",
      customerId: customerIds[1].id,
      status: "Paid",
      currency: "CAD",
      issueDate: "2026-02-15",
      dueDate: "2026-03-02",
      lineItems: [
        { productId: productIds[2].id, description: productIds[2].name, qty: 2, unitPrice: 850, taxApplicable: true, lineTotal: 1700 }
      ],
      discount: { type: "flat", value: 0 },
      taxRate: 13,
      subtotal: 1700,
      taxAmount: 221,
      discountAmount: 0,
      total: 1921,
      amountPaid: 1921,
      notes: "HST tax included.",
      terms: "Paid in full.",
      token: generateToken(),
      createdAt: new Date("2026-02-15T09:00:00Z").toISOString(),
      sentAt: new Date("2026-02-15T09:12:00Z").toISOString(),
      viewedAt: new Date("2026-02-16T14:22:00Z").toISOString(),
      paidAt: new Date("2026-02-20T10:30:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-003",
      title: "Monthly Marketing",
      customerId: customerIds[0].id,
      status: "Paid",
      currency: "USD",
      issueDate: "2026-03-10",
      dueDate: "2026-03-25",
      lineItems: [
        { productId: productIds[0].id, description: productIds[0].name, qty: 1, unitPrice: 1200, taxApplicable: false, lineTotal: 1200 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 0,
      subtotal: 1200,
      taxAmount: 0,
      discountAmount: 0,
      total: 1200,
      amountPaid: 1200,
      notes: "",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-03-10T10:00:00Z").toISOString(),
      sentAt: new Date("2026-03-10T10:05:00Z").toISOString(),
      viewedAt: new Date("2026-03-11T12:30:00Z").toISOString(),
      paidAt: new Date("2026-03-15T15:45:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-004",
      title: "Platform Coding Support",
      customerId: customerIds[2].id,
      status: "Paid",
      currency: "USD",
      issueDate: "2026-04-05",
      dueDate: "2026-04-20",
      lineItems: [
        { productId: productIds[1].id, description: "Custom UI Coding Support (40 hours)", qty: 40, unitPrice: 150, taxApplicable: false, lineTotal: 6000 }
      ],
      discount: { type: "flat", value: 500 },
      taxRate: 0,
      subtotal: 6000,
      taxAmount: 0,
      discountAmount: 500,
      total: 5500,
      amountPaid: 5500,
      notes: "PO: #990112",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-04-05T08:00:00Z").toISOString(),
      sentAt: new Date("2026-04-05T08:15:00Z").toISOString(),
      viewedAt: new Date("2026-04-06T10:00:00Z").toISOString(),
      paidAt: new Date("2026-04-10T11:20:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-005",
      title: "Brand Collaterals Design",
      customerId: customerIds[1].id,
      status: "Overdue",
      currency: "CAD",
      issueDate: "2026-04-12",
      dueDate: "2026-04-27",
      lineItems: [
        { productId: productIds[3].id, description: productIds[3].name, qty: 1, unitPrice: 3500, taxApplicable: true, lineTotal: 3500 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 13,
      subtotal: 3500,
      taxAmount: 455,
      discountAmount: 0,
      total: 3955,
      amountPaid: 0,
      notes: "",
      terms: "Sent notification twice.",
      token: generateToken(),
      createdAt: new Date("2026-04-12T11:00:00Z").toISOString(),
      sentAt: new Date("2026-04-12T11:05:00Z").toISOString(),
      viewedAt: new Date("2026-04-14T09:12:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-006",
      title: "SEO Management May",
      customerId: customerIds[0].id,
      status: "Paid",
      currency: "USD",
      issueDate: "2026-05-10",
      dueDate: "2026-05-25",
      lineItems: [
        { productId: productIds[0].id, description: productIds[0].name, qty: 1, unitPrice: 1200, taxApplicable: false, lineTotal: 1200 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 0,
      subtotal: 1200,
      taxAmount: 0,
      discountAmount: 0,
      total: 1200,
      amountPaid: 1200,
      notes: "",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-05-10T10:00:00Z").toISOString(),
      sentAt: new Date("2026-05-10T10:05:00Z").toISOString(),
      viewedAt: new Date("2026-05-11T12:30:00Z").toISOString(),
      paidAt: new Date("2026-05-15T15:45:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-007",
      title: "Ad Campaign - May",
      customerId: customerIds[1].id,
      status: "Sent",
      currency: "CAD",
      issueDate: "2026-05-20",
      dueDate: "2026-06-04",
      lineItems: [
        { productId: productIds[2].id, description: productIds[2].name, qty: 1, unitPrice: 850, taxApplicable: true, lineTotal: 850 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 13,
      subtotal: 850,
      taxAmount: 110.5,
      discountAmount: 0,
      total: 960.5,
      amountPaid: 0,
      notes: "",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-05-20T14:00:00Z").toISOString(),
      sentAt: new Date("2026-05-20T14:10:00Z").toISOString(),
      viewedAt: new Date("2026-05-21T09:00:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-008",
      title: "Hourly Platform Dev Support",
      customerId: customerIds[2].id,
      status: "Draft",
      currency: "USD",
      issueDate: "2026-06-01",
      dueDate: "2026-06-16",
      lineItems: [
        { productId: productIds[1].id, description: "Bugfixes and API integrations (12 hours)", qty: 12, unitPrice: 150, taxApplicable: false, lineTotal: 1800 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 0,
      subtotal: 1800,
      taxAmount: 0,
      discountAmount: 0,
      total: 1800,
      amountPaid: 0,
      notes: "",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-06-01T09:00:00Z").toISOString()
    },
    {
      invoiceNumber: "ELV-2026-009",
      title: "SEO Management June",
      customerId: customerIds[0].id,
      status: "Sent",
      currency: "USD",
      issueDate: "2026-06-03",
      dueDate: "2026-06-18",
      lineItems: [
        { productId: productIds[0].id, description: productIds[0].name, qty: 1, unitPrice: 1200, taxApplicable: false, lineTotal: 1200 }
      ],
      discount: { type: "percent", value: 0 },
      taxRate: 0,
      subtotal: 1200,
      taxAmount: 0,
      discountAmount: 0,
      total: 1200,
      amountPaid: 0,
      notes: "Standard monthly SEO.",
      terms: "",
      token: generateToken(),
      createdAt: new Date("2026-06-03T10:00:00Z").toISOString(),
      sentAt: new Date("2026-06-03T10:05:00Z").toISOString()
    }
  ];

  for (const inv of invoices) {
    const invRef = await addDoc(collection(db, "invoices"), inv);

    if (inv.status === "Paid") {
      await addDoc(collection(db, "payments"), {
        invoiceId: invRef.id,
        amount: inv.total,
        currency: inv.currency,
        method: "Stripe",
        stripePaymentIntentId: "pi_mock_" + Math.random().toString(36).substring(2, 10),
        stripeChargeId: "ch_mock_" + Math.random().toString(36).substring(2, 10),
        paidAt: inv.paidAt,
        recordedBy: "Automated Charge"
      });
    }
  }

  return { customerCount: customers.length, productCount: products.length, invoiceCount: invoices.length };
}
