import React, { useState, useCallback } from "react";
import { X } from "lucide-react";
// No visual icon by design — render an outlined ring only; optional "end" mode shows X
import styles from "./SendButton.module.css";

export interface SendButtonProps {
  onClick: () => void;
  disabled?: boolean;
  animating?: boolean;
  ariaLabel?: string;
  soft?: boolean;
  /** When true, same circular frame but shows X (end voice mode). */
  mode?: "send" | "end";
}

export default function SendButton({
  onClick,
  disabled = false,
  animating = false,
  ariaLabel = "Send message",
  soft = false,
  mode = "send",
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
      className={`${styles.root} ${mode === "end" ? styles.end : styles.send} ${soft ? styles.soft : ""} ${showPressed ? styles.pressed : ""} ${animating ? styles.animating : ""} ${isDisabled ? styles.disabled : ""}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      disabled={isDisabled}
      aria-label={ariaLabel}
    >
      {mode === "end" ? <X size={20} className={styles.endIcon} /> : null}
    </button>
  );
}
