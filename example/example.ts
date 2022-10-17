import { Player } from '../src/player';

document.addEventListener('click', () => {
  const player = new Player();
  player.addMediaItem('/static/1.mp3');
  player.addMediaItem('/static/2.mp3');
  player.play();
});
