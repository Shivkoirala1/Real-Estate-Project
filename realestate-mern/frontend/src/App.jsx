import React from "react";
import { Routes, Route } from "react-router-dom";

// Components
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import PostGate from "./components/PostGate";
import DashboardLayout from "./components/layout/DashboardLayout";
import MyPropertiesLayout from "./components/MyPropertiesLayout";

// Public pages
import Home from "./pages/public/Home";
import PropertyListing from "./pages/public/PropertyListing";
import PropertyDetail from "./pages/public/PropertyDetail";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import VerifyEmail from "./pages/public/VerifyEmail";
import ForgotPassword from "./pages/public/ForgotPassword";
import ResetPassword from "./pages/public/ResetPassword";
import Contact from "./pages/public/Contact";
import About from "./pages/public/About";
import LandConverter from "./pages/public/LandConverter";
import BlogList from "./pages/public/BlogList";
import BlogDetail from "./pages/public/BlogDetail";
import NotFound from "./pages/public/NotFound";

// User pages
import Profile from "./pages/user/Profile";
import Favorites from "./pages/user/Favorites";
import Notifications from "./pages/user/Notifications";
import MyVisits from "./pages/user/MyVisits";

// Agent and Admin dashboards
import AgentDashboard from "./pages/agent/AgentDashboard";

import AdminDashboard from "./pages/admin/AdminDashboard";
import VerifyUsers from "./pages/admin/VerifyUsers";
import ManageProperties from "./pages/admin/ManageProperties";
import AddEditProperty from "./pages/admin/AddEditProperty";
import BlogForm from "./pages/admin/BlogForm";
import ManageUsers from "./pages/admin/ManageUsers";
import ManageCategories from "./pages/admin/ManageCategories";
import BlogManagement from "./pages/admin/ManageBlogs";
// import Inquiries from "./pages/dashboard/Inquiries";
import Inquiries from "./pages/admin/RevampedInquiries";  // updated lead integrated inqueiris
import Visits from "./pages/admin/Visits";

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          {/* Public routes - the open feed of listings, visible to everyone */}
          <Route path="/" element={<Home />} />
          <Route path="/properties" element={<PropertyListing />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/blogs" element={<BlogList />} />
          <Route path="/blogs/:slug" element={<BlogDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/land-converter" element={<LandConverter />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Any registered user */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/favorites"
            element={
              <ProtectedRoute>
                <Favorites />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />

          <Route
            path="my-visits"
            element={
              <ProtectedRoute>
                <MyVisits />
              </ProtectedRoute>
            }
          />

          {/* My Properties - open to every registered user, posting itself is gated by verification */}
          <Route
            path="/my-properties"
            element={
              <ProtectedRoute>
                <MyPropertiesLayout>
                  <ManageProperties showHeader={false} />
                </MyPropertiesLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-properties/new"
            element={
              <ProtectedRoute>
                <MyPropertiesLayout>
                  <PostGate>
                    <AddEditProperty />
                  </PostGate>
                </MyPropertiesLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-properties/:id/edit"
            element={
              <ProtectedRoute>
                <MyPropertiesLayout>
                  <PostGate>
                    <AddEditProperty />
                  </PostGate>
                </MyPropertiesLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-properties/inquiries"
            element={
              <ProtectedRoute>
                <MyPropertiesLayout>
                  <Inquiries />
                </MyPropertiesLayout>
              </ProtectedRoute>
            }
          />

          {/* Agent dashboard */}

          <Route
            path="/dashboard/agent"
            element={
              <ProtectedRoute roles={["agent"]}> 
                <DashboardLayout>
                  <AgentDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          {/* Admin dashboard */}
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <AdminDashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/verifications"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <VerifyUsers />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/properties"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <ManageProperties />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/properties/new"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <AddEditProperty />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/properties/:id/edit"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <AddEditProperty />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/users"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <ManageUsers />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/categories"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <ManageCategories />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/inquiries"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <Inquiries />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/blogs"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <BlogManagement />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/blogs/create"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <BlogForm />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/blogs/:id/edit"
            element={
              <ProtectedRoute roles={["admin"]}>
                <DashboardLayout>
                  <BlogForm />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
           <Route
            path="/dashboard/admin/visits"
            element={
              <ProtectedRoute roles={["admin", "agent"]}>
                <DashboardLayout>
                  <Visits />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
