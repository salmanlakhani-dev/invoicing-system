"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import toast from "react-hot-toast";
import { compileInvoiceHTML } from "@/lib/pdf-template";

let stripePromise = null;

export default function PublicPayPage() {
  const { token } = useParams();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isStripeLoaded, setIsStripeLoaded] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function loadInvoice() {
      try {
        const res = await fetch(`/api/pay/${token}`);
        const result = await res.json();
        if (result.success) {
          setData(result);
          // Initialize Stripe SDK if keys are valid
          if (result.publishableKey && !result.publishableKey.includes("Dummy")) {
            stripePromise = loadStripe(result.publishableKey);
            setIsStripeLoaded(true);
          }
          if (result.stripeError) {
            toast.error(result.stripeError, { duration: 8000 });
          }
        } else {
          toast.error(result.error || "Failed to load invoice.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Error connecting to server.");
      } finally {
        setLoading(false);
      }
    }

    loadInvoice();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-sm font-semibold text-primary/80">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="h-16 w-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-brandText mb-2">Invalid Invoice URL</h2>
        <p className="text-sm text-muted max-w-sm">This billing link is incorrect, expired, or has been revoked. Please contact the issuer.</p>
      </div>
    );
  }

  const { invoice, customer, company, config, clientSecret, stripeError, lateFeeInfo } = data;
  const balanceDue = lateFeeInfo?.balanceDue !== undefined 
    ? lateFeeInfo.balanceDue 
    : Math.max(0, invoice.total - (invoice.amountPaid || 0));
  const isPaid = invoice.status === "Paid" || balanceDue <= 0;
  const isMockStripe = clientSecret && clientSecret.startsWith("pi_mock_secret_");

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: invoice.currency || "CAD",
    }).format(amount) + ` ${invoice.currency || "CAD"}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  };

  const handleDownloadPDF = () => {
    const toastId = toast.loading("Preparing printable invoice PDF...");
    try {
      const html = compileInvoiceHTML({ invoice, company, customer, config });

      // Create a hidden iframe
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for resources/fonts to render
      iframe.contentWindow.focus();
      setTimeout(() => {
        iframe.contentWindow.print();
        toast.success("PDF print dialog opened!", { id: toastId });
        // Clean up
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1500);
      }, 800);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF.", { id: toastId });
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Paid Banner Screen */}
        {isPaid && (
          <div className="glass-card rounded-2xl p-8 border border-success/30 bg-emerald-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="h-12 w-12 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-emerald-900">Invoice Paid in Full</h3>
                <p className="text-xs text-emerald-700/80 font-semibold mt-0.5">Thank you! Payment of {formatCurrency(invoice.total)} has been settled.</p>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="px-5 py-2.5 bg-white border border-success/20 text-success hover:bg-success/5 text-xs font-bold rounded-xl shadow-xs transition-all shrink-0"
            >
              Download Receipt PDF
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Invoice Card (Left column: lg:col-span-7) */}
          <div className="lg:col-span-7 glass-card rounded-2xl p-6 sm:p-8 border border-border bg-white shadow-lg text-xs font-semibold text-brandText space-y-8">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt="Logo" className="h-10 object-contain mb-2" />
                ) : (
                  <img src="/logo/Logo%20Icon%20Color.png" alt="Elevate TM Invoicing Logo" className="h-10 object-contain mb-2" />
                )}
                <h2 className="text-lg font-black text-primary">{company.companyName || "Elevate Marketing Group"}</h2>
                <p className="text-muted">{company.addressLine1} {company.addressLine2}</p>
                <p className="text-muted">{company.city}, {company.stateProvince} {company.postalCode}</p>
                <p className="text-muted">{company.country}</p>
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
              <div className="space-y-0.5">
                <p className="font-bold text-primary">{customer.firstName} {customer.lastName}</p>
                <p className="font-medium">{customer.companyName}</p>
                <p className="text-muted">{customer.billingAddressLine1} {customer.billingAddressLine2}</p>
                <p className="text-muted">{customer.city}, {customer.stateProvince} {customer.postalCode}</p>
                <p className="text-muted">{customer.country}</p>
                <p className="text-muted">Email: {customer.email}</p>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-primary text-muted font-bold pb-2">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 w-16 text-center">Qty</th>
                  <th className="pb-2 w-28 text-right">Unit Price</th>
                  <th className="pb-2 w-28 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium text-brandText">
                {(invoice.lineItems || []).map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3.5 pr-4 whitespace-pre-wrap">{item.description}</td>
                    <td className="py-3.5 text-center">{item.qty}</td>
                    <td className="py-3.5 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3.5 text-right font-extrabold">{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations Footer */}
            <div className="flex justify-end pt-4">
              <div className="w-72 space-y-2 text-xs font-semibold">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal:</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Discount:</span>
                    <span>-{formatCurrency(invoice.discountAmount)}</span>
                  </div>
                )}
                {invoice.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Tax ({invoice.taxRate}%):</span>
                    <span>{formatCurrency(invoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-primary border-t border-border pt-2">
                  <span>Total Due:</span>
                  <span>{formatCurrency(invoice.total)}</span>
                </div>
                {lateFeeInfo?.applied && (
                  <>
                    <div className="flex justify-between text-xs font-bold text-rose-600 border-t border-border pt-2">
                      <span>Late Payment Fee ({lateFeeInfo.type === "percent" ? `${lateFeeInfo.value}%` : "Fixed"}):</span>
                      <span>+{formatCurrency(lateFeeInfo.feeAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-brandText">
                      <span>Adjusted Total:</span>
                      <span>{formatCurrency(lateFeeInfo.adjustedTotal)}</span>
                    </div>
                  </>
                )}
                {invoice.amountPaid > 0 && (
                  <div className="flex justify-between text-xs font-bold text-success pt-1">
                    <span>Amount Paid:</span>
                    <span>{formatCurrency(invoice.amountPaid)}</span>
                  </div>
                )}
                {balanceDue > 0 && (
                  <div className="flex justify-between text-base font-black text-error border-t border-dashed border-border pt-2">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(balanceDue)}</span>
                  </div>
                )}

                {/* Quick popup payment trigger right under balance */}
                {!isPaid && (
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="w-full py-2.5 px-4 bg-[#FE1D66] hover:bg-[#D0104E] text-white text-xs font-extrabold rounded-xl shadow-md shadow-secondary/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span>Pay Now in Popup ({formatCurrency(balanceDue)})</span>
                    </button>
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

          {/* Payment Gateway Form (Right Column: lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            {!isPaid && (
              <div className="glass-card rounded-2xl sm:rounded-3xl p-6 sm:p-7 border border-border bg-white shadow-xl space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold mb-2">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Secure Online Checkout</span>
                    </div>
                    <h3 className="text-base font-black text-brandText">Payment Gateway</h3>
                    <p className="text-xs text-muted mt-0.5">Submit your card or Link details below to settle this invoice.</p>
                  </div>

                  {/* Switch to Popup button */}
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(true)}
                    title="Open checkout in large popup modal"
                    className="p-2 sm:px-3 sm:py-2 text-xs font-bold text-primary hover:text-white hover:bg-primary rounded-xl border border-primary/20 bg-primary/5 flex items-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-xs"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span className="hidden sm:inline">Popup View</span>
                  </button>
                </div>

                {/* Prominent Balance Banner */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/80 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">Balance Due</span>
                    <span className="text-xl font-black text-brandText">{formatCurrency(balanceDue)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">Due Date</span>
                    <span className="text-xs font-bold text-rose-600">{formatDate(invoice.dueDate)}</span>
                  </div>
                </div>

                {/* Inline Payment Gateway UI */}
                {!showPaymentModal ? (
                  stripeError ? (
                    <div className="p-4 border border-rose-200 rounded-xl bg-rose-50/50 space-y-2 text-xs text-left">
                      <h4 className="font-bold text-rose-700 uppercase tracking-wider">⚠️ Payment Gateway Error</h4>
                      <p className="text-rose-600/90 leading-relaxed font-semibold">
                        {stripeError}
                      </p>
                      <p className="text-[10px] text-muted pt-1 border-t border-rose-100">
                        Stripe secret keys must match your publishable key mode and must be set in your server environments (Vercel or .env.local).
                      </p>
                    </div>
                  ) : isMockStripe ? (
                    // Mock Sandbox Checkout UI
                    <MockCheckoutForm 
                      invoiceId={invoice.id} 
                      amount={balanceDue} 
                      currency={invoice.currency} 
                    />
                  ) : (
                    // Live/Sandbox Stripe Checkout Element with roomy container
                    isStripeLoaded && clientSecret ? (
                      <div className="space-y-4">
                        <Elements stripe={stripePromise} options={{ clientSecret }}>
                          <StripeCheckoutForm invoiceId={invoice.id} amountText={formatCurrency(balanceDue)} />
                        </Elements>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-muted">
                        {clientSecret ? "Stripe client loading..." : "Stripe checkout could not be initialized."}
                      </div>
                    )
                  )
                ) : (
                  <div className="p-6 text-center rounded-2xl border-2 border-dashed border-primary/20 bg-primary/5 space-y-3">
                    <div className="h-10 w-10 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-brandText">Checkout is active in the Popup Window</p>
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(false)}
                      className="px-4 py-2 bg-white border border-border hover:bg-slate-50 text-xs font-bold rounded-xl text-primary shadow-xs transition-all cursor-pointer"
                    >
                      Return to inline view
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-border hover:bg-gray-50 text-brandText text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF Copy
            </button>
          </div>

        </div>
      </div>

      {/* Spacious Fullscreen Checkout Popup Modal */}
      {showPaymentModal && !isPaid && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowPaymentModal(false)}
        >
          <div 
            className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-border bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-brandText">Secure Payment Checkout</h3>
                  <p className="text-xs text-muted">Invoice #{invoice.invoiceNumber} • {customer.companyName || `${customer.firstName} ${customer.lastName}`}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="p-2 text-muted hover:text-brandText hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body with Large Spacious Elements Container */}
            <div className="p-6 sm:p-8 space-y-6 max-h-[82vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/15">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">Total Amount Due</span>
                  <span className="text-2xl font-black text-primary">{formatCurrency(balanceDue)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>256-Bit SSL Encrypted</span>
                </div>
              </div>

              {stripeError ? (
                <div className="p-4 border border-rose-200 rounded-xl bg-rose-50/50 space-y-2 text-xs text-left">
                  <h4 className="font-bold text-rose-700 uppercase tracking-wider">⚠️ Payment Gateway Error</h4>
                  <p className="text-rose-600/90 leading-relaxed font-semibold">{stripeError}</p>
                </div>
              ) : isMockStripe ? (
                <MockCheckoutForm 
                  invoiceId={invoice.id} 
                  amount={balanceDue} 
                  currency={invoice.currency} 
                />
              ) : (
                isStripeLoaded && clientSecret ? (
                  <div className="space-y-4">
                    <Elements stripe={stripePromise} options={{ clientSecret }}>
                      <StripeCheckoutForm invoiceId={invoice.id} amountText={formatCurrency(balanceDue)} />
                    </Elements>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-muted">
                    {clientSecret ? "Stripe client loading..." : "Stripe checkout could not be initialized."}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inner component to handle real Stripe checkout elements confirmation.
 */
function StripeCheckoutForm({ invoiceId, amountText }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsPaying(true);
    const toastId = toast.loading("Processing transaction...");

    try {
      // In Phase 8 webhook, payment intent status will transition invoice to paid
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, // Re-load same page showing Receipt state
        },
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to confirm Stripe Payment");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Payment processing failed.", { id: toastId });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-4 sm:p-5 border border-border/80 rounded-2xl bg-white shadow-xs">
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={isPaying || !stripe}
        className="w-full py-3.5 bg-[#FE1D66] hover:bg-[#D0104E] text-white text-xs sm:text-sm font-black rounded-xl shadow-lg shadow-secondary/15 transition-all disabled:opacity-50 cursor-pointer"
      >
        {isPaying ? "Processing Payment..." : `Settle Balance Due ${amountText ? `(${amountText})` : ""}`}
      </button>
    </form>
  );
}

/**
 * Inner component to handle Simulated Mock sandbox checkout.
 */
function MockCheckoutForm({ invoiceId, amount, currency }) {
  const [isPaying, setIsPaying] = useState(false);
  const router = useRouter();

  const handleSimulatePayment = async () => {
    setIsPaying(true);
    const toastId = toast.loading("Simulating transaction capture...");
    try {
      // Direct call to charge-card endpoint using mock payment method ID
      const res = await fetch("/api/invoices/charge-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          paymentMethodId: "pm_mock_checkout_card",
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Simulation Success! Payment settled.", { id: toastId });
        // Hard reload the window to update Firestore states
        window.location.reload();
      } else {
        toast.error(data.error || "Simulation failed.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error simulating payment.", { id: toastId });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 border border-primary/10 rounded-xl bg-primary/5 space-y-2 text-xs">
        <h4 className="font-bold text-primary uppercase tracking-wider">🛠️ Sandbox Mock Checkout</h4>
        <p className="text-brandText/70 leading-relaxed">
          Stripe is running in test configuration. Click the button below to simulate a successful client payment. This writes a transaction entry and marks the invoice as Paid in your database.
        </p>
      </div>
      <button
        onClick={handleSimulatePayment}
        disabled={isPaying}
        className="w-full py-3 bg-[#FE1D66] hover:bg-[#D0104E] text-white text-xs font-extrabold rounded-xl shadow-md shadow-secondary/15 transition-all disabled:opacity-50"
      >
        {isPaying ? "Simulating capture..." : "Settle Balance Due (Simulate)"}
      </button>
    </div>
  );
}
