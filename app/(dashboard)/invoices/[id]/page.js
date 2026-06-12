"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, onSnapshot, query, where, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import Link from "next/link";

export default function InvoiceDetailPage() {
  const { id: invoiceId } = useParams();
  const router = useRouter();

  const [invoice, setInvoice] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [payments, setPayments] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal controls
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);

  // Manual payment state
  const [manualAmount, setManualAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Off-session charge state
  const [selectedCardId, setSelectedCardId] = useState("");
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;

    // 1. Fetch Invoice Details
    const unsubInv = onSnapshot(doc(db, "invoices", invoiceId),
      async (snap) => {
        if (snap.exists()) {
          const invData = { id: snap.id, ...snap.data() };
          setInvoice(invData);

          // 2. Fetch Customer details & their card payment methods
          if (invData.customerId) {
            const custSnap = await getDoc(doc(db, "customers", invData.customerId));
            if (custSnap.exists()) {
              setCustomer({ id: custSnap.id, ...custSnap.data() });
            }

            // Get cards for off-session charging
            const qCards = query(collection(db, "customers", invData.customerId, "paymentMethods"));
            const cardSnap = await getDoc(doc(db, "customers", invData.customerId)); // triggers read
            const unsubCards = onSnapshot(qCards, (sn) => {
              setCards(sn.docs.map(d => ({ id: d.id, ...d.data() })));
            });
          }
        } else {
          toast.error("Invoice not found.");
          router.push("/invoices");
        }
      },
      (err) => console.error("Error reading invoice:", err)
    );

    // 3. Fetch Payments associated with this invoice
    const qPay = query(collection(db, "payments"), where("invoiceId", "==", invoiceId));
    const unsubPay = onSnapshot(qPay,
      (snapshot) => {
        setPayments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading payments:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubInv();
      unsubPay();
    };
  }, [invoiceId, router]);

  // Actions
  const handleVoid = async () => {
    if (!confirm("Are you sure you want to void this invoice?")) return;
    try {
      await updateDoc(doc(db, "invoices", invoiceId), { status: "Void" });
      toast.success("Invoice voided.");
    } catch (err) {
      toast.error("Failed to void invoice.");
    }
  };

  const handleDuplicate = async () => {
    if (!confirm("Duplicate this invoice details to a new Draft?")) return;
    const toastId = toast.loading("Duplicating...");
    try {
      // Fetch latest invoice config to generate new counter number
      const confSnap = await getDoc(doc(db, "settings", "invoiceConfig"));
      const configData = confSnap.exists() ? confSnap.data() : {};
      
      const prefix = configData.prefix || "INV";
      const year = new Date().getFullYear();
      const counter = configData.currentCounter || 1;
      const paddedCounter = String(counter).padStart(3, "0");
      const nextInvoiceNumber = `${prefix}-${year}-${paddedCounter}`;

      // Create cloned draft payload
      const payload = {
        invoiceNumber: nextInvoiceNumber,
        title: `${invoice.title} (Clone)`,
        customerId: invoice.customerId,
        status: "Draft",
        currency: invoice.currency,
        issueDate: new Date().toISOString().split("T")[0],
        dueDate: invoice.dueDate,
        lineItems: invoice.lineItems,
        discount: invoice.discount || { type: "percent", value: 0 },
        taxRate: invoice.taxRate,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        discountAmount: invoice.discountAmount,
        total: invoice.total,
        amountPaid: 0,
        notes: invoice.notes,
        terms: invoice.terms,
        token: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        createdAt: new Date().toISOString(),
      };

      const newRef = doc(collection(db, "invoices"));
      await setDoc(newRef, payload);

      // Increment settings counter
      await updateDoc(doc(db, "settings", "invoiceConfig"), { currentCounter: counter + 1 });

      toast.success("Invoice duplicated successfully!", { id: toastId });
      router.push(`/invoices/${newRef.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to duplicate invoice.", { id: toastId });
    }
  };

  // Record manual payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const payVal = parseFloat(manualAmount) || 0;
    const totalDue = invoice.total - (invoice.amountPaid || 0);

    if (payVal <= 0 || payVal > totalDue) {
      toast.error(`Please enter a valid amount between $0.01 and the remaining balance of ${formatCurrency(totalDue, invoice.currency)}.`);
      return;
    }

    setIsRecording(true);
    const toastId = toast.loading("Recording payment transaction...");
    try {
      // 1. Log payment in Firestore
      await addDoc(collection(db, "payments"), {
        invoiceId,
        amount: payVal,
        currency: invoice.currency,
        method: paymentMethod,
        paidAt: new Date().toISOString(),
        recordedBy: "Manual Record",
        note: paymentNote,
      });

      // 2. Update Invoice Paid stats
      const newPaidAmount = (invoice.amountPaid || 0) + payVal;
      const newStatus = newPaidAmount >= invoice.total ? "Paid" : "Partially Paid";
      
      await updateDoc(doc(db, "invoices", invoiceId), {
        amountPaid: newPaidAmount,
        status: newStatus,
        paidAt: newStatus === "Paid" ? new Date().toISOString() : null,
      });

      toast.success("Payment recorded successfully!", { id: toastId });
      setShowPaymentModal(false);
      setManualAmount("");
      setPaymentNote("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to record payment.", { id: toastId });
    } finally {
      setIsRecording(false);
    }
  };

  // Trigger Off-Session Card Charge
  const handleChargeCard = async () => {
    if (!selectedCardId) {
      toast.error("Please select a saved card.");
      return;
    }
    const card = cards.find(c => c.id === selectedCardId);
    if (!card) return;

    setIsCharging(true);
    const toastId = toast.loading(`Initiating off-session charge on card •••• ${card.last4}...`);
    try {
      // In Phase 8, this API calls Stripe. We create a stub API call first.
      const res = await fetch("/api/invoices/charge-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          paymentMethodId: card.paymentMethodId,
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payment charge captured successfully!", { id: toastId });
        setShowChargeModal(false);
      } else {
        toast.error(data.error || "Card declined or charge failed.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error executing credit card charge.", { id: toastId });
    } finally {
      setIsCharging(false);
    }
  };

  const handleDownloadPDF = async () => {
    const toastId = toast.loading("Generating A4 Invoice PDF. Please wait...");
    try {
      const res = await fetch("/api/invoices/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${invoice?.invoiceNumber || "invoice"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success("PDF downloaded successfully!", { id: toastId });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to generate PDF.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error generating invoice PDF.", { id: toastId });
    }
  };

  const handleSendEmail = async () => {
    const toastId = toast.loading("Transmitting invoice email...");
    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Invoice email delivered successfully with PDF attached!", { id: toastId });
      } else {
        toast.error(data.error || "Failed to send email.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error delivering email.", { id: toastId });
    }
  };

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

  const statusColors = {
    Draft: "bg-gray-100 text-gray-800 border-gray-200",
    Sent: "bg-blue-50 text-blue-700 border-blue-100",
    Viewed: "bg-purple-50 text-purple-700 border-purple-100",
    "Partially Paid": "bg-amber-50 text-amber-700 border-amber-100",
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Overdue: "bg-rose-50 text-rose-700 border-rose-100",
    Void: "bg-zinc-100 text-zinc-600 border-zinc-200"
  };

  if (loading || !invoice) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      </div>
    );
  }

  const balanceDue = invoice.total - (invoice.amountPaid || 0);
  const isPaid = invoice.status === "Paid";
  const eligibleCards = cards.filter(c => c.allowOffSession);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Top back actions */}
      <div>
        <Link href="/invoices" className="text-xs font-bold text-primary hover:underline flex items-center gap-1 mb-2">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Invoices
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-brandText tracking-tight">{invoice.invoiceNumber}</h1>
            <span className={`inline-flex px-3 py-1 border rounded-full text-xs font-bold ${statusColors[invoice.status] || "bg-gray-100 text-gray-800"}`}>
              {invoice.status}
            </span>
          </div>
          <p className="text-xs text-muted font-semibold">
            Token URL: <code className="text-primary bg-primary/5 px-2 py-1 rounded">/pay/{invoice.token}</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Main Details Panel */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Printable Invoice Page */}
          <div className="glass-card rounded-2xl p-8 border border-border bg-white shadow-sm text-xs font-semibold text-brandText space-y-8">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-primary to-secondary text-white font-extrabold flex items-center justify-center text-base tracking-wider mb-2">
                  IF
                </div>
                <h2 className="text-lg font-black text-primary">Elevate Marketing Group</h2>
                <p className="text-muted">123 Innovation Drive, Suite 400</p>
                <p className="text-muted">Toronto, ON M5V 2M2</p>
                <p className="text-muted">Canada</p>
              </div>
              <div className="text-right space-y-1">
                <h1 className="text-2xl font-black text-primary">INVOICE</h1>
                <p className="text-sm font-bold text-brandText">{invoice.invoiceNumber}</p>
                <div className="pt-2 text-[10px] text-muted space-y-0.5">
                  <p>DATE: <span className="font-bold text-brandText">{formatDate(invoice.issueDate)}</span></p>
                  <p>DUE DATE: <span className="font-bold text-brandText">{formatDate(invoice.dueDate)}</span></p>
                  <p>CURRENCY: <span className="font-bold text-brandText">{invoice.currency}</span></p>
                </div>
              </div>
            </div>

            {/* Billed To */}
            <div className="border-t border-b border-border py-4">
              <span className="text-[10px] uppercase font-bold text-muted block mb-1">Billed To:</span>
              {customer ? (
                <div className="space-y-0.5">
                  <p className="font-bold text-primary">{customer.firstName} {customer.lastName}</p>
                  <p className="font-medium">{customer.companyName}</p>
                  <p className="text-muted">{customer.billingAddressLine1} {customer.billingAddressLine2}</p>
                  <p className="text-muted">{customer.city}, {customer.stateProvince} {customer.postalCode}</p>
                  <p className="text-muted">{customer.country}</p>
                  <p className="text-muted">Email: {customer.email}</p>
                </div>
              ) : (
                <p className="text-muted italic">Loading recipient profile details...</p>
              )}
            </div>

            {/* Line Items Table */}
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-primary text-muted font-bold pb-2">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 w-16 text-center">Qty</th>
                  <th className="pb-2 w-28 text-right">Unit Price</th>
                  <th className="pb-2 w-12 text-center">Tax</th>
                  <th className="pb-2 w-28 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-brandText">
                {(invoice.lineItems || []).map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3.5 pr-4 whitespace-pre-wrap">{item.description}</td>
                    <td className="py-3.5 text-center">{item.qty}</td>
                    <td className="py-3.5 text-right">{formatCurrency(item.unitPrice, invoice.currency)}</td>
                    <td className="py-3.5 text-center">{item.taxApplicable ? "Yes" : "No"}</td>
                    <td className="py-3.5 text-right font-extrabold">{formatCurrency(item.lineTotal, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations Footer */}
            <div className="flex justify-end pt-4">
              <div className="w-64 space-y-2 text-xs font-semibold">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal:</span>
                  <span>{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Discount:</span>
                    <span>-{formatCurrency(invoice.discountAmount, invoice.currency)}</span>
                  </div>
                )}
                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Tax ({invoice.taxRate}%):</span>
                    <span>{formatCurrency(invoice.taxAmount, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-primary border-t border-border pt-2">
                  <span>Total Due:</span>
                  <span>{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-success pt-1">
                  <span>Amount Paid:</span>
                  <span>{formatCurrency(invoice.amountPaid || 0, invoice.currency)}</span>
                </div>
                {balanceDue > 0 && (
                  <div className="flex justify-between text-base font-black text-error border-t border-dashed border-border pt-2">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(balanceDue, invoice.currency)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes Section */}
            {(invoice.notes || invoice.terms) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-border text-[10px] text-muted leading-relaxed">
                {invoice.notes && (
                  <div>
                    <span className="font-bold uppercase text-brandText block mb-1">Invoice Notes:</span>
                    <p className="bg-gray-50 p-2.5 rounded-lg border border-border">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <span className="font-bold uppercase text-brandText block mb-1">Terms & Conditions:</span>
                    <p className="bg-gray-50 p-2.5 rounded-lg border border-border">{invoice.terms}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payments Transaction Logs */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-6">
            <h3 className="text-xs font-bold text-brandText uppercase tracking-wider border-b border-border pb-3">Payments History</h3>
            {payments.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted font-bold">
                No payments recorded on this invoice yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted font-semibold pb-2">
                      <th className="pb-2">Payment Date</th>
                      <th className="pb-2">Method</th>
                      <th className="pb-2">Transaction Ref</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Recorded By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-semibold text-brandText">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-primary/5">
                        <td className="py-3">{formatDate(p.paidAt)}</td>
                        <td className="py-3">
                          <span className="inline-flex px-2 py-0.5 border border-border rounded-lg bg-gray-50 uppercase text-[9px] font-bold">
                            {p.method}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-[10px] text-muted truncate max-w-[150px]">
                          {p.stripePaymentIntentId || p.stripeChargeId || p.note || "—"}
                        </td>
                        <td className="py-3 font-extrabold text-success">{formatCurrency(p.amount, p.currency)}</td>
                        <td className="py-3 text-muted">{p.recordedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Actions Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-border pb-3">Actions</h3>
            
            {/* Download/Send */}
            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-border hover:bg-gray-50 text-brandText text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF
            </button>

            <button
              onClick={handleSendEmail}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-border hover:bg-gray-50 text-brandText text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Invoice Email
            </button>

            {/* Payment triggers */}
            {!isPaid && (
              <>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Record Manual Payment
                </button>

                {eligibleCards.length > 0 && (
                  <button
                    onClick={() => setShowChargeModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-tr from-primary to-secondary text-white text-xs font-bold rounded-xl shadow-md transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Charge Saved Card
                  </button>
                )}
              </>
            )}

            {/* Void & Duplicate */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              <button
                onClick={handleVoid}
                disabled={invoice.status === "Void"}
                className="py-2.5 border border-border hover:bg-gray-50 text-muted hover:text-brandText text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-40"
              >
                Void
              </button>
              <button
                onClick={handleDuplicate}
                className="py-2.5 border border-border hover:bg-gray-50 text-muted hover:text-brandText text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Duplicate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RECORD MANUAL PAYMENT MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity animate-fade-in" 
            onClick={() => setShowPaymentModal(false)} 
          />

          {/* Positioner */}
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-10">
              {/* Panel */}
              <div className="relative transform rounded-2xl bg-white p-6 border border-border shadow-2xl transition-all w-full max-w-md space-y-4 animate-fade-in my-8 z-20">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Record Manual Payment</h3>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="text-muted hover:text-brandText"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleRecordPayment} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
                      Payment Amount ({invoice.currency}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder={balanceDue.toFixed(2)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Stripe">Stripe Manual</option>
                      <option value="Cheque">Cheque</option>
                      <option value="E-Transfer">Interac E-Transfer</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Internal Reference Note</label>
                    <textarea
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="e.g. Received via Interac confirmation ID #11288..."
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(false)}
                      className="px-4 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isRecording}
                      className="px-6 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                    >
                      {isRecording ? "Recording..." : "Record Payment"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHARGE SAVED CARD MODAL */}
      {showChargeModal && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity animate-fade-in" 
            onClick={() => setShowChargeModal(false)} 
          />

          {/* Positioner */}
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-10">
              {/* Panel */}
              <div className="relative transform rounded-2xl bg-white p-6 border border-border shadow-2xl transition-all w-full max-w-md space-y-4 animate-fade-in my-8 z-20">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Charge Saved Card</h3>
                  <button
                    onClick={() => setShowChargeModal(false)}
                    className="text-muted hover:text-brandText"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-1">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Amount to Charge:</span>
                    <p className="text-xl font-black text-brandText">{formatCurrency(balanceDue, invoice.currency)}</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Select Saved Card</label>
                    <div className="space-y-2">
                      {eligibleCards.map((card) => (
                        <label
                          key={card.id}
                          className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-gray-50 transition-all ${
                            selectedCardId === card.id ? "border-primary bg-primary/5" : "border-border bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="saved_card"
                              checked={selectedCardId === card.id}
                              onChange={() => setSelectedCardId(card.id)}
                              className="h-4 w-4 text-primary border-border focus:ring-primary"
                            />
                            <div className="text-xs font-semibold text-brandText">
                              <p className="capitalize font-bold">{card.brand} •••• {card.last4}</p>
                              <p className="text-[10px] text-muted font-medium">Expires {card.expiry}</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowChargeModal(false)}
                      className="px-4 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleChargeCard}
                      disabled={isCharging || !selectedCardId}
                      className="px-6 py-2 bg-gradient-to-tr from-primary to-secondary hover:opacity-95 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                    >
                      {isCharging ? "Charging..." : "Execute Charge"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
