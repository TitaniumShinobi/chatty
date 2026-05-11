# Dictation Component Documentation

## Overview

The `Dictation` component is a reusable React component that provides real-time audio recording, waveform visualization, and transcription functionality. It is designed to be integrated across multiple chat components in the Chatty application, including Create, Preview, and Main chats.

## Features

- **Audio Recording**: Captures audio input from the user's microphone using `navigator.mediaDevices.getUserMedia`.
- **Waveform Visualization**: Displays a real-time waveform of the audio input on a `<canvas>` element.
- **Transcription**: Includes a placeholder for transcription logic, which can be extended to integrate with a speech-to-text service.
- **Controls**: Start/Stop buttons to manage the recording process and display transcription text.

## Integration

The `Dictation` component has been integrated into the following chat components:

1. **Create Chat**
2. **Preview Chat**
3. **Main Chat**

## Usage

To use the `Dictation` component in a React file, import it as follows:

```javascript
import Dictation from "../components/Dictation";

const ExampleComponent = () => (
  <div>
    <h1>Example Usage</h1>
    <Dictation />
  </div>
);

export default ExampleComponent;
```

## Notes

- The `Dictation` component is located in the `src/components/Dictation.tsx` file.
- This documentation is also referenced in the main `README.md` file for better discoverability.

## Future Enhancements

- Implement a speech-to-text service for real-time transcription.
- Add support for additional audio formats.
- Improve accessibility features for better user experience.
