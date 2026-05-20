import React from "react";

// Jest mock for react-syntax-highlighter: render code in a pre tag
export const Prism = ({ children, ...props }: any) =>
  React.createElement("pre", { "data-testid": "syntax-highlighter", ...props }, children);

export default { Prism };
