import { Toaster } from "@/components/ui/toaster";
import { useAppStore } from "@/store/appStore";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useMessageNotifications } from '@/hooks/useMessageNotifications';
import { usePresenceRefresh } from '@/hooks/usePresenceRefresh';
import { pushNotificationManager } from '@/lib/pushNotificationsManager-simple';
import { initializePushNotifications, setupForegroundMessages } from '@/lib/firebase';
import { lazy, Suspense, useEffect } from "react";
import { useTabBadge } from '@/hooks/useTabBadge';
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const AdminSettings = lazy(() => import("./pages/AdminSettings"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

// UPDATED: AppRoutes with all hooks integrated
function AppRoutes() {
  const { user } = useAuth();

  // 📲 Listen for openChat CustomEvent from React Native WebView
  useEffect(() => {
    const handler = (e: Event) => {
      const contactId = (e as CustomEvent).detail?.contactId;
      if (!contactId) return;
      const state = useAppStore.getState();
      const chat = state.chats.find((c: any) => c.contact?.id === contactId);
      if (chat) {
        state.setActiveChat(chat);
        state.setViewMode('chats');
      } else {
        const contact = state.contacts.find((c: any) => c.id === contactId);
        if (contact) {
          state.setActiveChat({ id: contact.id, contact, unreadCount: 0 });
          state.setViewMode('chats');
        }
      }
    };
    window.addEventListener('openChat', handler);
    return () => window.removeEventListener('openChat', handler);
  }, []);

  // 🔔 Desktop/Local Notifications
  useMessageNotifications();
  useTabBadge();

  // 🟢 Auto-refresh online status every 30s
  usePresenceRefresh();

  // 📲 Initialize Firebase Push Notifications
  useEffect(() => {
    if (!user) return;
    
    initializePushNotifications(user.id).then(result => {
      if (result.success) {
        console.log('✅ Firebase push initialized');
      } else {
        console.log('ℹ️ Firebase push not available:', result.error);
      }
    });

    // Foreground message handler
    setupForegroundMessages((payload) => {
      const title = payload.notification?.title || 'New Message';
      const body = payload.notification?.body || '';
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/pwa-192x192.png' });
      }
    });
  }, [user]);

  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route 
        path="/app/settings" 
        element={
          <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          }>
            <ProtectedRoute>
              <AdminSettings />
            </ProtectedRoute>
          </Suspense>
        } 
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
