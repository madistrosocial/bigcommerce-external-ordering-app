import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initViewportHeightVar } from "./lib/viewportHeight";
import { installAuthSessionMonitor } from "./lib/authSession";

initViewportHeightVar();
installAuthSessionMonitor();

createRoot(document.getElementById("root")!).render(<App />);
