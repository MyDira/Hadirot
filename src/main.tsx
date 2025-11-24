import { StrictMode } from "react";
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/global.css";
import { AuthProvider } from "@/hooks/useAuth";

Sentry.init({
  dsn: "https://ca3ceb8f19fa68cf58690ab12f4cf76d@o4510417390534656.ingest.us.sentry.io/4510417418125312",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  // Enable logs to be sent to Sentry
  enableLogs: true
});

const container = document.getElementById("app");
const root = createRoot(container);
root.render(<App />);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
