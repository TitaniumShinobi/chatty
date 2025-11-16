/**
 * Anvil Icon Component
 * SIMFORGE logo - hammer striking anvil
 * Used for SIMFORGE section in the Sidebar
 */

import React from 'react'

interface AnvilIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export const AnvilIcon: React.FC<AnvilIconProps> = ({ 
  size = 16, 
  className = '',
  style = {}
}) => {
  return (
    <img 
      src="/assets/Sim.svg"
      alt="SIMFORGE"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style
      }}
    />
  )
}
