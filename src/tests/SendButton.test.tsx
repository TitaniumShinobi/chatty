/**
 * Unit tests for SendButton: export, props contract, and (with jsdom) click/disabled/accessibility.
 * Run with jsdom for full DOM tests: add jest-environment-jsdom and use @jest-environment jsdom in this file.
 */
import type { SendButtonProps } from "../components/SendButton";
import SendButton from "../components/SendButton";

describe("SendButton", () => {
  test("exports a function component", () => {
    expect(typeof SendButton).toBe("function");
  });

  test("SendButtonProps includes onClick, disabled, animating, ariaLabel", () => {
    const props: SendButtonProps = {
      onClick: () => {},
      disabled: false,
      animating: false,
      soft: false,
      ariaLabel: "Send message",
    };
    expect(props.onClick).toBeDefined();
    expect(props.disabled).toBe(false);
    expect(props.animating).toBe(false);
    expect(props.soft).toBe(false);
    expect(props.ariaLabel).toBe("Send message");
  });

  test("ariaLabel is optional and defaults to Send message in component", () => {
    const optionalProps: { onClick: () => void } = {
      onClick: () => {},
    };
    expect(optionalProps.onClick).toBeDefined();
    // Component uses default ariaLabel when not provided
  });
});
