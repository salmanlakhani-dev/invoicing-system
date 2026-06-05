/**
 * Compiles a printable, high-end HTML layout for invoice PDF rendering.
 * Uses exact brand colors: Primary (#2A2A6C), Secondary (#FE1D66), Text (#1A1A2E).
 */
export function compileInvoiceHTML({ invoice, company, customer }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: invoice.currency || "CAD",
    }).format(amount) + ` ${invoice.currency || "CAD"}`;
  };

  const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/pay/${invoice.token}`;
  const balanceDue = invoice.total - (invoice.amountPaid || 0);

  // Line items rows
  const rows = (invoice.lineItems || []).map((item, index) => `
    <tr class="item-row">
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: left; font-weight: 500;">
        ${item.description}
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: center;">
        ${item.qty}
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right;">
        ${formatCurrency(item.unitPrice)}
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: center;">
        ${item.taxApplicable ? "Yes" : "No"}
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: bold; color: #1A1A2E;">
        ${formatCurrency(item.lineTotal)}
      </td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #1A1A2E;
          margin: 0;
          padding: 40px;
          background-color: #FFFFFF;
          -webkit-print-color-adjust: exact;
        }
        .header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 40px;
        }
        .logo-box {
          height: 40px;
          width: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, #2A2A6C 0%, #FE1D66 100%);
          color: #FFFFFF;
          font-weight: 900;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 15px;
        }
        .company-title {
          font-size: 20px;
          font-weight: 800;
          color: #2A2A6C;
          margin: 0 0 5px 0;
        }
        .company-details {
          font-size: 11px;
          color: #6B7280;
          line-height: 1.5;
        }
        .invoice-title {
          text-align: right;
        }
        .invoice-label {
          font-size: 28px;
          font-weight: 900;
          color: #2A2A6C;
          margin: 0 0 5px 0;
          letter-spacing: -0.5px;
        }
        .invoice-number {
          font-size: 14px;
          font-weight: 700;
          color: #1A1A2E;
          margin: 0 0 15px 0;
        }
        .meta-table {
          font-size: 11px;
          color: #6B7280;
          line-height: 1.6;
          margin-left: auto;
        }
        .meta-table td {
          padding: 2px 0;
        }
        .meta-label {
          font-weight: 600;
          text-align: right;
          padding-right: 15px !important;
        }
        .meta-value {
          font-weight: 700;
          color: #1A1A2E;
          text-align: right;
        }
        .billing-section {
          border-top: 1px solid #E5E7EB;
          border-bottom: 1px solid #E5E7EB;
          padding: 20px 0;
          margin-bottom: 40px;
        }
        .section-label {
          font-size: 10px;
          font-weight: 800;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
          display: block;
        }
        .billing-details {
          font-size: 11px;
          line-height: 1.6;
        }
        .billing-name {
          font-size: 13px;
          font-weight: 700;
          color: #2A2A6C;
          margin: 0 0 4px 0;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-bottom: 30px;
        }
        .table-th {
          font-size: 10px;
          font-weight: 800;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid #2A2A6C;
          padding-bottom: 10px;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 40px;
        }
        .totals-table {
          width: 250px;
          font-size: 11px;
          line-height: 1.8;
        }
        .total-row-highlight {
          font-size: 13px;
          font-weight: 900;
          color: #2A2A6C;
          border-top: 1px solid #E5E7EB;
          padding-top: 8px;
        }
        .balance-row-highlight {
          font-size: 15px;
          font-weight: 900;
          color: #EF4444;
          border-top: 2px solid #2A2A6C;
          padding-top: 8px;
        }
        .pay-button-container {
          text-align: center;
          margin-bottom: 40px;
        }
        .pay-button {
          display: inline-block;
          background-color: #FE1D66;
          color: #FFFFFF !important;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
          box-shadow: 0 4px 15px rgba(254, 29, 102, 0.25);
          text-align: center;
        }
        .notes-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          font-size: 10px;
          color: #6B7280;
          line-height: 1.5;
          border-top: 1px solid #E5E7EB;
          padding-top: 20px;
          margin-bottom: 40px;
        }
        .note-title {
          font-weight: 700;
          color: #1A1A2E;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .note-box {
          background-color: #F9FAFB;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #F3F4F6;
        }
        .footer {
          border-top: 1px solid #E5E7EB;
          padding-top: 15px;
          text-align: center;
          font-size: 10px;
          color: #9CA3AF;
        }
      </style>
    </head>
    <body>
      <!-- Top header -->
      <div class="header">
        <div>
          <div class="logo-box">IF</div>
          <h2 class="company-title">${company.companyName || "Elevate Marketing Group"}</h2>
          <div class="company-details">
            ${company.addressLine1 || "123 Innovation Drive"}${company.addressLine2 ? ", " + company.addressLine2 : ""}<br/>
            ${company.city || "Toronto"}, ${company.stateProvince || "ON"} ${company.postalCode || "M5V 2M2"}<br/>
            ${company.country || "Canada"}<br/>
            Phone: ${company.phone || "—"} | Email: ${company.email || "—"}<br/>
            GST/HST: ${company.gstHstNumber || "—"}
          </div>
        </div>
        <div class="invoice-title">
          <div class="invoice-label">INVOICE</div>
          <div class="invoice-number">${invoice.invoiceNumber}</div>
          <table class="meta-table">
            <tr>
              <td class="meta-label">DATE:</td>
              <td class="meta-value">${formatDate(invoice.issueDate)}</td>
            </tr>
            <tr>
              <td class="meta-label">DUE DATE:</td>
              <td class="meta-value">${formatDate(invoice.dueDate)}</td>
            </tr>
            <tr>
              <td class="meta-label">CURRENCY:</td>
              <td class="meta-value">${invoice.currency}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Billed To Section -->
      <div class="billing-section">
        <span class="section-label">Billed To:</span>
        <div class="billing-details">
          <p class="billing-name">${customer.firstName} ${customer.lastName}</p>
          <strong>${customer.companyName || ""}</strong><br/>
          ${customer.billingAddressLine1 || ""}${customer.billingAddressLine2 ? ", " + customer.billingAddressLine2 : ""}<br/>
          ${customer.city || ""}, ${customer.stateProvince || ""} ${customer.postalCode || ""}<br/>
          ${customer.country || ""}<br/>
          Email: ${customer.email}
        </div>
      </div>

      <!-- Line Items table -->
      <table class="items-table">
        <thead>
          <tr>
            <th class="table-th" style="text-align: left;">Description</th>
            <th class="table-th" style="text-align: center; width: 60px;">Qty</th>
            <th class="table-th" style="text-align: right; width: 100px;">Unit Price</th>
            <th class="table-th" style="text-align: center; width: 50px;">Tax</th>
            <th class="table-th" style="text-align: right; width: 100px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <!-- Totals pane -->
      <div class="totals-section">
        <table class="totals-table">
          <tr>
            <td style="color: #6B7280; font-weight: 500;">Subtotal:</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(invoice.subtotal)}</td>
          </tr>
          ${invoice.discountAmount > 0 ? `
          <tr>
            <td style="color: #EF4444; font-weight: 500;">Discount:</td>
            <td style="text-align: right; font-weight: 600; color: #EF4444;">-${formatCurrency(invoice.discountAmount)}</td>
          </tr>
          ` : ""}
          ${invoice.taxAmount > 0 ? `
          <tr>
            <td style="color: #6B7280; font-weight: 500;">${config.taxLabel || "Tax"} (${invoice.taxRate}%):</td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(invoice.taxAmount)}</td>
          </tr>
          ` : ""}
          <tr class="total-row-highlight">
            <td>Total Due:</td>
            <td style="text-align: right; font-weight: 800;">${formatCurrency(invoice.total)}</td>
          </tr>
          <tr>
            <td style="color: #10B981; font-weight: 500;">Amount Paid:</td>
            <td style="text-align: right; font-weight: 700; color: #10B981;">${formatCurrency(invoice.amountPaid || 0)}</td>
          </tr>
          ${balanceDue > 0 ? `
          <tr class="balance-row-highlight">
            <td>Balance Due:</td>
            <td style="text-align: right; font-weight: 900;">${formatCurrency(balanceDue)}</td>
          </tr>
          ` : ""}
        </table>
      </div>

      <!-- Clickable Pay Now CTA -->
      ${balanceDue > 0 ? `
      <div class="pay-button-container">
        <a href="${payUrl}" class="pay-button">Pay Invoice Online Now</a>
      </div>
      ` : ""}

      <!-- Notes & Terms -->
      <div class="notes-section">
        ${invoice.notes ? `
        <div>
          <div class="note-title">Notes / Special Instructions</div>
          <div class="note-box">${invoice.notes}</div>
        </div>
        ` : ""}
        ${invoice.terms ? `
        <div>
          <div class="note-title">Terms & Conditions</div>
          <div class="note-box">${invoice.terms}</div>
        </div>
        ` : ""}
      </div>

      <!-- Footer -->
      <div class="footer">
        Thank you for choosing ${company.companyName || "Elevate Marketing Group"}.<br/>
        For billing questions, contact ${company.email || "billing@elevatetalent.co"}.
      </div>
    </body>
    </html>
  `;
}
