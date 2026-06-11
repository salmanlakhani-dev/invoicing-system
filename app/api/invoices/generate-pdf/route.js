import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { compileInvoiceHTML } from "@/lib/pdf-template";
import puppeteer from "puppeteer";

/**
 * Generates an invoice PDF via Puppeteer and returns it directly as a binary PDF response.
 * This avoids any dependency on Firebase Storage buckets.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: "invoiceId is required" }, { status: 400 });
    }

    // 1. Fetch Invoice Details
    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }
    const invoice = invoiceSnap.data();

    // 2. Fetch Customer Details
    const customerSnap = await adminDb.collection("customers").doc(invoice.customerId).get();
    if (!customerSnap.exists) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }
    const customer = customerSnap.data();

    // 3. Fetch Company Details & Invoicing Configuration
    const companySnap = await adminDb.collection("settings").doc("company").get();
    const company = companySnap.exists ? companySnap.data() : {};

    // 4. Compile HTML String
    const htmlContent = compileInvoiceHTML({ invoice, company, customer });

    // 5. Spin up Puppeteer headless browser to render PDF
    console.log("Launching Puppeteer browser...");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0.4in", bottom: "0.4in", left: "0.4in", right: "0.4in" }
    });

    await browser.close();
    console.log("Puppeteer rendering complete.");

    // 6. Return the PDF buffer directly in the response
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber || "invoice"}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF Generation Handler Failure:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to generate PDF" }, { status: 500 });
  }
}
