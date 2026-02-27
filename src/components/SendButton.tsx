import React, { useState, useCallback } from "react";
// No visual icon by design — render an outlined ring only
import styles from "./SendButton.module.css";

export interface SendButtonProps {
  onClick: () => void;
  disabled?: boolean;
  animating?: boolean;
  ariaLabel?: string;
}

export default function SendButton({
  onClick,
  disabled = false,
  animating = false,
  ariaLabel = "Send message",
}: SendButtonProps) {
  const [pressed, setPressed] = useState(false);

  const handlePointerDown = useCallback(() => {
    if (disabled) return;
    setPressed(true);
  }, [disabled]);

  const handlePointerUp = useCallback(() => {
    setPressed(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setPressed(false);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (disabled) return;
      onClick();
    },
    [disabled, onClick]
  );

  const isDisabled = disabled;
  const showPressed = pressed && !isDisabled;

  return (
    <button
      type="button"
      className={`${styles.root} ${showPressed ? styles.pressed : ""} ${animating ? styles.animating : ""} ${isDisabled ? styles.disabled : ""}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      disabled={isDisabled}
      aria-label={ariaLabel}
    >
      {/* Intentionally empty: visual is an outline ring matching other controls */}
    </button>
  );
}
