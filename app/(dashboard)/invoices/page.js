"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import Link from "next/link";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [selectedInvoices, setSelectedInvoices] = useState([]);

  useEffect(() => {
    // 1. Fetch Invoices
    const qInv = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubInv = onSnapshot(qInv,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setInvoices(list);
      },
      (err) => {
        console.error("Error reading invoices:", err);
        toast.error("Failed to load invoices.");
      }
    );

    // 2. Fetch Customers for dropdown filter and name mapping
    const qCust = query(collection(db, "customers"));
    const unsubCust = onSnapshot(qCust,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCustomers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error reading customers:", err);
        setLoading(false);
      }
    );

    return () => {
      unsubInv();
      unsubCust();
    };
  }, []);

  const getCustomerName = (customerId) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return "Unknown Client";
    return cust.companyName ? `${cust.companyName} (${cust.firstName})` : `${cust.firstName} ${cust.lastName}`;
  };

  const handleSelectInvoice = (id) => {
    setSelectedInvoices((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedInvoices(filteredInvoices.map((inv) => inv.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  // Bulk Actions
  const handleBulkVoid = async () => {
    if (selectedInvoices.length === 0) return;
    if (!confirm(`Are you sure you want to void ${selectedInvoices.length} selected invoices?`)) return;

    const toastId = toast.loading("Voiding invoices...");
    try {
      const batch = writeBatch(db);
      selectedInvoices.forEach((id) => {
        const invRef = doc(db, "invoices", id);
        batch.update(invRef, { status: "Void" });
      });
      await batch.commit();
      toast.success("Selected invoices voided successfully!", { id: toastId });
      setSelectedInvoices([]);
    } catch (err) {
      toast.error("Failed to void selected invoices.", { id: toastId });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInvoices.length === 0) return;

    // Filter to only drafts (only drafts can be deleted)
    const draftsOnly = invoices.filter(
      (inv) => selectedInvoices.includes(inv.id) && inv.status === "Draft"
    );

    if (draftsOnly.length === 0) {
      toast.error("Only invoices in Draft status can be deleted.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete the ${draftsOnly.length} selected Draft invoices? (Non-draft invoices will be ignored)`
      )
    )
      return;

    const toastId = toast.loading("Deleting draft invoices...");
    try {
      const batch = writeBatch(db);
      draftsOnly.forEach((inv) => {
        const invRef = doc(db, "invoices", inv.id);
        batch.delete(invRef);
      });
      await batch.commit();
      toast.success("Selected draft invoices deleted successfully!", { id: toastId });
      setSelectedInvoices([]);
    } catch (err) {
      toast.error("Failed to delete selected invoices.", { id: toastId });
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
      day: "2-digit",
    });
  };

  // Status badging styles
  const statusColors = {
    Draft: "bg-gray-100 text-gray-800 border-gray-200",
    Sent: "bg-blue-50 text-blue-700 border-blue-100",
    Viewed: "bg-purple-50 text-purple-700 border-purple-100",
    "Partially Paid": "bg-amber-50 text-amber-700 border-amber-100",
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Overdue: "bg-rose-50 text-rose-700 border-rose-100",
    Void: "bg-zinc-100 text-zinc-600 border-zinc-200"
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const invoiceNum = (inv.invoiceNumber || "").toLowerCase();
    const invoiceTitle = (inv.title || "").toLowerCase();
    const customerName = getCustomerName(inv.customerId).toLowerCase();
    const queryStr = search.toLowerCase();

    const matchesSearch =
      invoiceNum.includes(queryStr) || invoiceTitle.includes(queryStr) || customerName.includes(queryStr);
    
    const matchesStatus = statusFilter === "All" || inv.status === statusFilter;
    const matchesCustomer = customerFilter === "All" || inv.customerId === customerFilter;

    return matchesSearch && matchesStatus && matchesCustomer;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">Invoices</h1>
          <p className="text-sm text-muted">Create billing demands, track unpaid client transactions, and execute bulk operations.</p>
        </div>

        <Link
          href="/invoices/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all self-start sm:self-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Invoice
        </Link>
      </div>

      {/* Filters and List */}
      <div className="glass-card rounded-2xl border border-border shadow-sm overflow-hidden bg-white/50">
        
        {/* Search & Filter Header */}
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-xs w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search invoice #, title, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-xs text-brandText placeholder-muted/70 focus:border-primary focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Customer filter */}
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-white text-xs text-brandText focus:border-primary focus:outline-none transition-all"
            >
              <option value="All">All Clients</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName || `${c.firstName} ${c.lastName}`}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-border bg-white text-xs text-brandText focus:border-primary focus:outline-none transition-all"
            >
              <option value="All">All Statuses</option>
              {["Draft", "Sent", "Viewed", "Partially Paid", "Paid", "Overdue", "Void"].map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Action Controls */}
        {selectedInvoices.length > 0 && (
          <div className="px-6 py-3.5 bg-primary/5 border-b border-border flex items-center justify-between gap-4 animate-fade-in">
            <span className="text-xs font-bold text-primary">
              {selectedInvoices.length} Invoices selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkVoid}
                className="px-3 py-1.5 border border-border hover:border-brandText text-brandText text-[10px] font-bold rounded-lg bg-white shadow-sm transition-all"
              >
                Void Selected
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-bold rounded-lg shadow-sm transition-all"
              >
                Delete Selected Drafts
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-brandText">No Invoices Found</h4>
            <p className="text-xs text-muted mt-1 max-w-xs font-semibold">Construct invoices, issue terms, and accept automated credit card charges.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-primary/5 text-muted font-semibold">
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={
                        filteredInvoices.length > 0 &&
                        selectedInvoices.length === filteredInvoices.length
                      }
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="p-4">Invoice #</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Title</th>
                  <th className="p-4">Issue Date</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-primary/5 font-semibold text-brandText transition-all">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(inv.id)}
                        onChange={() => handleSelectInvoice(inv.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="p-4">
                      <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline font-bold">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="p-4 truncate max-w-[150px]">{getCustomerName(inv.customerId)}</td>
                    <td className="p-4 truncate max-w-[150px] font-medium text-muted">{inv.title || "Consulting"}</td>
                    <td className="p-4 text-muted">{formatDate(inv.issueDate)}</td>
                    <td className="p-4 text-muted">{formatDate(inv.dueDate)}</td>
                    <td className="p-4 font-extrabold">{formatCurrency(inv.total || 0, inv.currency)}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-0.5 border rounded-full text-[10px] font-bold ${statusColors[inv.status] || "bg-gray-100 text-gray-800"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="p-1.5 text-primary hover:bg-primary/5 rounded-lg transition-all"
                        title="View Details"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </Link>
                      {inv.status === "Draft" && (
                        <Link
                          href={`/invoices/${inv.id}/edit`}
                          className="p-1.5 text-primary hover:bg-primary/5 rounded-lg transition-all"
                          title="Edit Invoice"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
