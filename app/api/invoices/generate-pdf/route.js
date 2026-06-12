import { NextResponse } from "next/server";

/**
 * Puppeteer PDF generation is deprecated in favor of client-side printing.
 * This route is kept for backwards-compatibility to return a 410 Gone error.
 */
export async function POST(req) {
  return NextResponse.json({
    success: false,
    error: "Puppeteer PDF generation is deprecated. Please download the PDF via client-side printing directly from the invoice pay or detail page."
  }, { status: 410 });
}
