import { Navigate, Route, Routes } from "react-router-dom";
import { SourcesProvider } from "./sources";
import { Layout } from "./components/Layout";
import { Home } from "./components/Home";
import { SourceLayout } from "./components/SourceLayout";
import { Browse } from "./components/Browse";
import { Filters } from "./components/Filters";
import { Config } from "./components/Config";
import { Login } from "./components/Login";
import { NovelPage } from "./components/NovelPage";
import { ReaderPage } from "./components/ReaderPage";
import { RunReport } from "./components/RunReport";

export function App() {
  return (
    <SourcesProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="run" element={<RunReport />} />
          <Route path="source/:id" element={<SourceLayout />}>
            <Route index element={<Navigate to="popular" replace />} />
            <Route path="popular" element={<Browse mode="Popular" />} />
            <Route path="latest" element={<Browse mode="Latest" />} />
            <Route path="search" element={<Browse mode="Search" />} />
            <Route path="filters" element={<Filters />} />
            <Route path="config" element={<Config />} />
            <Route path="login" element={<Login />} />
            <Route path="novel" element={<NovelPage />} />
            <Route path="read" element={<ReaderPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SourcesProvider>
  );
}
