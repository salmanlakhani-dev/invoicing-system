import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function DELETE(req, { params }) {
  try {
    const { uid } = params;

    // 1. Authenticate user as Admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    const adminDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
    if (!adminDoc.exists || adminDoc.data().role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    if (!uid) {
      return NextResponse.json({ success: false, error: "User UID is required" }, { status: 400 });
    }

    if (uid === decodedToken.uid) {
      return NextResponse.json({ success: false, error: "You cannot delete your own admin account." }, { status: 400 });
    }

    // 2. Delete from Firebase Auth
    await adminAuth.deleteUser(uid);

    // 3. Delete from Firestore users collection
    await adminDb.collection("users").doc(uid).delete();

    return NextResponse.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("[Staff Deletion Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to delete user." }, { status: 500 });
  }
}
