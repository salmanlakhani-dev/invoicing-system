import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      let credentials = null;
      try {
        // Attempt parsing as inline JSON string
        credentials = JSON.parse(serviceAccountKey);
      } catch (jsonErr) {
        // If not valid JSON, treat as a local filesystem path
        try {
          const fs = require("fs");
          const path = require("path");
          const resolvedPath = path.resolve(serviceAccountKey);
          if (fs.existsSync(resolvedPath)) {
            credentials = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
          } else {
            console.warn(`Firebase service account file not found at path: ${resolvedPath}`);
          }
        } catch (fsErr) {
          console.error("Failed to read Firebase service account JSON from file path:", fsErr);
        }
      }

      if (credentials) {
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || credentials.project_id,
        });
        console.log("Firebase Admin SDK initialized using service account key.");
      } else {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY was provided but could not be resolved to valid credentials.");
      }
    } else {
      // Fallback to Application Default Credentials (ADC)
      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "elevate-invoicing-system",
      });
      console.log("Firebase Admin SDK initialized using Application Default Credentials.");
    }
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminStorage = admin.storage();
