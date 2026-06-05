"use client";

import { useParams } from "next/navigation";
import InvoiceBuilder from "@/components/invoice/invoice-builder";

export default function EditInvoicePage() {
  const { id } = useParams();
  return <InvoiceBuilder invoiceId={id} />;
}
