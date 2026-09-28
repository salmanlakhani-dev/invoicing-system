/**
 * Utility functions for calculating late payment fees across the application.
 */

export function calculateLateFee(invoice) {
  if (!invoice || !invoice.latePayment?.enabled) {
    const total = parseFloat(invoice?.total) || 0;
    const paid = parseFloat(invoice?.amountPaid) || 0;
    return {
      enabled: false,
      applied: false,
      feeAmount: 0,
      adjustedTotal: total,
      balanceDue: Math.max(0, Math.round((total - paid) * 100) / 100),
      type: invoice?.latePayment?.type || "percent",
      value: invoice?.latePayment?.value || 0,
      gracePeriodDays: invoice?.latePayment?.gracePeriodDays || 0,
    };
  }

  const { type = "percent", value = 5, gracePeriodDays = 0 } = invoice.latePayment;
  const numValue = parseFloat(value) || 0;
  const graceDays = parseInt(gracePeriodDays, 10) || 0;

  // Determine if due date (+ optional grace days) has passed
  let isOverdue = invoice.status === "Overdue";
  if (invoice.dueDate) {
    try {
      const due = new Date(invoice.dueDate);
      due.setDate(due.getDate() + graceDays);
      const dueStr = due.toISOString().split("T")[0];
      const todayStr = new Date().toISOString().split("T")[0];
      if (todayStr > dueStr) {
        isOverdue = true;
      }
    } catch (e) {
      // fallback
    }
  }

  const baseTotal = parseFloat(invoice.total) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;

  let feeAmount = 0;
  if (isOverdue && numValue > 0) {
    if (type === "percent") {
      feeAmount = Math.round((baseTotal * (numValue / 100)) * 100) / 100;
    } else {
      feeAmount = Math.round(numValue * 100) / 100;
    }
  }

  const adjustedTotal = Math.round((baseTotal + feeAmount) * 100) / 100;
  const balanceDue = Math.max(0, Math.round((adjustedTotal - paid) * 100) / 100);

  return {
    enabled: true,
    applied: isOverdue && feeAmount > 0,
    feeAmount,
    adjustedTotal,
    balanceDue,
    type,
    value: numValue,
    gracePeriodDays: graceDays,
  };
}
