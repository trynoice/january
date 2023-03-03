import {
  createContext,
  createElement,
  ReactElement,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import CdnClient from './cdn-client';
import { Logger } from './logger';
import { SoundPlayerState } from './sound-player';
import {
  SoundPlayerManager,
  SoundPlayerManagerState,
} from './sound-player-manager';

const SoundPlayerManagerContext = createContext<SoundPlayerManager | undefined>(
  undefined
);

export interface SoundPlayerManagerProviderProps {
  readonly cdnClient: CdnClient;
  readonly logger?: Logger;
  readonly children?: ReactNode;
}

export function SoundPlayerManagerProvider(
  props: SoundPlayerManagerProviderProps
): ReactElement {
  const [soundPlayerManager] = useState(
    () => new SoundPlayerManager(props.cdnClient, props.logger)
  );

  useEffect(() => {
    return () => soundPlayerManager?.stopAll(true);
  }, [soundPlayerManager]);

  return createElement(SoundPlayerManagerContext.Provider, {
    value: soundPlayerManager,
    children: props.children,
  });
}

export interface SoundPlayerManagerController {
  readonly state: SoundPlayerManagerState;
  readonly volume: number;
  readonly setVolume: (volume: number) => void;
  readonly togglePlayback: () => void;
  readonly stop: () => void;
}

export function useSoundPlayerManager(): SoundPlayerManagerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [state, setState] = useState(SoundPlayerManagerState.Idle);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    // reconcile volume if manager instance changes.
    setVolume(manager?.getMasterVolume() ?? 1);

    const listener = () =>
      setState(manager?.getState() ?? SoundPlayerManagerState.Idle);

    listener();
    manager?.addEventListener(SoundPlayerManager.EVENT_STATE_CHANGE, listener);
    return () =>
      manager?.removeEventListener(
        SoundPlayerManager.EVENT_STATE_CHANGE,
        listener
      );
  }, [manager]);

  useEffect(() => manager?.setMasterVolume(volume), [manager, volume]);

  return {
    state: state,
    volume: volume,
    setVolume: setVolume,
    togglePlayback: () =>
      state === SoundPlayerManagerState.Playing
        ? manager?.pause()
        : manager?.resume(),
    stop: () => manager?.stopAll(false),
  };
}

export interface SoundPlayerController {
  readonly state: SoundPlayerState;
  readonly volume: number;
  readonly setVolume: (volume: number) => void;
  readonly togglePlayback: () => void;
}

export function useSoundPlayer(soundId: string): SoundPlayerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [playerState, setPlayerState] = useState(SoundPlayerState.Stopped);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const listener = () => {
      setPlayerState(
        manager?.getPlayerState(soundId) ?? SoundPlayerState.Stopped
      );

      // reconcile volume; it might change on transitioning to stopped state.
      const currentVolume = manager?.getVolume(soundId) ?? 1;
      if (volume !== currentVolume) {
        setVolume(currentVolume);
      }
    };

    listener();
    manager?.addPlayerStateChangeListener(soundId, listener);
    return () => manager?.removePlayerStateChangeListener(soundId, listener);
  }, [manager]);

  useEffect(() => manager?.setVolume(soundId, volume), [manager, volume]);

  return {
    state: playerState,
    volume: volume,
    setVolume: setVolume,
    togglePlayback: () =>
      playerState === SoundPlayerState.Buffering ||
      playerState === SoundPlayerState.Playing
        ? manager?.stop(soundId)
        : manager?.play(soundId),
  };
}
