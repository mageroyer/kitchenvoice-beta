import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '../database/firebase';

/**
 * Password strength validation
 * Requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character (!@#$%^&*)
 */
export function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&* etc.)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate password strength score (0-4)
 */
export function getPasswordStrength(password) {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  // Cap at 4
  return Math.min(score, 4);
}

/**
 * Get strength label and color
 */
export function getPasswordStrengthLabel(score) {
  const labels = [
    { label: 'Very Weak', color: '#e74c3c' },
    { label: 'Weak', color: '#e67e22' },
    { label: 'Fair', color: '#f1c40f' },
    { label: 'Good', color: '#27ae60' },
    { label: 'Strong', color: '#2ecc71' },
  ];
  return labels[score] || labels[0];
}

/**
 * Register a new user with email and password
 */
export async function registerUser(email, password, displayName = null) {
  if (!auth) {
    throw new Error('Firebase Auth not initialized');
  }

  // Validate password strength
  const validation = validatePasswordStrength(password);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('. '));
  }

  try {
    // Create user account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name if provided
    if (displayName) {
      await updateProfile(user, { displayName });
    }

    // Send email verification
    await sendEmailVerification(user);

    console.log('✅ User registered:', user.email);
    console.log('📧 Verification email sent');

    return {
      success: true,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
      },
      message: 'Registration successful! Please check your email to verify your account.',
    };
  } catch (error) {
    console.error('Registration error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Sign in user with email and password
 */
export async function loginUser(email, password) {
  if (!auth) {
    throw new Error('Firebase Auth not initialized');
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log('✅ User logged in:', user.email);

    return {
      success: true,
      needsVerification: !user.emailVerified,
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
      },
      message: user.emailVerified
        ? 'Login successful!'
        : 'Login successful! Please verify your email when convenient.',
    };
  } catch (error) {
    console.error('Login error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  if (!auth) {
    throw new Error('Firebase Auth not initialized');
  }

  try {
    await signOut(auth);
    console.log('✅ User logged out');
    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    console.error('Logout error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  if (!auth) {
    throw new Error('Firebase Auth not initialized');
  }

  try {
    await sendPasswordResetEmail(auth, email);
    console.log('📧 Password reset email sent to:', email);
    return {
      success: true,
      message: 'Password reset email sent! Please check your inbox.',
    };
  } catch (error) {
    console.error('Password reset error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Resend email verification
 */
export async function resendVerificationEmail() {
  if (!auth || !auth.currentUser) {
    throw new Error('No user logged in');
  }

  try {
    await sendEmailVerification(auth.currentUser);
    console.log('📧 Verification email resent');
    return {
      success: true,
      message: 'Verification email sent! Please check your inbox.',
    };
  } catch (error) {
    console.error('Resend verification error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Change current user's password
 * Requires re-authentication with current password first
 * @param {string} currentPassword - User's current password
 * @param {string} newPassword - New password to set
 * @returns {Promise<Object>} Success result
 */
export async function changePassword(currentPassword, newPassword) {
  if (!auth || !auth.currentUser) {
    throw new Error('No user logged in');
  }

  // Validate new password strength
  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('. '));
  }

  try {
    const user = auth.currentUser;

    // Re-authenticate user with current password
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Update password
    await updatePassword(user, newPassword);

    console.log('✅ Password changed successfully');
    return {
      success: true,
      message: 'Password changed successfully!',
    };
  } catch (error) {
    console.error('Password change error:', error);
    if (error.code === 'auth/wrong-password') {
      throw new Error('Current password is incorrect');
    }
    throw mapFirebaseError(error);
  }
}

/**
 * Update current user's display name
 * @param {string} displayName - New display name
 * @returns {Promise<Object>} Success result
 */
export async function updateUserDisplayName(displayName) {
  if (!auth || !auth.currentUser) {
    throw new Error('No user logged in');
  }

  try {
    await updateProfile(auth.currentUser, { displayName });
    console.log('✅ Display name updated:', displayName);
    return {
      success: true,
      message: 'Display name updated successfully!',
    };
  } catch (error) {
    console.error('Update profile error:', error);
    throw mapFirebaseError(error);
  }
}

/**
 * Map Firebase error codes to user-friendly messages
 */
function mapFirebaseError(error) {
  const errorMessages = {
    'auth/email-already-in-use': 'This email is already registered. Please login or use a different email.',
    'auth/invalid-email': 'Invalid email address format.',
    'auth/operation-not-allowed': 'Email/password accounts are not enabled. Please contact support.',
    'auth/weak-password': 'Password is too weak. Please use a stronger password.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/user-not-found': 'No account found with this email address.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please try again.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
  };

  const message = errorMessages[error.code] || error.message || 'An unexpected error occurred.';
  return new Error(message);
}
