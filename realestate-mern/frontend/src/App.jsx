import React from 'react';
import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import PostGate from './components/PostGate';
import DashboardLayout from './components/dashboard/DashboardLayout';
import MyPropertiesLayout from './components/MyPropertiesLayout';

import Home from './pages/Home';
import PropertyListing from './pages/PropertyListing';
import PropertyDetail from './pages/PropertyDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Favorites from './pages/Favorites';
import Notifications from './pages/Notifications';
import Contact from './pages/Contact';
import About from './pages/About';
import LandConverter from './pages/LandConverter';
import NotFound from './pages/NotFound';

import AdminDashboard from './pages/dashboard/AdminDashboard';
import VerifyUsers from './pages/dashboard/VerifyUsers';
import ManageProperties from './pages/dashboard/ManageProperties';
import AddEditProperty from './pages/dashboard/AddEditProperty';
import ManageUsers from './pages/dashboard/ManageUsers';
import ManageCategories from './pages/dashboard/ManageCategories';
import Inquiries from './pages/dashboard/Inquiries';

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
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/land-converter" element={<LandConverter />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Any registered user */}
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

          {/* My Properties - open to every registered user, posting itself is gated by verification */}
          <Route path="/my-properties" element={
            <ProtectedRoute>
              <MyPropertiesLayout><ManageProperties showHeader={false} /></MyPropertiesLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-properties/new" element={
            <ProtectedRoute>
              <MyPropertiesLayout><PostGate><AddEditProperty /></PostGate></MyPropertiesLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-properties/:id/edit" element={
            <ProtectedRoute>
              <MyPropertiesLayout><PostGate><AddEditProperty /></PostGate></MyPropertiesLayout>
            </ProtectedRoute>
          } />
          <Route path="/my-properties/inquiries" element={
            <ProtectedRoute>
              <MyPropertiesLayout><Inquiries /></MyPropertiesLayout>
            </ProtectedRoute>
          } />

          {/* Admin dashboard */}
          <Route path="/dashboard/admin" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><AdminDashboard /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/verifications" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><VerifyUsers /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/properties" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><ManageProperties /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/properties/new" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><AddEditProperty /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/properties/:id/edit" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><AddEditProperty /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/users" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><ManageUsers /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/categories" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><ManageCategories /></DashboardLayout></ProtectedRoute>
          } />
          <Route path="/dashboard/admin/inquiries" element={
            <ProtectedRoute roles={['admin']}><DashboardLayout><Inquiries /></DashboardLayout></ProtectedRoute>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
