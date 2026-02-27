import { shouldDisableSendButton } from "../components/MessageBar";

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
});
