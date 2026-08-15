// my-YBO-app/src/App.jsx : Setting Pages/Routes and define which URL renders which component
// some necessary imports for routing and components
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./components/Feed";
import Feed from "./components/Feed";
import Login from "./components/Login";
import NewPost from "./components/NewPost";
import Search from "./components/Search";
import Signup from "./components/Signup";
import SinglePost from "./components/SinglePost";
import ToolbarComponent from "./components/ToolbarComponent";
import User from "./components/User";
import Users from "./components/Users";
import UserProfile from "./components/UserProfile";
import ProtectedRoute from "./auth/ProtectedRoute";

import About from "./components/About";


// The App component sets up the routing for the application using React Router. It defines which component should be rendered for each URL path. The ToolbarComponent is included at the top level so that it is displayed on all pages. The ProtectedRoute component is used to protect certain routes that require authentication, such as the NewPost page. If a user tries to access a protected route without being authenticated, they will be redirected to the login page.
function App() {
  return (
    <BrowserRouter>
      <ToolbarComponent />
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/login" element={<Login />} />
        <Route path="/new-post" element={<ProtectedRoute> <NewPost /> </ProtectedRoute>} />
        <Route path="/search" element={<Search />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/post/:postId" element={<SinglePost />} />
        <Route path="/ToolbarComponent" element={<ToolbarComponent />} />

        <Route path="/users" element={<Users />} />
        <Route path="/user/:id" element={<UserProfile />} />
        <Route path="/users/:id" element={<UserProfile />} />

        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;