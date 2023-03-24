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
    return () => soundPlayerManager?.stop(true);
  }, [soundPlayerManager]);

  return createElement(SoundPlayerManagerContext.Provider, {
    value: soundPlayerManager,
    children: props.children,
  });
}

export type AudioBitrate = '128k' | '192k' | '256k' | '320k';

export interface SoundPlayerManagerConfigController {
  fadeInSeconds: number;
  setFadeInSeconds: (seconds: number) => void;
  fadeOutSeconds: number;
  setFadeOutSeconds: (seconds: number) => void;
  audioBitrate: AudioBitrate;
  setAudioBitrate: (bitrate: AudioBitrate) => void;
}

export function useSoundPlayerManagerConfig(): SoundPlayerManagerConfigController {
  const manager = useContext(SoundPlayerManagerContext);
  const [fadeInSeconds, setFadeInSeconds] = useState(0);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(0);
  const [audioBitrate, setAudioBitrate] = useState<AudioBitrate>('128k');

  useEffect(
    () => manager?.setFadeInSeconds(fadeInSeconds),
    [manager, fadeInSeconds]
  );

  useEffect(
    () => manager?.setFadeOutSeconds(fadeOutSeconds),
    [manager, fadeOutSeconds]
  );

  useEffect(() => manager?.setAudioBitrate(audioBitrate), [audioBitrate]);

  return {
    fadeInSeconds,
    setFadeInSeconds,
    fadeOutSeconds,
    setFadeOutSeconds,
    audioBitrate,
    setAudioBitrate,
  };
}

export interface SoundPlayerManagerController {
  readonly state: SoundPlayerManagerState;
  readonly volume: number;
  readonly setVolume: (volume: number) => void;
  readonly resume: () => void;
  readonly pause: () => void;
  readonly stop: () => void;
}

export function useSoundPlayerManager(): SoundPlayerManagerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [state, setState] = useState(
    manager?.getState() ?? SoundPlayerManagerState.Idle
  );

  const [volume, setVolume] = useState(manager?.getVolume() ?? 1);

  useEffect(() => {
    const stateListener = () =>
      setState(manager?.getState() ?? SoundPlayerManagerState.Idle);
    const volumeListener = () => setVolume(manager?.getVolume() ?? 1);

    manager?.addStateListener(stateListener);
    manager?.addVolumeListener(volumeListener);

    return () => {
      manager?.removeStateListener(stateListener);
      manager?.removeVolumeListener(volumeListener);
    };
  }, [manager]);

  useEffect(() => manager?.setVolume(volume), [manager, volume]);

  return {
    state: state,
    volume: volume,
    setVolume: setVolume,
    resume: () => manager?.resume(),
    pause: () => manager?.pause(),
    stop: () => manager?.stop(false),
  };
}

export interface SoundPlayerController {
  readonly state: SoundPlayerState;
  readonly volume: number;
  readonly setVolume: (volume: number) => void;
  readonly play: () => void;
  readonly stop: () => void;
}

export function useSoundPlayer(soundId: string): SoundPlayerController {
  const manager = useContext(SoundPlayerManagerContext);
  const [state, setState] = useState(
    manager?.getSoundState(soundId) ?? SoundPlayerState.Stopped
  );

  const [volume, setVolume] = useState(manager?.getSoundVolume(soundId) ?? 1);

  useEffect(() => {
    const stateListener = () =>
      setState(manager?.getSoundState(soundId) ?? SoundPlayerState.Stopped);
    const volumeListener = () =>
      setVolume(manager?.getSoundVolume(soundId) ?? 1);

    manager?.addSoundStateListener(soundId, stateListener);
    manager?.addSoundVolumeListener(soundId, volumeListener);

    return () => {
      manager?.removeSoundStateListener(soundId, stateListener);
      manager?.removeSoundVolumeListener(soundId, volumeListener);
    };
  }, [manager]);

  useEffect(() => manager?.setSoundVolume(soundId, volume), [manager, volume]);

  return {
    state: state,
    volume: volume,
    setVolume: setVolume,
    play: () => manager?.playSound(soundId),
    stop: () => manager?.stopSound(soundId),
  };
}
