"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const formatCurrency = (amount, currencyCode) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "CAD",
  }).format(amount) + ` ${currencyCode || "CAD"}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

export default function InvoiceBuilder({ invoiceId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // System settings/catalogs
  const [company, setCompany] = useState({});
  const [config, setConfig] = useState({});
  const [emailConfig, setEmailConfig] = useState({});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Form states
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [title, setTitle] = useState("Marketing & Services Delivery");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("CAD");
  const [customerId, setCustomerId] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  // Line Items
  const [lineItems, setLineItems] = useState([
    { description: "", qty: 1, unitPrice: 0, taxApplicable: true, lineTotal: 0 }
  ]);

  // Discount
  const [discountType, setDiscountType] = useState("percent"); // 'flat' | 'percent'
  const [discountValue, setDiscountValue] = useState(0);

  // Notes & Terms
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  
  // Preview State
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Load Settings
        const compSnap = await getDoc(doc(db, "settings", "company"));
        if (compSnap.exists()) setCompany(compSnap.data());

        const confSnap = await getDoc(doc(db, "settings", "invoiceConfig"));
        const configData = confSnap.exists() ? confSnap.data() : {};
        setConfig(configData);

        const emailSnap = await getDoc(doc(db, "settings", "smtp"));
        if (emailSnap.exists()) setEmailConfig(emailSnap.data());

        // 2. Load Customers & Products list
        const custSnaps = await getDocs(collection(db, "customers"));
        setCustomers(custSnaps.docs.map(d => ({ id: d.id, ...d.data() })));

        const prodSnaps = await getDocs(collection(db, "products"));
        setProducts(prodSnaps.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Set Date defaults
        const today = new Date().toISOString().split("T")[0];
        setIssueDate(today);

        const defaultNetDays = configData.defaultDueDays || 15;
        const due = new Date();
        due.setDate(due.getDate() + parseInt(defaultNetDays, 10));
        setDueDate(due.toISOString().split("T")[0]);

        // Prefill notes & terms from config
        setNotes(configData.defaultNotes || "");
        setTerms(configData.defaultTerms || "");

        // 4. Load Invoice details if in EDIT Mode
        if (invoiceId) {
          const invSnap = await getDoc(doc(db, "invoices", invoiceId));
          if (invSnap.exists()) {
            const invData = invSnap.data();
            setInvoiceNumber(invData.invoiceNumber);
            setTitle(invData.title || "");
            setIssueDate(invData.issueDate || today);
            setDueDate(invData.dueDate || "");
            setCurrency(invData.currency || "CAD");
            setCustomerId(invData.customerId || "");
            setLineItems(invData.lineItems || []);
            setDiscountType(invData.discount?.type || "percent");
            setDiscountValue(invData.discount?.value || 0);
            setNotes(invData.notes || "");
            setTerms(invData.terms || "");
          } else {
            toast.error("Invoice not found.");
            router.push("/invoices");
          }
        } else {
          // GENERATE INVOICE NUMBER (NEW Mode)
          const prefix = configData.prefix || "INV";
          const year = new Date().getFullYear();
          const counter = configData.currentCounter || 1;
          const paddedCounter = String(counter).padStart(3, "0");
          setInvoiceNumber(`${prefix}-${year}-${paddedCounter}`);
        }
      } catch (err) {
        console.error("Failed to load invoice builder catalogs:", err);
        toast.error("Error configuring Invoice Builder.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [invoiceId, router]);

  // Sync Customer Selection details
  useEffect(() => {
    const cust = customers.find(c => c.id === customerId);
    setSelectedCustomer(cust || null);
    if (cust && !invoiceId) {
      // Set customer currency preference in NEW mode
      setCurrency(cust.currencyPreference || "CAD");
    }
  }, [customerId, customers, invoiceId]);

  // Line Items Actions
  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: "", qty: 1, unitPrice: 0, taxApplicable: config.taxEnabledByDefault !== false, lineTotal: 0 }]);
  };

  const handleRemoveLineItem = (index) => {
    if (lineItems.length === 1) {
      toast.error("An invoice must contain at least one line item.");
      return;
    }
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index, field, value) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    
    // Recalculate line total
    const qty = parseFloat(updated[index].qty) || 0;
    const price = parseFloat(updated[index].unitPrice) || 0;
    updated[index].lineTotal = qty * price;
    
    setLineItems(updated);
  };

  const handleSelectProduct = (index, prodId) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    const updated = [...lineItems];
    updated[index].productId = prod.id;
    updated[index].description = `${prod.name} - ${prod.description || ""}`;
    updated[index].unitPrice = prod.unitPrice;
    updated[index].taxApplicable = prod.taxApplicable !== false;
    updated[index].lineTotal = (updated[index].qty || 1) * prod.unitPrice;

    setLineItems(updated);
  };

  // Reordering helpers
  const moveItem = (index, direction) => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= lineItems.length) return;

    const updated = [...lineItems];
    const temp = updated[index];
    updated[index] = updated[nextIndex];
    updated[nextIndex] = temp;
    
    setLineItems(updated);
  };

  // Calculations Panel
  const subtotal = lineItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  
  const discountAmount = 
    discountType === "percent" 
      ? (subtotal * (parseFloat(discountValue) || 0)) / 100 
      : parseFloat(discountValue) || 0;

  // Calculate tax on items with taxApplicable = true, post discount
  const taxRatePercent = parseFloat(config.taxRate) || 0;
  const taxableSubtotal = lineItems
    .filter(item => item.taxApplicable)
    .reduce((sum, item) => {
      // Pro-rata discount allocation per line item to keep calculations exact
      const share = subtotal > 0 ? item.lineTotal / subtotal : 0;
      const itemDiscount = discountAmount * share;
      return sum + (item.lineTotal - itemDiscount);
    }, 0);

  const taxAmount = (taxableSubtotal * taxRatePercent) / 100;
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  // Submit Handler
  const handleSave = async (status) => {
    if (!emailConfig.encryptedResendApiKey) {
      toast.error("Email setup is incomplete. Please go to Settings > Email Setup and configure your Resend API Key first.");
      return;
    }
    if (!customerId) {
      toast.error("Please select a customer.");
      return;
    }
    if (lineItems.some(item => !item.description.trim())) {
      toast.error("Please enter descriptions for all line items.");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(invoiceId ? "Updating invoice..." : "Creating invoice...");

    try {
      const payload = {
        invoiceNumber,
        title,
        customerId,
        status,
        currency,
        issueDate,
        dueDate,
        lineItems,
        discount: {
          type: discountType,
          value: parseFloat(discountValue) || 0,
        },
        taxRate: taxRatePercent,
        subtotal,
        taxAmount,
        discountAmount,
        total,
        amountPaid: invoiceId ? undefined : 0, // Reset only in new mode
        notes,
        terms,
        token: invoiceId ? undefined : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        createdAt: invoiceId ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Clean undefined keys
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      let savedInvoiceId = invoiceId;

      if (invoiceId) {
        // EDIT MODE
        await updateDoc(doc(db, "invoices", invoiceId), payload);
        toast.success("Invoice updated successfully!", { id: toastId });
      } else {
        // NEW MODE
        const newRef = doc(collection(db, "invoices"));
        savedInvoiceId = newRef.id;
        await setDoc(newRef, payload);

        // Increment settings counter
        const nextCounter = (config.currentCounter || 1) + 1;
        await updateDoc(doc(db, "settings", "invoiceConfig"), { currentCounter: nextCounter });

        toast.success("Invoice created successfully!", { id: toastId });
      }

      // Automatically send the email if status is "Sent" (Save & Send clicked)
      if (status === "Sent") {
        toast.loading("Delivering invoice email to customer...", { id: toastId });
        try {
          const emailRes = await fetch("/api/invoices/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceId: savedInvoiceId })
          });
          const emailData = await emailRes.json();
          if (emailData.success) {
            toast.success("Invoice saved and email sent successfully!", { id: toastId });
          } else {
            toast.error(`Invoice saved, but email failed: ${emailData.error || "Unknown error"}`, { id: toastId, duration: 6000 });
          }
        } catch (emailErr) {
          console.error("Auto email sending error:", emailErr);
          toast.error("Invoice saved, but network error sending email.", { id: toastId, duration: 6000 });
        }
      }

      router.push("/invoices");
    } catch (err) {
      console.error("Save Invoice Error:", err);
      toast.error("Failed to save invoice.", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">
            {invoiceId ? `Edit Invoice ${invoiceNumber}` : "Create Invoice"}
          </h1>
          <p className="text-sm text-muted">Draft a new invoice, configure catalog line items, apply taxes, and save drafts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 border border-border bg-white hover:bg-gray-50 text-brandText text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            Preview Invoice
          </button>
          <button
            type="button"
            onClick={() => handleSave("Draft")}
            disabled={isSaving}
            className="px-4 py-2 bg-white hover:bg-gray-50 border border-border text-primary text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave("Sent")}
            disabled={isSaving}
            className="px-5 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            Save & Send
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left main forms */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Section 1: Header Configs */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Invoice Headers</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Invoice Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                  placeholder="Marketing Services Delivery"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Section 2: To / From Details */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Sender From (Loaded from Company config) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider">From (Issuer)</h3>
              <div className="text-xs font-semibold text-brandText leading-relaxed space-y-1">
                <p className="font-extrabold text-primary">{company.companyName || "Configure Company Details in Settings"}</p>
                <p>{company.addressLine1} {company.addressLine2}</p>
                <p>{company.city}, {company.stateProvince} {company.postalCode}</p>
                <p>{company.country}</p>
                <p>Phone: {company.phone}</p>
                <p>Email: {company.email}</p>
              </div>
            </div>

            {/* Recipient To (Dropdown Customer selector) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">To (Recipient) *</h3>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all font-semibold"
              >
                <option value="">Select a Client...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || `${c.firstName} ${c.lastName}`} ({c.email})
                  </option>
                ))}
              </select>

              {selectedCustomer && (
                <div className="text-xs font-semibold text-brandText leading-relaxed pt-2 space-y-1 border-t border-border animate-fade-in">
                  <p className="font-bold">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                  <p>{selectedCustomer.companyName}</p>
                  <p>{selectedCustomer.billingAddressLine1}</p>
                  <p>{selectedCustomer.city}, {selectedCustomer.stateProvince} {selectedCustomer.postalCode}</p>
                  <p>{selectedCustomer.country}</p>
                  <p>Email: {selectedCustomer.email}</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Line Items Catalog */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Line Items</h3>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 hover:bg-primary hover:text-white rounded-lg text-[10px] font-bold text-primary transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item Row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs font-semibold">
                <thead>
                  <tr className="border-b border-border text-muted pb-2">
                    <th className="pb-2 w-8">#</th>
                    <th className="pb-2 w-48">Catalog Product</th>
                    <th className="pb-2">Description / Details *</th>
                    <th className="pb-2 w-16 text-center">Qty</th>
                    <th className="pb-2 w-28">Unit Price</th>
                    <th className="pb-2 w-12 text-center">Tax</th>
                    <th className="pb-2 w-28">Amount</th>
                    <th className="pb-2 w-20 text-right">Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lineItems.map((item, index) => (
                    <tr key={index} className="align-top hover:bg-gray-50/50">
                      <td className="py-3 text-muted">{index + 1}</td>
                      <td className="py-3 pr-2">
                        <select
                          value={item.productId || ""}
                          onChange={(e) => handleSelectProduct(index, e.target.value)}
                          className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-brandText focus:outline-none focus:border-primary"
                        >
                          <option value="">Manual Entry...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-2">
                        <textarea
                          required
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, "description", e.target.value)}
                          rows={1}
                          className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-brandText focus:outline-none focus:border-primary resize-y"
                          placeholder="Line item description details..."
                        />
                      </td>
                      <td className="py-3 pr-2 text-center">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.qty}
                          onChange={(e) => handleLineItemChange(index, "qty", parseInt(e.target.value, 10) || 1)}
                          className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-brandText focus:outline-none text-center"
                        />
                      </td>
                      <td className="py-3 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={item.unitPrice}
                          onChange={(e) => handleLineItemChange(index, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-brandText focus:outline-none"
                        />
                      </td>
                      <td className="py-3 pr-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.taxApplicable}
                          onChange={(e) => handleLineItemChange(index, "taxApplicable", e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </td>
                      <td className="py-3 font-extrabold text-brandText pt-4.5">
                        {formatCurrency(item.lineTotal || 0, currency)}
                      </td>
                      <td className="py-3 text-right flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(index, "up")}
                          disabled={index === 0}
                          className="p-1 border border-border rounded text-muted hover:text-brandText disabled:opacity-30"
                          title="Move Up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(index, "down")}
                          disabled={index === lineItems.length - 1}
                          className="p-1 border border-border rounded text-muted hover:text-brandText disabled:opacity-30"
                          title="Move Down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="p-1 text-muted hover:text-error hover:bg-error/5 border border-border rounded"
                          title="Delete Line"
                        >
                          ✖
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right sidebars: Totals calculation & Notes */}
        <div className="space-y-6">
          {/* Currency configuration */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-border pb-3">Billing Settings</h3>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Invoice Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all font-semibold"
              >
                <option value="CAD">CAD ($)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>

          {/* Totals panel */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-border pb-3">Invoiced Totals</h3>
            <div className="space-y-3 text-xs font-semibold text-brandText">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>

              {/* Discount inputs */}
              <div className="py-2 border-t border-b border-border space-y-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-muted block">Discount Config</span>
                <div className="flex gap-2">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    className="rounded-lg border border-border bg-white px-2 py-1 text-xs text-brandText focus:outline-none w-20"
                  >
                    <option value="percent">% Off</option>
                    <option value="flat">$ Off</option>
                  </select>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="flex-1 rounded-lg border border-border bg-white px-2 py-1 text-xs text-brandText focus:outline-none"
                    placeholder="0"
                  />
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold text-xs pt-1">
                    <span>Discounted</span>
                    <span>-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                )}
              </div>

              {/* Tax values */}
              {taxRatePercent > 0 && (
                <div className="flex justify-between border-b border-border pb-2 text-[11px]">
                  <span className="text-muted">{config.taxLabel || "Tax"} ({taxRatePercent}%)</span>
                  <span>{formatCurrency(taxAmount, currency)}</span>
                </div>
              )}

              {/* Total final */}
              <div className="flex justify-between text-base font-extrabold text-primary border-b border-border pb-3">
                <span>Total Due</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-border pb-3">Notes & Terms</h3>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Invoice Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                placeholder="Include payment link notes, bank details..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Terms & Conditions</label>
              <textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                placeholder="Due dates, interest rules..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* PRINT-READY PREVIEW MODAL */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-4xl w-full bg-white rounded-2xl p-6 md:p-8 border border-border shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Invoice Print Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-muted hover:text-brandText"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Render Invoice Page Content */}
            <div className="p-8 border border-border rounded-xl bg-white shadow-sm text-xs font-semibold text-brandText space-y-8">
              
              {/* Top Section */}
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-secondary text-white font-extrabold flex items-center justify-center text-base tracking-wider mb-2">
                    IF
                  </div>
                  <h2 className="text-xl font-black text-primary">{company.companyName || "Elevate Billing"}</h2>
                  <p className="text-muted">{company.addressLine1} {company.addressLine2}</p>
                  <p className="text-muted">{company.city}, {company.stateProvince} {company.postalCode}</p>
                  <p className="text-muted">{company.country}</p>
                  <p className="text-muted">GST/HST: {company.gstHstNumber || "—"}</p>
                </div>
                <div className="text-right space-y-1">
                  <h1 className="text-2xl font-black text-primary">INVOICE</h1>
                  <p className="text-sm font-bold text-brandText">{invoiceNumber}</p>
                  <div className="pt-2 text-[10px] text-muted space-y-0.5">
                    <p>DATE: <span className="font-bold text-brandText">{formatDate(issueDate)}</span></p>
                    <p>DUE DATE: <span className="font-bold text-brandText">{formatDate(dueDate)}</span></p>
                    <p>CURRENCY: <span className="font-bold text-brandText">{currency}</span></p>
                  </div>
                </div>
              </div>

              {/* Billed To Section */}
              <div className="border-t border-b border-border py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted block">Billed To:</span>
                  {selectedCustomer ? (
                    <>
                      <p className="font-bold text-primary">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                      <p className="font-medium">{selectedCustomer.companyName}</p>
                      <p className="text-muted">{selectedCustomer.billingAddressLine1}</p>
                      <p className="text-muted">{selectedCustomer.city}, {selectedCustomer.stateProvince} {selectedCustomer.postalCode}</p>
                      <p className="text-muted">{selectedCustomer.country}</p>
                      <p className="text-muted">Email: {selectedCustomer.email}</p>
                    </>
                  ) : (
                    <p className="text-rose-500 font-bold italic">No client selected</p>
                  )}
                </div>
              </div>

              {/* Table Line Items */}
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-primary text-muted font-bold">
                    <th className="pb-2">Description</th>
                    <th className="pb-2 w-16 text-center">Qty</th>
                    <th className="pb-2 w-28 text-right">Unit Price</th>
                    <th className="pb-2 w-12 text-center">Tax</th>
                    <th className="pb-2 w-28 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="font-medium text-brandText">
                      <td className="py-3 pr-4">{item.description || "Manual Entry line details"}</td>
                      <td className="py-3 text-center">{item.qty}</td>
                      <td className="py-3 text-right">{formatCurrency(item.unitPrice, currency)}</td>
                      <td className="py-3 text-center">{item.taxApplicable ? "Yes" : "No"}</td>
                      <td className="py-3 text-right font-extrabold">{formatCurrency(item.lineTotal, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Calculations footer */}
              <div className="flex justify-end pt-4">
                <div className="w-64 space-y-2 text-xs font-semibold">
                  <div className="flex justify-between">
                    <span className="text-muted">Subtotal:</span>
                    <span>{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Discount:</span>
                      <span>-{formatCurrency(discountAmount, currency)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted">{config.taxLabel} ({taxRatePercent}%):</span>
                      <span>{formatCurrency(taxAmount, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-primary border-t border-border pt-2">
                    <span>Total Due:</span>
                    <span>{formatCurrency(total, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Notes panel */}
              {(notes || terms) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
                  {notes && (
                    <div>
                      <span className="font-bold uppercase text-brandText block mb-1">Invoice Notes:</span>
                      <p className="bg-gray-50 p-2.5 rounded-lg border border-border">{notes}</p>
                    </div>
                  )}
                  {terms && (
                    <div>
                      <span className="font-bold uppercase text-brandText block mb-1">Terms & Conditions:</span>
                      <p className="bg-gray-50 p-2.5 rounded-lg border border-border">{terms}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons in footer */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
