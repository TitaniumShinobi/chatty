import React from "react";
import moonFourPointStar from "@assets/stars/moonfourpointstarburst.svg";
import rayStar from "@assets/stars/fourpointray.svg";
import starburstStar from "@assets/stars/lemonfourpointstarburst.svg";
import novaStar from "@assets/stars/eightpointnova.svg";
import { useTheme } from "../../lib/ThemeContext";
import { Z_LAYERS } from "../../lib/zLayers";
import styles from "./Starfield.module.css";

type StarSpec = {
  top: string;
  left: string;
  width: number;
  duration: string;
  delay: string;
  opacity: number;
};

const fourpointStars: StarSpec[] = [
  { top: "8%", left: "9%", width: 64, duration: "34s", delay: "-6s", opacity: 0.72 },
  { top: "18%", left: "72%", width: 58, duration: "39s", delay: "-18s", opacity: 0.68 },
  { top: "35%", left: "22%", width: 46, duration: "31s", delay: "-12s", opacity: 0.66 },
  { top: "48%", left: "82%", width: 54, duration: "36s", delay: "-9s", opacity: 0.63 },
  { top: "68%", left: "12%", width: 60, duration: "42s", delay: "-24s", opacity: 0.7 },
  { top: "78%", left: "64%", width: 50, duration: "33s", delay: "-15s", opacity: 0.65 },
];

const rays: StarSpec[] = [
  { top: "14%", left: "46%", width: 132, duration: "14s", delay: "-7s", opacity: 0.28 },
  { top: "60%", left: "70%", width: 148, duration: "14s", delay: "-16s", opacity: 0.24 },
];

const starbursts: StarSpec[] = [
  { top: "24%", left: "58%", width: 108, duration: "28s", delay: "-11s", opacity: 0.24 },
  { top: "66%", left: "30%", width: 118, duration: "28s", delay: "-27s", opacity: 0.22 },
];

const novas: StarSpec[] = [
  { top: "6%", left: "58%", width: 184, duration: "72s", delay: "-22s", opacity: 0.14 },
  { top: "54%", left: "6%", width: 208, duration: "78s", delay: "-38s", opacity: 0.12 },
];

function spriteStyle(spec: StarSpec): React.CSSProperties {
  return {
    top: spec.top,
    left: spec.left,
    width: `${spec.width}px`,
    height: `${spec.width}px`,
    ["--duration" as string]: spec.duration,
    ["--delay" as string]: spec.delay,
    ["--opacity" as string]: spec.opacity,
    transformOrigin: "50% 50%",
  };
}

export default function Starfield() {
  const { actualTheme, activeThemeScript } = useTheme();

  if (actualTheme !== "night" || activeThemeScript) {
    return null;
  }

  return (
    <div className={styles.starfield} style={{ zIndex: Z_LAYERS.base }} aria-hidden="true">
      <div className={`${styles.layer} ${styles.novaLayer}`}>
        {novas.map((spec, index) => (
          <img
            key={`nova-${index}`}
            src={novaStar}
            alt=""
            className={`${styles.sprite} ${styles.nova}`}
            style={spriteStyle(spec)}
          />
        ))}
      </div>
      <div className={`${styles.layer} ${styles.rayLayer}`}>
        {rays.map((spec, index) => (
          <img
            key={`ray-${index}`}
            src={rayStar}
            alt=""
            className={`${styles.sprite} ${styles.ray}`}
            style={spriteStyle(spec)}
          />
        ))}
      </div>
      <div className={`${styles.layer} ${styles.starburstLayer}`}>
        {starbursts.map((spec, index) => (
          <img
            key={`starburst-${index}`}
            src={starburstStar}
            alt=""
            className={`${styles.sprite} ${styles.starburst}`}
            style={spriteStyle(spec)}
          />
        ))}
      </div>
      <div className={`${styles.layer} ${styles.fourpointLayer}`}>
        {fourpointStars.map((spec, index) => (
          <img
            key={`fourpoint-${index}`}
            src={moonFourPointStar}
            alt=""
            className={`${styles.sprite} ${styles.fourpoint}`}
            style={spriteStyle(spec)}
          />
        ))}
      </div>
    </div>
  );
}