import type CdnClient from '../src/cdn-client';
import { MediaPlayer } from '../src/media-player';

class SimpleCdnClient implements CdnClient {
  private static readonly CDN_BASE_URL =
    process.env.NODE_ENV === 'production'
      ? 'https://cdn.trynoice.com'
      : 'https://cdn.staging.trynoice.com';

  getResource(path: string): Promise<Response> {
    return fetch(`${SimpleCdnClient.CDN_BASE_URL}/${path}`, {
      credentials: 'include',
    });
  }
}

function main() {
  const items = [
    'library/segments/white_noise/white_noise/128k/index.jan',
    'library/segments/white_noise/white_noise_white_noise/128k/index.jan',
  ];

  const player = new MediaPlayer(15, new SimpleCdnClient(), console);
  player.addEventListener(MediaPlayer.EVENT_ITEM_TRANSITION, () =>
    console.info(
      'playlist item transitioned, remaining:',
      player.remainingItemCount()
    )
  );

  player.addEventListener(MediaPlayer.EVENT_STATE_CHANGE, () =>
    console.info('media player state changed:', player.getState())
  );

  items.forEach((item) => player.addToPlaylist(item));

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

  document
    .querySelector('#clearPlaylist')
    ?.addEventListener('click', () => player.clearPlaylist());

  document
    .querySelector('#addToPlaylist')
    ?.addEventListener('click', () =>
      items.forEach((item) => player.addToPlaylist(item))
    );
}

document.addEventListener('DOMContentLoaded', () => main());
