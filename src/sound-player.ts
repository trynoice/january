import CdnClient from './cdn-client';
import { createNamedLogger, Logger } from './logger';
import { MediaPlayer, MediaPlayerState } from './media-player';

interface LibraryManifest {
  segmentsBasePath: string;
  sounds: Sound[];
}

interface Sound {
  id: string;
  maxSilence: number;
  segments: {
    name: string;
    isFree: boolean;
  }[];
}

interface Segment {
  name: string;
  basePath: string;
  isFree: boolean;
  isBridge: boolean;
  from?: string;
  to?: string;
}

export const enum SoundPlayerState {
  Idle = 'idle',
  Buffering = 'buffering',
  Playing = 'playing',
  Pausing = 'pausing',
  Paused = 'paused',
  Stopping = 'stopping',
  Stopped = 'stopped',
}

export class SoundPlayer extends EventTarget {
  public static readonly EVENT_STATE_CHANGE = 'statechange';

  private static readonly MIN_RETRY_DELAY_MILLIS = 1 * 1000;
  private static readonly MAX_RETRY_DELAY_MILLIS = 30 * 1000;

  private readonly segments: Segment[] = [];

  private maxSilenceSeconds = 0;
  private fadeInSeconds = 0;
  private fadeOutSeconds = 0;
  private isPremiumSegmentsEnabled = false;
  private audioBitrate = '128k';
  private masterVolume = 1;
  private volume = 1;
  private state = SoundPlayerState.Idle;
  private isLoadingMetadata = false;
  private metadataRetryDelayMillis = SoundPlayer.MIN_RETRY_DELAY_MILLIS;
  private shouldFadeIn = false;

  private readonly cdnClient: CdnClient;
  private readonly logger?: Logger;
  private readonly mediaPlayer: MediaPlayer;

  private metadataLoadTimeout?: ReturnType<typeof setTimeout>;
  private queueNextSegmentTimeout?: ReturnType<typeof setTimeout>;
  private currentSegment?: Segment;

  public constructor(cdnClient: CdnClient, soundId: string, logger?: Logger) {
    super();
    this.cdnClient = cdnClient;
    this.logger = createNamedLogger(logger, `SoundPlayer(${soundId})`);
    this.mediaPlayer = new MediaPlayer(
      15,
      cdnClient,
      createNamedLogger(this.logger, 'MediaPayer')
    );

    this.mediaPlayer.addEventListener(MediaPlayer.EVENT_ITEM_TRANSITION, () =>
      this.onMediaPlayerItemTransition()
    );

    this.mediaPlayer.addEventListener(MediaPlayer.EVENT_STATE_CHANGE, () =>
      this.onMediaPlayerStateChange()
    );

    this.metadataLoadTimeout = setTimeout(() => this.loadMetadata(soundId), 0);
  }

  private onMediaPlayerItemTransition() {
    if (this.state === SoundPlayerState.Stopped) {
      return;
    }

    if (
      this.maxSilenceSeconds > 0 &&
      this.mediaPlayer.getMediaItemCount() === 0
    ) {
      const d = 30 + Math.floor(Math.random() * (this.maxSilenceSeconds - 29));
      this.logger?.debug(`scheduling next segment after ${d}s`);
      this.queueNextSegmentTimeout = setTimeout(
        () => this.queueNextSegment(),
        d * 1000
      );
    }

    if (
      this.maxSilenceSeconds === 0 &&
      this.mediaPlayer.getMediaItemCount() < 2
    ) {
      this.queueNextSegment();
    }
  }

  private onMediaPlayerStateChange() {
    this.logger?.debug(`media player state: ${this.mediaPlayer.getState()}`);

    if (
      this.shouldFadeIn &&
      this.mediaPlayer.getState() === MediaPlayerState.Playing
    ) {
      this.mediaPlayer.fadeTo(this.getScaledVolume(), this.fadeInSeconds);
      this.shouldFadeIn = false;
    }

    switch (this.mediaPlayer.getState()) {
      case MediaPlayerState.Buffering:
        this.setState(SoundPlayerState.Buffering);
        break;
      case MediaPlayerState.Paused:
        this.setState(SoundPlayerState.Paused);
        break;
      case MediaPlayerState.Stopped:
        this.setState(SoundPlayerState.Stopped);
        break;
      default:
        // do not overwrite pausing and stopping state.
        if (
          this.state !== SoundPlayerState.Pausing &&
          this.state !== SoundPlayerState.Stopping
        ) {
          this.setState(SoundPlayerState.Playing);
        }
        break;
    }
  }

  private queueNextSegment() {
    const validSegments = this.isPremiumSegmentsEnabled
      ? this.segments
      : this.segments.filter((s) => s.isFree);

    let next: Segment | undefined = undefined;
    if (this.currentSegment?.isBridge) {
      // contiguous sound is playing a bridge segment, find its destination!
      next = validSegments.find((s) => s.name === this.currentSegment?.to);
    } else if (this.currentSegment != null && this.maxSilenceSeconds === 0) {
      // contiguous sound is playing a regular segment, find a bridge!
      const validBridges = validSegments.filter(
        (s) => s.from === this.currentSegment?.name
      );

      next = validBridges[Math.floor(Math.random() * validBridges.length)];
    } else {
      // either no segment had been played yet or this is not a contiguous
      // sound.
      next = validSegments[Math.floor(Math.random() * validSegments.length)];
    }

    if (next == null) {
      throw new Error("couldn't find a valid segment to queue next");
    }

    this.currentSegment = next;
    this.mediaPlayer.addToPlaylist(
      `library/${next.basePath}/${this.audioBitrate}/index.jan`
    );

    this.logger?.info(`queued segment: ${next.name}`);
  }

  public getState(): SoundPlayerState {
    return this.state;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setFadeInSeconds(seconds: number) {
    this.fadeInSeconds = seconds;
  }

  public setFadeOutSeconds(seconds: number) {
    this.fadeOutSeconds = seconds;
  }

  public setPremiumSegmentsEnabled(enabled: boolean) {
    this.isPremiumSegmentsEnabled = enabled;
    this.mediaPlayer.clearPlaylist(); // media player will trigger item transition event.
  }

  public setAudioBitrate(bitrate: string) {
    if (bitrate === this.audioBitrate) {
      return;
    }

    this.audioBitrate = bitrate;
    this.mediaPlayer.clearPlaylist(); // media player will trigger item transition event.
  }

  public setMasterVolume(volume: number) {
    this.setVolumeInternal(volume, this.volume);
  }

  public setVolume(volume: number) {
    this.setVolumeInternal(this.masterVolume, volume);
  }

  private setVolumeInternal(masterVolume: number, volume: number) {
    this.masterVolume = masterVolume;
    this.volume = volume;
    this.mediaPlayer.fadeTo(this.getScaledVolume(), 1.5);
  }

  private getScaledVolume(): number {
    return Math.pow(this.masterVolume * this.volume, 2);
  }

  public play() {
    if (this.state === SoundPlayerState.Stopped) {
      throw new Error('cannot re-use a stopped sound player');
    }

    if (this.mediaPlayer.getState() === MediaPlayerState.Playing) {
      this.setState(SoundPlayerState.Playing);
      this.mediaPlayer.fadeTo(this.getScaledVolume(), this.fadeInSeconds);
      return;
    }

    if (this.isLoadingMetadata) {
      // set our state to buffering so that we can auto start when the metadata
      // finishes loading.
      this.setState(SoundPlayerState.Buffering);
    } else {
      if (this.mediaPlayer.getMediaItemCount() === 0) {
        this.queueNextSegment();
      }

      this.shouldFadeIn = true;
      this.mediaPlayer.setVolume(0);
      this.mediaPlayer.play();
    }
  }

  public pause(immediate: boolean) {
    clearTimeout(this.queueNextSegmentTimeout);
    if (immediate || this.mediaPlayer.getState() !== MediaPlayerState.Playing) {
      this.mediaPlayer.pause();
      return;
    }

    this.setState(SoundPlayerState.Pausing);
    this.mediaPlayer.fadeTo(0, this.fadeOutSeconds, () =>
      this.mediaPlayer.pause()
    );
  }

  public stop(immediate: boolean) {
    clearTimeout(this.metadataLoadTimeout);
    clearTimeout(this.queueNextSegmentTimeout);
    if (immediate || this.mediaPlayer.getState() !== MediaPlayerState.Playing) {
      this.mediaPlayer.stop();
      return;
    }

    this.setState(SoundPlayerState.Stopping);
    this.mediaPlayer.fadeTo(0, this.fadeOutSeconds, () =>
      this.mediaPlayer.stop()
    );
  }

  private async loadMetadata(soundId: string) {
    this.isLoadingMetadata = true;
    this.logger?.debug('start loading sound metadata');

    try {
      const response = await this.cdnClient.getResource(
        'library/library-manifest.json'
      );

      if (!response.ok) {
        throw new Error(
          `http error: ${response.status} ${response.statusText}`
        );
      }

      const manifest: LibraryManifest = await response.json();
      const sound = manifest.sounds.find((s) => s.id === soundId);
      if (sound == null) {
        throw new Error('sound not found');
      }

      this.maxSilenceSeconds = sound.maxSilence;
      this.segments.length = 0;
      const segmentsBasePath = `${manifest.segmentsBasePath}/${sound.id}`;
      sound.segments.forEach((segment) => {
        this.segments.push({
          name: segment.name,
          basePath: `${segmentsBasePath}/${segment.name}`,
          isFree: segment.isFree,
          isBridge: false,
        });

        if (sound.maxSilence === 0) {
          sound.segments.forEach((toSegment) => {
            const bridgeName = `${segment.name}_${toSegment.name}`;
            this.segments.push({
              name: bridgeName,
              basePath: `${segmentsBasePath}/${bridgeName}`,
              isFree: segment.isFree && toSegment.isFree,
              isBridge: true,
              from: segment.name,
              to: toSegment.name,
            });
          });
        }
      });

      this.logger?.debug('finished loading sound metadata');
      this.isLoadingMetadata = false;
      this.metadataRetryDelayMillis = SoundPlayer.MIN_RETRY_DELAY_MILLIS;
      this.queueNextSegment();
    } catch (error) {
      this.metadataRetryDelayMillis = Math.min(
        this.metadataRetryDelayMillis * 2,
        SoundPlayer.MAX_RETRY_DELAY_MILLIS
      );

      this.logger?.warn(
        `failed to load sound metadata, retrying in ${(
          this.metadataRetryDelayMillis / 1000
        ).toPrecision(2)}s`
      );

      this.metadataLoadTimeout = setTimeout(
        () => this.loadMetadata(soundId),
        this.metadataRetryDelayMillis
      );
    }
  }

  private setState(state: SoundPlayerState) {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.dispatchEvent(new Event(SoundPlayer.EVENT_STATE_CHANGE));
  }
}
