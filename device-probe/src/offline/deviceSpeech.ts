import { NativeModules } from 'react-native';
import {
  pauseSpeech,
  resumeSpeech,
  startSpeech,
  stopSpeech,
  type SpeechSnapshot,
} from '../../../src/ai/speechController';

interface DeviceSpeechNative {
  available: () => Promise<boolean>;
  speak: (text: string) => Promise<boolean>;
  stop: () => Promise<number>;
}

export function getDeviceSpeechModule(): DeviceSpeechNative | undefined {
  const native = NativeModules.DeviceSpeech as DeviceSpeechNative | undefined;
  if (!native || typeof native.speak !== 'function' || typeof native.stop !== 'function') {
    return undefined;
  }
  return native;
}

export async function deviceSpeechAvailable(): Promise<boolean> {
  const native = getDeviceSpeechModule();
  if (!native) {
    return false;
  }
  try {
    return (await native.available()) === true;
  } catch {
    return false;
  }
}

export async function playSpeech(text: string): Promise<SpeechSnapshot> {
  const available = await deviceSpeechAvailable();
  const snapshot = startSpeech(text, available);
  if (snapshot.phase === 'playing') {
    const native = getDeviceSpeechModule();
    const started = native ? await native.speak(snapshot.remaining) : false;
    if (!started) {
      return {
        phase: 'unavailable',
        fullText: snapshot.fullText,
        remaining: snapshot.fullText,
        reason: 'On-device speech did not start. No cloud voice was used.',
      };
    }
  }
  return snapshot;
}

export async function pauseDeviceSpeech(snapshot: SpeechSnapshot): Promise<SpeechSnapshot> {
  const native = getDeviceSpeechModule();
  const spoken = native ? Number(await native.stop()) : 0;
  return pauseSpeech(snapshot, Number.isFinite(spoken) ? spoken : 0);
}

export async function resumeDeviceSpeech(snapshot: SpeechSnapshot): Promise<SpeechSnapshot> {
  const available = await deviceSpeechAvailable();
  const next = resumeSpeech(snapshot, available);
  if (next.phase === 'playing') {
    const native = getDeviceSpeechModule();
    const started = native ? await native.speak(next.remaining) : false;
    if (!started) {
      return { ...next, phase: 'unavailable', reason: 'On-device speech did not resume. No cloud voice was used.' };
    }
  }
  return next;
}

export async function stopDeviceSpeech(): Promise<SpeechSnapshot> {
  const native = getDeviceSpeechModule();
  if (native) {
    await native.stop();
  }
  return stopSpeech();
}
