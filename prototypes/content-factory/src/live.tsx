import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./live.css";
import { LiveFactoryPage } from "./live/LiveFactoryPage";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LiveFactoryPage />
  </React.StrictMode>,
);
