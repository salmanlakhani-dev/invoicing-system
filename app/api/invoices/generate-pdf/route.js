import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { compileInvoiceHTML } from "@/lib/pdf-template";
import puppeteer from "puppeteer";
import admin from "firebase-admin";

/**
 * Generates an invoice PDF via Puppeteer, uploads it to Firebase Storage,
 * and saves the generated URL to the invoice document.
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
    const company = companySnap.exists() ? companySnap.data() : {};

    const configSnap = await adminDb.collection("settings").doc("invoiceConfig").get();
    const config = configSnap.exists() ? configSnap.data() : {};

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

    // 6. Upload PDF to Firebase Storage
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "invoice-flow-dummy.appspot.com";
    const bucket = admin.storage().bucket(bucketName);
    const filePath = `invoices/${invoiceId}.pdf`;
    const file = bucket.file(filePath);

    await file.save(pdfBuffer, {
      contentType: "application/pdf",
      metadata: {
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
        }
      }
    });

    // 7. Generate Signed URL with fallback to public media URL
    let pdfUrl = "";
    try {
      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: "03-01-2500", // Far future date
      });
      pdfUrl = signedUrl;
    } catch (storageErr) {
      console.warn("Storage credentials missing for Signed URL, falling back to public media url:", storageErr);
      pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
    }

    // 8. Update Invoice with the generated pdfUrl
    await invoiceRef.update({ pdfUrl });

    return NextResponse.json({
      success: true,
      message: "PDF generated and saved successfully!",
      pdfUrl,
    });
  } catch (err) {
    console.error("PDF Generation Handler Failure:", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to generate PDF" }, { status: 500 });
  }
}
