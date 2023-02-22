import type HttpClient from '../src/http-client';
import MediaPlayer from '../src/media-player';

class SimpleHttpClient implements HttpClient {
  get(url: string): Promise<Response> {
    return fetch(url, { credentials: 'include' });
  }
}

function main() {
  const player = new MediaPlayer(15, new SimpleHttpClient(), console);
  player.addEventListener(MediaPlayer.EVENT_MEDIA_ITEM_TRANSITION, () =>
    console.info('media item transitioned')
  );

  player.addToPlaylist('static/1/index.jan');
  player.addToPlaylist('static/2/index.jan');

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
      player.addToPlaylist('static/1/index.jan')
    );
}

document.addEventListener('DOMContentLoaded', () => main());
