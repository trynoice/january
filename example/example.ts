import { Player } from '../src/player';
import type { PlayerDataSource } from '../src/player';

class HttpPlayerDataSource implements PlayerDataSource {
  async load(url: string): Promise<ArrayBuffer> | never {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`failed to load data from ${url}`);
    }

    return await response.arrayBuffer();
  }
}

function main() {
  const player = new Player(15, new HttpPlayerDataSource(), console);
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
