import { Player } from '../src/player';

function main() {
  const player = new Player();
  player.addMediaItem('static/1.mp3');
  player.addMediaItem('static/2.mp3');
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
