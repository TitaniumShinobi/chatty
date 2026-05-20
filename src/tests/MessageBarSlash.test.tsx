/**
 * @jest-environment jsdom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderMessageBar } from "./utils";

// Filter only the noisy act warning; surface everything else
const actWarning = /not wrapped in act|ReactDOMTestUtils\.act/i;
const consoleError = console.error;
const consoleLog = console.log;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const combined = args.map(String).join(" ");
    if (actWarning.test(combined)) return;
    if (args.some((a) => typeof a === "string" && actWarning.test(a))) return;
    // @ts-ignore
    return consoleError.apply(console, args);
  };
  console.log = (...args: any[]) => {
    if (typeof args[0] === "string" && args[0].includes("[MessageBar]")) return;
    // @ts-ignore
    return consoleLog.apply(console, args);
  };
});

afterAll(() => {
  console.error = consoleError;
  console.log = consoleLog;
});

describe("MessageBar slash-command handling", () => {
  test("submits /creator so Layout can handle it", async () => {
    const onSubmit = jest.fn();
    renderMessageBar({ onSubmit, initialValue: "/creator" });

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("/creator", undefined, undefined),
    );
  });

  test("allows normal text to submit", async () => {
    const onSubmit = jest.fn();
    renderMessageBar({ onSubmit, initialValue: "hello world" });

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("hello world", undefined, undefined),
    );
  });

  test("science beaker opens orchestration controls when that callback is present", async () => {
    const onSubmit = jest.fn();
    const onOrchestrationClick = jest.fn();
    renderMessageBar({
      onSubmit,
      showOrchestrationButton: true,
      onOrchestrationClick,
      initialValue: "check Nova route",
    });

    fireEvent.click(screen.getByRole("button", { name: /show orchestration log/i }));

    expect(onOrchestrationClick).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("armed probe send uses the diagnostic submit path on the next send", async () => {
    const onSubmit = jest.fn();
    renderMessageBar({
      onSubmit,
      showOrchestrationButton: true,
      diagnosticSendArmed: true,
      initialValue: "check Nova route",
    });

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("check Nova route", undefined, undefined, {
        diagnostic: true,
        diagnosticArmed: true,
      }),
    );
  });

  test("armed probe send does not swallow slash commands", async () => {
    const onSubmit = jest.fn();
    renderMessageBar({
      onSubmit,
      showOrchestrationButton: true,
      diagnosticSendArmed: true,
      initialValue: "/pickup",
    });

    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("/pickup", undefined, undefined),
    );
  });
});
