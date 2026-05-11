/**
 * @jest-environment jsdom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderMessageBar } from "./utils";

const actWarning = /not wrapped in act|ReactDOMTestUtils\.act/i;
const consoleError = console.error;

beforeAll(() => {
  console.error = (...args: any[]) => {
    const combined = args.map(String).join(" ");
    if (actWarning.test(combined)) return;
    if (args.some((entry) => typeof entry === "string" && actWarning.test(entry))) return;
    // @ts-ignore
    return consoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = consoleError;
});

describe("MessageBar layout behavior", () => {
  it("stays collapsed when the empty composer is only focused", () => {
    renderMessageBar();

    const textarea = screen.getByPlaceholderText("Message…") as HTMLTextAreaElement;
    const pill = screen.getByTestId("message-pill");

    expect(pill).toHaveStyle({ height: "44px", paddingTop: "0px", paddingBottom: "0px" });

    fireEvent.focus(textarea);

    expect(pill).toHaveStyle({ height: "44px", paddingTop: "0px", paddingBottom: "0px" });
  });

  it("stays collapsed for a normal single-line message", () => {
    renderMessageBar();

    const textarea = screen.getByPlaceholderText("Message…") as HTMLTextAreaElement;
    const pill = screen.getByTestId("message-pill");

    fireEvent.change(textarea, { target: { value: "A short message" } });

    expect(pill).toHaveStyle({ height: "44px", paddingTop: "0px", paddingBottom: "0px" });
  });

  it("expands after a real soft-wrap into a second visual line", async () => {
    renderMessageBar();

    const textarea = screen.getByPlaceholderText("Message…") as HTMLTextAreaElement;
    const pill = screen.getByTestId("message-pill");
    let wrapped = false;

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get() {
        if (textarea.style.height === "24px") {
          return 24;
        }
        return wrapped ? 48 : 24;
      },
    });

    fireEvent.change(textarea, { target: { value: "A short message" } });
    expect(pill).toHaveStyle({ height: "44px", paddingTop: "0px", paddingBottom: "0px" });

    wrapped = true;
    fireEvent.change(textarea, {
      target: { value: "This line is long enough to wrap into a real second row in the composer." },
    });

    await waitFor(() => {
      expect(pill).toHaveStyle({ paddingTop: "8px", paddingBottom: "8px" });
    });
  });

  it("expands only after the input becomes multiline", async () => {
    renderMessageBar();

    const textarea = screen.getByPlaceholderText("Message…");
    const pill = screen.getByTestId("message-pill");

    fireEvent.change(textarea, { target: { value: "First line\nSecond line" } });

    await waitFor(() => {
      expect(pill).toHaveStyle({ paddingTop: "8px", paddingBottom: "8px" });
    });
  });

  it("expands when attachments are present", async () => {
    const { container } = renderMessageBar();

    const pill = screen.getByTestId("message-pill");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["note"], "note.txt", { type: "text/plain" })],
      },
    });

    await waitFor(() => {
      expect(pill).toHaveStyle({ paddingTop: "8px", paddingBottom: "8px" });
    });
  });
});
