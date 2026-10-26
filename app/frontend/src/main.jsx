import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.jsx";
import TelegramWebApp from "./components/tma/TelegramWebApp.jsx";
import { ErrorBoundary } from "./components/ui";
import "./i18n";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <TelegramWebApp>
          <App />
        </TelegramWebApp>
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>
);
