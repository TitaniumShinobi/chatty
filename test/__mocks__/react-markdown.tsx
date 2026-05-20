import React from "react";

// Jest mock for react-markdown: render children as a div (no markdown parsing in tests)
const ReactMarkdown = ({
  children,
  components,
  remarkPlugins,
  rehypePlugins,
  ...props
}: any) =>
  React.createElement("div", { "data-testid": "react-markdown", ...props }, children);

export default ReactMarkdown;
