import AudioContextDelegate from './audio-context-delegate';
import CdnClient from './cdn-client';
import type { Logger } from './logger';

export const enum MediaPlayerState {
  Idle = 'idle',
  Buffering = 'buffering',
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
}

export class MediaPlayer extends EventTarget {
  public static readonly EVENT_ITEM_TRANSITION = 'itemtransition';
  public static readonly EVENT_STATE_CHANGE = 'statechange';

  private readonly context = new AudioContextDelegate();
  private readonly gainNode = this.context.createGain();
  private readonly playlist: string[] = [];
  private readonly chunkList: string[] = [];
  private readonly sourceNodes: AudioBufferSourceNode[] = [];

  private state = MediaPlayerState.Paused;
  private volume = 1.0;
  private nextChunkStartTime: number = this.context.currentTime();
  private mediaItemCount = 0;

  private readonly bufferSizeSeconds: number;
  private readonly cdnClient: CdnClient;
  private readonly logger?: Logger;

  private bufferTicker?: ReturnType<typeof setTimeout>;
  private fadeTicker?: ReturnType<typeof setTimeout>;

  constructor(
    bufferSizeSeconds: number,
    cdnClient: CdnClient,
    logger?: Logger
  ) {
    super();
    this.bufferSizeSeconds = bufferSizeSeconds;
    this.cdnClient = cdnClient;
    this.logger = logger;
    this.gainNode.connect(this.context.destination());
    this.context.suspend();
  }

  public getState(): MediaPlayerState {
    return this.state;
  }

  public async play() {
    if (this.context.state() === 'closed') {
      throw new Error('attempted to restarted stopped player');
    }

    this.scheduleBufferTicker(true);
    if (this.context.state() === 'suspended') {
      this.setVolume(this.volume);
      await this.context.resume();
    }

    this.setState(
      this.sourceNodes.length > 0
        ? MediaPlayerState.Playing
        : this.mediaItemCount > 0
        ? MediaPlayerState.Buffering
        : MediaPlayerState.Idle
    );
  }

  public async pause() {
    clearTimeout(this.fadeTicker);
    if (this.context.state() === 'running') {
      await this.context.suspend();
    }

    this.setState(MediaPlayerState.Paused);
  }

  public async stop() {
    clearTimeout(this.bufferTicker);
    clearTimeout(this.fadeTicker);
    if (this.context.state() !== 'closed') {
      await this.context.close();
    }

    this.setState(MediaPlayerState.Stopped);
  }

  public setVolume(volume: number) {
    if (volume < 0 || volume > 1) {
      throw new Error(`volume must be in range [0, 1], got: ${volume}`);
    }

    this.volume = volume;
    this.gainNode.gain.value = volume;
  }

  public fadeTo(
    volume: number,
    durationSeconds: number,
    callback?: () => void
  ): void {
    const fromVolume = this.gainNode.gain.value;
    clearTimeout(this.fadeTicker);
    if (fromVolume === volume || this.context.state() !== 'running') {
      this.setVolume(volume);
      callback?.apply(undefined);
      return;
    }

    // audio node's ramp function doesn't cancel correctly with
    // cancelScheduledValues and cancelAndHoldAtTime isn't implemented by
    // Firefox. Therefore, here's a make-shift solution using timeouts.
    const startTime = this.context.currentTime();
    const deltaVolume = Math.abs(fromVolume - volume);
    const sign = fromVolume > volume ? -1 : 1;
    this.volume = volume;
    const fadeTickerCallback = () => {
      const elapsed = this.context.currentTime() - startTime;
      if (elapsed >= durationSeconds) {
        this.gainNode.gain.value = volume;
        callback?.apply(undefined);
        return;
      }

      this.gainNode.gain.value =
        fromVolume + (elapsed / durationSeconds) * deltaVolume * sign;

      this.fadeTicker = setTimeout(fadeTickerCallback, 0);
    };

    this.fadeTicker = setTimeout(fadeTickerCallback, 0);
  }

  public addToPlaylist(src: string): void {
    this.playlist.push(src);
    this.mediaItemCount++;
    if (this.context.state() === 'running') {
      this.scheduleBufferTicker(true);
    }
  }

  public clearPlaylist() {
    this.mediaItemCount = 0;
    this.playlist.length = 0;
    this.chunkList.length = 0;
    this.sourceNodes.forEach((node) => node.stop()); // will dispatch ended event
    this.nextChunkStartTime = this.context.currentTime();
  }

  public getMediaItemCount(): number {
    return this.mediaItemCount;
  }

  private async buffer() {
    if (this.playlist.length < 1 && this.chunkList.length < 1) {
      this.logger?.info('all items in the playlist have finished buffering');
      return;
    }

    const remaining = this.nextChunkStartTime - this.context.currentTime();
    if (remaining > this.bufferSizeSeconds) {
      this.logger?.debug('buffered duration exceeds the requested buffer size');
      this.scheduleBufferTicker(false);
      return;
    }

    if (this.chunkList.length < 1) {
      this.logger?.info('loading chunk list for the next media item');
      const mediaItemPath = this.playlist.shift() ?? '';

      try {
        this.chunkList.push(...(await this.loadChunkList(mediaItemPath)));
      } catch (error) {
        this.logger?.warn(`failed to load chunk list for media item: ${error}`);
      }
    }

    const nextChunkPath = this.chunkList.shift();

    // do not return without scheduling buffer ticker if the next chunk path is
    // absent. Otherwise, it might be possible that there were media items in
    // the playlist, but the buffering stopped because the player failed to load
    // chunk list for a previous media item and the buffer ticker stopped since
    // it didn't have more chunks to load.
    if (nextChunkPath != null) {
      try {
        const response = await this.cdnClient.getResource(nextChunkPath);
        if (!response.ok) {
          throw new Error(`http error: ${response.status}`);
        }

        const chunk = await response.arrayBuffer();
        await this.appendToAudioContext(chunk, this.chunkList.length === 0);
        this.logger?.debug('appended chunk to audio context');
      } catch (error) {
        this.logger?.warn(
          `failed to load a chunk for the media item: ${error}`
        );
      }
    }

    this.scheduleBufferTicker(false);
  }

  private scheduleBufferTicker(immediate: boolean) {
    clearTimeout(this.bufferTicker);
    this.bufferTicker = setTimeout(() => this.buffer(), immediate ? 0 : 1000);
  }

  private async loadChunkList(path: string): Promise<string[]> {
    const basePath = path.substring(0, path.lastIndexOf('/'));
    const response = await this.cdnClient.getResource(path);
    if (!response.ok) {
      throw new Error(`http error: ${response.status}`);
    }

    return (await response.text())
      .trim()
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v != null && v.length > 0)
      .map((v) => `${basePath}/${v}`);
  }

  private async appendToAudioContext(chunk: ArrayBuffer, isLastChunk: boolean) {
    const buffer = await this.context.decodeAudioData(chunk);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.addEventListener('ended', () => {
      source.disconnect();
      this.sourceNodes.shift();
      this.logger?.debug('finished playing chunk');
      if (isLastChunk) {
        // when clearing playlist, media item count is reset, so...
        if (this.mediaItemCount > 0) this.mediaItemCount--;
        this.dispatchEvent(new Event(MediaPlayer.EVENT_ITEM_TRANSITION));
      }

      if (this.sourceNodes.length < 1) {
        this.setState(
          this.chunkList.length > 0 || this.playlist.length > 0
            ? MediaPlayerState.Buffering
            : MediaPlayerState.Idle
        );
      }
    });

    if (this.nextChunkStartTime < this.context.currentTime()) {
      this.nextChunkStartTime = this.context.currentTime();
    }

    if (this.sourceNodes.length === 0) {
      // playback just started which is technically an item transition.
      this.dispatchEvent(new Event(MediaPlayer.EVENT_ITEM_TRANSITION));
    }

    this.sourceNodes.push(source);
    source.connect(this.gainNode);
    source.start(this.nextChunkStartTime);
    this.nextChunkStartTime += buffer.duration;
    this.setState(MediaPlayerState.Playing);
  }

  private setState(state: MediaPlayerState) {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.dispatchEvent(new Event(MediaPlayer.EVENT_STATE_CHANGE));
  }
}
