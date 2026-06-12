"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("company");
  const [loading, setLoading] = useState(true);

  // Auth context and router
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Role Protection: Admin Only
  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== "admin") {
        toast.error("Forbidden: Admin access required.");
        router.push("/");
      }
    }
  }, [user, authLoading, router]);

  // Staff States
  const [staffList, setStaffList] = useState([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("staff");
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [isDeletingStaff, setIsDeletingStaff] = useState(null);

  // Form states
  const [company, setCompany] = useState({
    companyName: "",
    logoUrl: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateProvince: "",
    postalCode: "",
    country: "",
    phone: "",
    email: "",
    website: "",
    gstHstNumber: "",
    defaultCurrency: "CAD",
  });

  const [invoiceConfig, setInvoiceConfig] = useState({
    prefix: "",
    currentCounter: 1,
    defaultDueDays: 15,
    defaultNotes: "",
    defaultTerms: "",
    taxLabel: "HST",
    taxRate: 13,
    taxEnabledByDefault: true,
  });

  const [smtp, setSmtp] = useState({
    resendApiKey: "",
    encryptedResendApiKey: "",
    fromName: "",
    fromEmail: "",
  });

  const [stripeConfig, setStripeConfig] = useState({
    publishableKey: "",
    testMode: true,
    secretKeyPlaceholder: "••••••••••••••••••••••••",
    secretKeyInput: "", // used for testing connection dynamically
  });

  // Verification modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isTestingStripe, setIsTestingStripe] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const companyDoc = await getDoc(doc(db, "settings", "company"));
        if (companyDoc.exists()) setCompany(prev => ({ ...prev, ...companyDoc.data() }));

        const invoiceDoc = await getDoc(doc(db, "settings", "invoiceConfig"));
        if (invoiceDoc.exists()) setInvoiceConfig(prev => ({ ...prev, ...invoiceDoc.data() }));

        const smtpDoc = await getDoc(doc(db, "settings", "smtp"));
        if (smtpDoc.exists()) {
          const data = smtpDoc.data();
          setSmtp(prev => ({ 
            ...prev, 
            ...data,
            resendApiKey: data.encryptedResendApiKey ? window.atob(data.encryptedResendApiKey) : ""
          }));
        }

        const stripeDoc = await getDoc(doc(db, "settings", "stripe"));
        if (stripeDoc.exists()) setStripeConfig(prev => ({ ...prev, ...stripeDoc.data() }));
      } catch (err) {
        console.error("Failed to load settings from Firestore:", err);
        toast.error("Error loading settings from database.");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Save Handlers
  const handleSaveCompany = async (e) => {
    e.preventDefault();
    const loadId = toast.loading("Saving company details...");
    try {
      await setDoc(doc(db, "settings", "company"), company);
      toast.success("Company details saved successfully!", { id: loadId });
    } catch (err) {
      toast.error("Failed to save company details.", { id: loadId });
    }
  };

  const handleSaveInvoiceConfig = async (e) => {
    e.preventDefault();
    const loadId = toast.loading("Saving invoice settings...");
    try {
      await setDoc(doc(db, "settings", "invoiceConfig"), {
        ...invoiceConfig,
        currentCounter: parseInt(invoiceConfig.currentCounter, 10) || 1,
        taxRate: parseFloat(invoiceConfig.taxRate) || 0,
        defaultDueDays: parseInt(invoiceConfig.defaultDueDays, 10) || 15
      });
      toast.success("Invoice settings saved successfully!", { id: loadId });
    } catch (err) {
      toast.error("Failed to save invoice settings.", { id: loadId });
    }
  };

  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    const loadId = toast.loading("Saving email configurations...");
    try {
      const encryptedResendApiKey = smtp.resendApiKey ? window.btoa(smtp.resendApiKey) : "";
      await setDoc(doc(db, "settings", "smtp"), {
        encryptedResendApiKey,
        fromName: smtp.fromName || "",
        fromEmail: smtp.fromEmail || ""
      });
      toast.success("Email settings saved successfully!", { id: loadId });
    } catch (err) {
      toast.error("Failed to save email settings.", { id: loadId });
    }
  };

  const handleSaveStripe = async (e) => {
    e.preventDefault();
    const loadId = toast.loading("Saving Stripe credentials...");
    try {
      await setDoc(doc(db, "settings", "stripe"), {
        publishableKey: stripeConfig.publishableKey,
        testMode: stripeConfig.testMode,
      });
      toast.success("Stripe settings saved successfully!", { id: loadId });
    } catch (err) {
      toast.error("Failed to save Stripe settings.", { id: loadId });
    }
  };

  // Diagnostic Test Actions
  const handleTestEmail = async () => {
    if (!testRecipient) {
      toast.error("Please enter a recipient email address.");
      return;
    }
    setIsTestingEmail(true);
    const toastId = toast.loading(`Sending test email to ${testRecipient}...`);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: {
            provider: "resend",
            resendApiKey: smtp.resendApiKey,
            fromName: smtp.fromName,
            fromEmail: smtp.fromEmail,
          },
          testRecipient
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Test email sent! Please check your inbox.", { id: toastId });
        setShowEmailModal(false);
      } else {
        toast.error(data.error || "Failed to send email.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error testing email config.", { id: toastId });
    } finally {
      setIsTestingEmail(false);
    }
  };

  const handleTestStripe = async () => {
    setIsTestingStripe(true);
    const toastId = toast.loading("Testing Stripe API connection...");
    try {
      const res = await fetch("/api/settings/test-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretKey: stripeConfig.secretKeyInput || null // uses env fallback if empty
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Success! Connected to Stripe Account: ${data.accountName}`, { id: toastId });
      } else {
        toast.error(data.error || "Failed to verify connection.", { id: toastId });
      }
    } catch (err) {
      toast.error("Network error testing Stripe credentials.", { id: toastId });
    } finally {
      setIsTestingStripe(false);
    }
  };

  const fetchStaffList = async () => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/staff", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setStaffList(data.users);
      }
    } catch (err) {
      console.error("Error fetching staff list:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "staff" && user) {
      fetchStaffList();
    }
  }, [activeTab, user]);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!staffEmail || !staffPassword || !staffName) {
      toast.error("Please fill out all fields.");
      return;
    }
    setIsCreatingStaff(true);
    const toastId = toast.loading(`Creating ${staffRole} member...`);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: staffEmail,
          password: staffPassword,
          name: staffName,
          role: staffRole
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Success! Created ${staffRole} member.`, { id: toastId });
        setStaffEmail("");
        setStaffPassword("");
        setStaffName("");
        setStaffRole("staff");
        fetchStaffList();
      } else {
        toast.error(data.error || "Failed to create staff member.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error creating staff member.", { id: toastId });
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleDeleteStaff = async (uid, name) => {
    if (uid === user.uid) {
      toast.error("You cannot delete your own admin account.");
      return;
    }
    if (!confirm(`Are you sure you want to delete ${name}? This removes their dashboard access permanently.`)) {
      return;
    }
    setIsDeletingStaff(uid);
    const toastId = toast.loading(`Deleting member...`);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/staff/${uid}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Staff member deleted successfully.", { id: toastId });
        fetchStaffList();
      } else {
        toast.error(data.error || "Failed to delete staff member.", { id: toastId });
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error deleting staff member.", { id: toastId });
    } finally {
      setIsDeletingStaff(null);
    }
  };

  const tabs = [
    { id: "company", name: "Company Details" },
    { id: "invoice", name: "Invoice Config" },
    { id: "smtp", name: "Email Setup" },
    { id: "stripe", name: "Stripe Setup" },
    { id: "staff", name: "Staff Management" },
  ];

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
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold text-brandText tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Configure your company identity, default tax rates, invoice counters, Resend email settings, and Stripe gateway keys.</p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="border-b border-border">
        <nav className="flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-brandText hover:border-border"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Active Tab Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Form Box */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6 md:p-8 border border-border shadow-sm bg-white/50">
          
          {/* TAB 1: COMPANY DETAILS */}
          {activeTab === "company" && (
            <form onSubmit={handleSaveCompany} className="space-y-6">
              <h3 className="text-base font-bold text-brandText uppercase tracking-wider mb-4">Company Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Company Name</label>
                  <input
                    type="text"
                    required
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Elevate Marketing Group"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Phone Number</label>
                  <input
                    type="text"
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="+1 (416) 555-0199"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="billing@elevatetalent.co"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Website</label>
                  <input
                    type="text"
                    value={company.website}
                    onChange={(e) => setCompany({ ...company, website: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="www.elevatetalent.co"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">GST/HST Number</label>
                  <input
                    type="text"
                    value={company.gstHstNumber}
                    onChange={(e) => setCompany({ ...company, gstHstNumber: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="GST-123456789RT0001"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Address Line 1</label>
                  <input
                    type="text"
                    required
                    value={company.addressLine1}
                    onChange={(e) => setCompany({ ...company, addressLine1: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="123 Innovation Drive"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    value={company.addressLine2}
                    onChange={(e) => setCompany({ ...company, addressLine2: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Suite 400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">City</label>
                  <input
                    type="text"
                    required
                    value={company.city}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Toronto"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Province / State</label>
                  <input
                    type="text"
                    required
                    value={company.stateProvince}
                    onChange={(e) => setCompany({ ...company, stateProvince: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="ON"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Postal / Zip Code</label>
                  <input
                    type="text"
                    required
                    value={company.postalCode}
                    onChange={(e) => setCompany({ ...company, postalCode: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="M5V 2M2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Country</label>
                  <input
                    type="text"
                    required
                    value={company.country}
                    onChange={(e) => setCompany({ ...company, country: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Canada"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Default Currency</label>
                  <select
                    value={company.defaultCurrency}
                    onChange={(e) => setCompany({ ...company, defaultCurrency: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  >
                    <option value="CAD">CAD ($)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Save Company Details
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: INVOICE CONFIG */}
          {activeTab === "invoice" && (
            <form onSubmit={handleSaveInvoiceConfig} className="space-y-6">
              <h3 className="text-base font-bold text-brandText uppercase tracking-wider mb-4">Invoice Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Invoice Prefix</label>
                  <input
                    type="text"
                    required
                    value={invoiceConfig.prefix}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, prefix: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="ELV"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Next Counter Number</label>
                  <input
                    type="number"
                    required
                    value={invoiceConfig.currentCounter}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, currentCounter: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Default Net Terms</label>
                  <select
                    value={invoiceConfig.defaultDueDays}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, defaultDueDays: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                  >
                    <option value={0}>Due on Receipt</option>
                    <option value={7}>Net 7</option>
                    <option value={15}>Net 15</option>
                    <option value={30}>Net 30</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Tax Label</label>
                  <input
                    type="text"
                    required
                    value={invoiceConfig.taxLabel}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, taxLabel: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="HST"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={invoiceConfig.taxRate}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, taxRate: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="13"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    id="taxEnabled"
                    checked={invoiceConfig.taxEnabledByDefault}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, taxEnabledByDefault: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="taxEnabled" className="ml-2 text-xs font-semibold text-brandText uppercase tracking-wider">
                    Enable Tax by Default
                  </label>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Default Invoicing Notes</label>
                  <textarea
                    value={invoiceConfig.defaultNotes}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, defaultNotes: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Default notes displayed on client invoice PDF..."
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Default Terms & Conditions</label>
                  <textarea
                    value={invoiceConfig.defaultTerms}
                    onChange={(e) => setInvoiceConfig({ ...invoiceConfig, defaultTerms: e.target.value })}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Terms, payment methods accepted, late fee details..."
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Save Invoicing Config
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: EMAIL CONFIGURATION (RESEND) */}
          {activeTab === "smtp" && (
            <form onSubmit={handleSaveSmtp} className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-brandText uppercase tracking-wider">Resend Email Setup</h3>
                <button
                  type="button"
                  onClick={() => setShowEmailModal(true)}
                  className="px-3.5 py-1.5 bg-secondary hover:bg-secondary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Send Test Email
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Resend API Key</label>
                  <input
                    type="password"
                    required
                    value={smtp.resendApiKey}
                    onChange={(e) => setSmtp({ ...smtp, resendApiKey: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="re_••••••••••••••••••••••••"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Sender Name ("From")</label>
                  <input
                    type="text"
                    required
                    value={smtp.fromName}
                    onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="Elevate Billing"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Sender Email ("From")</label>
                  <input
                    type="email"
                    required
                    value={smtp.fromEmail}
                    onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="billing@elevatetm.com"
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Save Email Settings
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: STRIPE KEYS */}
          {activeTab === "stripe" && (
            <form onSubmit={handleSaveStripe} className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-brandText uppercase tracking-wider">Stripe Integration</h3>
                <button
                  type="button"
                  onClick={handleTestStripe}
                  disabled={isTestingStripe}
                  className="px-3.5 py-1.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  {isTestingStripe ? "Testing..." : "Test Connection"}
                </button>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Stripe Publishable Key (Frontend)</label>
                  <input
                    type="text"
                    required
                    value={stripeConfig.publishableKey}
                    onChange={(e) => setStripeConfig({ ...stripeConfig, publishableKey: e.target.value })}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="pk_test_..."
                  />
                </div>

                {/* Test Mode Switch */}
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold uppercase tracking-wider text-brandText">Stripe Sandbox / Test Mode</span>
                    <span className="text-[10px] text-muted mt-1">If enabled, Stripe will use mock payment configurations, test cards, and setup intents.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={stripeConfig.testMode}
                    onChange={(e) => setStripeConfig({ ...stripeConfig, testMode: e.target.checked })}
                    className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
                  />
                </div>

                {/* Instructions / Secret key panel */}
                <div className="rounded-xl border border-border bg-yellow-50/20 p-5">
                  <h4 className="text-xs font-semibold text-yellow-800 uppercase tracking-wider mb-2">🔑 Stripe Server Security Policy</h4>
                  <p className="text-xs text-brandText/80 leading-relaxed mb-4">
                    Stripe Secret Keys and Webhook secrets represent critical privileges and are **never** stored in the Firestore database. They are resolved securely inside server APIs via Next.js environment configurations or Firebase Secrets Managers.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
                        Dynamic Secret Key Test Override (Optional)
                      </label>
                      <input
                        type="password"
                        value={stripeConfig.secretKeyInput}
                        onChange={(e) => setStripeConfig({ ...stripeConfig, secretKeyInput: e.target.value })}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-brandText focus:border-primary focus:outline-none transition-all"
                        placeholder="Paste sk_test_... here to test connection without saving to disk"
                      />
                    </div>
                    <p className="text-[10px] text-muted italic">
                      Leave empty to run connection diagnostics using your `.env.local` server configurations.
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-border flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Save Stripe Configuration
                </button>
              </div>
            </form>
          )}

          {/* TAB 5: STAFF MANAGEMENT */}
          {activeTab === "staff" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Invite Form */}
                <form onSubmit={handleCreateStaff} className="space-y-4 pr-0 md:pr-4 border-r-0 md:border-r border-border">
                  <h3 className="text-base font-bold text-brandText uppercase tracking-wider mb-2">Create New Member</h3>
                  
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Full Name</label>
                    <input
                      type="text"
                      required
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Email Address</label>
                    <input
                      type="email"
                      required
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                      placeholder="john@elevatetalent.co"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Password</label>
                    <input
                      type="password"
                      required
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Account Role</label>
                    <select
                      value={staffRole}
                      onChange={(e) => setStaffRole(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all font-semibold"
                    >
                      <option value="staff">Staff (Generate Invoices & Add Customers only)</option>
                      <option value="admin">Admin (Full System Privileges)</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isCreatingStaff}
                      className="w-full py-2.5 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                    >
                      {isCreatingStaff ? "Creating Account..." : "Create Account"}
                    </button>
                  </div>
                </form>

                {/* Staff List */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-brandText uppercase tracking-wider">Active Staff & Admins</h3>
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto pr-2">
                    {staffList.map((member) => (
                      <div key={member.uid} className="py-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/5 text-primary border border-primary/15 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {member.name ? member.name.slice(0, 2) : "US"}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-brandText">{member.name}</p>
                            <p className="text-[10px] text-muted">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase ${
                            member.role === "admin" 
                              ? "bg-purple-50 text-purple-700 border border-purple-100" 
                              : "bg-blue-50 text-blue-700 border border-blue-100"
                          }`}>
                            {member.role}
                          </span>
                          {member.uid !== user?.uid && (
                            <button
                              type="button"
                              onClick={() => handleDeleteStaff(member.uid, member.name)}
                              disabled={isDeletingStaff === member.uid}
                              className="p-1.5 text-muted hover:text-error hover:bg-error/5 rounded-lg border border-transparent hover:border-error/10 transition-all"
                              title="Delete Member"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Right Info Box */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-border shadow-sm bg-white/50">
            <h4 className="text-xs font-bold text-brandText uppercase tracking-wider mb-3">Settings Quick Guide</h4>
            <ul className="space-y-3 text-xs text-muted leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>**Company Details**: Sets the invoice issuer billing details and currency CAD/USD defaults on invoice drafts.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>**Invoice Settings**: Generates sequence IDs (e.g. `ELV-2026-012`) and default terms/taxes printed on invoice exports.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>**Email Setup**: Configures Resend to securely deliver branded invoices and payment receipts directly to client mailboxes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>**Stripe Gateway**: Connects credit card inputs on the public pay page. Toggle **Test Mode** to configure sandbox runs.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* SMTP EMAIL TEST MODAL */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity animate-fade-in" 
            onClick={() => setShowEmailModal(false)} 
          />

          {/* Positioner */}
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-10">
              {/* Panel */}
              <div className="relative transform rounded-2xl bg-white p-6 border border-border shadow-2xl transition-all w-full max-w-md space-y-4 animate-fade-in my-8 z-20">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Test SMTP Mailer</h3>
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="text-muted hover:text-brandText"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Recipient Email Address</label>
                  <input
                    type="email"
                    required
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brandText focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    placeholder="developer@elevatetm.com"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={isTestingEmail}
                    className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                  >
                    {isTestingEmail ? "Sending..." : "Send Test Mail"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
