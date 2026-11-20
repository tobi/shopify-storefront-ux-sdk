/** Small DOM helpers the data elements share. */

const setText = (el: Element | null | undefined, text: string) => {
  if (el && el.textContent !== text) el.textContent = text
}

/** Each item's copy of the first element in the host's own `<template>`. */
function cloneEach<T>(
  host: Element,
  items: readonly T[],
  fill: (el: HTMLElement, item: T, index: number) => void,
) {
  const model = host.querySelector<HTMLTemplateElement>(":scope > template")?.content.firstElementChild
  return items.map((item, index) => {
    const el = (model?.cloneNode(true) as HTMLElement | undefined) ?? document.createElement("div")
    el.setAttribute("data-generated", "")
    fill(el, item, index)
    return el
  })
}

/** Replaces what a host generated before, leaving its template and authored markup. */
function replaceGenerated(host: Element, nodes: Element[], before?: Element | null) {
  for (const old of host.querySelectorAll(":scope > [data-generated]")) old.remove()
  if (before && before.parentElement === host) before.before(...nodes)
  else host.append(...nodes)
}

type WithApi<T> = Element & { api?: T }

/**
 * A child element's controller, once it has upgraded. Parents use it to
 * compose children: a buy box follows its variant selector this way.
 */
async function apiOf<T>(el: Element | null | undefined): Promise<T | null> {
  if (!el) return null
  await customElements.whenDefined(el.localName)
  for (let tries = 0; tries < 50; tries++) {
    const api = (el as WithApi<T>).api
    if (api) return api
    await new Promise((resolve) => setTimeout(resolve, tries < 5 ? 0 : 16))
  }
  return null
}

let ids = 0
const uid = (prefix: string) => `${prefix}-${++ids}`

export { apiOf, cloneEach, replaceGenerated, setText, uid }
