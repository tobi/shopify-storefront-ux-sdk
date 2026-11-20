import { createAgent } from "@ui-sdk/react/agent"
import { createRoot } from "react-dom/client"
import "shopify-storefront-ux-sdk/styles.css"
import { App } from "./app"
import "./styles.css"

const agent = createAgent({ allow: (step) => (step.confirm ? window.confirm(step.confirm) : true) })
Object.assign(window, { agent })

createRoot(document.getElementById("root")!).render(<App />)
