import { createSignal, onCleanup, type Accessor } from "solid-js"

type Subscribable<State> = {
  get: () => State
  subscribe: (listener: () => void) => () => void
}

// `PrimitiveHandle.state` doesn't track; components that render collections
// (cart lines, catalog results) need the whole state as a signal.
function useInstanceState<State>(instance: Subscribable<State>): Accessor<State> {
  const [state, setState] = createSignal<State>(instance.get() as Exclude<State, Function>, { equals: false })
  onCleanup(instance.subscribe(() => setState(() => instance.get())))
  return state
}

export { useInstanceState }
