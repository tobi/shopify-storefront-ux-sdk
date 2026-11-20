import { useSyncExternalStore } from "react"

type Subscribable<State> = {
  get: () => State
  subscribe: (listener: () => void) => () => void
}

/** Subscribes a React component to a ui-sdk primitive instance's store. */
function useInstanceState<State>(instance: Subscribable<State>): State {
  return useSyncExternalStore(
    (onStoreChange) => instance.subscribe(onStoreChange),
    () => instance.get(),
    () => instance.get(),
  )
}

export { useInstanceState }
