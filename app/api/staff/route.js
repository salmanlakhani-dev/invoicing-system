import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function POST(req) {
  try {
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

    // 2. Parse payload
    const body = await req.json();
    const { email, password, role, name } = body;

    if (!email || !password || !role || !name) {
      return NextResponse.json({ success: false, error: "All fields are required (email, password, role, name)." }, { status: 400 });
    }

    if (role !== "admin" && role !== "staff") {
      return NextResponse.json({ success: false, error: "Invalid role. Must be 'admin' or 'staff'." }, { status: 400 });
    }

    // 3. Create User in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    // 4. Save User details to Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      email,
      name,
      role,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, user: { uid: userRecord.uid, email, role, name } });
  } catch (error) {
    console.error("[Staff Creation Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to create user." }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Fetch caller's profile to verify they are authenticated
    const callerDoc = await adminDb.collection("users").doc(decodedToken.uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Only Admins can view the full staff list
    if (callerDoc.data().role !== "admin") {
      return NextResponse.json({ success: false, error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    // Fetch all users
    const usersSnap = await adminDb.collection("users").get();
    const users = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("[Staff List Error]:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch staff list." }, { status: 500 });
  }
}
