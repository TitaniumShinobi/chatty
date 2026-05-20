import {
  resolveScienceButtonMode,
  shouldDisableSendButton,
  shouldUseArmedDiagnosticSubmit,
} from "../components/MessageBar";

describe("MessageBar send availability", () => {
  test("disables while sending", () => {
    expect(
      shouldDisableSendButton({
        disabled: false,
        isSending: true,
        canRetry: false,
        allowEmptySubmit: true,
        inputValue: "",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(true);
  });

  test("allows retry even with empty composer", () => {
    expect(
      shouldDisableSendButton({
        disabled: false,
        isSending: false,
        canRetry: true,
        allowEmptySubmit: false,
        inputValue: "",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(false);
  });

  test("allows empty submit when continuation is enabled", () => {
    expect(
      shouldDisableSendButton({
        disabled: false,
        isSending: false,
        canRetry: false,
        allowEmptySubmit: true,
        inputValue: "",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(false);
  });

  test("requires text or attachments when empty submit is disabled", () => {
    expect(
      shouldDisableSendButton({
        disabled: false,
        isSending: false,
        canRetry: false,
        allowEmptySubmit: false,
        inputValue: "",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldDisableSendButton({
        disabled: false,
        isSending: false,
        canRetry: false,
        allowEmptySubmit: false,
        inputValue: "hello",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(false);
  });

  test("disables send when disabled is true (e.g. while transcribing)", () => {
    expect(
      shouldDisableSendButton({
        disabled: true,
        isSending: false,
        canRetry: false,
        allowEmptySubmit: false,
        inputValue: "hello",
        docFileCount: 0,
        imageFileCount: 0,
      }),
    ).toBe(true);
  });

  test("routes the science beaker to orchestration when the orchestration callback is present", () => {
    expect(
      resolveScienceButtonMode({
        showDiagnosticSend: false,
        showOrchestrationButton: true,
        isVoiceMode: false,
        hasOrchestrationClick: true,
      }),
    ).toBe("orchestration");
  });

  test("keeps the science beaker on the diagnostic path when no orchestration callback is wired", () => {
    expect(
      resolveScienceButtonMode({
        showDiagnosticSend: true,
        showOrchestrationButton: false,
        isVoiceMode: false,
        hasOrchestrationClick: false,
      }),
    ).toBe("diagnostic");
  });

  test("uses the armed probe-send path only when the next send was armed from orchestration", () => {
    expect(
      shouldUseArmedDiagnosticSubmit({
        diagnosticSendArmed: true,
        submitOptions: undefined,
      }),
    ).toBe(true);

    expect(
      shouldUseArmedDiagnosticSubmit({
        diagnosticSendArmed: true,
        submitOptions: { diagnostic: true },
      }),
    ).toBe(false);
  });
});
