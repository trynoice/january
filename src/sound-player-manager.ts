import CdnClient from './cdn-client';
import { createNamedLogger, Logger } from './logger';
import { SoundPlayer, SoundPlayerState } from './sound-player';

export enum SoundPlayerManagerState {
  Idle = 'idle',
  Playing = 'playing',
  Paused = 'paused',
}

export class SoundPlayerManager extends EventTarget {
  public static readonly EVENT_STATE_CHANGE = 'statechange';

  private readonly soundPlayers = new Map<string, SoundPlayer>();
  private readonly soundPlayerStates = new Map<string, SoundPlayerState>();
  private readonly soundPlayerVolumes = new Map<string, number>();

  private state = SoundPlayerManagerState.Idle;
  private fadeInSeconds = 0;
  private fadeOutSeconds = 0;
  private volume = 1;

  private readonly cdnClient: CdnClient;
  private readonly logger?: Logger;

  public constructor(cdnClient: CdnClient, logger?: Logger) {
    super();
    this.cdnClient = cdnClient;
    this.logger = logger;
  }

  public setFadeInSeconds(seconds: number) {
    this.fadeInSeconds = seconds;
    this.soundPlayers.forEach((player) => player.setFadeInSeconds(seconds));
  }

  public getFadeInSeconds(): number {
    return this.fadeInSeconds;
  }

  public setFadeOutSeconds(seconds: number) {
    this.fadeOutSeconds = seconds;
    this.soundPlayers.forEach((player) => player.setFadeOutSeconds(seconds));
  }

  public getFadeOutSeconds(): number {
    return this.fadeOutSeconds;
  }

  public setVolume(volume: number) {
    this.volume = volume;
    this.soundPlayers.forEach((player, soundId) =>
      player.setVolume(volume * (this.soundPlayerVolumes.get(soundId) ?? 1))
    );
  }

  public getVolume(): number {
    return this.volume;
  }

  public setSoundVolume(soundId: string, volume: number) {
    this.soundPlayerVolumes.set(soundId, volume);
    this.soundPlayers.get(soundId)?.setVolume(this.volume * volume);
  }

  public getSoundVolume(soundId: string): number {
    return this.soundPlayerVolumes.get(soundId) ?? 1;
  }

  public getSoundState(soundId: string): SoundPlayerState {
    return this.soundPlayerStates.get(soundId) ?? SoundPlayerState.Stopped;
  }

  public getState(): SoundPlayerManagerState {
    return this.state;
  }

  public playSound(soundId: string) {
    const player =
      this.soundPlayers.get(soundId) ?? this.initSoundPlayer(soundId);
    if (this.state === SoundPlayerManagerState.Paused) {
      // force transition to paused state if other players are also paused. We
      // cannot call `player.pause()` instead of manually setting its state,
      // because all new instances of players initialise at paused state,
      // calling pause method won't trigger a state change event.
      this.soundPlayerStates.set(soundId, SoundPlayerState.Paused);
      this.dispatchSoundStateChangeEvent(soundId);
    } else {
      player.play();
    }
  }

  public stopSound(soundId: string) {
    this.soundPlayers.get(soundId)?.stop(false);
  }

  public resume() {
    this.soundPlayers.forEach((player) => player.play());
  }

  public pause() {
    this.soundPlayers.forEach((player) => {
      // some sounds may be stopping when the pause is requested.
      if (player.getState() !== SoundPlayerState.Stopping) {
        player.pause(false);
      }
    });
  }

  public stop(immediate: boolean) {
    this.soundPlayers.forEach((player) => player.stop(immediate));
  }

  public addSoundStateChangeListener(soundId: string, listener: () => void) {
    // do not register listeners on the sound players because they are
    // disposable, and an instance may not be available at the time of
    // registration.
    this.addEventListener(this.soundStateChangeEventType(soundId), listener);
  }

  public removeSoundStateChangeListener(soundId: string, listener: () => void) {
    this.removeEventListener(this.soundStateChangeEventType(soundId), listener);
  }

  private soundStateChangeEventType(soundId: string): string {
    return `${soundId}${SoundPlayer.EVENT_STATE_CHANGE}`;
  }

  private initSoundPlayer(soundId: string): SoundPlayer {
    const logger = createNamedLogger(this.logger, `SoundPlayer(${soundId})`);
    const player = new SoundPlayer(this.cdnClient, soundId, logger);
    this.soundPlayers.set(soundId, player);
    this.setSoundVolume(soundId, this.soundPlayerVolumes.get(soundId) ?? 1);
    player.setFadeInSeconds(this.fadeInSeconds);
    player.setFadeOutSeconds(this.fadeOutSeconds);
    player.addEventListener(SoundPlayer.EVENT_STATE_CHANGE, () =>
      this.onSoundPlayerStateChangeEvent(soundId)
    );

    return player;
  }

  private onSoundPlayerStateChangeEvent(soundId: string) {
    const playerState = this.soundPlayers.get(soundId)?.getState();
    if (playerState == null) {
      return;
    }

    if (playerState === SoundPlayerState.Stopped) {
      this.soundPlayers.delete(soundId);
      this.soundPlayerStates.delete(soundId);
    } else {
      this.soundPlayerStates.set(soundId, playerState);
    }

    this.dispatchSoundStateChangeEvent(soundId);
    this.reconcileState();
  }

  private dispatchSoundStateChangeEvent(soundId: string) {
    this.dispatchEvent(new Event(this.soundStateChangeEventType(soundId)));
  }

  private reconcileState() {
    let isPaused = true;
    let isIdle = true;
    for (const soundState of this.soundPlayerStates.values()) {
      if (
        soundState !== SoundPlayerState.Stopping && // some sounds may be stopping
        soundState !== SoundPlayerState.Pausing &&
        soundState !== SoundPlayerState.Paused
      ) {
        isPaused = false;
      }

      if (
        soundState !== SoundPlayerState.Stopping &&
        soundState !== SoundPlayerState.Stopped
      ) {
        isIdle = false;
      }
    }

    const managerState = isIdle
      ? SoundPlayerManagerState.Idle
      : isPaused
      ? SoundPlayerManagerState.Paused
      : SoundPlayerManagerState.Playing;

    if (this.state === managerState) {
      return;
    }

    this.state = managerState;
    this.dispatchEvent(new Event(SoundPlayerManager.EVENT_STATE_CHANGE));
  }
}
