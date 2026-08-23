import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import TelegramWebApp from "./components/tma/TelegramWebApp.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TelegramWebApp>
      <App />
    </TelegramWebApp>
  </StrictMode>
);
