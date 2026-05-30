import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { App } from "./App";
import { theme } from "./theme";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
);
