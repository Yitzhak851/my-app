// my-YBO-app/src/auth/AuthContext.jsx - This file contains the AuthContext and AuthProvider for managing authentication state in the React application
import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

// Reading the stored user must never throw: AuthProvider wraps the whole app, so an
// exception here happens during the very first render and blanks the entire page.
// localStorage can legitimately hold a corrupted value, and getItem() does not always
// return null for "missing" (it is undefined under a mocked storage).
function readStoredUser() {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem("currentUser");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(readStoredUser);

  function login(userData) {
    localStorage.setItem(
      "currentUser",
      JSON.stringify(userData)
    );

    setCurrentUser(userData);
  }

  function logout() {
    localStorage.removeItem("currentUser");
    setCurrentUser(null);
  }
  
  const value = { currentUser, isLoggedIn: Boolean(currentUser), login, logout, };
  
  return ( <AuthContext.Provider value={value}> {children} </AuthContext.Provider> );
}

export function useAuth() {
  return useContext(AuthContext);
}