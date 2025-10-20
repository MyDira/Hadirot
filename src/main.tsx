import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/global.css";
import { AuthProvider } from "@/hooks/useAuth";
import { ImpersonationProvider } from "@/hooks/useImpersonation";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ImpersonationProvider>
        <App />
      </ImpersonationProvider>
    </AuthProvider>
  </StrictMode>,
);
