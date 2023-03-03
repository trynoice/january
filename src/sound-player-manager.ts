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

  private state = SoundPlayerManagerState.Idle;
  private fadeInSeconds = 0;
  private fadeOutSeconds = 0;
  private masterVolume = 1;

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

  public setFadeOutSeconds(seconds: number) {
    this.fadeOutSeconds = seconds;
    this.players.forEach((player) => player.setFadeOutSeconds(seconds));
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = volume;
    this.players.forEach((player) => player.setMasterVolume(volume));
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setVolume(soundId: string, volume: number) {
    this.players.get(soundId)?.setVolume(volume);
  }

  public getVolume(soundId: string): number {
    return this.players.get(soundId)?.getVolume() ?? 1;
  }

  public getPlayerState(soundId: string): SoundPlayerState {
    return this.playerStates.get(soundId) ?? SoundPlayerState.Stopped;
  }

  public getState(): SoundPlayerManagerState {
    return this.state;
  }

  public play(soundId: string) {
    const player = this.players.get(soundId) ?? this.buildPlayer(soundId);
    this.players.set(soundId, player);

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

  public stopAll() {
    this.players.forEach((player) => player.stop(true));
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

  private buildPlayer(soundId: string): SoundPlayer {
    const logger = createNamedLogger(this.logger, `SoundPlayer(${soundId})`);
    const player = new SoundPlayer(this.cdnClient, soundId, logger);
    player.setFadeInSeconds(this.fadeInSeconds);
    player.setFadeOutSeconds(this.fadeOutSeconds);
    player.setMasterVolume(this.masterVolume);
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
    let managerState = SoundPlayerManagerState.Idle;
    if (this.playerStates.size > 0) {
      managerState = SoundPlayerManagerState.Paused;
      for (const playerState of this.playerStates.values()) {
        if (
          playerState !== SoundPlayerState.Pausing &&
          playerState !== SoundPlayerState.Paused
        ) {
          managerState = SoundPlayerManagerState.Playing;
          break;
        }
      }
    }

    if (this.state === managerState) {
      return;
    }

    this.state = managerState;
    this.dispatchEvent(new Event(SoundPlayerManager.EVENT_STATE_CHANGE));
  }
}
