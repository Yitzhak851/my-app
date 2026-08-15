// my-YBO-app/src/auth/AuthContext.jsx - This file contains the AuthContext and AuthProvider for managing authentication state in the React application
import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    return JSON.parse(localStorage.getItem("currentUser"));
  });

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