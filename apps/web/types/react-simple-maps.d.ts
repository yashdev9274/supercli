declare module "react-simple-maps" {
  import { ComponentType, SVGProps } from "react"

  interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    projection?: string
    projectionConfig?: {
      rotate?: [number, number, number]
      scale?: number
      center?: [number, number]
    }
    width?: number
    height?: number
    viewBox?: string
  }

  interface GeographiesProps {
    geography: string | object
    children: (data: {
      geographies: (Record<string, unknown> & {
        properties?: Record<string, string | undefined>
        rsmKey?: string
        type?: string
        id?: string
      })[]
    }) => React.ReactNode
  }

  interface GeographyProps {
    geography: Record<string, unknown> & {
      properties?: Record<string, unknown>
      rsmKey?: string
      type?: string
      id?: string
    }
    style?: {
      default?: React.CSSProperties
      hover?: React.CSSProperties
      pressed?: React.CSSProperties
    }
    onMouseEnter?: React.MouseEventHandler<SVGPathElement>
    onMouseMove?: React.MouseEventHandler<SVGPathElement>
    onMouseLeave?: React.MouseEventHandler<SVGPathElement>
    onClick?: React.MouseEventHandler<SVGPathElement>
    [key: string]: unknown
  }

  export const ComposableMap: ComponentType<ComposableMapProps>
  export const Geographies: ComponentType<GeographiesProps>
  export const Geography: ComponentType<GeographyProps>
}
