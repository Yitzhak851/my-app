// my-YBO-app/src/main.jsx = This file turn-on the Fronted
import React from "react";  // React library for building user interfaces
import ReactDOM from "react-dom/client";  // ReactDOM for rendering the React application to the DOM
import { AuthProvider } from "./auth/AuthContext.jsx";  // AuthProvider component to provide authentication context to the application

import App from "./App.jsx";  // Main App component that contains the routing and main structure of the application
import "./index.css";  // Importing global CSS styles for the application

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);