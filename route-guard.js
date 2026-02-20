// ─── ROUTE GUARD ──────────────────────────────────────────────────────────────
// Handles authentication state and route protection

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification, 
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCo956yVV5pqp9LlfiQhXl2OZaIjqs1ARo",
  authDomain: "flappyep-1cd3e.firebaseapp.com",
  projectId: "flappyep-1cd3e",
  storageBucket: "flappyep-1cd3e.firebasestorage.app",
  messagingSenderId: "736560829565",
  appId: "1:736560829565:web:d98889f7c30ce1a8bbcd14"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

console.log('[Route Guard] ✅ Firebase initialized successfully');

// ─── DOM ELEMENTS ─────────────────────────────────────────────────────────────
const loginContainer = document.getElementById('login-container');
const gameContainer = document.getElementById('game-container');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const authMsg = document.getElementById('auth-msg');
const settingsToggle = document.getElementById('settings-toggle');
const settingsMenu = document.getElementById('settings-menu');
const userEmailDisplay = document.getElementById('user-email');

// Validate all required DOM elements exist
if (!loginContainer || !gameContainer || !emailInput || !passwordInput || !loginBtn || !registerBtn || !authMsg) {
  console.error('[Route Guard] Missing required DOM elements. Ensure index.html has all required IDs.');
  throw new Error('Route guard initialization failed: missing DOM elements');
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser = null;

// ─── ROUTE GUARD FUNCTION ─────────────────────────────────────────────────────
function protectRoute() {
  console.log('[Route Guard] Starting authentication check...');
  const loadingSpinner = document.getElementById('loading-spinner');
  
  onAuthStateChanged(auth, (user) => {
    // Hide loading spinner
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }
    
    if (user && user.emailVerified) {
      console.log('[Route Guard] ✅ User authenticated:', user.email);
      currentUser = user;
      updateUserDisplay(user.email);
      showGameContainer();
      // Boot the game after container is shown
      setTimeout(() => {
        if (window.bootGame) {
          console.log('[Route Guard] Booting game...');
          window.bootGame();
        }
      }, 100);
    } else if (user && !user.emailVerified) {
      console.log('[Route Guard] ⚠️ User email not verified:', user.email);
      authMsg.textContent = '⚠️ Please verify your email first. Check your inbox.';
      showLoginContainer();
    } else {
      console.log('[Route Guard] ℹ️ No authenticated user - showing login');
      showLoginContainer();
    }
  });
}

// ─── NAVIGATION FUNCTIONS ─────────────────────────────────────────────────────
function showLoginContainer() {
  loginContainer.style.display = 'flex';
  gameContainer.style.display = 'none';
  closeSettingsMenu();
}

function showGameContainer() {
  loginContainer.style.display = 'none';
  gameContainer.style.display = 'block';
}

// ─── SETTINGS MENU FUNCTIONS ──────────────────────────────────────────────────
function openSettingsMenu() {
  if (settingsMenu) settingsMenu.style.display = 'block';
}

function closeSettingsMenu() {
  if (settingsMenu) settingsMenu.style.display = 'none';
}

function toggleSettingsMenu() {
  if (settingsMenu) {
    const isVisible = settingsMenu.style.display === 'block';
    if (isVisible) {
      closeSettingsMenu();
    } else {
      openSettingsMenu();
    }
  }
}

function updateUserDisplay(email) {
  if (userEmailDisplay) {
    userEmailDisplay.textContent = email;
  }
}

// ─── AUTH HANDLERS ────────────────────────────────────────────────────────────
async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMsg.textContent = '❌ Please fill in all fields';
    return;
  }

  authMsg.textContent = '🔄 Authenticating...';
  loginBtn.disabled = true;
  registerBtn.disabled = true;

  try {
    console.log('[Route Guard] Login attempt for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('[Route Guard] ✅ Sign in successful:', user.email, '| Email verified:', user.emailVerified);

    if (!user.emailVerified) {
      authMsg.textContent = '⚠️ Please verify your email first. Check your inbox.';
      loginBtn.disabled = false;
      registerBtn.disabled = false;
      return;
    }

    clearForm();
    authMsg.textContent = '✅ Login successful!';
    currentUser = user;
    // Immediately show game and boot
    showGameContainer();
    setTimeout(() => {
      if (window.bootGame) {
        window.bootGame();
      }
    }, 100);
  } catch (error) {
    console.error('[Route Guard] Login error:', error.code, error.message);
    let errorMsg = 'Login failed. Please try again.';
    if (error.code === 'auth/user-not-found') {
      errorMsg = 'Email not found. Please sign up first.';
    } else if (error.code === 'auth/wrong-password') {
      errorMsg = 'Password is incorrect.';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'Invalid email address.';
    } else if (error.code === 'auth/too-many-requests') {
      errorMsg = 'Too many login attempts. Please try later.';
    }
    authMsg.textContent = `❌ ${errorMsg}`;
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
}

async function handleRegister() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMsg.textContent = '❌ Please fill in all fields';
    return;
  }

  if (password.length < 6) {
    authMsg.textContent = '❌ Password must be at least 6 characters';
    return;
  }

  authMsg.textContent = '🔄 Creating account...';
  loginBtn.disabled = true;
  registerBtn.disabled = true;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    authMsg.textContent = '📧 Verification email sent! Check your inbox.';
    await sendEmailVerification(user);

    clearForm();
    startEmailVerificationCheck(user);
  } catch (error) {
    console.error('[Route Guard] Register error:', error.code, error.message);
    let errorMsg = 'Account creation failed. Please try again.';
    if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'Email already registered. Please login instead.';
    } else if (error.code === 'auth/weak-password') {
      errorMsg = 'Password is too weak. Use at least 6 characters.';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'Invalid email address.';
    }
    authMsg.textContent = `❌ ${errorMsg}`;
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
}

function startEmailVerificationCheck(user) {
  let checkInterval = setInterval(async () => {
    await user.reload();
    if (user.emailVerified) {
      clearInterval(checkInterval);
      authMsg.textContent = '✅ Email verified! You can now login.';
      loginBtn.disabled = false;
      registerBtn.disabled = false;
    }
  }, 2000);

  // Also check on window focus
  const focusHandler = async () => {
    await user.reload();
    if (user.emailVerified) {
      clearInterval(checkInterval);
      authMsg.textContent = '✅ Email verified! You can now login.';
      loginBtn.disabled = false;
      registerBtn.disabled = false;
      window.removeEventListener('focus', focusHandler);
    }
  };
  window.addEventListener('focus', focusHandler);
}

async function handleLogout() {
  try {
    console.log('[Route Guard] Logging out user...');
    await signOut(auth);
    if (window.stopGame) window.stopGame();
    currentUser = null;
    clearForm();
    authMsg.textContent = '👋 Logged out successfully';
    closeSettingsMenu();
    showLoginContainer();
    console.log('[Route Guard] ✅ User logged out');
  } catch (error) {
    console.error('[Route Guard] Logout error:', error.message);
    authMsg.textContent = `❌ ${error.message}`;
  }
}

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────
function clearForm() {
  emailInput.value = '';
  passwordInput.value = '';
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
loginBtn.addEventListener('click', handleLogin);
registerBtn.addEventListener('click', handleRegister);
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (settingsToggle) settingsToggle.addEventListener('click', toggleSettingsMenu);

// Close settings menu when clicking outside
if (settingsMenu) {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.settings-panel')) {
      closeSettingsMenu();
    }
  });
}

// Allow Enter key to login
emailInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });

// ─── INIT ─────────────────────────────────────────────────────────────────────
protectRoute();
