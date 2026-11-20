import { createAgent } from "@ui-sdk/solid/agent"
import { render } from "@solidjs/web"
import "shopify-storefront-ux-sdk/styles.css"
import { App } from "./app"
import "./styles.css"

const agent = createAgent({ allow: (step) => (step.confirm ? window.confirm(step.confirm) : true) })
Object.assign(window, { agent })

render(() => <App />, document.getElementById("root")!)
