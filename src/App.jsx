import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { DocPage } from "./pages/DocPage";
import { guideSections } from "./content";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          {guideSections.map((section) => (
            <Route
              key={section.slug}
              index={section.slug === "overview"}
              path={section.slug === "overview" ? undefined : section.slug}
              element={<DocPage slug={section.slug} />}
            />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
