"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const AuthContext = createContext({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: userData.name || firebaseUser.displayName,
              role: userData.role || "staff",
              getIdToken: (forceRefresh) => firebaseUser.getIdToken(forceRefresh)
            });
          } else {
            // Default first logged in user to admin if no record in Firestore yet
            const defaultProfile = {
              name: firebaseUser.displayName || firebaseUser.email.split("@")[0],
              role: "admin",
              email: firebaseUser.email,
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, defaultProfile);
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: defaultProfile.name,
              role: defaultProfile.role,
              getIdToken: (forceRefresh) => firebaseUser.getIdToken(forceRefresh)
            });
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email.split("@")[0],
            role: "admin", // Fallback to admin to avoid locking anyone out due to a transient error
            getIdToken: (forceRefresh) => firebaseUser.getIdToken(forceRefresh)
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
