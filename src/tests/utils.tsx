import React from "react";
import { render } from "@testing-library/react";
import MessageBar, { type ImageAttachment } from "../components/MessageBar";
import { TtsPlaybackProvider } from "../context/TtsPlaybackContext";

type MessageBarProps = React.ComponentProps<typeof MessageBar>;

export function renderMessageBar(
  props: Partial<MessageBarProps> = {},
) {
  const defaultProps: MessageBarProps = {
    onSubmit: () => {},
    placeholder: "Message…",
    showVoiceButton: false,
    showFileAttachment: true,
    autoFocus: false,
    disabled: false,
    initialValue: "",
    onValueChange: undefined,
    maxRows: 6,
    isSending: false,
    canRetry: false,
    onRetry: undefined,
    allowEmptySubmit: false,
    ...props,
  };

  return render(
    <TtsPlaybackProvider>
      <MessageBar {...defaultProps} />
    </TtsPlaybackProvider>,
  );
}
