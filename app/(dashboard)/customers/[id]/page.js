"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, onSnapshot, query, where, updateDoc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStripe } from "@/lib/stripe";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import toast from "react-hot-toast";
import Link from "next/link";

export default function CustomerDetailPage() {
  const { id: customerId } = useParams();
  const router = useRouter();

  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Card Modal controls
  const [showCardModal, setShowCardModal] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [isCreatingSecret, setIsCreatingSecret] = useState(false);

  useEffect(() => {
    if (!customerId) return;

    // 1. Fetch Customer details
    const unsubCust = onSnapshot(doc(db, "customers", customerId), 
      (docSnap) => {
        if (docSnap.exists()) {
          setCustomer({ id: docSnap.id, ...docSnap.data() });
        } else {
          toast.error("Customer profile not found.");
          router.push("/customers");
        }
      },
      (err) => {
        console.error(err);
        toast.error("Error reading customer details.");
      }
    );

    // 2. Fetch Customer invoices
    const qInv = query(collection(db, "invoices"), where("customerId", "==", customerId));
    const unsubInv = onSnapshot(qInv, 
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setInvoices(list);
      },
      (err) => console.error("Error loading customer invoices:", err)
    );

    // 3. Fetch Customer saved cards
    const qCards = query(collection(db, "customers", customerId, "paymentMethods"));
    const unsubCards = onSnapshot(qCards,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCards(list);
        setLoading(false);
      },
      (err) => console.error("Error loading customer cards:", err)
    );

    return () => {
      unsubCust();
      unsubInv();
      unsubCards();
    };
  }, [customerId, router]);

  // Open modal & request Stripe SetupIntent clientSecret
  const handleOpenCardModal = async () => {
    if (!customer?.stripeCustomerId) {
      toast.error("Stripe Customer ID is missing. Cannot add card.");
      return;
    }
    setIsCreatingSecret(true);
    const toastId = toast.loading("Connecting with Stripe...");
    try {
      const res = await fetch("/api/customers/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId: customer.stripeCustomerId }),
      });
      const data = await res.json();
      if (data.success) {
        setClientSecret(data.clientSecret);
        setShowCardModal(true);
        toast.dismiss(toastId);
      } else {
        toast.error(data.error || "Failed to initiate Stripe Element", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error connecting to Stripe setup.", { id: toastId });
    } finally {
      setIsCreatingSecret(false);
    }
  };

  // Toggle off-session charge eligibility on a card
  const handleToggleOffSession = async (cardId, currentValue) => {
    const cardRef = doc(db, "customers", customerId, "paymentMethods", cardId);
    try {
      await updateDoc(cardRef, { allowOffSession: !currentValue });
      toast.success("Card off-session settings updated.");
    } catch (err) {
      toast.error("Failed to update card preferences.");
    }
  };

  // Detach card from Stripe and delete from Firestore
  const handleDeleteCard = async (cardId, pmId) => {
    if (!confirm("Are you sure you want to detach and delete this card?")) return;
    const toastId = toast.loading("Detaching card...");
    try {
      const res = await fetch("/api/customers/detach-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: pmId })
      });
      const data = await res.json();
      if (data.success) {
        await deleteDoc(doc(db, "customers", customerId, "paymentMethods", cardId));
        toast.success("Card detached successfully!", { id: toastId });
      } else {
        toast.error(data.error || "Failed to detach card in Stripe.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error detaching card.", { id: toastId });
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

  if (loading || !customer) {
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
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/customers" className="text-xs font-bold text-primary hover:underline flex items-center gap-1 mb-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Customers
          </Link>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">
            {customer.firstName} {customer.lastName}
          </h1>
          <p className="text-sm text-muted">{customer.companyName || "No Company Specified"}</p>
        </div>
        <button
          onClick={handleOpenCardModal}
          disabled={isCreatingSecret}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all self-start sm:self-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          {isCreatingSecret ? "Connecting..." : "Add Credit Card"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Customer Profile Details & Card Methods */}
        <div className="space-y-8 lg:col-span-1">
          {/* Profile Details Card */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-6">
            <h3 className="text-xs font-bold text-brandText uppercase tracking-wider border-b border-border pb-3">Client Information</h3>
            <div className="space-y-4 text-xs font-semibold">
              <div>
                <span className="text-muted block font-medium">Email Address</span>
                <span className="text-brandText">{customer.email}</span>
              </div>
              <div>
                <span className="text-muted block font-medium">Phone</span>
                <span className="text-brandText">{customer.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted block font-medium">Stripe Customer Reference</span>
                <code className="text-primary bg-primary/5 px-2 py-0.5 rounded text-[10px] border border-primary/10">
                  {customer.stripeCustomerId}
                </code>
              </div>
              <div>
                <span className="text-muted block font-medium">Billing Address</span>
                <span className="text-brandText leading-relaxed block">
                  {customer.billingAddressLine1}
                  {customer.billingAddressLine2 && <><br/>{customer.billingAddressLine2}</>}
                  {customer.city && <><br/>{customer.city}, {customer.stateProvince} {customer.postalCode}</>}
                  {customer.country && <><br/>{customer.country}</>}
                  {!customer.billingAddressLine1 && "No address configured"}
                </span>
              </div>
              <div>
                <span className="text-muted block font-medium">Billing Preference</span>
                <span className="text-brandText uppercase">{customer.currencyPreference}</span>
              </div>
              {customer.notes && (
                <div className="pt-3 border-t border-border">
                  <span className="text-muted block font-medium mb-1">Internal Notes</span>
                  <p className="text-brandText bg-yellow-50/50 p-3 rounded-lg border border-yellow-100 font-medium leading-relaxed italic">
                    {customer.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cards List */}
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50 space-y-6">
            <h3 className="text-xs font-bold text-brandText uppercase tracking-wider border-b border-border pb-3">Saved Card Profiles</h3>
            {cards.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted font-bold">
                No credit cards linked to this client yet.
              </div>
            ) : (
              <div className="space-y-4">
                {cards.map((card) => (
                  <div key={card.id} className="p-4 border border-border rounded-xl bg-white flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Mock Brand Logo */}
                        <div className="h-8 w-11 border border-border rounded bg-gray-50 flex items-center justify-center font-bold text-[10px] text-primary uppercase shrink-0">
                          {card.brand}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-brandText">•••• {card.last4}</p>
                          <p className="text-[10px] text-muted">Expires {card.expiry}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteCard(card.id, card.paymentMethodId)}
                        className="p-1.5 text-muted hover:text-error hover:bg-error/5 rounded-lg transition-all"
                        title="Delete Card"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-border text-[10px]">
                      <span className="font-semibold text-muted uppercase tracking-wider">Allow Off-Session Charges</span>
                      <input
                        type="checkbox"
                        checked={card.allowOffSession || false}
                        onChange={() => handleToggleOffSession(card.id, card.allowOffSession)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Invoice History List */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6 md:p-8 border border-border shadow-sm bg-white/50">
          <h3 className="text-xs font-bold text-brandText uppercase tracking-wider mb-6 border-b border-border pb-3">Invoices History</h3>
          {invoices.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center text-primary mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-xs font-bold text-brandText">No Invoices Associated</h4>
              <p className="text-[10px] text-muted mt-1">Navigate to the Invoice Builder to construct a new bill for this client.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted font-semibold">
                    <th className="pb-3">Invoice #</th>
                    <th className="pb-3">Title</th>
                    <th className="pb-3">Issue Date</th>
                    <th className="pb-3">Due Date</th>
                    <th className="pb-3">Amount</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-semibold text-brandText">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-primary/5 transition-all">
                      <td className="py-3.5">
                        <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline font-bold">
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="py-3.5 truncate max-w-[130px]">{inv.title || "Consulting"}</td>
                      <td className="py-3.5">{formatDate(inv.issueDate)}</td>
                      <td className="py-3.5">{formatDate(inv.dueDate)}</td>
                      <td className="py-3.5 font-bold">{formatCurrency(inv.total || 0, inv.currency)}</td>
                      <td className="py-3.5">
                        <span className={`inline-flex px-2 py-0.5 border rounded-full text-[10px] font-bold ${statusColors[inv.status] || "bg-gray-100 text-gray-800"}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="inline-flex px-2.5 py-1.5 bg-primary/5 hover:bg-primary hover:text-white rounded-lg text-[10px] font-bold text-primary transition-all"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* STRIPE CARD SETUP ELEMENT MODAL */}
      {showCardModal && clientSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full bg-white rounded-2xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Save Card to Customer</h3>
              <button
                onClick={() => setShowCardModal(false)}
                className="text-muted hover:text-brandText"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Elements Provider */}
            <Elements stripe={getStripe()} options={{ clientSecret }}>
              <StripeCardForm 
                customerId={customerId} 
                onSuccess={() => setShowCardModal(false)} 
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inner component to handle Stripe PaymentElement interactions securely.
 */
function StripeCardForm({ customerId, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsSubmitting(true);
    const toastId = toast.loading("Saving card details securely...");

    try {
      // 1. Confirm setup intent with 'if_required' redirects to handle cards inline
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/customers/${customerId}`,
        },
        redirect: "if_required",
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to confirm SetupIntent");
      }

      if (result.setupIntent.status === "succeeded") {
        const pmId = result.setupIntent.payment_method;

        // 2. Fetch Card details from Stripe using server API
        const cardRes = await fetch("/api/customers/retrieve-payment-method", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: pmId }),
        });
        const cardData = await cardRes.json();

        if (!cardData.success) {
          throw new Error(cardData.error || "Failed to fetch card parameters.");
        }

        // 3. Save card method in Firestore subcollection
        const newCardRef = doc(collection(db, "customers", customerId, "paymentMethods"));
        await setDoc(newCardRef, {
          paymentMethodId: pmId,
          last4: cardData.card.last4,
          brand: cardData.card.brand,
          expiry: cardData.card.expiry,
          allowOffSession: false, // Default is false, owner toggles
          createdAt: new Date().toISOString()
        });

        toast.success("Card saved and attached successfully!", { id: toastId });
        onSuccess();
      } else {
        throw new Error("SetupIntent incomplete or status is: " + result.setupIntent.status);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Error setting up card.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stripe Payment Element */}
      <div className="p-3 border border-border rounded-xl bg-gray-50/50">
        <PaymentElement />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !stripe}
          className="px-6 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
        >
          {isSubmitting ? "Saving Card..." : "Confirm & Save Card"}
        </button>
      </div>
    </form>
  );
}
