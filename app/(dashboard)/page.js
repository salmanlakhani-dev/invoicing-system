"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { seedMockData } from "@/lib/seeding";
import toast from "react-hot-toast";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function DashboardPage() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("CAD");
  const [isSeeding, setIsSeeding] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setInvoices(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to invoices:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSeed = async () => {
    setIsSeeding(true);
    const toastId = toast.loading("Seeding mock database...");
    try {
      const stats = await seedMockData();
      toast.success(
        `Seeded ${stats.invoiceCount} invoices, ${stats.customerCount} customers, and ${stats.productCount} products!`,
        { id: toastId }
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to seed database.", { id: toastId });
    } finally {
      setIsSeeding(false);
    }
  };

  const formatCurrency = (amount, currencyCode) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(amount) + ` ${currencyCode}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  };

  // Calculations filtered by selected currency
  const filteredInvoices = invoices.filter(inv => inv.currency === currency);
  
  const totalRevenue = filteredInvoices
    .filter(inv => inv.status === "Paid")
    .reduce((sum, inv) => sum + (inv.total || 0), 0);

  const outstandingAmount = filteredInvoices
    .filter(inv => ["Sent", "Viewed", "Partially Paid"].includes(inv.status))
    .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.amountPaid || 0)), 0);

  const overdueAmount = filteredInvoices
    .filter(inv => inv.status === "Overdue")
    .reduce((sum, inv) => sum + ((inv.total || 0) - (inv.amountPaid || 0)), 0);

  const thisMonthInvoices = filteredInvoices.filter(inv => {
    if (!inv.createdAt) return false;
    const date = new Date(inv.createdAt);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  // Monthly Revenue Line Chart Data (based on paidAt months)
  const getMonthlyRevenueData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const monthlyData = months.map(m => ({ name: m, revenue: 0 }));

    filteredInvoices.forEach(inv => {
      if (inv.status === "Paid" && inv.paidAt) {
        const monthIndex = new Date(inv.paidAt).getMonth();
        if (monthIndex >= 0 && monthIndex < 6) {
          monthlyData[monthIndex].revenue += inv.total;
        }
      }
    });
    return monthlyData;
  };

  // Donut status breakdown data
  const getStatusData = () => {
    const counts = {};
    filteredInvoices.forEach(inv => {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    });

    const colors = {
      Draft: "#9CA3AF",
      Sent: "#3B82F6",
      Viewed: "#8B5CF6",
      "Partially Paid": "#F59E0B",
      Paid: "#10B981",
      Overdue: "#EF4444",
      Void: "#4B5563"
    };

    return Object.keys(counts).map(status => ({
      name: status,
      value: counts[status],
      color: colors[status] || "#9CA3AF"
    }));
  };

  const monthlyRevenueData = getMonthlyRevenueData();
  const statusBreakdownData = getStatusData();

  const recentInvoices = invoices.slice(0, 10);
  const overdueInvoices = invoices.filter(inv => inv.status === "Overdue");

  const statusColors = {
    Draft: "bg-gray-100 text-gray-800 border-gray-200",
    Sent: "bg-blue-50 text-blue-700 border-blue-100",
    Viewed: "bg-purple-50 text-purple-700 border-purple-100",
    "Partially Paid": "bg-amber-50 text-amber-700 border-amber-100",
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Overdue: "bg-rose-50 text-rose-700 border-rose-100",
    Void: "bg-zinc-100 text-zinc-600 border-zinc-200"
  };

  if (!isMounted) {
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
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brandText tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Overview of your invoicing performance, outstanding balances, and recent accounts.</p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center">
          {/* Currency Toggle */}
          {!isStaff && (
            <div className="inline-flex rounded-xl bg-white border border-border p-1 shadow-sm">
              <button
                onClick={() => setCurrency("USD")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currency === "USD" ? "bg-primary text-white" : "text-muted hover:text-brandText"
                }`}
              >
                USD ($)
              </button>
              <button
                onClick={() => setCurrency("CAD")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currency === "CAD" ? "bg-primary text-white" : "text-muted hover:text-brandText"
                }`}
              >
                CAD ($)
              </button>
            </div>
          )}

          {/* Seed Button */}
          {!isStaff && invoices.length === 0 && (
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-secondary to-secondary/90 hover:from-secondary/90 hover:to-secondary text-white text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {isSeeding ? "Seeding..." : "Seed Mock Data"}
            </button>
          )}

          <Link
            href="/invoices/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
        </div>
      ) : (
        <>
          {invoices.length === 0 && (
            <div className="glass-card rounded-2xl p-12 text-center border border-border flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-brandText mb-2">No Invoice Data Found</h3>
              <p className="text-sm text-muted max-w-md mx-auto mb-6">
                Your database is empty. Click the button below to seed high-quality mock data representing 6 months of historical transactions, customers, products, and card tokens.
              </p>
              <button
                onClick={handleSeed}
                disabled={isSeeding}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-tr from-primary to-secondary text-white text-sm font-bold rounded-xl shadow-md hover:scale-105 active:scale-95 transition-all"
              >
                {isSeeding ? "Seeding Database..." : "Seed Invoicing Mock Data"}
              </button>
            </div>
          )}

          {invoices.length > 0 && (
            <>
              {/* Metric Grid */}
              {!isStaff && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Total Revenue */}
                  <div className="glass-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">Total Revenue</span>
                      <h3 className="text-2xl font-black text-brandText mt-2">{formatCurrency(totalRevenue, currency)}</h3>
                    </div>
                    <div className="mt-4 flex items-center text-xs text-success font-bold">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>All-time paid invoices</span>
                    </div>
                  </div>

                  {/* Outstanding Amount */}
                  <div className="glass-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">Outstanding</span>
                      <h3 className="text-2xl font-black text-brandText mt-2">{formatCurrency(outstandingAmount, currency)}</h3>
                    </div>
                    <div className="mt-4 flex items-center text-xs text-amber-600 font-bold">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Sent / Unpaid balances</span>
                    </div>
                  </div>

                  {/* Overdue Amount */}
                  <div className="glass-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">Overdue</span>
                      <h3 className="text-2xl font-black text-error mt-2">{formatCurrency(overdueAmount, currency)}</h3>
                    </div>
                    <div className="mt-4 flex items-center text-xs text-error font-bold">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Overdue past terms</span>
                    </div>
                  </div>

                  {/* Total Invoices This Month */}
                  <div className="glass-card rounded-2xl p-6 border border-border shadow-sm flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-muted uppercase tracking-wider">Invoices (This Month)</span>
                      <h3 className="text-2xl font-black text-brandText mt-2">{thisMonthInvoices}</h3>
                    </div>
                    <div className="mt-4 flex items-center text-xs text-primary font-bold">
                      <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Created this calendar month</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts Section */}
              {!isStaff && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Line Chart */}
                  <div className="lg:col-span-2 glass-card rounded-2xl p-6 border border-border shadow-sm">
                    <h3 className="text-sm font-bold text-brandText uppercase tracking-wider mb-6">Revenue Over Time (Last 6 Months)</h3>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyRevenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: "12px", fontWeight: "600" }} />
                          <YAxis stroke="#6B7280" style={{ fontSize: "12px", fontWeight: "600" }} />
                          <Tooltip 
                            contentStyle={{ 
                              background: "rgba(255, 255, 255, 0.9)", 
                              border: "1px solid #E5E7EB", 
                              borderRadius: "12px",
                              boxShadow: "0 4px 20px rgba(0,0,0,0.03)"
                            }} 
                            formatter={(value) => [`$${value.toFixed(2)}`, "Revenue"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#2A2A6C"
                            strokeWidth={3}
                            activeDot={{ r: 6 }}
                            dot={{ r: 4, stroke: "#FE1D66", strokeWidth: 2, fill: "#fff" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Donut Chart */}
                  <div className="glass-card rounded-2xl p-6 border border-border shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold text-brandText uppercase tracking-wider mb-6">Invoice Status Breakdown</h3>
                    <div className="h-56 w-full flex-1 relative">
                      {statusBreakdownData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-muted font-semibold">No status records in {currency}</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusBreakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {statusBreakdownData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [value, "Count"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    {/* Legend Grid */}
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      {statusBreakdownData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2 text-xs font-semibold text-brandText">
                          <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }}></span>
                          <span className="truncate">{entry.name} ({entry.value})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Lists / Tables Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Invoices */}
                <div className="glass-card rounded-2xl p-6 border border-border shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Recent Invoices</h3>
                    <Link href="/invoices" className="text-xs font-bold text-primary hover:underline">View All</Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-semibold border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted">
                          <th className="pb-3 font-semibold">Invoice #</th>
                          <th className="pb-3 font-semibold">Title</th>
                          <th className="pb-3 font-semibold">Total</th>
                          <th className="pb-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {recentInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-primary/5 transition-all">
                            <td className="py-3">
                              <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">
                                {inv.invoiceNumber}
                              </Link>
                            </td>
                            <td className="py-3 truncate max-w-[150px]">
                              {inv.title || "Consulting"}
                            </td>
                            <td className="py-3 font-bold">{formatCurrency(inv.total || 0, inv.currency)}</td>
                            <td className="py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColors[inv.status] || "bg-gray-100 text-gray-800"}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Overdue Invoices */}
                <div className="glass-card rounded-2xl p-6 border border-border shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-brandText uppercase tracking-wider">Overdue Invoices</h3>
                    <span className="text-[10px] px-2.5 py-0.5 bg-rose-50 text-rose-700 font-bold border border-rose-100 rounded-full">Action Needed</span>
                  </div>
                  {overdueInvoices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-xs text-muted font-bold">No overdue invoices! Good job.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-semibold border-collapse">
                        <thead>
                          <tr className="border-b border-border text-muted">
                            <th className="pb-3 font-semibold">Invoice #</th>
                            <th className="pb-3 font-semibold">Due Date</th>
                            <th className="pb-3 font-semibold">Balance</th>
                            <th className="pb-3 font-semibold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {overdueInvoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-primary/5 transition-all">
                              <td className="py-3">
                                <Link href={`/invoices/${inv.id}`} className="text-primary hover:underline font-bold">
                                  {inv.invoiceNumber}
                                </Link>
                              </td>
                              <td className="py-3 text-error">{formatDate(inv.dueDate)}</td>
                              <td className="py-3 font-black text-brandText">{formatCurrency(inv.total - (inv.amountPaid || 0), inv.currency)}</td>
                              <td className="py-3 text-right">
                                <Link
                                  href={`/invoices/${inv.id}`}
                                  className="inline-flex px-2.5 py-1.5 bg-primary/5 hover:bg-primary hover:text-white rounded-lg text-[10px] font-bold text-primary transition-all"
                                >
                                  Remind
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
            </>
          )}
        </>
      )}
    </div>
  );
}
