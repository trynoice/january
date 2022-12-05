import { Player } from '../src/player';

function main() {
  const player = new Player(15);
  player.addMediaItem('static/1/index.jan');
  player.addMediaItem('static/2/index.jan');
  document
    .querySelector('#play')
    ?.addEventListener('click', () => player.play());

  document
    .querySelector('#pause')
    ?.addEventListener('click', () => player.pause());

  document
    .querySelector('#stop')
    ?.addEventListener('click', () => player.stop());
}

document.addEventListener('DOMContentLoaded', () => main());
