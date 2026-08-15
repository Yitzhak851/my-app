// my-YBO-app/src/auth/AuthContext.jsx
//
// Who is signed in, for the whole app.
//
// The session lives in an HttpOnly cookie that JavaScript cannot read, so this
// context cannot know the answer on its own — it asks the server once on load.
// localStorage is used only as a cache to avoid a blank flash on refresh; the
// server's answer always wins, which is what makes logout and bans real.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
} from "../api/api";

const AuthContext = createContext(null);
const CACHE_KEY = "currentUser";

// Reading the cache must never throw: this runs during the first render of the
// provider that wraps the whole app, so an exception here blanks the page.
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function writeCache(user) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // A full or disabled storage is not a reason to break signing in.
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readCache);
  // True until the server has confirmed (or denied) the cached user. Guards
  // against ProtectedRoute bouncing a signed-in user to /login on first paint.
  const [loading, setLoading] = useState(true);

  const apply = useCallback((user) => {
    setCurrentUser(user);
    writeCache(user);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCurrentUser();
      apply(data.user);
      return data.user;
    } catch {
      // 401 (no session) and a network failure both mean "not usable as signed
      // in". Clearing the cache keeps the UI honest.
      apply(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(email, password) {
    const data = await loginRequest(email, password);
    apply(data.user);
    return data.user;
  }

  async function signup(email, password, name) {
    const data = await signupRequest(email, password, name);
    apply(data.user);
    return data.user;
  }

  async function logout() {
    try {
      await logoutRequest();
    } catch {
      // Signing out must never reject. The old `try/finally` without a `catch`
      // cleared the local state but let the rejection escape, so every caller
      // that did not wrap the call produced an unhandled promise rejection —
      // in the browser console, and as a non-zero exit code in the test run.
      //
      // Failing to reach the server is not a reason to stay "signed in" in the
      // UI, and the session expires on its own regardless.
    } finally {
      apply(null);
    }
  }

  const value = {
    currentUser,
    isLoggedIn: Boolean(currentUser),
    loading,
    login,
    signup,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
