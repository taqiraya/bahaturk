import React, { lazy } from "react";
import SafePage from "./components/RouteBoundary";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/home/Home";
import { loadAbout, loadProjects, loadContact, loadAdmin } from "./pages/route-loaders";
import MainLayout from "./layouts/MainLayout";
import NotFoundPage from "./pages/NotFound";
const About = lazy(loadAbout);
const Projects = lazy(loadProjects);
const Contact = lazy(loadContact);
const Admin = lazy(loadAdmin);

export default function App() {
  return (
    <Routes>
      <Route path="admin" element={<SafePage key="admin" component={Admin} />} />
      <Route path="/" element={<MainLayout />} >
        <Route index element={<Home />} />
        {/* اسلش (/) از ابتدای آدرس‌ها حذف شد تا به درستی ذیل مسیر پایه لود شوند */}
        <Route path="about" element={<SafePage key="about" component={About} />} />
        <Route path="projects" element={<SafePage key="projects" component={Projects} />} />
        <Route path="contact" element={<SafePage key="contact" component={Contact} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
