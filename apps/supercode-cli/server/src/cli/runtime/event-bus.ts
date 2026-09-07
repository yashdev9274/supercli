/** CLI-facing re-export of the shared runtime event bus. */
export {
  createEventBus,
  type EventBus,
  type TurnEvent,
  type TurnEventListener,
} from "src/runtime/events.ts"
