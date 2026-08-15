// my-YBO-app/src/auth/ProtectedRoute.jsx - This file contains the ProtectedRoute component that restricts access to certain routes based on the user's authentication status

import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth();
  // if the user NOT-logged-in ==> the component redirects them to the Login-page using the Navigate component from React Router
  if (!isLoggedIn) {
    return <Navigate to="/login" />;
  }
  // If the user is logged in, the component renders its children, 
  // allowing access to the protected route. 
  // If the user is not logged in, it redirects them to the Login-page
  return children;
}

export default ProtectedRoute;