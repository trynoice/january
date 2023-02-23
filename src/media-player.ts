import AudioContextDelegate from './audio-context-delegate';
import CdnClient from './cdn-client';
import type Logger from './logger';

export default class MediaPlayer extends EventTarget {
  public static readonly EVENT_MEDIA_ITEM_TRANSITION = 'mediaitemtransition';

  private readonly context = new AudioContextDelegate();
  private readonly gainNode = this.context.createGain();
  private readonly playlist: string[] = [];
  private readonly chunkList: string[] = [];
  private readonly sourceNodes: AudioBufferSourceNode[] = [];

  private volume = 1.0;
  private nextChunkStartTime: number = this.context.currentTime();

  private readonly bufferSizeSeconds: number;
  private readonly cdnClient: CdnClient;
  private readonly logger?: Logger;

  private bufferTicker?: ReturnType<typeof setTimeout>;
  private fadeCallbackTimeout?: ReturnType<typeof setTimeout>;

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

  public async play() {
    if (this.context.state() === 'closed') {
      throw new Error('attempted to restarted stopped player');
    }

    this.scheduleBufferTicker(true);
    if (this.context.state() === 'suspended') {
      this.setGain(this.volume);
      await this.context.resume();
    }
  }

  public async pause() {
    clearTimeout(this.fadeCallbackTimeout);
    if (this.context.state() === 'running') {
      await this.context.suspend();
    }
  }

  public async stop() {
    clearTimeout(this.bufferTicker);
    await this.pause();
    if (this.context.state() !== 'closed') {
      await this.context.close();
    }
  }

  private setGain(gain: number) {
    this.gainNode.gain
      .cancelScheduledValues(this.context.currentTime())
      .setValueAtTime(gain, this.context.currentTime());
  }

  public fadeTo(
    volume: number,
    durationSeconds: number,
    callback?: () => void
  ): void {
    this.volume = volume;
    clearTimeout(this.fadeCallbackTimeout);
    if (this.context.state() !== 'running') {
      this.setGain(volume);
      callback?.apply(undefined);
      return;
    }

    // value must always be positive for whatever reasons.
    // https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime
    const toVolume = Math.max(Number.EPSILON, volume);
    this.gainNode.gain
      .cancelScheduledValues(this.context.currentTime())
      .linearRampToValueAtTime(
        toVolume,
        this.context.currentTime() + durationSeconds
      );

    if (callback != null) {
      this.fadeCallbackTimeout = setTimeout(callback, durationSeconds * 1000);
    }
  }

  public addToPlaylist(src: string): void {
    this.playlist.push(src);
    if (this.context.state() === 'running') {
      this.scheduleBufferTicker(true);
    }
  }

  public clearPlaylist() {
    this.playlist.length = 0;
    this.chunkList.length = 0;
    this.sourceNodes.forEach((node) => node.stop()); // will dispatch ended event
    this.nextChunkStartTime = this.context.currentTime();
  }

  public remainingItemCount(): number {
    return this.playlist.length;
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
        this.logger?.warn('failed to load chunk list for media item', error);
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
        this.logger?.warn('failed to load a chunk for the media item', error);
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
        this.dispatchEvent(new Event(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION));
      }
    });

    if (this.nextChunkStartTime < this.context.currentTime()) {
      this.nextChunkStartTime = this.context.currentTime();
    }

    if (this.sourceNodes.length === 0) {
      // playback just started which is technically an item transition.
      this.dispatchEvent(new Event(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION));
    }

    this.sourceNodes.push(source);
    source.connect(this.gainNode);
    source.start(this.nextChunkStartTime);
    this.nextChunkStartTime += buffer.duration;
  }
}
