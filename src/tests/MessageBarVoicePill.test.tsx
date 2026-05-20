/**
 * @jest-environment jsdom
 */
import { act, screen, within } from "@testing-library/react";

import { renderMessageBar } from "./utils";
import { __resetMockVoiceController, __setMockVoiceControllerState } from "../../test/__mocks__/useVoiceController";

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

describe("MessageBar voice pill icons", () => {
  beforeEach(() => {
    __resetMockVoiceController();
  });

  afterEach(() => {
    __resetMockVoiceController();
  });

  it("renders ripple above microphone in the vertical pill", async () => {
    renderMessageBar({ initialValue: "Start a build" });

    const sendButton = screen.getByRole("button", { name: /send message/i });
    await act(async () => {
      sendButton.focus();
    });

    const menu = await screen.findByRole("menu", { name: /voice actions/i });
    const actions = within(menu).getAllByRole("menuitem");

    expect(actions).toHaveLength(2);
    expect(actions[0].querySelector('svg[data-icon="ripple"]')).toBeTruthy();
    expect(actions[1].querySelector('svg[data-icon="mic"]')).toBeTruthy();
  });

  it("keeps the base icons while recording and swaps only to spinner while transcribing", async () => {
    renderMessageBar({ initialValue: "Start a build" });

    const sendButton = screen.getByRole("button", { name: /send message/i });
    await act(async () => {
      sendButton.focus();
    });

    const menu = await screen.findByRole("menu", { name: /voice actions/i });
    const actions = within(menu).getAllByRole("menuitem");
    const [voiceAction, dictateAction] = actions;

    await act(async () => {
      __setMockVoiceControllerState({
        voiceState: "recording",
        isVoiceMode: true,
        isRecording: true,
        isTranscribing: false,
      });
    });
    expect(voiceAction.querySelector('svg[data-icon="ripple"]')).toBeTruthy();

    await act(async () => {
      __setMockVoiceControllerState({
        voiceState: "recording",
        isVoiceMode: false,
        isRecording: true,
        isTranscribing: false,
      });
    });
    expect(dictateAction.querySelector('svg[data-icon="mic"]')).toBeTruthy();

    await act(async () => {
      __setMockVoiceControllerState({
        voiceState: "transcribing",
        isVoiceMode: true,
        isRecording: false,
        isTranscribing: true,
      });
    });
    expect(voiceAction.querySelector('svg[data-icon="ripple"]')).toBeNull();
    expect(voiceAction.querySelector('svg.animate-spin')).toBeTruthy();
  });
});
