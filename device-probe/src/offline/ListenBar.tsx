import { useState } from 'react';
import type { SpeechSnapshot } from '../../../src/ai/speechController';
import { idleSpeech } from '../../../src/ai/speechController';
import { Notice, SecondaryButton } from '../ui';
import { pauseDeviceSpeech, playSpeech, resumeDeviceSpeech, stopDeviceSpeech } from './deviceSpeech';

export function ListenBar({ text }: { text: string }) {
  const [speech, setSpeech] = useState<SpeechSnapshot>(idleSpeech());
  const [note, setNote] = useState<string | undefined>(undefined);

  async function play() {
    const next = await playSpeech(text);
    setSpeech(next);
    setNote(next.reason);
  }

  return (
    <>
      {note ? <Notice>{note}</Notice> : null}
      <SecondaryButton title={speech.phase === 'playing' ? 'Playing' : 'Listen'} onPress={() => void play()} disabled={text.trim().length === 0} />
      <SecondaryButton
        title="Pause"
        onPress={() => {
          void pauseDeviceSpeech(speech).then(setSpeech);
        }}
        disabled={speech.phase !== 'playing'}
      />
      <SecondaryButton
        title="Resume"
        onPress={() => {
          void resumeDeviceSpeech(speech).then(next => {
            setSpeech(next);
            setNote(next.reason);
          });
        }}
        disabled={speech.phase !== 'paused'}
      />
      <SecondaryButton
        title="Stop"
        onPress={() => {
          void stopDeviceSpeech().then(setSpeech);
        }}
        disabled={speech.phase !== 'playing' && speech.phase !== 'paused'}
      />
    </>
  );
}
