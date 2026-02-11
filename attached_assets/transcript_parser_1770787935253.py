import re
import json

# Define a function to parse the transcript file
def parse_transcript(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            lines = file.readlines()

        # Reverse the lines to make the conversation chronological
        lines = lines[::-1]

        # Initialize variables for parsing
        parsed_entries = []
        current_entry = {}
        
        # Regex patterns for parsing timestamps and speakers
        timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}')
        speaker_pattern = re.compile(r'^(\w+):')

        for line in lines:
            line = line.strip()

            # Check for a timestamp
            timestamp_match = timestamp_pattern.search(line)
            if timestamp_match:
                if current_entry:
                    parsed_entries.append(current_entry)
                    current_entry = {}

                current_entry['timestamp'] = timestamp_match.group()
                continue

            # Check for a speaker
            speaker_match = speaker_pattern.match(line)
            if speaker_match:
                current_entry['speaker'] = speaker_match.group(1)
                current_entry['content'] = line[len(speaker_match.group(0)):].strip()
                continue

            # Append content to the current entry
            if 'content' in current_entry:
                current_entry['content'] += f' {line}'

        # Append the last entry if it exists
        if current_entry:
            parsed_entries.append(current_entry)

        # Output the parsed entries as JSON
        output_file = file_path.replace('.txt', '_parsed.json')
        with open(output_file, 'w', encoding='utf-8') as json_file:
            json.dump(parsed_entries, json_file, indent=4)

        print(f"Parsed transcript saved to {output_file}")

    except FileNotFoundError:
        print(f"Error: File not found at {file_path}")
    except Exception as e:
        print(f"An error occurred: {e}")

# Example usage
# Replace 'your_transcript_file.txt' with the path to your transcript file
# parse_transcript('your_transcript_file.txt')