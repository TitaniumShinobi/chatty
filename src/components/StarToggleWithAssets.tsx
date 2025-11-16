import React, { useState, useRef } from 'react';

// Use public assets path for better compatibility
const FourPointStar = '/assets/fourpointstarburst.svg';

interface StarToggleProps {
  toggled: boolean;
  onToggle: (toggled: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  useNova?: boolean;
  spacing?: 'normal' | 'wide' | string;
}

const StarToggleWithAssets: React.FC<StarToggleProps> = ({
  toggled,
  onToggle,
  disabled = false,
  size = 'md',
  className = '',
  useNova = false,
  spacing = 'normal'
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showEightPoint, setShowEightPoint] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const leftStarRef = useRef<HTMLImageElement>(null);
  const rightStarRef = useRef<HTMLImageElement>(null);

  const sizeConfig = {
    sm: { container: 'w-24 h-8', star: 'w-5 h-5' },
    md: { container: 'w-28 h-10', star: 'w-6 h-6' },
    lg: { container: 'w-32 h-12', star: 'w-8 h-8' }
  };

  const config = sizeConfig[size];
  
  // Calculate left star position based on spacing
  const getLeftPosition = (spacing: string) => {
    if (spacing === 'normal') return '64px';
    if (spacing === 'wide') return '44px';
    // If it's a pixel value (contains 'px'), use it directly
    if (spacing.includes('px')) return spacing;
    // Default fallback
    return '64px';
  };
  
  const leftPosition = getLeftPosition(spacing);

  const handleClick = () => {
    if (disabled || isAnimating) return;
    
    setIsAnimating(true);
    onToggle(!toggled);
    
    if (useNova && !toggled) {
      // Multi-stage animation for Nova
      setTimeout(() => {
        setShowEightPoint(true);
        setTimeout(() => {
          setShowNova(true);
        }, 100);
      }, 600);
    }
    
    // Reset animation state after animation completes
    setTimeout(() => {
      setIsAnimating(false);
      if (!useNova || toggled) {
        setShowEightPoint(false);
        setShowNova(false);
      }
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1.1); }
          50% { opacity: 0.8; transform: scale(1.2); }
        }
      `}</style>
      <div
        className={`relative cursor-pointer select-none ${config.container} ${className} transition-all duration-200`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="switch"
        aria-checked={toggled}
        aria-disabled={disabled}
        aria-label={`Toggle ${toggled ? 'on' : 'off'}`}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1
        }}
        onMouseEnter={() => {
          // Apply filter to both stars simultaneously
          if (leftStarRef.current) leftStarRef.current.style.filter = 'hue-rotate(20deg) saturate(1.2) brightness(1.1)';
          if (rightStarRef.current) rightStarRef.current.style.filter = 'hue-rotate(20deg) saturate(1.2) brightness(1.1)';
        }}
        onMouseLeave={() => {
          // Remove filter from both stars
          if (leftStarRef.current) leftStarRef.current.style.filter = 'none';
          if (rightStarRef.current) rightStarRef.current.style.filter = 'none';
        }}
      >
      {/* Left Star (4-point) - cartwheels to right */}
      <img
        ref={leftStarRef}
        src={FourPointStar}
        alt="4-point star"
        className={`absolute top-1 ${config.star}`}
        style={{
          left: toggled ? 'calc(100% - 12px)' : leftPosition,
          transform: toggled ? 'translateX(-50%) rotate(405deg)' : 'translateX(0) rotate(0deg)',
          transformOrigin: 'center',
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 2,
          filter: 'none',
          color: '#e294bc'
        }}
        aria-hidden="true"
      />

      {/* Right Star (4-point) - stays in place, transforms to 8-point/Nova when useNova=true */}
      <img
        ref={rightStarRef}
        src={FourPointStar}
        alt={showNova ? "nova star" : showEightPoint ? "8-point star" : "4-point star"}
        className={`absolute top-1 ${config.star}`}
        style={{
          right: '0px',
          zIndex: 1,
          filter: showNova ? 'drop-shadow(0 0 8px #e294bc) brightness(1.2)' : 'none',
          transform: showEightPoint || showNova ? 'scale(1.1)' : 'none',
          transition: showEightPoint || showNova ? 'all 0.1s ease-in-out' : 'none',
          animation: showNova ? 'pulse 1s ease-in-out infinite' : 'none',
          color: '#e294bc'
        }}
        aria-hidden="true"
      />

      </div>
    </>
  );
};

export default StarToggleWithAssets;
