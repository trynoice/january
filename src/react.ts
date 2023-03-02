import { createContext, useContext, useEffect, useState } from 'react';
import { SoundPlayerState } from './sound-player';
import {
  SoundPlayerManager,
  SoundPlayerManagerState,
} from './sound-player-manager';

const SoundPlayerManagerContext = createContext<SoundPlayerManager | undefined>(
  undefined
);

export const SoundPlayerManagerProvider = SoundPlayerManagerContext.Provider;

export interface SoundPlayerManagerController {
  readonly state: SoundPlayerManagerState;
  readonly resume: () => void;
  readonly pause: () => void;
  readonly setVolume: (volume: number) => void;
}

export function useSoundPlayerManager(): SoundPlayerManagerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [state, setState] = useState(SoundPlayerManagerState.Idle);
  useSoundPlayerManagerStateChangeEventListener(() =>
    setState(manager?.getState() ?? SoundPlayerManagerState.Idle)
  );

  return {
    state: state,
    resume: () => manager?.resume(),
    pause: () => manager?.pause(),
    setVolume: (volume) => manager?.setMasterVolume(volume),
  };
}

export interface SoundPlayerController {
  readonly state: SoundPlayerState;
  readonly play: () => void;
  readonly pause: () => void;
  readonly setVolume: (volume: number) => void;
}

export function useSoundPlayer(soundId: string): SoundPlayerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [playerState, setPlayerState] = useState(SoundPlayerState.Stopped);
  useSoundPlayerManagerStateChangeEventListener(() =>
    setPlayerState(manager?.getPlayerState(soundId) ?? SoundPlayerState.Stopped)
  );

  return {
    state: playerState,
    setVolume: (volume) => manager?.setVolume(soundId, volume),
    play: () => manager?.play(soundId),
    pause: () => manager?.stop(soundId),
  };
}

function useSoundPlayerManagerStateChangeEventListener(listener: () => void) {
  const manager = useContext(SoundPlayerManagerContext);
  useEffect(() => {
    manager?.addEventListener(SoundPlayerManager.EVENT_STATE_CHANGE, listener);
    return () => {
      manager?.removeEventListener(
        SoundPlayerManager.EVENT_STATE_CHANGE,
        listener
      );
    };
  }, [manager]);
}
