interface PixelLogoProps {
  animate?: boolean
  className?: string
}

const colors = {
  light: "#fdba74",
  medium: "#fb923c",
  dark: "#f97316",
}

const PixelLogo = ({ animate = false, className }: PixelLogoProps) => {
  return (
    <svg
      width="400"
      height="35"
      viewBox="0 0 140 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={animate ? "animate-float" : className}
    >
      <g className="pixel-letter">
        <rect x="0" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="3" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="6" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="0" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="0" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="3" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="6" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="6" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="0" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="3" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="6" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="12" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="18" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="12" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="18" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="12" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="18" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="12" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="18" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="12" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="15" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="18" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="24" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="27" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="30" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="24" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="30" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="24" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="27" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="30" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="24" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="24" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="36" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="39" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="42" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="36" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="36" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="39" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="36" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="36" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="39" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="42" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="48" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="51" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="54" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="48" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="54" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="48" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="51" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="54" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="48" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="51" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="48" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="54" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="62" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="65" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="68" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="62" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="62" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="62" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="62" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="65" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="68" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="74" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="77" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="80" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="74" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="80" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="74" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="80" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="74" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="80" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="74" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="77" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="80" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="86" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="89" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="86" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="92" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="86" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="92" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="86" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="92" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="86" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="89" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
      <g className="pixel-letter">
        <rect x="98" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="101" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="104" y="0" width="3" height="3" fill={colors.light}/>
        <rect x="98" y="3" width="3" height="3" fill={colors.medium}/>
        <rect x="98" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="101" y="6" width="3" height="3" fill={colors.medium}/>
        <rect x="98" y="9" width="3" height="3" fill={colors.dark}/>
        <rect x="98" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="101" y="12" width="3" height="3" fill={colors.dark}/>
        <rect x="104" y="12" width="3" height="3" fill={colors.dark}/>
      </g>
    </svg>
  )
}

export { PixelLogo }
export type { PixelLogoProps }
