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

  private readonly players = new Map<string, SoundPlayer>();
  private readonly playerStates = new Map<string, SoundPlayerState>();
  private readonly playerVolumes = new Map<string, number>();

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
    this.players.forEach((player) => player.setFadeInSeconds(seconds));
  }

  public getFadeInSeconds(): number {
    return this.fadeInSeconds;
  }

  public setFadeOutSeconds(seconds: number) {
    this.fadeOutSeconds = seconds;
    this.players.forEach((player) => player.setFadeOutSeconds(seconds));
  }

  public getFadeOutSeconds(): number {
    return this.fadeOutSeconds;
  }

  public setVolume(volume: number) {
    this.volume = volume;
    this.players.forEach((_, soundId) =>
      this.setPlayerVolume(soundId, this.playerVolumes.get(soundId) ?? 1)
    );
  }

  public getVolume(): number {
    return this.volume;
  }

  public setPlayerVolume(soundId: string, volume: number) {
    this.playerVolumes.set(soundId, volume);
    this.players.get(soundId)?.setVolume(this.volume * volume);
  }

  public getPlayerVolume(soundId: string): number {
    return this.playerVolumes.get(soundId) ?? 1;
  }

  public getPlayerState(soundId: string): SoundPlayerState {
    return this.playerStates.get(soundId) ?? SoundPlayerState.Stopped;
  }

  public getState(): SoundPlayerManagerState {
    return this.state;
  }

  public play(soundId: string) {
    const player = this.players.get(soundId) ?? this.initPlayer(soundId);
    if (this.state === SoundPlayerManagerState.Paused) {
      // force transition to paused state if other players are also paused. We
      // cannot call `player.pause()` instead of manually setting its state,
      // because all new instances of players initialise at paused state,
      // calling pause method won't trigger a state change event.
      this.playerStates.set(soundId, SoundPlayerState.Paused);
      this.dispatchPlayerStateChangeEvent(soundId);
    } else {
      player.play();
    }
  }

  public stop(soundId: string) {
    this.players.get(soundId)?.stop(false);
  }

  public resume() {
    this.players.forEach((player) => player.play());
  }

  public pause() {
    this.players.forEach((player) => player.pause(false));
  }

  public stopAll(immediate: boolean) {
    this.players.forEach((player) => player.stop(immediate));
  }

  public addPlayerStateChangeListener(soundId: string, listener: () => void) {
    // do not register listeners on the sound players because they are
    // disposable, and an instance may not be available at the time of
    // registration.
    this.addEventListener(this.playerStateChangeEventType(soundId), listener);
  }

  public removePlayerStateChangeListener(
    soundId: string,
    listener: () => void
  ) {
    this.removeEventListener(
      this.playerStateChangeEventType(soundId),
      listener
    );
  }

  private playerStateChangeEventType(soundId: string): string {
    return `${soundId}${SoundPlayer.EVENT_STATE_CHANGE}`;
  }

  private initPlayer(soundId: string): SoundPlayer {
    const logger = createNamedLogger(this.logger, `SoundPlayer(${soundId})`);
    const player = new SoundPlayer(this.cdnClient, soundId, logger);
    this.players.set(soundId, player);
    this.setPlayerVolume(soundId, this.playerVolumes.get(soundId) ?? 1);
    player.setFadeInSeconds(this.fadeInSeconds);
    player.setFadeOutSeconds(this.fadeOutSeconds);
    player.addEventListener(SoundPlayer.EVENT_STATE_CHANGE, () =>
      this.onPlayerStateChangeEvent(soundId)
    );

    return player;
  }

  private onPlayerStateChangeEvent(soundId: string) {
    const playerState = this.players.get(soundId)?.getState();
    if (playerState == null) {
      return;
    }

    if (playerState === SoundPlayerState.Stopped) {
      this.players.delete(soundId);
      this.playerStates.delete(soundId);
    } else {
      this.playerStates.set(soundId, playerState);
    }

    this.dispatchPlayerStateChangeEvent(soundId);
    this.reconcileState();
  }

  private dispatchPlayerStateChangeEvent(soundId: string) {
    this.dispatchEvent(new Event(this.playerStateChangeEventType(soundId)));
  }

  private reconcileState() {
    let isPaused = true;
    let isIdle = true;
    for (const playerState of this.playerStates.values()) {
      if (
        playerState !== SoundPlayerState.Pausing &&
        playerState !== SoundPlayerState.Paused
      ) {
        isPaused = false;
      }

      if (
        playerState !== SoundPlayerState.Stopping &&
        playerState !== SoundPlayerState.Stopped
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
