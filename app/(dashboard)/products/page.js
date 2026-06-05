"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, doc, addDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  // Modal controls
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    unitPrice: "",
    currency: "CAD",
    type: "Service",
    taxApplicable: true,
  });

  useEffect(() => {
    const q = query(collection(db, "products"));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setProducts(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load product catalog.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setForm({
      name: "",
      description: "",
      unitPrice: "",
      currency: "CAD",
      type: "Service",
      taxApplicable: true,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setForm({
      name: prod.name,
      description: prod.description || "",
      unitPrice: prod.unitPrice,
      currency: prod.currency || "CAD",
      type: prod.type || "Service",
      taxApplicable: prod.taxApplicable !== false,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.unitPrice) {
      toast.error("Please fill in all required fields (Name, Unit Price).");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(editingProduct ? "Updating product..." : "Adding product...");

    try {
      const productPayload = {
        name: form.name,
        description: form.description,
        unitPrice: parseFloat(form.unitPrice) || 0,
        currency: form.currency,
        type: form.type,
        taxApplicable: form.taxApplicable,
      };

      if (editingProduct) {
        // Edit Mode
        await updateDoc(doc(db, "products", editingProduct.id), productPayload);
        toast.success("Product updated successfully!", { id: toastId });
      } else {
        // Add Mode
        await addDoc(collection(db, "products"), {
          ...productPayload,
          createdAt: new Date().toISOString()
        });
        toast.success("Product added successfully!", { id: toastId });
      }
      setShowModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Operation failed.", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (productId) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    const toastId = toast.loading("Deleting product...");
    try {
      await deleteDoc(doc(db, "products", productId));
      toast.success("Product deleted successfully!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete product.", { id: toastId });
    }
  };

  const formatCurrency = (amount, currencyCode) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(amount) + ` ${currencyCode}`;
  };

  const filteredProducts = products.filter((prod) => {
    const name = prod.name.toLowerCase();
    const desc = (prod.description || "").toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase()) || desc.includes(search.toLowerCase());
    const matchesType = typeFilter === "All" || prod.type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">Products & Services</h1>
          <p className="text-sm text-muted">Manage the catalog of offerings that can be added as line items to invoices.</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all self-start sm:self-center"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product / Service
        </button>
      </div>

      {/* Filter Options and Table */}
      <div className="glass-card rounded-2xl border border-border shadow-sm overflow-hidden bg-white/50">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Search bar */}
          <div className="relative max-w-md w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search products/services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-white text-xs text-brandText placeholder-muted/70 focus:border-primary focus:outline-none transition-all"
            />
          </div>

          {/* Type filters */}
          <div className="inline-flex rounded-xl bg-white border border-border p-1 shadow-sm shrink-0">
            {["All", "Product", "Service"].map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  typeFilter === type ? "bg-primary text-white" : "text-muted hover:text-brandText"
                }`}
              >
                {type}s
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-brandText">No Offerings Cataloged</h4>
            <p className="text-xs text-muted mt-1 max-w-xs">Create your first billing product or hourly service rate to start invoicing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-primary/5 text-muted font-semibold">
                  <th className="p-4">Name</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Taxable</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-primary/5 font-semibold text-brandText transition-all">
                    <td className="p-4 font-bold text-primary">{prod.name}</td>
                    <td className="p-4 truncate max-w-[200px] text-muted font-medium">{prod.description || "—"}</td>
                    <td className="p-4 font-extrabold">{formatCurrency(prod.unitPrice, prod.currency)}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${
                        prod.type === "Service" ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-blue-50 text-blue-700 border-blue-100"
                      }`}>
                        {prod.type}
                      </span>
                    </td>
                    <td className="p-4">
                      {prod.taxApplicable ? (
                        <span className="text-success font-bold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-success"></span> Yes
                        </span>
                      ) : (
                        <span className="text-muted font-medium flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted"></span> No
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(prod)}
                        className="p-1.5 text-primary hover:bg-primary/5 rounded-lg transition-all"
                        title="Edit Item"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(prod.id)}
                        className="p-1.5 text-muted hover:text-error hover:bg-error/5 rounded-lg transition-all"
                        title="Delete Item"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD / EDIT CATALOG MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full bg-white rounded-2xl p-6 border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">
                {editingProduct ? "Edit Catalog Item" : "Add Catalog Item"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-brandText"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Item Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={form.name}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                  placeholder="Monthly SEO Audit"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                  placeholder="Includes competitor analysis and ranking indicators..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Unit Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="unitPrice"
                    required
                    value={form.unitPrice}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                    placeholder="999.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Currency</label>
                  <select
                    name="currency"
                    value={form.currency}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                  >
                    <option value="CAD">CAD ($)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Offer Type</label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                  >
                    <option value="Service">Service</option>
                    <option value="Product">Product</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <input
                    type="checkbox"
                    id="taxApplicable"
                    name="taxApplicable"
                    checked={form.taxApplicable}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="taxApplicable" className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brandText">
                    Apply Tax
                  </label>
                </div>
              </div>

              {/* Actions */}
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
                  {isSubmitting ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
