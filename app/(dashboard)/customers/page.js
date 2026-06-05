"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import Link from "next/link";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New customer form state
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
    billingAddressLine1: "",
    billingAddressLine2: "",
    city: "",
    stateProvince: "",
    postalCode: "",
    country: "",
    currencyPreference: "CAD",
    notes: "",
  });

  useEffect(() => {
    // 1. Fetch Customers
    const qCust = query(collection(db, "customers"));
    const unsubCust = onSnapshot(qCust, 
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setCustomers(list);
      },
      (err) => {
        console.error("Customers read error:", err);
        toast.error("Failed to load customers.");
      }
    );

    // 2. Fetch Invoices to calculate balances dynamically
    const qInv = query(collection(db, "invoices"));
    const unsubInv = onSnapshot(qInv, 
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setInvoices(list);
        setLoading(false);
      },
      (err) => {
        console.error("Invoices read error:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubCust();
      unsubInv();
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.firstName || !form.lastName) {
      toast.error("Please fill in all required fields (First Name, Last Name, Email).");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Adding customer...");

    try {
      // 1. Create Customer in Stripe via API
      const address = {
        line1: form.billingAddressLine1,
        line2: form.billingAddressLine2,
        city: form.city,
        state: form.stateProvince,
        postalCode: form.postalCode,
        country: form.country,
      };

      const stripeRes = await fetch("/api/customers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${form.firstName} ${form.lastName}`,
          email: form.email,
          phone: form.phone,
          companyName: form.companyName,
          address,
        }),
      });

      const stripeData = await stripeRes.json();
      if (!stripeData.success) {
        throw new Error(stripeData.error || "Failed to create Stripe customer.");
      }

      // 2. Save Customer to Firestore
      await addDoc(collection(db, "customers"), {
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        billingAddressLine1: form.billingAddressLine1,
        billingAddressLine2: form.billingAddressLine2,
        city: form.city,
        stateProvince: form.stateProvince,
        postalCode: form.postalCode,
        country: form.country,
        currencyPreference: form.currencyPreference,
        notes: form.notes,
        stripeCustomerId: stripeData.stripeCustomerId,
        createdAt: new Date().toISOString()
      });

      toast.success("Customer added successfully!", { id: toastId });
      setShowModal(false);
      
      // Reset form
      setForm({
        firstName: "",
        lastName: "",
        companyName: "",
        email: "",
        phone: "",
        billingAddressLine1: "",
        billingAddressLine2: "",
        city: "",
        stateProvince: "",
        postalCode: "",
        country: "",
        currencyPreference: "CAD",
        notes: "",
      });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add customer.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculations for list columns
  const getCustomerMetrics = (customerId) => {
    const custInvoices = invoices.filter((inv) => inv.customerId === customerId);
    
    const totalInvoiced = custInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    
    const outstanding = custInvoices
      .filter((inv) => ["Sent", "Viewed", "Partially Paid", "Overdue"].includes(inv.status))
      .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.amountPaid || 0)), 0);

    return { totalInvoiced, outstanding };
  };

  const filteredCustomers = customers.filter((cust) => {
    const fullName = `${cust.firstName} ${cust.lastName}`.toLowerCase();
    const company = (cust.companyName || "").toLowerCase();
    const email = (cust.email || "").toLowerCase();
    const queryStr = search.toLowerCase();

    return fullName.includes(queryStr) || company.includes(queryStr) || email.includes(queryStr);
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">Customers</h1>
          <p className="text-sm text-muted">Manage your client contacts, invoice balances, and saved payment profiles.</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all self-start sm:self-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Customer
        </button>
      </div>

      {/* Filter and Table Grid */}
      <div className="glass-card rounded-2xl border border-border shadow-sm overflow-hidden bg-white/50">
        {/* Search header bar */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="relative max-w-md w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by name, email, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-xs text-brandText placeholder-muted/70 focus:border-primary focus:outline-none transition-all"
            />
          </div>
          <span className="text-xs text-muted font-bold">Total: {filteredCustomers.length} clients</span>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-brandText">No Customers Found</h4>
            <p className="text-xs text-muted mt-1 max-w-xs">Try searching a different name, or click Add Customer to register a new client profile.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-primary/5 text-muted font-semibold">
                  <th className="p-4">Customer Name</th>
                  <th className="p-4">Company</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Total Invoiced</th>
                  <th className="p-4">Outstanding</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((cust) => {
                  const metrics = getCustomerMetrics(cust.id);
                  return (
                    <tr key={cust.id} className="hover:bg-primary/5 font-semibold text-brandText transition-all">
                      <td className="p-4">
                        <Link href={`/customers/${cust.id}`} className="text-primary hover:underline font-bold">
                          {cust.firstName} {cust.lastName}
                        </Link>
                      </td>
                      <td className="p-4 truncate max-w-[130px]">{cust.companyName || "N/A"}</td>
                      <td className="p-4 truncate max-w-[150px]">{cust.email}</td>
                      <td className="p-4">${metrics.totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-error">
                        {metrics.outstanding > 0 ? `$${metrics.outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right">
                        <Link
                          href={`/customers/${cust.id}`}
                          className="inline-flex px-3 py-1.5 bg-primary/5 hover:bg-primary hover:text-white rounded-lg text-[10px] font-bold text-primary transition-all"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD CUSTOMER MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
          <div className="glass-card max-w-2xl w-full bg-white rounded-2xl p-6 md:p-8 border border-border shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h3 className="text-base font-bold text-brandText uppercase tracking-wider">Add New Customer</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-brandText"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Primary Contact Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Contact Info</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">First Name *</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      value={form.firstName}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Last Name *</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      value={form.lastName}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Company Name</label>
                    <input
                      type="text"
                      name="companyName"
                      value={form.companyName}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Acme Corporation"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="jane.doe@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Phone</label>
                    <input
                      type="text"
                      name="phone"
                      value={form.phone}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="+1 (555) 012-3456"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Currency Preference</label>
                    <select
                      name="currencyPreference"
                      value={form.currencyPreference}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                    >
                      <option value="CAD">CAD ($)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Billing Address Details */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Billing Address</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Address Line 1</label>
                    <input
                      type="text"
                      name="billingAddressLine1"
                      value={form.billingAddressLine1}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="456 Main St"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Address Line 2</label>
                    <input
                      type="text"
                      name="billingAddressLine2"
                      value={form.billingAddressLine2}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Apt 2B"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">City</label>
                    <input
                      type="text"
                      name="city"
                      value={form.city}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Vancouver"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Province / State</label>
                    <input
                      type="text"
                      name="stateProvince"
                      value={form.stateProvince}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="BC"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Postal / Zip Code</label>
                    <input
                      type="text"
                      name="postalCode"
                      value={form.postalCode}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="V6B 3H6"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Country</label>
                    <input
                      type="text"
                      name="country"
                      value={form.country}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                      placeholder="Canada"
                    />
                  </div>
                </div>
              </div>

              {/* Internal Notes */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Internal Notes</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                    placeholder="Wants invoices on 1st of the month, etc..."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Provisioning..." : "Add & Provision Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
