/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  limit,
  getDoc,
  getDocs,
  setDoc,
  getDocFromServer,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User,
  deleteUser,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  Book, 
  Smile, 
  CheckSquare, 
  Sparkles, 
  Settings, 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  LogOut, 
  Sun, 
  Moon, 
  ChevronRight, 
  ChevronLeft,
  Calendar,
  Save,
  Clock,
  Star,
  Quote,
  AlertCircle,
  Apple,
  Heart,
  Brain,
  Menu,
  X,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar 
} from 'recharts';
import Markdown from 'react-markdown';

import { db, auth } from './firebase';
import { JournalEntry, MoodLog, Task, UserPreference, SavedInspiration, Memory } from './types';
import { getAIInsights, getDailyInspiration, getAIChatResponse } from './services/gemini';
import { Card, Button, cn } from './components/ui';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-[var(--muted-foreground)] mb-4">
            {this.state.error?.message?.includes('{') 
              ? "A database error occurred. Please try again later." 
              : "An unexpected error occurred."}
          </p>
          <Button onClick={() => window.location.reload()}>Reload App</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [moods, setMoods] = useState<MoodLog[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [savedInspirations, setSavedInspirations] = useState<SavedInspiration[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [dailyQuote, setDailyQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- Auth & Initial Setup ---
  useEffect(() => {
    // Set persistence to local for better reliability
    setPersistence(auth, browserLocalPersistence).catch(err => console.error("Persistence error:", err));

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // --- Theme Management ---
  useEffect(() => {
    if (preferences?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    if (preferences?.colorTheme) {
      document.documentElement.setAttribute('data-theme', preferences.colorTheme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [preferences?.theme, preferences?.colorTheme]);

  // --- Data Listeners ---
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const qEntries = query(collection(db, 'journalEntries'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const qMoods = query(collection(db, 'moodLogs'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const qTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const qPrefs = query(collection(db, 'userPreferences'), where('userId', '==', user.uid), limit(1));
    const qSaved = query(collection(db, 'savedInspirations'), where('userId', '==', user.uid), orderBy('savedAt', 'desc'));
    const qMemories = query(collection(db, 'memories'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubEntries = onSnapshot(qEntries, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journalEntries'));

    const unsubMoods = onSnapshot(qMoods, (snap) => {
      setMoods(snap.docs.map(d => ({ id: d.id, ...d.data() } as MoodLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'moodLogs'));

    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    const unsubPrefs = onSnapshot(qPrefs, (snap) => {
      if (!snap.empty) {
        setPreferences({ id: snap.docs[0].id, ...snap.docs[0].data() } as UserPreference);
      } else {
        // Create default preferences
        const newPref: UserPreference = {
          theme: 'light',
          colorTheme: 'indigo',
          notificationsEnabled: true,
          userId: user.uid
        };
        addDoc(collection(db, 'userPreferences'), newPref).catch(err => handleFirestoreError(err, OperationType.CREATE, 'userPreferences'));
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'userPreferences'));

    const unsubSaved = onSnapshot(qSaved, (snap) => {
      setSavedInspirations(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedInspiration)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'savedInspirations'));

    const unsubMemories = onSnapshot(qMemories, (snap) => {
      setMemories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Memory)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'memories'));

    return () => {
      unsubEntries();
      unsubMoods();
      unsubTasks();
      unsubPrefs();
      unsubSaved();
      unsubMemories();
    };
  }, [user, isAuthReady]);

  // Clear AI insights when data changes to ensure they stay relevant
  useEffect(() => {
    if (aiInsights) {
      setAiInsights(null);
    }
  }, [entries.length, moods.length]);

  // Auto-fetch insights when data is available and we don't have them yet
  useEffect(() => {
    if (user && !aiInsights && !loadingInsights && (entries.length > 0 || moods.length > 0)) {
      fetchInsights();
    }
  }, [user, entries.length, moods.length, aiInsights, loadingInsights]);

  // --- Daily Inspiration Fetch ---
  useEffect(() => {
    const fetchQuote = async () => {
      try {
        setLoadingQuote(true);
        const quote = await getDailyInspiration();
        setDailyQuote(quote);
      } catch (err) {
        console.error("Failed to fetch quote in App:", err);
      } finally {
        setLoadingQuote(false);
      }
    };
    fetchQuote();
  }, []);

  // --- AI Insights Fetch ---
  const fetchInsights = async () => {
    if (!user) return;
    
    // Define "today" as start of day
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Filter for today's data
    const todayEntries = entries.filter(e => {
      const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      return date >= today;
    });
    
    const todayMoods = moods.filter(m => {
      const date = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt);
      return date >= today;
    });

    const isToday = todayEntries.length > 0 || todayMoods.length > 0;
    
    // Use today's data if available, otherwise fallback to most recent 5
    const entriesToUse = isToday ? todayEntries : entries.slice(0, 5);
    const moodsToUse = isToday ? todayMoods : moods.slice(0, 5);

    if (entriesToUse.length === 0 && moodsToUse.length === 0) {
      setAiInsights({
        tips: ["Start your first journal entry to get personalized tips.", "Log your mood to see trends.", "Try the AI chat for immediate support."],
        quote: "The journey of a thousand miles begins with a single step.",
        author: "Lao Tzu",
        prompt: "What is one thing you're looking forward to today?"
      });
      return;
    }
    
    setLoadingInsights(true);
    try {
      const entriesContent = entriesToUse.map(e => e.content);
      const moodsValue = moodsToUse.map(m => m.mood);
      const insights = await getAIInsights(entriesContent, moodsValue, isToday);
      if (insights) {
        setAiInsights(insights);
      }
    } catch (err) {
      console.error("Failed to fetch insights:", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    console.log("Starting Google login...");
    const provider = new GoogleAuthProvider();
    // Force account selection to help with school/workspace accounts
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("Google login successful:", result.user.email);
    } catch (error: any) {
      console.error("Google login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("The login window was closed before completion. Please try again.");
      } else if (error.code === 'auth/cancelled-by-user') {
        setLoginError("Login was cancelled. Please try again.");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("The login popup was blocked by your browser. Please allow popups for this site.");
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError("Google Sign-In is not enabled in the Firebase Console. Please contact the administrator.");
      } else {
        setLoginError(`Login failed: ${error.message}`);
      }
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    signOut(auth);
    setShowLogoutConfirm(false);
  };

  if (!isAuthReady) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen bg-[var(--background)]">
        <AnimatePresence>
          {showAbout && <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />}
        </AnimatePresence>

        {/* Top Header for Login Page */}
        <header className="w-full bg-[var(--card)] border-b border-[var(--border)] p-4 md:p-6 flex items-center justify-between sticky top-0 z-50">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => setShowAbout(true)}
          >
            <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Sparkles className="w-6 h-6 text-[var(--primary-foreground)]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight">Mindful Mirror</span>
              <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] font-bold">What is this?</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowAbout(true)}
              className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors"
            >
              <AlertCircle className="w-4 h-4" />
              About
            </button>
          </div>
        </header>

        {/* Login Form Container */}
        <div className="flex flex-col items-center justify-center flex-1 p-6 md:p-12">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-md w-full"
          >
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Welcome to Mindful Mirror</h2>
            <p className="text-[var(--muted-foreground)] mb-10 text-lg leading-relaxed">
              Sign in with Google to continue your reflection.
            </p>
            
            {loginError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/30 flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-left">{loginError}</p>
              </motion.div>
            )}
            
            <div className="space-y-6">
              <Button onClick={handleLogin} className="w-full gap-3 py-8 text-sm font-bold uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </Button>
            </div>

            <p className="mt-12 text-xs text-[var(--muted-foreground)] uppercase tracking-widest font-medium">
              Secure • Private • Minimal
              <br />
              <span className="mt-2 block font-bold text-[var(--primary)]">Supports School & Workspace Accounts</span>
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen bg-[var(--background)]">
        <AnimatePresence>
          {showAbout && <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />}
        </AnimatePresence>

        {/* AI Chat Box */}

      {/* Logout Confirmation Modal */}
        <AnimatePresence>
          {showLogoutConfirm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-sm"
              >
                <Card className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <LogOut className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2 tracking-tight">Sign Out?</h2>
                  <p className="text-[var(--muted-foreground)] mb-8">Are you sure you want to sign out of your account?</p>
                  <div className="flex flex-col gap-3">
                    <Button variant="danger" onClick={confirmLogout} className="w-full py-6 font-bold uppercase tracking-widest text-xs">
                      Yes, Sign Out
                    </Button>
                    <Button variant="ghost" onClick={() => setShowLogoutConfirm(false)} className="w-full py-6 font-bold uppercase tracking-widest text-xs">
                      Cancel
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Top Navigation */}
        <nav className="sticky top-0 w-full bg-[var(--card)] border-b border-[var(--border)] z-50">
          <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => {
                setShowAbout(true);
                setIsMobileMenuOpen(false);
              }}
            >
              <div className="w-8 h-8 md:w-10 md:h-10 bg-[var(--primary)] rounded-lg flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-[var(--primary-foreground)]" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg md:text-xl tracking-tight">Mindful Mirror</span>
                <span className="hidden md:block text-[9px] uppercase tracking-widest text-[var(--muted-foreground)] font-bold">About App</span>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-2">
              <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard />} label="Dashboard" />
              <NavButton active={activeTab === 'journal'} onClick={() => setActiveTab('journal')} icon={<Book />} label="Journal" />
              <NavButton active={activeTab === 'mood'} onClick={() => setActiveTab('mood')} icon={<Smile />} label="Mood" />
              <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<CheckSquare />} label="Tasks" />
              <NavButton active={activeTab === 'inspiration'} onClick={() => setActiveTab('inspiration')} icon={<Quote />} label="Inspiration" />
              <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings />} label="Settings" />
              
              <div className="ml-4 border-l border-[var(--border)] pl-4">
                <Button variant="ghost" onClick={handleLogout} className="p-2 rounded-full">
                  <LogOut className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center gap-2">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-xl bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation Overlay */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="lg:hidden bg-[var(--card)] border-b border-[var(--border)] overflow-hidden"
              >
                <div className="flex flex-col p-4 gap-2">
                  <MobileNavButton 
                    active={activeTab === 'dashboard'} 
                    onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} 
                    icon={<LayoutDashboard />} 
                    label="Dashboard" 
                  />
                  <MobileNavButton 
                    active={activeTab === 'journal'} 
                    onClick={() => { setActiveTab('journal'); setIsMobileMenuOpen(false); }} 
                    icon={<Book />} 
                    label="Journal" 
                  />
                  <MobileNavButton 
                    active={activeTab === 'mood'} 
                    onClick={() => { setActiveTab('mood'); setIsMobileMenuOpen(false); }} 
                    icon={<Smile />} 
                    label="Mood" 
                  />
                  <MobileNavButton 
                    active={activeTab === 'tasks'} 
                    onClick={() => { setActiveTab('tasks'); setIsMobileMenuOpen(false); }} 
                    icon={<CheckSquare />} 
                    label="Tasks" 
                  />
                  <MobileNavButton 
                    active={activeTab === 'inspiration'} 
                    onClick={() => { setActiveTab('inspiration'); setIsMobileMenuOpen(false); }} 
                    icon={<Quote />} 
                    label="Inspiration" 
                  />
                  <MobileNavButton 
                    active={activeTab === 'settings'} 
                    onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} 
                    icon={<Settings />} 
                    label="Settings" 
                  />
                  <div className="pt-2 mt-2 border-t border-[var(--border)]">
                    <button 
                      onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                      className="flex items-center gap-3 w-full p-4 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 font-bold uppercase tracking-widest text-xs transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  entries={entries} 
                  moods={moods} 
                  tasks={tasks} 
                  quote={dailyQuote} 
                  loadingQuote={loadingQuote}
                  insights={aiInsights} 
                  fetchInsights={fetchInsights} 
                  loadingInsights={loadingInsights} 
                />
              )}
              {activeTab === 'journal' && <JournalView entries={entries} userId={user.uid} />}
              {activeTab === 'mood' && <MoodView moods={moods} userId={user.uid} />}
              {activeTab === 'tasks' && <TasksView tasks={tasks} userId={user.uid} />}
              {activeTab === 'inspiration' && <InspirationView quote={dailyQuote} saved={savedInspirations} userId={user.uid} />}
              {activeTab === 'settings' && <SettingsView preferences={preferences} onLogout={handleLogout} user={user} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-Views ---

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 py-1 md:px-3 md:py-2 rounded-xl transition-all",
        active 
          ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-medium shadow-sm" 
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      )}
    >
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { className: "w-4 h-4 md:w-5 md:h-5" })}
      <span className="text-[9px] md:text-xs font-bold uppercase tracking-tight md:tracking-normal">{label}</span>
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 w-full p-4 rounded-xl transition-all",
        active 
          ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-bold shadow-md" 
          : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      )}
    >
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { className: "w-6 h-6" })}
      <span className="uppercase tracking-widest text-xs font-bold">{label}</span>
    </button>
  );
}

function AboutModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl"
      >
        <Card className="p-8 relative overflow-hidden bg-[var(--primary)] text-[var(--primary-foreground)] border-none shadow-2xl">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-20"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <Sparkles className="w-[500px] h-[500px] -translate-x-20 -translate-y-20" />
          </div>
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 shadow-xl border border-white/20">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4 tracking-tighter leading-none">Mindful Mirror</h1>
            <p className="text-lg opacity-80 mb-10 max-w-lg leading-relaxed font-light">
              Your digital sanctuary for mental clarity. Reflect on your day, track your emotional journey, and find daily inspiration.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Book className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold">Intelligent Journaling</h3>
                  <p className="opacity-60 text-xs">Express your thoughts with Markdown support and auto-save.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold">AI-Powered Insights</h3>
                  <p className="opacity-60 text-xs">Get personalized self-care tips and reflection prompts.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Smile className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold">Mood Tracking</h3>
                  <p className="opacity-60 text-xs">Visualize your emotional trends over time with beautiful charts.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold">Daily Inspiration</h3>
                  <p className="opacity-60 text-xs">Receive curated quotes and affirmations to start your day.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-10">
              <Button onClick={onClose} variant="outline" className="border-white/20 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] py-6 px-10">
                Close
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

function Dashboard({ entries, moods, tasks, quote, loadingQuote, insights, fetchInsights, loadingInsights }: any) {
  const moodData = moods.slice(0, 7).reverse().map((m: any) => ({
    date: format(m.createdAt?.toDate() || new Date(), 'MMM d'),
    mood: m.mood
  }));

  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const pendingTasks = tasks.length - completedTasks;

  return (
    <div className="space-y-6 md:space-y-8 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Overview</h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm md:text-base">A summary of your recent wellness and productivity.</p>
        </div>
        <Button variant="outline" onClick={fetchInsights} disabled={loadingInsights || (entries.length === 0 && moods.length === 0)} className="gap-2 w-full md:w-auto py-5 md:py-2 relative overflow-hidden">
          <Sparkles className={cn("w-4 h-4", loadingInsights && "animate-spin")} />
          {loadingInsights ? "Analyzing..." : "AI Analysis"}
          {loadingInsights && (
            <motion.div 
              className="absolute bottom-0 left-0 h-0.5 bg-[var(--primary)]"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 15, ease: "linear" }}
            />
          )}
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Daily Quote Card */}
        <Card className="md:col-span-2 p-6 md:p-8 bg-[var(--primary)] text-[var(--primary-foreground)] border-none relative overflow-hidden">
          {loadingQuote && !quote && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] flex items-center justify-center z-10">
              <Sparkles className="w-8 h-8 animate-pulse opacity-50" />
            </div>
          )}
          <div className="flex flex-col h-full justify-between">
            <div>
              <Quote className="w-6 h-6 md:w-8 md:h-8 opacity-20 mb-4 md:mb-6" />
              <p className={cn(
                "text-xl md:text-3xl font-serif italic mb-4 md:mb-6 leading-tight tracking-tight transition-opacity duration-500",
                loadingQuote && !quote ? "opacity-0" : "opacity-100"
              )}>
                "{quote?.quote || "The best way to predict the future is to create it."}"
              </p>
              <p className={cn(
                "text-[var(--primary-foreground)] opacity-70 font-medium text-sm md:text-base transition-opacity duration-500",
                loadingQuote && !quote ? "opacity-0" : "opacity-100"
              )}>
                — {quote?.author || "Peter Drucker"}
              </p>
            </div>
            <div className="mt-6 md:mt-8 flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-50">
              <Star className="w-3 h-3 fill-current" />
              <span>Daily Reflection</span>
            </div>
          </div>
        </Card>

        {/* Stats Card */}
        <Card className="p-6 md:p-8">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-4 md:mb-6 flex items-center gap-2">
            <CheckSquare className="w-4 h-4" />
            Productivity
          </h3>
          <div className="space-y-4 md:space-y-6">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-3xl md:text-4xl font-bold">{completedTasks}</p>
                <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider mt-1">Completed</p>
              </div>
              <div className="text-right">
                <p className="text-xl md:text-2xl font-bold text-[var(--muted-foreground)]">{pendingTasks}</p>
                <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider mt-1">Pending</p>
              </div>
            </div>
            <div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--primary)] transition-all duration-700 ease-out" 
                style={{ width: `${tasks.length ? (completedTasks / tasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Mood Trends */}
        <Card className="p-6 md:p-8">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-6 md:mb-8 flex items-center gap-2">
            <Smile className="w-4 h-4" />
            Mood Trends
          </h3>
          <div className="h-48 md:h-64 w-full relative">
            {moodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={moodData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} 
                  />
                  <YAxis 
                    domain={[1, 5]} 
                    axisLine={false} 
                    tickLine={false} 
                    ticks={[1, 2, 3, 4, 5]}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <Tooltip 
                    content={({ active, label }) => {
                      if (active && label) {
                        return (
                          <div className="bg-[var(--card)] border border-[var(--border)] p-2 rounded-lg shadow-md text-[10px] font-bold uppercase tracking-widest text-[var(--foreground)]">
                            {label}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="mood" 
                    stroke="var(--primary)" 
                    strokeWidth={2} 
                    dot={{ r: 2, fill: 'var(--primary)', strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <Smile className="w-8 h-8 text-[var(--muted)] mb-3 opacity-30" />
                <p className="text-xs text-[var(--muted-foreground)] max-w-[180px]">
                  No mood data to display. Log your mood to see trends.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* AI Insights Card */}
        <Card className="p-6 md:p-8">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-4 md:mb-6 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI Analysis
          </h3>
          {insights ? (
            <div className="space-y-4 md:space-y-6">
              <div className="p-4 md:p-5 bg-[var(--muted)] rounded-xl border border-[var(--border)]">
                <p className="text-[9px] font-bold text-[var(--muted-foreground)] mb-2 md:mb-3 uppercase tracking-widest">Reflection Prompt</p>
                <p className="text-[var(--foreground)] italic font-medium leading-relaxed text-sm md:text-base">"{insights.prompt}"</p>
              </div>
              <div className="space-y-2 md:space-y-3">
                <p className="text-[9px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">Recommendations</p>
                <ul className="space-y-2 md:space-y-3">
                  {insights.tips.map((tip: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-xs md:text-sm leading-relaxed">
                      <div className="w-1 h-1 rounded-full bg-[var(--primary)] mt-2 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-8 md:py-12 text-center">
              <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-[var(--muted)] mb-4 opacity-50" />
              <p className="text-xs md:text-sm text-[var(--muted-foreground)] max-w-[200px]">
                {entries.length === 0 && moods.length === 0
                  ? "I need at least one journal entry or mood check-in to analyze." 
                  : "Analyze your recent activity for deeper insights."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function JournalView({ entries, userId }: { entries: JournalEntry[]; userId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<Partial<JournalEntry> | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'already-saved'>('idle');
  const [lastSavedHash, setLastSavedHash] = useState('');
  const isSavingRef = useRef(false);
  const autoSaveTimer = useRef<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const [isPreview, setIsPreview] = useState(false);

  const handleNew = () => {
    setCurrentEntry({
      title: '',
      content: '',
      mood: 'Neutral',
      tags: [],
      userId
    });
    setIsEditing(true);
    setIsPreview(false);
  };

  const handleEdit = (entry: JournalEntry) => {
    setCurrentEntry(entry);
    setIsEditing(true);
    setIsPreview(false);
  };

  const handleSave = async () => {
    if (!currentEntry?.content || isSavingRef.current) return;
    
    const currentHash = `${currentEntry.title || ''}-${currentEntry.content}-${currentEntry.mood || ''}`;
    if (currentHash === lastSavedHash && currentEntry.id) {
      setSaveStatus('already-saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    // Clear any pending auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    isSavingRef.current = true;
    setSaveStatus('saving');
    
    try {
      if (currentEntry.id) {
        await updateDoc(doc(db, 'journalEntries', currentEntry.id), {
          ...currentEntry,
          updatedAt: serverTimestamp()
        });
      } else {
        const docRef = await addDoc(collection(db, 'journalEntries'), {
          ...currentEntry,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        // Update currentEntry with the new ID to prevent duplicates on next save
        setCurrentEntry(prev => prev ? { ...prev, id: docRef.id } : null);
      }
      setLastSavedHash(currentHash);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'journalEntries');
      setSaveStatus('idle');
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'journalEntries', id));
      if (currentEntry?.id === id) setIsEditing(false);
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'journalEntries');
    }
  };

  const handleDeleteAll = async () => {
    if (entries.length === 0) return;
    setIsDeletingAll(true);
    try {
      const batch = writeBatch(db);
      entries.forEach((entry) => {
        if (entry.id) {
          batch.delete(doc(db, 'journalEntries', entry.id));
        }
      });
      await batch.commit();
      setShowDeleteAllConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'journalEntries');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Auto-save logic
  useEffect(() => {
    if (isEditing && currentEntry) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        handleSave();
      }, 3000);
    }
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [currentEntry?.content, currentEntry?.title]);

  if (isEditing && currentEntry) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <Button variant="ghost" onClick={() => setIsEditing(false)} className="px-2 md:px-4">
              <ChevronLeft className="w-5 h-5 md:mr-2" />
              <span className="hidden md:inline">Back to Journal</span>
              <span className="md:hidden">Back</span>
            </Button>
            <div className="flex items-center gap-2 md:hidden">
               <span className={cn(
                 "text-[10px] flex items-center gap-1 transition-all",
                 (saveStatus === 'saved' || saveStatus === 'already-saved') ? "text-green-500 font-bold scale-110" : "text-[var(--muted-foreground)]"
               )}>
                  {saveStatus === 'saving' && <Clock className="w-3 h-3 animate-spin" />}
                  {(saveStatus === 'saved' || saveStatus === 'already-saved') && <CheckSquare className="w-3 h-3" />}
                  {saveStatus === 'saving' ? 'Saving' : saveStatus === 'already-saved' ? 'Already Saved' : saveStatus === 'saved' ? 'Saved' : 'Auto-saving'}
               </span>
            </div>
          </div>
          <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto">
            <div className="hidden md:flex items-center gap-2 mr-4">
               <span className={cn(
                 "text-xs flex items-center gap-1.5 transition-all",
                 (saveStatus === 'saved' || saveStatus === 'already-saved') ? "text-green-500 font-bold scale-110" : "text-[var(--muted-foreground)]"
               )}>
                  {saveStatus === 'saving' && <Clock className="w-4 h-4 animate-spin" />}
                  {(saveStatus === 'saved' || saveStatus === 'already-saved') && <CheckSquare className="w-4 h-4" />}
                  {saveStatus === 'saving' ? 'Saving' : saveStatus === 'already-saved' ? 'Already Saved' : saveStatus === 'saved' ? 'Saved' : 'Auto-saving'}
               </span>
            </div>
            <Button variant="ghost" onClick={() => setIsPreview(!isPreview)} className="flex-1 md:flex-none text-[10px] md:text-xs uppercase tracking-widest font-bold py-4 md:py-2">
              {isPreview ? 'Edit Mode' : 'Preview Mode'}
            </Button>
            <Button onClick={handleSave} className="flex-1 md:flex-none text-[10px] md:text-xs uppercase tracking-widest font-bold py-4 md:py-2">
              Save Now
            </Button>
          </div>
        </header>

        <Card className="p-5 md:p-8 min-h-[60vh] flex flex-col">
          <input 
            type="text" 
            placeholder="Entry Title..." 
            className="text-xl md:text-3xl font-bold bg-transparent border-none outline-none mb-4 md:mb-6 w-full"
            value={currentEntry.title}
            onChange={e => setCurrentEntry({ ...currentEntry, title: e.target.value })}
          />
          <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto pb-2 no-scrollbar">
            {['Happy', 'Calm', 'Neutral', 'Sad', 'Anxious', 'Productive'].map(m => (
              <button
                key={m}
                onClick={() => setCurrentEntry({ ...currentEntry, mood: m })}
                className={cn(
                  "px-3 py-1.5 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold border transition-all shrink-0 uppercase tracking-widest",
                  currentEntry.mood === m 
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] shadow-sm" 
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {isPreview ? (
            <div className="flex-1 prose dark:prose-invert max-w-none markdown-body text-sm md:text-base">
              <Markdown>{currentEntry.content || ''}</Markdown>
            </div>
          ) : (
            <textarea 
              placeholder="Start writing your thoughts (Markdown supported)..." 
              className="flex-1 bg-transparent border-none outline-none resize-none text-base md:text-lg leading-relaxed min-h-[40vh]"
              value={currentEntry.content}
              onChange={e => setCurrentEntry({ ...currentEntry, content: e.target.value })}
            />
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Journal</h1>
          <p className="text-[var(--muted-foreground)]">Your personal collection of thoughts.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          {entries.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteAllConfirm(true)} 
              className="gap-2 flex-1 md:flex-none py-5 md:py-2 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-4 h-4" />
              Delete All
            </Button>
          )}
          <Button onClick={handleNew} className="gap-2 flex-1 md:flex-none py-5 md:py-2">
            <Plus className="w-5 h-5" />
            New Entry
          </Button>
        </div>
      </header>

      <AnimatePresence>
        {showDeleteAllConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Delete All Entries?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This will permanently delete all {entries.length} journal entries. This action cannot be undone.</p>
              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full bg-red-500 hover:bg-red-600 text-white border-none py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll}
                >
                  {isDeletingAll ? 'Deleting...' : 'Delete Everything'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={() => setShowDeleteAllConfirm(false)}
                  disabled={isDeletingAll}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {deleteConfirmId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Delete Entry?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This action cannot be undone. Your thoughts will be deleted forever.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-none" onClick={() => handleDelete(deleteConfirmId)}>Delete Forever</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {entries.map(entry => (
          <Card key={entry.id} className="group cursor-pointer" onClick={() => handleEdit(entry)}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-bold text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded uppercase tracking-widest">
                  {entry.mood}
                </span>
                <span className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-widest">
                  {entry.createdAt ? format(entry.createdAt.toDate(), 'MMM d, yyyy') : 'Just now'}
                </span>
              </div>
              <h3 className="font-bold text-xl mb-3 line-clamp-1 tracking-tight">{entry.title || "Untitled Entry"}</h3>
              <p className="text-[var(--muted-foreground)] text-sm line-clamp-3 mb-6 leading-relaxed">
                {entry.content}
              </p>
              <div className="flex justify-between items-center">
                <div className="flex gap-1.5">
                  {entry.tags?.map(t => (
                    <span key={t} className="text-[9px] font-bold text-[var(--muted-foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded uppercase tracking-tighter">#{t}</span>
                  ))}
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(entry.id!); }}
                  className="p-2 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {entries.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <Book className="w-16 h-16 text-[var(--muted)] mx-auto mb-4" />
            <p className="text-[var(--muted-foreground)]">No entries yet. Start your journey today.</p>
          </div>
        )}
      </div>
    </div>
  );
}


function MoodView({ moods, userId }: { moods: MoodLog[]; userId: string }) {
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'already-saved'>('idle');
  const [lastLoggedHash, setLastLoggedHash] = useState('');
  const isSavingRef = useRef(false);

  const moodOptions = [
    { value: 1, emoji: '😢', label: 'Very Sad' },
    { value: 2, emoji: '🙁', label: 'Sad' },
    { value: 3, emoji: '😐', label: 'Neutral' },
    { value: 4, emoji: '🙂', label: 'Happy' },
    { value: 5, emoji: '🤩', label: 'Amazing' },
  ];

  const handleLogMood = async () => {
    if (!selectedMood || isSavingRef.current) return;

    const currentHash = `${selectedMood}-${note}`;
    if (currentHash === lastLoggedHash) {
      setSaveStatus('already-saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');
    const moodObj = moodOptions.find(m => m.value === selectedMood);
    try {
      await addDoc(collection(db, 'moodLogs'), {
        mood: selectedMood,
        emoji: moodObj?.emoji,
        note,
        createdAt: serverTimestamp(),
        userId
      });
      setLastLoggedHash(currentHash);
      setSelectedMood(null);
      setNote('');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'moodLogs');
      setSaveStatus('idle');
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleDeleteMood = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'moodLogs', id));
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'moodLogs');
    }
  };

  const handleDeleteAllMoods = async () => {
    if (moods.length === 0) return;
    setIsDeletingAll(true);
    try {
      const batch = writeBatch(db);
      moods.forEach((log) => {
        if (log.id) {
          batch.delete(doc(db, 'moodLogs', log.id));
        }
      });
      await batch.commit();
      setShowDeleteAllConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'moodLogs');
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-4xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Mood Tracker</h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm md:text-base">Reflect on your current emotional state.</p>
        </div>
        {moods.length > 0 && (
          <Button 
            variant="outline" 
            onClick={() => setShowDeleteAllConfirm(true)} 
            className="gap-2 w-full md:w-auto py-5 md:py-2 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            Delete All
          </Button>
        )}
      </header>

      <AnimatePresence>
        {showDeleteAllConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Delete All Mood Logs?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This will permanently delete all {moods.length} mood logs. This action cannot be undone.</p>
              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full bg-red-500 hover:bg-red-600 text-white border-none py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={handleDeleteAllMoods}
                  disabled={isDeletingAll}
                >
                  {isDeletingAll ? 'Deleting...' : 'Delete Everything'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={() => setShowDeleteAllConfirm(false)}
                  disabled={isDeletingAll}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {deleteConfirmId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Delete Mood Log?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This action cannot be undone. Your mood log will be deleted forever.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-none" onClick={() => handleDeleteMood(deleteConfirmId)}>Delete Forever</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="p-6 md:p-10 text-center">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-6 md:mb-10">Quick Check-in</h2>
        <div className="grid grid-cols-5 gap-2 md:gap-4 mb-8 md:mb-10">
          {moodOptions.map(m => (
            <button
              key={m.value}
              onClick={() => setSelectedMood(m.value)}
              className={cn(
                "flex flex-col items-center gap-1.5 md:gap-3 p-3 md:p-6 rounded-2xl transition-all flex-1 border border-transparent",
                selectedMood === m.value 
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md scale-105" 
                  : "bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground)]"
              )}
            >
              <span className="text-2xl md:text-5xl">{m.emoji}</span>
              <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-tighter md:tracking-widest leading-none text-center">
                {m.label.split(' ').map((word, i) => <span key={i} className="block md:inline">{word} </span>)}
              </span>
            </button>
          ))}
        </div>
        
        <textarea
          placeholder="Add a brief note about your day..."
          className="w-full p-4 md:p-5 rounded-xl bg-[var(--muted)] border border-[var(--border)] outline-none resize-none mb-6 md:mb-8 h-24 md:h-32 focus:ring-1 focus:ring-[var(--primary)] transition-all text-sm md:text-base"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        
        <Button 
          size="lg" 
          className="w-full py-5 md:py-8 text-xs md:text-base uppercase tracking-widest font-bold relative overflow-hidden" 
          disabled={(!selectedMood && saveStatus !== 'already-saved') || saveStatus === 'saving'}
          onClick={handleLogMood}
        >
          <span className={cn(
            "flex items-center gap-2 transition-all",
            (saveStatus === 'saved' || saveStatus === 'already-saved') ? "opacity-0" : "opacity-100"
          )}>
            {saveStatus === 'saving' ? 'Logging...' : 'Log Mood'}
          </span>
          {(saveStatus === 'saved' || saveStatus === 'already-saved') && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "absolute inset-0 flex items-center justify-center text-white font-black text-lg md:text-xl",
                saveStatus === 'already-saved' ? "bg-amber-500" : "bg-green-500"
              )}
            >
              <CheckSquare className="w-6 h-6 md:w-8 md:h-8 mr-3" />
              {saveStatus === 'already-saved' ? 'ALREADY SAVED' : 'SAVED'}
            </motion.div>
          )}
        </Button>
      </Card>

      <div className="space-y-6">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent History
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {moods.map(log => (
            <Card key={log.id} className="p-5 md:p-6 flex items-center gap-4 md:gap-5 group relative">
              <span className="text-3xl md:text-4xl">{log.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <p className="font-bold text-base md:text-lg tracking-tight truncate">{moodOptions.find(m => m.value === log.mood)?.label}</p>
                  <span className="text-[9px] md:text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-widest shrink-0">
                    {log.createdAt ? format(log.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                  </span>
                </div>
                {log.note && <p className="text-xs md:text-sm text-[var(--muted-foreground)] leading-relaxed italic line-clamp-2">"{log.note}"</p>}
              </div>
              <button 
                onClick={() => setDeleteConfirmId(log.id!)}
                className="opacity-0 group-hover:opacity-100 p-2 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all absolute top-2 right-2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Card>
          ))}
          {moods.length === 0 && (
            <div className="col-span-full py-16 md:py-20 text-center bg-[var(--muted)]/20 rounded-2xl border-2 border-dashed border-[var(--border)]">
              <Smile className="w-10 h-10 md:w-12 md:h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-xs md:text-sm text-[var(--muted-foreground)]">No mood logs yet. Start tracking your journey.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TasksView({ tasks, userId }: { tasks: Task[]; userId: string }) {
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isAdding, setIsAdding] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim() || isAdding) return;
    setIsAdding(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        title: newTask,
        priority,
        completed: false,
        createdAt: serverTimestamp(),
        userId
      });
      setNewTask('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tasks');
    } finally {
      setIsAdding(false);
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id!), {
        completed: !task.completed
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tasks');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tasks');
    }
  };

  const handleDeleteAllTasks = async () => {
    if (tasks.length === 0) return;
    setIsDeletingAll(true);
    try {
      const batch = writeBatch(db);
      tasks.forEach((task) => {
        if (task.id) {
          batch.delete(doc(db, 'tasks', task.id));
        }
      });
      await batch.commit();
      setShowDeleteAllConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tasks');
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-3xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Productivity Hub</h1>
          <p className="text-[var(--muted-foreground)] text-sm md:text-base">Stay organized and focused on your goals.</p>
        </div>
        {tasks.length > 0 && (
          <Button 
            variant="outline" 
            onClick={() => setShowDeleteAllConfirm(true)} 
            className="gap-2 w-full md:w-auto py-5 md:py-2 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            Delete All
          </Button>
        )}
      </header>

      <AnimatePresence>
        {showDeleteAllConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Delete All Tasks?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This will permanently delete all {tasks.length} tasks. This action cannot be undone.</p>
              <div className="flex flex-col gap-3">
                <Button 
                  className="w-full bg-red-500 hover:bg-red-600 text-white border-none py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={handleDeleteAllTasks}
                  disabled={isDeletingAll}
                >
                  {isDeletingAll ? 'Deleting...' : 'Delete Everything'}
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full py-6 font-bold uppercase tracking-widest text-xs" 
                  onClick={() => setShowDeleteAllConfirm(false)}
                  disabled={isDeletingAll}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="p-5 md:p-6">
        <form onSubmit={handleAddTask} className="flex flex-col md:flex-row gap-3 md:gap-4">
          <input
            type="text"
            placeholder="What needs to be done?"
            className="flex-1 bg-[var(--muted)] px-4 md:px-5 py-3 rounded-xl outline-none border border-transparent focus:border-[var(--accent)] transition-all text-sm md:text-base"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
          />
          <select 
            className="bg-[var(--muted)] px-4 md:px-5 py-3 rounded-xl outline-none border border-transparent focus:border-[var(--accent)] transition-all text-xs md:text-sm font-bold uppercase tracking-widest"
            value={priority}
            onChange={e => setPriority(e.target.value as any)}
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
          </select>
          <Button type="submit" disabled={isAdding} className="px-8 py-3.5 md:py-3 uppercase tracking-widest text-[10px] md:text-xs font-bold w-full md:w-auto">
            {isAdding ? 'Adding...' : 'Add Task'}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {tasks.map(task => (
          <motion.div layout key={task.id}>
            <Card className={cn("p-4 md:p-5 flex items-center gap-4 md:gap-5 group transition-all", task.completed && "opacity-50")}>
              <button 
                onClick={() => toggleTask(task)}
                className={cn(
                  "w-5 h-5 md:w-6 md:h-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0",
                  task.completed 
                    ? "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]" 
                    : "border-[var(--border)] hover:border-[var(--accent)]"
                )}
              >
                {task.completed && <CheckSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn("font-bold text-base md:text-lg tracking-tight truncate", task.completed && "line-through text-[var(--muted-foreground)]")}>{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    "text-[8px] md:text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded",
                    task.priority === 'high' ? "bg-stone-100 text-stone-600 dark:bg-stone-800" : 
                    task.priority === 'medium' ? "bg-stone-100 text-stone-600 dark:bg-stone-800" : 
                    "bg-stone-100 text-stone-600 dark:bg-stone-800"
                  )}>
                    {task.priority} Priority
                  </span>
                </div>
              </div>
              <button 
                onClick={() => deleteTask(task.id!)}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Card>
          </motion.div>
        ))}
        {tasks.length === 0 && (
          <div className="py-16 md:py-20 text-center bg-[var(--muted)]/20 rounded-2xl border-2 border-dashed border-[var(--border)]">
            <CheckSquare className="w-10 h-10 md:w-12 md:h-12 text-[var(--muted)] mx-auto mb-4" />
            <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Your task list is empty. Time to plan!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InspirationView({ quote, saved, userId }: { quote: any; saved: SavedInspiration[]; userId: string }) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isAlreadySaved = saved.some(s => s.quote === quote?.quote);

  const handleSave = async () => {
    if (!quote) return;
    
    if (isAlreadySaved) {
      const savedItem = saved.find(s => s.quote === quote.quote);
      if (savedItem?.id) {
        try {
          await deleteDoc(doc(db, 'savedInspirations', savedItem.id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, 'savedInspirations');
        }
      }
      return;
    }

    try {
      await addDoc(collection(db, 'savedInspirations'), {
        quote: quote.quote,
        author: quote.author,
        savedAt: serverTimestamp(),
        userId
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'savedInspirations');
    }
  };

  const handleClearAll = async () => {
    try {
      const batch = writeBatch(db);
      saved.forEach(s => {
        if (s.id) {
          batch.delete(doc(db, 'savedInspirations', s.id));
        }
      });
      await batch.commit();
      setShowClearConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'savedInspirations');
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inspiration</h1>
          <p className="text-[var(--muted-foreground)]">Daily wisdom to fuel your journey.</p>
        </div>
        {saved.length > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            className="text-[10px] uppercase tracking-widest font-bold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/30 w-full md:w-auto py-4 md:py-2"
          >
            Clear All
          </Button>
        )}
      </header>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--background)] p-8 rounded-2xl max-w-sm w-full shadow-2xl border border-[var(--border)] text-center"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Clear Favorites?</h3>
              <p className="text-[var(--muted-foreground)] mb-8">This will permanently remove all your saved quotes.</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
                <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white border-none" onClick={handleClearAll}>Clear All</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="p-8 md:p-16 bg-[var(--primary)] text-[var(--primary-foreground)] text-center relative overflow-hidden border-none">
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
          <Quote className="w-48 h-48 md:w-96 md:h-96 -translate-x-10 -translate-y-10 md:-translate-x-20 md:-translate-y-20" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-2xl md:text-5xl font-serif italic mb-6 md:mb-10 leading-tight tracking-tight">
            "{quote?.quote || "Loading your daily inspiration..."}"
          </p>
          <p className="text-[var(--primary-foreground)] opacity-70 text-base md:text-xl mb-8 md:mb-12 font-medium">— {quote?.author || "..."}</p>
          <div className="p-5 md:p-8 bg-white/5 backdrop-blur-sm rounded-2xl mb-8 md:mb-12 text-left border border-white/10">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--primary-foreground)] opacity-50 mb-2 md:mb-3">Daily Reflection Tip</p>
            <p className="text-lg md:text-xl leading-relaxed font-light">{quote?.tip || "..."}</p>
          </div>
          <Button 
            variant="outline" 
            className={cn(
              "bg-transparent border-white/20 text-white hover:bg-white/10 w-full md:w-auto px-10 py-6 text-[10px] uppercase tracking-widest font-bold",
              isAlreadySaved && "bg-white/10"
            )}
            onClick={handleSave}
            disabled={!quote}
          >
            <Star className={cn("w-4 h-4 mr-2", isAlreadySaved && "fill-current")} />
            {isAlreadySaved ? 'Saved to Favorites' : 'Save to Favorites'}
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] flex items-center gap-2">
          <Star className="w-4 h-4" />
          Saved Favorites ({saved.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {saved.map(s => (
            <Card key={s.id} className="p-6 md:p-8 border-l-4 border-l-[var(--primary)]">
              <Quote className="w-5 h-5 md:w-6 md:h-6 opacity-10 mb-3 md:mb-4" />
              <p className="text-lg md:text-xl font-serif italic mb-3 md:mb-4 leading-snug tracking-tight">"{s.quote}"</p>
              <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">— {s.author}</p>
            </Card>
          ))}
          {saved.length === 0 && (
            <div className="col-span-full py-16 md:py-20 text-center bg-[var(--muted)]/20 rounded-2xl border-2 border-dashed border-[var(--border)]">
              <Star className="w-10 h-10 md:w-12 md:h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-xs md:text-sm text-[var(--muted-foreground)]">No favorites yet. Save a quote to see it here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ preferences, onLogout, user }: { preferences: UserPreference | null; onLogout: () => void; user: User }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleTheme = async () => {
    if (!preferences) return;
    try {
      await updateDoc(doc(db, 'userPreferences', preferences.id!), {
        theme: preferences.theme === 'light' ? 'dark' : 'light'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'userPreferences');
    }
  };

  const setColorTheme = async (color: string) => {
    if (!preferences) return;
    try {
      await updateDoc(doc(db, 'userPreferences', preferences.id!), {
        colorTheme: color
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'userPreferences');
    }
  };

  const toggleNotifications = async () => {
    if (!preferences) return;
    try {
      await updateDoc(doc(db, 'userPreferences', preferences.id!), {
        notificationsEnabled: !preferences.notificationsEnabled
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'userPreferences');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.toLowerCase() !== 'delete') return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      // 1. Delete all user data from Firestore
      const collectionsToDelete = ['journalEntries', 'moodLogs', 'tasks', 'userPreferences', 'savedInspirations', 'memories'];
      
      for (const collName of collectionsToDelete) {
        const q = query(collection(db, collName), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 2. Delete the Auth user
      // Note: This often requires a recent login.
      await deleteUser(user);
      window.location.reload();
    } catch (err: any) {
      console.error("Delete account error:", err);
      if (err.code === 'auth/requires-recent-login') {
        setDeleteError("This operation requires a recent login. Please sign out and sign back in, then try again.");
      } else {
        setDeleteError(`Failed to delete account: ${err.message}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-2xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-[var(--muted-foreground)]">Personalize your Mindful Mirror experience.</p>
      </header>

      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        <div className="p-6 md:p-8 flex flex-col md:flex-row items-center md:items-center gap-4 md:gap-6 bg-[var(--muted)]/30 text-center md:text-left">
          <img src={user.photoURL || ''} alt="" className="w-20 h-20 rounded-full border-4 border-[var(--background)] shadow-sm" />
          <div>
            <p className="font-bold text-2xl tracking-tight">{user.displayName}</p>
            <div className="flex flex-col md:flex-row items-center gap-2 mt-1">
              <p className="text-[var(--muted-foreground)] font-medium text-sm md:text-base">{user.email}</p>
              <span className="text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                {user.providerData[0]?.providerId === 'google.com' ? 'Google' : 
                 user.providerData[0]?.providerId === 'apple.com' ? 'Apple' : 
                 user.providerData[0]?.providerId === 'password' ? 'Email' : 'Account'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-6 md:space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2.5 md:p-3 bg-[var(--muted)] rounded-xl text-[var(--primary)]">
                {preferences?.theme === 'dark' ? <Moon className="w-5 h-5 md:w-6 md:h-6" /> : <Sun className="w-5 h-5 md:w-6 md:h-6" />}
              </div>
              <div>
                <p className="font-bold text-base md:text-lg tracking-tight">Dark Mode</p>
                <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Adjust the interface for low-light</p>
              </div>
            </div>
            <button 
              onClick={toggleTheme}
              className={cn(
                "w-12 h-6 md:w-14 md:h-7 rounded-full transition-all relative p-1 border border-black/10 dark:border-white/10",
                preferences?.theme === 'dark' ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              )}
            >
              <div className={cn(
                "w-4 h-4 md:w-5 md:h-5 bg-white rounded-full transition-all shadow-sm",
                preferences?.theme === 'dark' ? "translate-x-6 md:translate-x-7" : "translate-x-0"
              )} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2.5 md:p-3 bg-[var(--muted)] rounded-xl text-[var(--primary)]">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <p className="font-bold text-base md:text-lg tracking-tight">Color Theme</p>
                <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Choose your primary accent color</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pl-14 md:pl-16">
              {[
                { name: 'Default', value: 'indigo', bg: 'bg-indigo-500' },
                { name: 'Emerald', value: 'emerald', bg: 'bg-emerald-500' },
                { name: 'Rose', value: 'rose', bg: 'bg-rose-500' },
                { name: 'Amber', value: 'amber', bg: 'bg-amber-500' },
                { name: 'Slate', value: 'slate', bg: 'bg-slate-500' },
                { name: 'Violet', value: 'violet', bg: 'bg-violet-500' },
              ].map((color) => (
                <button
                  key={color.value}
                  onClick={() => setColorTheme(color.value)}
                  className={cn(
                    "w-8 h-8 md:w-10 md:h-10 rounded-full transition-all border-2 flex items-center justify-center",
                    color.bg,
                    preferences?.colorTheme === color.value 
                      ? "border-[var(--foreground)] scale-110 shadow-md" 
                      : "border-transparent hover:scale-105"
                  )}
                  title={color.name}
                >
                  {preferences?.colorTheme === color.value && <CheckSquare className="w-4 h-4 md:w-5 md:h-5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2.5 md:p-3 bg-[var(--muted)] rounded-xl text-[var(--primary)]">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <p className="font-bold text-base md:text-lg tracking-tight">Notifications</p>
                <p className="text-xs md:text-sm text-[var(--muted-foreground)]">Receive daily reminders</p>
              </div>
            </div>
            <button 
              onClick={toggleNotifications}
              className={cn(
                "w-12 h-6 md:w-14 md:h-7 rounded-full transition-all relative p-1 border border-black/10 dark:border-white/10",
                preferences?.notificationsEnabled ? "bg-[var(--primary)]" : "bg-[var(--border)]"
              )}
            >
              <div className={cn(
                "w-4 h-4 md:w-5 md:h-5 bg-white rounded-full transition-all shadow-sm",
                preferences?.notificationsEnabled ? "translate-x-6 md:translate-x-7" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>

        <div className="p-6 md:p-8 bg-[var(--muted)]/10 space-y-4">
          <Button variant="outline" onClick={onLogout} className="w-full py-5 md:py-6 gap-3 text-xs md:text-sm font-bold uppercase tracking-widest border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900/30 dark:hover:bg-red-900/20">
            <LogOut className="w-5 h-5" />
            Sign Out of Account
          </Button>
          
          <button 
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors"
          >
            Delete Account Permanently
          </button>
        </div>
      </Card>

      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md"
            >
              <Card className="p-8 border-red-500/50 shadow-2xl">
                <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2 tracking-tight text-center">Delete Account?</h2>
                <p className="text-[var(--muted-foreground)] mb-6 text-center text-sm leading-relaxed">
                  This action is permanent and will delete all your journal entries, mood logs, and settings.
                </p>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Type "delete" to confirm</p>
                    <input 
                      type="text"
                      value={deleteInput}
                      onChange={(e) => setDeleteInput(e.target.value)}
                      placeholder="delete"
                      className="w-full bg-[var(--muted)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all"
                    />
                  </div>
                  
                  {deleteError && (
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/20">{deleteError}</p>
                  )}
                  
                  <div className="flex flex-col gap-3 pt-2">
                    <Button 
                      variant="danger" 
                      onClick={handleDeleteAccount}
                      disabled={deleteInput.toLowerCase() !== 'delete' || isDeleting}
                      className="w-full py-6 font-bold uppercase tracking-widest text-xs shadow-lg hover:shadow-xl disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting..." : "Delete My Account"}
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => { setShowDeleteModal(false); setDeleteInput(''); setDeleteError(null); }}
                      disabled={isDeleting}
                      className="w-full py-6 font-bold uppercase tracking-widest text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center text-[var(--muted-foreground)] text-[10px] md:text-sm">
        <p>Mindful Mirror v1.0.0</p>
        <p>© 2026 Mindful Mirror Team</p>
      </div>
    </div>
  );
}

