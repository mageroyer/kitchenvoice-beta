import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth } from '../services/database/firebase';
import { disableDemoMode } from '../services/demo/demoService';
import { createLogger } from '../utils/logger';

// Create scoped logger
const logger = createLogger('AuthContext');

// Create Auth Context
const AuthContext = createContext(null);

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Auth Provider Component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth) {
      logger.warn('Firebase Auth not initialized', { action: 'init' });
      setLoading(false);
      return;
    }

    // Set persistence to LOCAL (stay logged in until logout)
    const initPersistence = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        logger.info('Auth persistence set to LOCAL', { action: 'setPersistence' });
      } catch (err) {
        logger.logError('setPersistence', err);
      }
    };
    initPersistence();

    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Exit demo mode when a real user signs in
        disableDemoMode();

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
        logger.info('User signed in', {
          action: 'signIn',
          data: { email: firebaseUser.email, uid: firebaseUser.uid },
        });
      } else {
        setUser(null);
        logger.info('User signed out', { action: 'signOut' });
      }
      setLoading(false);
    }, (err) => {
      logger.logError('onAuthStateChanged', err);
      setError(err.message);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  // Check if user is authenticated
  const isAuthenticated = user !== null;

  // Check if user exists but email not verified (for showing reminder)
  const isPendingVerification = user !== null && !user.emailVerified;

  const value = {
    user,
    loading,
    error,
    isAuthenticated,
    isPendingVerification,
    setError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
