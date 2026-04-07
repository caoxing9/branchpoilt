import React from "react";
import ReactDOM from "react-dom/client";
import { SplitPreview } from "./components/SplitPreview";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SplitPreview />
  </React.StrictMode>,
);
