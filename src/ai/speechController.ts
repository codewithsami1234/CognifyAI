export type SpeechPhase = "idle" | "playing" | "paused" | "unavailable";

export interface SpeechSnapshot {
  phase: SpeechPhase;
  fullText: string;
  remaining: string;
  reason?: string;
}

export function idleSpeech(): SpeechSnapshot {
  return { phase: "idle", fullText: "", remaining: "" };
}

/**
 * Play, pause, resume, and stop for on-device speech.
 * The native engine only receives the remaining text. This object does not
 * call a network speech API. If the engine is unavailable, the phase stays
 * unavailable and no text is marked as spoken.
 */
export function startSpeech(text: string, engineAvailable: boolean): SpeechSnapshot {
  const trimmed = text.trim();
  if (!engineAvailable) {
    return {
      phase: "unavailable",
      fullText: trimmed,
      remaining: trimmed,
      reason: "On-device text to speech is not available. No cloud voice was used.",
    };
  }
  if (trimmed.length === 0) {
    return { phase: "idle", fullText: "", remaining: "", reason: "There is no text to read." };
  }
  return { phase: "playing", fullText: trimmed, remaining: trimmed };
}

export function pauseSpeech(snapshot: SpeechSnapshot, spokenCharacters: number): SpeechSnapshot {
  if (snapshot.phase !== "playing") {
    return snapshot;
  }
  const spoken = Math.max(0, Math.min(snapshot.remaining.length, Math.floor(spokenCharacters)));
  return {
    phase: "paused",
    fullText: snapshot.fullText,
    remaining: snapshot.remaining.slice(spoken),
  };
}

export function resumeSpeech(snapshot: SpeechSnapshot, engineAvailable: boolean): SpeechSnapshot {
  if (!engineAvailable) {
    return { ...snapshot, phase: "unavailable", reason: "On-device text to speech is not available." };
  }
  if (snapshot.phase !== "paused" || snapshot.remaining.trim().length === 0) {
    return snapshot;
  }
  return { phase: "playing", fullText: snapshot.fullText, remaining: snapshot.remaining };
}

export function stopSpeech(): SpeechSnapshot {
  return idleSpeech();
}
