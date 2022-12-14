import { Player } from '../src/player';

function main() {
  const player = new Player(15, console);
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
    ?.addEventListener('click', () => player.fadeTo(0, 5));

  document
    .querySelector('#unmute')
    ?.addEventListener('click', () => player.fadeTo(1, 5));
}

document.addEventListener('DOMContentLoaded', () => main());
