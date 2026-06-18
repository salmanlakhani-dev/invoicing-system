"use client";

import { useState, useRef } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import toast from "react-hot-toast";

// Schema for Customer fields in the system
const schemaFields = [
  { key: "firstName", label: "First Name", required: true, patterns: [/first\s*name/i, /^fname$/i, /^first$/i] },
  { key: "lastName", label: "Last Name", required: true, patterns: [/last\s*name/i, /^lname$/i, /^last$/i] },
  { key: "email", label: "Email Address", required: true, patterns: [/email/i, /mail/i, /e-mail/i] },
  { key: "phone", label: "Phone Number", required: false, patterns: [/phone/i, /tel/i, /mobile/i, /contact/i, /cell/i] },
  { key: "companyName", label: "Company Name", required: false, patterns: [/company/i, /org/i, /business/i, /firm/i] },
  { key: "billingAddressLine1", label: "Address Line 1", required: false, patterns: [/address\s*(line\s*1)?$/i, /street/i, /location/i, /addr1/i] },
  { key: "billingAddressLine2", label: "Address Line 2", required: false, patterns: [/address\s*line\s*2/i, /suite/i, /apt/i, /unit/i, /addr2/i] },
  { key: "city", label: "City", required: false, patterns: [/city/i] },
  { key: "stateProvince", label: "State / Province", required: false, patterns: [/state/i, /province/i, /region/i, /prov/i] },
  { key: "postalCode", label: "Postal / Zip Code", required: false, patterns: [/postal/i, /zip/i, /pincode/i, /postcode/i] },
  { key: "country", label: "Country", required: false, patterns: [/country/i] },
];

// RFC 4180 compliant CSV Parser
function parseCSV(text) {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          row[row.length - 1] += '"';
          i++; // Skip the second quote
        } else {
          inQuotes = false;
        }
      } else {
        row[row.length - 1] += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push("");
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && next === '\n') {
          i++; // Skip \n
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += c;
      }
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
}

export default function ImportGhlModal({ isOpen, onClose, existingCustomers, onImportComplete }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mappings, setMappings] = useState({});
  const [parsedContacts, setParsedContacts] = useState([]);
  
  // Progress & Logs
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    successes: 0,
    failures: 0,
    currentContactName: "",
  });
  const [importLogs, setImportLogs] = useState([]);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Handle Drag & Drop
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelected = (file) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a valid CSV file.");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        const allRows = parseCSV(text);
        if (allRows.length < 2) {
          toast.error("CSV file must have a header row and at least one contact row.");
          return;
        }

        const rawHeaders = allRows[0].map(h => h.trim());
        // Clean out empty rows
        const dataRows = allRows.slice(1).filter(row => row.some(val => val.trim() !== ""));

        setHeaders(rawHeaders);
        setRows(dataRows);

        // Initialize mappings to -1 (Do Not Import) by default
        const initialMappings = {};
        schemaFields.forEach(field => {
          initialMappings[field.key] = -1;
        });

        setMappings(initialMappings);
        setStep(2);
      } catch (err) {
        console.error(err);
        toast.error("Error parsing CSV. Please check formatting.");
      }
    };
    reader.readAsText(file);
  };

  // Update mapping selections
  const handleMappingChange = (fieldKey, colIdx) => {
    setMappings(prev => ({ ...prev, [fieldKey]: parseInt(colIdx, 10) }));
  };

  const autoDetectMappings = () => {
    const newMappings = {};
    schemaFields.forEach(field => {
      let foundIdx = -1;
      for (let i = 0; i < headers.length; i++) {
        const hName = headers[i];
        if (field.patterns.some(pattern => pattern.test(hName))) {
          foundIdx = i;
          break;
        }
      }
      newMappings[field.key] = foundIdx;
    });
    setMappings(newMappings);
    toast.success("Columns auto-detected based on header names!");
  };

  // Convert CSV rows into customer schema and validate
  const generatePreview = () => {
    // Ensure that required fields are mapped
    const missingRequired = schemaFields
      .filter(f => f.required)
      .filter(f => mappings[f.key] === undefined || mappings[f.key] === -1);

    if (missingRequired.length > 0) {
      toast.error(`Please map the required fields: ${missingRequired.map(f => f.label).join(", ")}`);
      return;
    }

    const contacts = rows.map((row, index) => {
      const contact = { csvIndex: index };
      schemaFields.forEach(field => {
        const colIdx = mappings[field.key];
        contact[field.key] = (colIdx !== undefined && colIdx >= 0 && colIdx < row.length) 
          ? row[colIdx]?.trim() || "" 
          : "";
      });

      let isValid = true;
      let errorReason = "";
      let isDuplicate = false;

      // Validate required fields
      if (!contact.firstName || !contact.lastName) {
        isValid = false;
        errorReason = "Missing Name (First and/or Last)";
      } else if (!contact.email) {
        isValid = false;
        errorReason = "Missing Email Address";
      } else if (!/\S+@\S+\.\S+/.test(contact.email)) {
        isValid = false;
        errorReason = "Invalid Email Format";
      } else {
        // Duplicate detection
        const emailLower = contact.email.toLowerCase();
        const exists = existingCustomers.some(c => c.email && c.email.toLowerCase() === emailLower);
        if (exists) {
          isDuplicate = true;
          isValid = false;
          errorReason = "Duplicate Email";
        }
      }

      return {
        ...contact,
        isValid,
        errorReason,
        isDuplicate,
        shouldImport: isValid, // default to true if valid
      };
    });

    setParsedContacts(contacts);
    setStep(3);
  };

  const toggleContactSelection = (idx) => {
    setParsedContacts(prev => prev.map((c, i) => {
      if (i === idx) {
        if (!c.isValid) {
          toast.error(`Cannot select: ${c.errorReason}`);
          return c;
        }
        return { ...c, shouldImport: !c.shouldImport };
      }
      return c;
    }));
  };

  const allValidSelected = parsedContacts.length > 0 && parsedContacts.filter(c => c.isValid).every(c => c.shouldImport);
  const someValidSelected = parsedContacts.length > 0 && parsedContacts.some(c => c.isValid && c.shouldImport);

  const toggleAllValid = () => {
    if (allValidSelected) {
      setParsedContacts(prev => prev.map(c => ({ ...c, shouldImport: false })));
    } else {
      setParsedContacts(prev => prev.map(c => ({ 
        ...c, 
        shouldImport: c.isValid ? true : false 
      })));
    }
  };

  // Run the batch import
  const startImport = async () => {
    const contactsToImport = parsedContacts.filter(c => c.shouldImport);
    if (contactsToImport.length === 0) {
      toast.error("No contacts selected to import.");
      return;
    }

    setIsImporting(true);
    setStep(4);
    setImportProgress({
      current: 0,
      total: contactsToImport.length,
      successes: 0,
      failures: 0,
      currentContactName: "",
    });

    const logs = [];

    for (let i = 0; i < contactsToImport.length; i++) {
      const contact = contactsToImport[i];
      const name = `${contact.firstName} ${contact.lastName}`;

      setImportProgress(prev => ({
        ...prev,
        current: i + 1,
        currentContactName: name,
      }));

      try {
        const address = {
          line1: contact.billingAddressLine1,
          line2: contact.billingAddressLine2,
          city: contact.city,
          state: contact.stateProvince,
          postalCode: contact.postalCode,
          country: contact.country,
        };

        // 1. Create Customer in Stripe
        const stripeRes = await fetch("/api/customers/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: contact.email,
            phone: contact.phone,
            companyName: contact.companyName,
            address,
          }),
        });

        const stripeData = await stripeRes.json();
        if (!stripeRes.ok || !stripeData.success) {
          throw new Error(stripeData.error || "Failed to create customer in Stripe.");
        }

        // 2. Save customer to Firestore
        await addDoc(collection(db, "customers"), {
          firstName: contact.firstName,
          lastName: contact.lastName,
          companyName: contact.companyName,
          email: contact.email,
          phone: contact.phone,
          billingAddressLine1: contact.billingAddressLine1,
          billingAddressLine2: contact.billingAddressLine2,
          city: contact.city,
          stateProvince: contact.stateProvince,
          postalCode: contact.postalCode,
          country: contact.country,
          currencyPreference: "CAD",
          notes: "Imported from Go High Level CRM.",
          stripeCustomerId: stripeData.stripeCustomerId,
          createdAt: new Date().toISOString(),
        });

        logs.push({
          name,
          email: contact.email,
          status: "success",
          message: "Imported successfully.",
        });

        setImportProgress(prev => ({
          ...prev,
          successes: prev.successes + 1,
        }));
      } catch (err) {
        console.error("Import error:", contact.email, err);
        logs.push({
          name,
          email: contact.email,
          status: "error",
          message: err.message || "Unknown error.",
        });

        setImportProgress(prev => ({
          ...prev,
          failures: prev.failures + 1,
        }));
      }

      // 150ms buffer to respect rate limits & show nice UI animations
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    setImportLogs(logs);
    setIsImporting(false);
    setStep(5);
    if (onImportComplete) {
      onImportComplete();
    }
  };

  const resetState = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMappings({});
    setParsedContacts([]);
    setImportLogs([]);
    setIsImporting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Helper counts
  const validCount = parsedContacts.filter(c => c.isValid).length;
  const duplicateCount = parsedContacts.filter(c => c.isDuplicate).length;
  const errorCount = parsedContacts.filter(c => !c.isValid && !c.isDuplicate).length;
  const selectedCount = parsedContacts.filter(c => c.shouldImport).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity animate-fade-in" 
        onClick={isImporting ? undefined : handleClose} 
      />

      {/* Positioner */}
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-10 z-10 relative">
        {/* Panel */}
        <div className="relative transform rounded-2xl bg-white p-6 md:p-8 text-left shadow-2xl transition-all w-full max-w-3xl border border-border space-y-6 animate-fade-in my-8 z-20">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-brandText uppercase tracking-wider">Import Go High Level Contacts</h3>
                <p className="text-[10px] text-muted font-semibold">Step {step} of 5: {
                  step === 1 ? "Upload CSV file" :
                  step === 2 ? "Map Column Headers" :
                  step === 3 ? "Review and Validate Contacts" :
                  step === 4 ? "Importing to Stripe & Database" :
                  "Import Complete Summary"
                }</p>
              </div>
            </div>
            {!isImporting && (
              <button onClick={handleClose} className="text-muted hover:text-brandText transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="space-y-6">
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary rounded-2xl p-10 text-center cursor-pointer transition-all bg-primary/5/20 hover:bg-primary/5 flex flex-col items-center justify-center space-y-4"
              >
                <div className="h-16 w-16 rounded-full bg-primary/5 flex items-center justify-center text-primary shadow-inner">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-brandText">Drag & Drop your Go High Level CSV Export here</p>
                  <p className="text-[10px] text-muted mt-1">or click to browse from your device</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv"
                  className="hidden" 
                />
              </div>

              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 space-y-2 text-xs font-semibold text-brandText">
                <span className="text-primary font-bold block uppercase text-[10px] tracking-wider">How to export from Go High Level CRM:</span>
                <ol className="list-decimal pl-4 space-y-1 text-muted text-[11px] leading-relaxed">
                  <li>Log in to your Go High Level account, navigate to <strong className="text-brandText">Contacts</strong>.</li>
                  <li>Filter or select the contacts you want to export.</li>
                  <li>Click the <strong className="text-brandText">Export Contacts</strong> button on the top right.</li>
                  <li>Download the CSV file and drag it into the box above.</li>
                </ol>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={handleClose}
                  className="px-5 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div className="text-xs font-semibold text-muted leading-relaxed">
                  Match our customer fields with your Go High Level columns. Non-required fields can be skipped.
                </div>
                <button
                  type="button"
                  onClick={autoDetectMappings}
                  className="text-xs font-bold text-primary hover:text-primary-light flex items-center gap-1.5 shrink-0 self-start"
                >
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-Detect Columns
                </button>
              </div>

              <div className="max-h-[350px] overflow-y-auto border border-border rounded-xl divide-y divide-border">
                {schemaFields.map(field => {
                  const currentSelection = mappings[field.key] !== undefined ? mappings[field.key] : -1;
                  return (
                    <div key={field.key} className="p-4 grid grid-cols-1 sm:grid-cols-2 items-center gap-4 hover:bg-primary/5 transition-all">
                      <div className="text-xs font-bold text-brandText">
                        {field.label} {field.required && <span className="text-error">*</span>}
                        <span className="block text-[10px] text-muted font-medium mt-0.5">{field.key}</span>
                      </div>
                      <div>
                        <select
                          value={currentSelection}
                          onChange={(e) => handleMappingChange(field.key, e.target.value)}
                          className="w-full text-xs font-semibold bg-white border border-border rounded-lg px-3 py-2 text-brandText focus:outline-none focus:border-primary"
                        >
                          <option value={-1} className="text-muted italic">-- Skip / Do Not Import --</option>
                          {headers.map((hName, idx) => (
                            <option key={idx} value={idx}>{hName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-border">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                >
                  Back
                </button>
                <button
                  onClick={generatePreview}
                  className="px-6 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Validate & Preview
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Stat Boxes */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-success/5 border border-success/20 rounded-xl text-center">
                  <span className="block text-xl font-bold text-success">{validCount}</span>
                  <span className="text-[10px] font-bold text-muted uppercase">Ready to Import</span>
                </div>
                <div className="p-4 bg-warning/5 border border-warning/20 rounded-xl text-center">
                  <span className="block text-xl font-bold text-warning">{duplicateCount}</span>
                  <span className="text-[10px] font-bold text-muted uppercase">Duplicates (Skip)</span>
                </div>
                <div className="p-4 bg-error/5 border border-error/20 rounded-xl text-center">
                  <span className="block text-xl font-bold text-error">{errorCount}</span>
                  <span className="text-[10px] font-bold text-muted uppercase">Invalid (Skip)</span>
                </div>
              </div>

              {/* Table Preview */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-primary/5 text-muted font-bold">
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            checked={allValidSelected}
                            ref={(input) => {
                              if (input) {
                                input.indeterminate = someValidSelected && !allValidSelected;
                              }
                            }}
                            onChange={toggleAllValid}
                            className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">Company</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-semibold text-brandText">
                      {parsedContacts.map((contact, idx) => (
                        <tr key={idx} className={`hover:bg-primary/5 transition-all ${!contact.isValid ? "opacity-75 bg-gray-50/50" : ""}`}>
                          <td className="p-3 text-center">
                            <input 
                              type="checkbox" 
                              checked={contact.shouldImport || false}
                              disabled={!contact.isValid}
                              onChange={() => toggleContactSelection(idx)}
                              className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-3">{contact.firstName} {contact.lastName}</td>
                          <td className="p-3 truncate max-w-[160px]">{contact.email || <span className="text-error italic">None</span>}</td>
                          <td className="p-3 truncate max-w-[120px]">{contact.companyName || <span className="text-muted italic">N/A</span>}</td>
                          <td className="p-3 text-right">
                            {contact.isValid ? (
                              <span className="inline-flex px-2 py-0.5 bg-success/10 text-success text-[9px] font-bold rounded-full border border-success/10">
                                Ready
                              </span>
                            ) : contact.isDuplicate ? (
                              <span className="inline-flex px-2 py-0.5 bg-warning/10 text-warning text-[9px] font-bold rounded-full border border-warning/10" title={contact.errorReason}>
                                Duplicate (Skip)
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 bg-error/10 text-error text-[9px] font-bold rounded-full border border-error/10" title={contact.errorReason}>
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-border">
                <button
                  onClick={() => setStep(2)}
                  className="px-5 py-2 border border-border text-muted hover:text-brandText text-xs font-bold rounded-xl transition-all"
                >
                  Back
                </button>
                <button
                  onClick={startImport}
                  disabled={selectedCount === 0}
                  className="px-6 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  Import {selectedCount} Selected Contacts
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING */}
          {step === 4 && (
            <div className="space-y-8 py-4 text-center">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Processing Contacts</h4>
                <p className="text-base font-extrabold text-brandText">
                  {importProgress.currentContactName || "Initializing..."}
                </p>
                <p className="text-xs text-muted">
                  Creating customer profile {importProgress.current} of {importProgress.total}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-primary/5 rounded-full h-3.5 border border-primary/10 overflow-hidden relative">
                <div 
                  className="bg-primary h-full rounded-full transition-all duration-300 shadow-md"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                />
              </div>

              {/* Counts */}
              <div className="flex justify-center gap-12 font-semibold">
                <div>
                  <span className="block text-xl font-bold text-success">{importProgress.successes}</span>
                  <span className="text-[10px] text-muted uppercase">Created</span>
                </div>
                <div>
                  <span className="block text-xl font-bold text-error">{importProgress.failures}</span>
                  <span className="text-[10px] text-muted uppercase">Failed</span>
                </div>
              </div>

              <div className="text-[10px] text-muted animate-pulse font-semibold">
                Please do not close this window or refresh your browser while the import is running.
              </div>
            </div>
          )}

          {/* STEP 5: SUMMARY */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="text-center py-6 space-y-3 bg-primary/5 border border-primary/10 rounded-2xl">
                <div className="h-14 w-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto border border-success/10">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-base font-bold text-brandText">Import Process Completed!</h4>
                  <p className="text-xs text-muted mt-1 font-medium">
                    Successfully imported <span className="font-bold text-success">{importProgress.successes}</span> contacts. 
                    {importProgress.failures > 0 && (
                      <> Failed to import <span className="font-bold text-error">{importProgress.failures}</span> contacts.</>
                    )}
                  </p>
                </div>
              </div>

              {/* Log Details if any fail */}
              {importLogs.length > 0 && (
                <div className="space-y-3">
                  <span className="block text-xs font-bold text-brandText uppercase tracking-wider">Transaction Log</span>
                  <div className="border border-border rounded-xl max-h-[200px] overflow-y-auto divide-y divide-border">
                    {importLogs.map((log, idx) => (
                      <div key={idx} className="p-3 text-xs font-semibold flex items-center justify-between hover:bg-primary/5 transition-all">
                        <div>
                          <p className="text-brandText">{log.name}</p>
                          <p className="text-[10px] text-muted mt-0.5">{log.email}</p>
                        </div>
                        <div>
                          {log.status === "success" ? (
                            <span className="text-success text-[10px]">Success</span>
                          ) : (
                            <span className="text-error text-[10px]" title={log.message}>{log.message}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-primary hover:bg-primary-light text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Done & Close
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
