import React from "react";

type RippleIconProps = {
  size?: number;
  className?: string;
};

export default function RippleIcon({ size = 20, className }: RippleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="ripple"
    >
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="9.5" />
    </svg>
  );
}
