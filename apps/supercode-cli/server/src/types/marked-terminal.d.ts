declare module "marked-terminal" {
  import type { MarkedExtension } from "marked"

  interface MarkedTerminalOptions {
    code?: import("chalk").ChalkInstance
    blockquote?: import("chalk").ChalkInstance
    html?: import("chalk").ChalkInstance
    heading?: import("chalk").ChalkInstance
    firstHeading?: import("chalk").ChalkInstance
    hr?: import("chalk").ChalkInstance
    listitem?: import("chalk").ChalkInstance
    list?: import("chalk").ChalkInstance
    table?: import("chalk").ChalkInstance
    paragraph?: import("chalk").ChalkInstance
    strong?: import("chalk").ChalkInstance
    em?: import("chalk").ChalkInstance
    codespan?: import("chalk").ChalkInstance
    del?: import("chalk").ChalkInstance
    link?: import("chalk").ChalkInstance
    href?: import("chalk").ChalkInstance
    text?: import("chalk").ChalkInstance
    unescape?: boolean
    emoji?: boolean
    width?: number
    showSectionPrefix?: boolean
    reflowText?: boolean
    tab?: number
    tableOptions?: Record<string, unknown>
  }

  export function markedTerminal(
    options?: MarkedTerminalOptions,
    highlightOptions?: Record<string, unknown>
  ): MarkedExtension

  export default class Renderer {
    constructor(options?: MarkedTerminalOptions, highlightOptions?: Record<string, unknown>)
  }
}
