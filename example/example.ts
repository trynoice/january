import { MediaPlayer } from '../src/media-player';
import type { MediaPlayerDataSource } from '../src/media-player';

class HttpMediaPlayerDataSource implements MediaPlayerDataSource {
  async load(url: string): Promise<ArrayBuffer> | never {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`failed to load data from ${url}`);
    }

    return await response.arrayBuffer();
  }
}

function main() {
  const player = new MediaPlayer(15, new HttpMediaPlayerDataSource(), console);
  player.addEventListener(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION, () =>
    console.info('media item transitioned')
  );

  player.addMediaItem(
    'https://cdn.staging.trynoice.com/library/segments/birds/birds_3_birds_3/128k/index.jan'
  );

  player.addMediaItem(
    'https://cdn.staging.trynoice.com/library/segments/birds/birds_3/128k/index.jan'
  );

  document
    .querySelector('#play')
    ?.addEventListener('click', () => player.play());

  document
    .querySelector('#pause')
    ?.addEventListener('click', () => player.pause());

  document
    .querySelector('#stop')
    ?.addEventListener('click', () => player.stop());

  document
    .querySelector('#mute')
    ?.addEventListener('click', () =>
      player.fadeTo(0, 5, () => console.log('mute callback invoked'))
    );

  document
    .querySelector('#unmute')
    ?.addEventListener('click', () =>
      player.fadeTo(1, 5, () => console.log('unmute callback invoked'))
    );
}

document.addEventListener('DOMContentLoaded', () => main());
