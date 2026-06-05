import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { RouteGuard } from "@/components/ui/route-guard";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata = {
  title: "InvoiceFlow — Smart Full-Stack Invoicing",
  description: "Manage customers, products, and invoices. Accept secure Stripe payments and automate card charges.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full bg-background">
      <body className={`${inter.className} min-h-full flex flex-col`}>
        <AuthProvider>
          <RouteGuard>
            {children}
            <Toaster 
              position="top-right"
              toastOptions={{
                style: {
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(8px)',
                  color: '#1A1A2E',
                  border: '1px solid rgba(229, 231, 235, 0.5)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
                  fontFamily: 'Inter, sans-serif',
                },
                duration: 4000,
                success: {
                  iconTheme: {
                    primary: '#10B981',
                    secondary: '#fff',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#EF4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
