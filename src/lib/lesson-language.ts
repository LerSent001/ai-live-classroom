// Shared by text inputs, the command boundary, and planner suggestions.
export function isValidTopic(value: string): boolean {
  const topic = value.trim();
  return topic.length >= 2 && topic.length <= 500;
}

// WebKit may finish composition before keydown; 229 still identifies that IME key.
export function isLessonSubmitKey(event: {
  key: string;
  shiftKey: boolean;
  nativeEvent: { isComposing: boolean; keyCode: number };
}): boolean {
  return event.key === "Enter" && !event.shiftKey &&
    !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229;
}
