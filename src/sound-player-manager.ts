import CdnClient from './cdn-client';
import { createNamedLogger, Logger } from './logger';
import { SoundPlayer, SoundPlayerState } from './sound-player';

/**
 * Represents the current playback state of the {@link SoundPlayerManager}.
 */
export enum SoundPlayerManagerState {
  /**
   * All sounds in the manager are currently in stopped state.
   */
  Idle = 'idle',

  /**
   * At least one sound in the manager is currently in buffering or playing
   * state.
   */
  Playing = 'playing',

  /**
   * All sounds in the manager are currently in paused state.
   */
  Paused = 'paused',
}

/**
 * {@link SoundPlayerManager} is responsible for managing the state and
 * lifecycle of {@link SoundPlayer} instances for each and every sound. The
 * class provides methods to set fade-in and fade-out durations, enable/disable
 * premium segments, set the audio bitrate, and adjust the volumes of all sound
 * players. It also provides methods to play, stop and set volumes of individual
 * sounds, and pause, resume and stop all sounds.
 *
 * {@link SoundPlayerManagerState} enum represents playback states of the sound
 * player manager. The manager initialises in
 * {@link SoundPlayerManagerState.Idle} state. There's no terminal state in
 * manager's lifecycle, i.e. its instances always remain functional.
 */
export class SoundPlayerManager {
  private static readonly EVENT_STATE_CHANGE = 'statechange';
  private static readonly EVENT_VOLUME_CHANGE = 'volumechange';

  private readonly eventTarget = new EventTarget();
  private readonly soundPlayers = new Map<string, SoundPlayer>();
  private readonly soundPlayerVolumes = new Map<string, number>();

  private state = SoundPlayerManagerState.Idle;
  private fadeInSeconds = 0;
  private fadeOutSeconds = 0;
  private audioBitrate = '128k';
  private isPremiumSegmentsEnabled = false;
  private volume = 1;

  private readonly cdnClient: CdnClient;
  private readonly logger?: Logger;

  public constructor(cdnClient: CdnClient, logger?: Logger) {
    this.cdnClient = cdnClient;
    this.logger = logger;
  }

  /**
   * Sets the duration for fading in sounds.
   */
  public setFadeInSeconds(seconds: number) {
    this.fadeInSeconds = seconds;
    this.soundPlayers.forEach((player) => player.setFadeInSeconds(seconds));
  }

  /**
   * Sets the duration for fading out sounds.
   */
  public setFadeOutSeconds(seconds: number) {
    this.fadeOutSeconds = seconds;
    this.soundPlayers.forEach((player) => player.setFadeOutSeconds(seconds));
  }

  /**
   * Sets the premium segments enabled flag of all future {@link SoundPlayer}
   * instances, and updates the flag of existing {@link SoundPlayer} instances.
   */
  public setPremiumSegmentsEnabled(enabled: boolean) {
    if (this.isPremiumSegmentsEnabled === enabled) {
      return;
    }

    this.isPremiumSegmentsEnabled = enabled;
    this.soundPlayers.forEach((player) =>
      player.setPremiumSegmentsEnabled(enabled)
    );
  }

  /**
   * Sets the audio bitrate for streaming sounds.
   *
   * @param bitrate acceptable values are `128k`, `192k`, `256k` and `320k`.
   */
  public setAudioBitrate(bitrate: string) {
    if (this.audioBitrate === bitrate) {
      return;
    }

    this.audioBitrate = bitrate;
    this.soundPlayers.forEach((player) => player.setAudioBitrate(bitrate));
  }

  /**
   * @returns the global multiplier used to scale individual volumes of all
   * sounds.
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Sets a global multiplier used to scale individual volumes of all sounds.
   *
   * @param volume must be >= 0 and <= 1.
   * @throws Error if the volume is not within the accepted range.
   */
  public setVolume(volume: number) {
    if (volume < 0 || volume > 1) {
      throw new Error('volume must be in range [0, 1]');
    }

    this.volume = volume;
    this.soundPlayers.forEach((player, soundId) =>
      player.setVolume(volume * (this.soundPlayerVolumes.get(soundId) ?? 1))
    );

    this.dispatchEvent(SoundPlayerManager.EVENT_VOLUME_CHANGE);
  }

  /**
   * @returns the volume of specific sound without taking the global multiplier
   * into account.
   */
  public getSoundVolume(soundId: string): number {
    return this.soundPlayerVolumes.get(soundId) ?? 1;
  }

  /**
   * Sets the volume of the specified sound.
   *
   * @param volume must be >= 0 and <= 1.
   * @throws Error if the volume is not within the accepted range.
   */
  public setSoundVolume(soundId: string, volume: number) {
    if (volume < 0 || volume > 1) {
      throw new Error('volume must be in range [0, 1]');
    }

    this.soundPlayerVolumes.set(soundId, volume);
    this.soundPlayers.get(soundId)?.setVolume(this.volume * volume);
    this.dispatchSoundEvent(soundId, SoundPlayerManager.EVENT_VOLUME_CHANGE);
  }

  /**
   * @returns the current {@link SoundPlayerManagerState} of this instance.
   */
  public getState(): SoundPlayerManagerState {
    return this.state;
  }

  /**
   * @returns the current {@link SoundPlayerState} of the specified sound.
   */
  public getSoundState(soundId: string): SoundPlayerState {
    return (
      this.soundPlayers.get(soundId)?.getState() ?? SoundPlayerState.Stopped
    );
  }

  /**
   * Plays the specified sound. It also resumes all sounds if the
   * {@link SoundPlayerManager} is in the
   * {@link SoundPlayerManagerState.Paused}.
   */
  public playSound(soundId: string) {
    const player =
      this.soundPlayers.get(soundId) ?? this.initSoundPlayer(soundId);
    if (this.state === SoundPlayerManagerState.Paused) {
      this.resume();
    } else {
      player.play();
    }
  }

  /**
   * Stops the specified sound.
   */
  public stopSound(soundId: string) {
    this.soundPlayers.get(soundId)?.stop(false);
  }

  /**
   * Resumes all sounds that are in {@link SoundPlayerState.Paused}.
   */
  public resume() {
    this.soundPlayers.forEach((player) => player.play());
  }

  /**
   * Pauses all sounds with a fade-out effect.
   */
  public pause() {
    this.soundPlayers.forEach((player) => {
      // some sounds may be stopping when the pause is requested.
      if (player.getState() !== SoundPlayerState.Stopping) {
        player.pause(false);
      }
    });
  }

  /**
   * Stops all sounds immediately or with a fade-out effect
   *
   * @param immediate whether the stop should be immediate or if the sounds
   * should perform a fade-out effect before stopping.
   */
  public stop(immediate: boolean) {
    this.soundPlayers.forEach((player) => player.stop(immediate));
  }

  /**
   * Registers a callback that is invoked every time
   * {@link SoundPlayerManagerState} changes.
   */
  public addStateListener(callback: () => void) {
    this.eventTarget.addEventListener(
      SoundPlayerManager.EVENT_STATE_CHANGE,
      callback
    );
  }

  /**
   * Removes a previous registered callback to listen for state changes.
   */
  public removeStateListener(callback: () => void) {
    this.eventTarget.removeEventListener(
      SoundPlayerManager.EVENT_STATE_CHANGE,
      callback
    );
  }

  /**
   * Registers a callback that is invoked every time volume changes.
   */
  public addVolumeListener(callback: () => void) {
    this.eventTarget.addEventListener(
      SoundPlayerManager.EVENT_VOLUME_CHANGE,
      callback
    );
  }

  /**
   * Removes a previous registered callback to listen for volume changes.
   */
  public removeVolumeListener(callback: () => void) {
    this.eventTarget.removeEventListener(
      SoundPlayerManager.EVENT_VOLUME_CHANGE,
      callback
    );
  }

  /**
   * Registers a callback that is invoked every time {@link SoundPlayerState}
   * of the specified sound changes.
   */
  public addSoundStateListener(soundId: string, callback: () => void) {
    // do not register listeners on the sound players because they are
    // disposable, and an instance may not be available at the time of
    // registration.
    this.eventTarget.addEventListener(
      `${soundId}.${SoundPlayerManager.EVENT_STATE_CHANGE}`,
      callback
    );
  }

  /**
   * Removes a previously registered callback to listen for state changes of the
   * specified sound.
   */
  public removeSoundStateListener(soundId: string, callback: () => void) {
    this.eventTarget.removeEventListener(
      `${soundId}.${SoundPlayerManager.EVENT_STATE_CHANGE}`,
      callback
    );
  }

  /**
   * Registers a callback that is invoked every time volume of the specified
   * sound changes.
   */
  public addSoundVolumeListener(soundId: string, callback: () => void) {
    this.eventTarget.addEventListener(
      `${soundId}.${SoundPlayerManager.EVENT_VOLUME_CHANGE}`,
      callback
    );
  }

  /**
   * Removes a previously registered callback to listen for volume changes of
   * the specified sound.
   */
  public removeSoundVolumeListener(soundId: string, callback: () => void) {
    this.eventTarget.removeEventListener(
      `${soundId}.${SoundPlayerManager.EVENT_STATE_CHANGE}`,
      callback
    );
  }

  private initSoundPlayer(soundId: string): SoundPlayer {
    const logger = createNamedLogger(this.logger, `SoundPlayer(${soundId})`);
    const player = new SoundPlayer(this.cdnClient, soundId, logger);
    this.soundPlayers.set(soundId, player);
    this.setSoundVolume(soundId, this.soundPlayerVolumes.get(soundId) ?? 1);
    player.setFadeInSeconds(this.fadeInSeconds);
    player.setFadeOutSeconds(this.fadeOutSeconds);
    player.setPremiumSegmentsEnabled(this.isPremiumSegmentsEnabled);
    player.setAudioBitrate(this.audioBitrate);
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
    }

    this.dispatchSoundEvent(soundId, SoundPlayerManager.EVENT_STATE_CHANGE);
    this.reconcileState();
  }

  private reconcileState() {
    let isPaused = true;
    let isIdle = true;
    for (const soundPlayer of this.soundPlayers.values()) {
      const soundState = soundPlayer.getState();
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
    this.dispatchEvent(SoundPlayerManager.EVENT_STATE_CHANGE);
  }

  private dispatchEvent(event: string) {
    this.eventTarget.dispatchEvent(new Event(event));
  }

  private dispatchSoundEvent(soundId: string, event: string) {
    this.dispatchEvent(`${soundId}.${event}`);
  }
}
