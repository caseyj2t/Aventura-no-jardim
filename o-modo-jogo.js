(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas?.getContext('2d');
  const scoreElement = document.getElementById('score');
  const bestElement = document.getElementById('bestScore');
  const loadingScreen = document.getElementById('loadingScreen');
  const message = document.getElementById('gameMessage');
  const messageKicker = document.getElementById('messageKicker');
  const messageTitle = document.getElementById('messageTitle');
  const messageText = document.getElementById('messageText');
  const actionButton = document.getElementById('actionButton');

  if (!canvas || !ctx || !scoreElement || !bestElement || !loadingScreen || !message || !actionButton) {
    console.error('Não foi possível iniciar o jogo: elementos essenciais não foram encontrados.');
    return;
  }

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND_Y = 344;
  const STORAGE_KEY = 'pipoca-jardim-recorde-v1';
  const SPRITE_SIZE = 96;
  const SPRITE_COLUMNS = 4;
  const SPRITE_ROWS = {
    idle: 0,
    run: 1,
    jump: 2,
    fall: 3,
    celebrate: 4
  };

  const loadingStartedAt = performance.now();
  let loadingResolved = false;
  const spriteImage = new Image();
  let spriteReady = false;

  spriteImage.onload = () => {
    spriteReady = true;
    render(0);
    finishLoading();
  };

  spriteImage.onerror = () => {
    console.warn('Sprites não carregaram. O desenho alternativo será utilizado.');
    finishLoading();
  };

  spriteImage.src = 'assets/pipoca-sprites.svg';

  const game = {
    state: 'loading',
    score: 0,
    best: readBestScore(),
    elapsed: 0,
    lastTime: 0,
    spawnTimer: 0.8,
    obstacles: [],
    particles: [],
    nextMilestone: 100,
    overElapsed: 0,
    newRecord: false,
    animationId: null
  };

  const player = {
    x: 130,
    y: GROUND_Y - 60,
    width: 68,
    height: 60,
    velocityY: 0,
    gravity: 1750,
    jumpPower: -650,
    grounded: true,
    squash: 0,
    animationTime: 0,
    celebrateTimer: 0
  };

  const clouds = [
    { x: 65, y: 76, scale: 0.85, speed: 10 },
    { x: 390, y: 118, scale: 1.08, speed: 7 },
    { x: 730, y: 67, scale: 0.72, speed: 13 },
    { x: 1040, y: 145, scale: 0.92, speed: 8 }
  ];

  // Recorde salvo no navegador.
  function readBestScore() {
    try {
      const value = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (error) {
      console.warn('O navegador não permitiu salvar o recorde.', error);
      return 0;
    }
  }

  function saveBestScore() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(game.best));
    } catch (error) {
      console.warn('Não foi possível salvar o recorde neste navegador.', error);
    }
  }

  function updateHud() {
    scoreElement.textContent = String(Math.floor(game.score));
    bestElement.textContent = String(game.best);
  }

  // Telas iniciais e de fim de jogo.
  function showMessage(mode) {
    message.classList.remove('is-hidden');

    if (mode === 'ready') {
      messageKicker.textContent = 'MENU PRINCIPAL';
      messageTitle.textContent = 'A aventura vai começar!';
      messageText.textContent = 'Ajude Pipoca a pular as flores espinhosas e conquistar o maior recorde.';
      actionButton.innerHTML = 'Jogar agora <span aria-hidden="true">→</span>';
    } else {
      messageKicker.textContent = game.newRecord ? 'NOVO RECORDE!' : 'FIM DE JOGO';
      messageTitle.textContent = game.newRecord
        ? 'Pipoca bateu seu recorde!'
        : 'Pipoca precisa de outra tentativa!';
      messageText.textContent = `Você fez ${Math.floor(game.score)} pontos. Seu recorde é ${game.best}. Vamos tentar novamente?`;
      actionButton.innerHTML = 'Jogar novamente <span aria-hidden="true">↻</span>';
    }
  }

  function hideMessage() {
    message.classList.add('is-hidden');
  }

  // Reinicia todos os elementos.
  function resetGame() {
    game.score = 0;
    game.elapsed = 0;
    game.spawnTimer = 0.85;
    game.obstacles = [];
    game.particles = [];
    game.nextMilestone = 100;
    game.overElapsed = 0;
    game.newRecord = false;

    player.y = GROUND_Y - player.height;
    player.velocityY = 0;
    player.grounded = true;
    player.squash = 0;
    player.animationTime = 0;
    player.celebrateTimer = 0;

    updateHud();
  }

  function startGame(shouldJump = false) {
    if (game.state === 'over') resetGame();

    if (game.state === 'running') {
      if (shouldJump) jump();
      return;
    }

    game.state = 'running';
    game.lastTime = 0;
    hideMessage();

    if (shouldJump) jump();

    cancelAnimationFrame(game.animationId);
    game.animationId = requestAnimationFrame(loop);
  }

  function endGame() {
    if (game.state !== 'running') return;

    game.state = 'over';
    game.overElapsed = 0;
    game.lastTime = 0;
    player.animationTime = 0;
    player.celebrateTimer = 0;

    const finalScore = Math.floor(game.score);

    game.newRecord = finalScore > game.best;
    if (game.newRecord) {
      game.best = finalScore;
      saveBestScore();
    }

    updateHud();
    hideMessage();
    cancelAnimationFrame(game.animationId);
    game.animationId = requestAnimationFrame(overAnimationLoop);
  }

  function overAnimationLoop(timestamp) {
    if (game.state !== 'over') return;

    if (!game.lastTime) {
      game.lastTime = timestamp;
    }

    const dt = Math.min((timestamp - game.lastTime) / 1000, 0.04);
    game.lastTime = timestamp;
    game.overElapsed += dt;
    player.animationTime += dt;
    render(0);

    if (game.overElapsed < 0.62) {
      game.animationId = requestAnimationFrame(overAnimationLoop);
    } else {
      showMessage('over');
    }
  }

  // Sistema de pulo.
  function jump() {
    if (game.state !== 'running' || !player.grounded) return;

    player.velocityY = player.jumpPower;
    player.grounded = false;
    player.squash = 0.15;
    player.animationTime = 0;
    player.celebrateTimer = 0;

    createDust(player.x + 28, GROUND_Y - 3, 8);
  }

  // Partículas de poeira.
  function createDust(x, y, amount) {
    for (let i = 0; i < amount; i += 1) {
      game.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y - Math.random() * 7,
        vx: (Math.random() - 0.5) * 85,
        vy: -Math.random() * 70 - 10,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.55,
        size: 2 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#fff6d2' : '#a8c98a'
      });
    }
  }

  // Classe das flores espinhosas.
  class FlowerObstacle {
    constructor() {
      this.width = 56;
      this.height = 76 + Math.random() * 28;
      this.x = WIDTH + 20;
      this.y = GROUND_Y - this.height;

      this.color = Math.random() > 0.5 ? '#ef79a4' : '#b28be8';
      this.centerColor = Math.random() > 0.5 ? '#ffe27a' : '#ffcc65';

      this.passed = false;
    }

    update(dt, speed) {
      this.x -= speed * dt;
    }

    draw() {
      const stemX = this.x + 28;
      const flowerX = stemX;
      const flowerY = this.y + 19;

      // Sombra da planta.
      ctx.fillStyle = 'rgba(42, 91, 50, 0.13)';
      ctx.beginPath();
      ctx.ellipse(stemX, GROUND_Y - 2, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Caule curvado.
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#398b50';
      ctx.lineWidth = 7;

      ctx.beginPath();
      ctx.moveTo(stemX, GROUND_Y - 2);
      ctx.quadraticCurveTo(stemX - 5, this.y + 52, stemX, flowerY + 6);
      ctx.stroke();

      // Folhas.
      drawLeaf(stemX - 1, this.y + 55, -1, '#60ad62');
      drawLeaf(stemX + 2, this.y + 69, 1, '#4e9d58');

      // Espinhos.
      ctx.fillStyle = '#327b48';

      for (let i = 0; i < 3; i += 1) {
        const thornY = this.y + 43 + i * 15;

        ctx.beginPath();
        ctx.moveTo(stemX - 2, thornY);
        ctx.lineTo(stemX - 12, thornY - 5);
        ctx.lineTo(stemX - 5, thornY + 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(stemX + 2, thornY + 7);
        ctx.lineTo(stemX + 12, thornY + 2);
        ctx.lineTo(stemX + 5, thornY + 11);
        ctx.closePath();
        ctx.fill();
      }

      // Pétalas arredondadas.
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;

        ctx.save();
        ctx.translate(
          flowerX + Math.cos(angle) * 12,
          flowerY + Math.sin(angle) * 12
        );
        ctx.rotate(angle);

        ctx.fillStyle = this.color;
        ctx.strokeStyle = shadeColor(this.color, -18);
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // Miolo.
      ctx.fillStyle = this.centerColor;
      ctx.strokeStyle = '#e9a943';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(flowerX, flowerY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Brilho do miolo.
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(flowerX - 3, flowerY - 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    get hitbox() {
      return {
        x: this.x + 10,
        y: this.y + 13,
        width: 37,
        height: this.height - 13
      };
    }

    isOffscreen() {
      return this.x + this.width < -10;
    }
  }

  // Desenho das folhas.
  function drawLeaf(x, y, direction, color) {
    ctx.save();

    ctx.translate(x, y);
    ctx.rotate(direction * -0.42);

    ctx.fillStyle = color;
    ctx.strokeStyle = '#347e49';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.ellipse(direction * 8, 0, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Escurece ou clareia uma cor.
  function shadeColor(hex, amount) {
    const value = hex.replace('#', '');
    const number = parseInt(value, 16);

    const r = Math.max(0, Math.min(255, (number >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((number >> 8) & 0xff) + amount));
    const b = Math.max(0, Math.min(255, (number & 0xff) + amount));

    return `rgb(${r}, ${g}, ${b})`;
  }

  // Nuvens do cenário.
  function drawCloud(x, y, scale) {
    ctx.save();

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();

    ctx.arc(0, 10, 17, 0, Math.PI * 2);
    ctx.arc(20, 0, 23, 0, Math.PI * 2);
    ctx.arc(46, 10, 17, 0, Math.PI * 2);

    ctx.roundRect(-4, 8, 55, 19, 10);
    ctx.fill();

    ctx.restore();
  }

  // Céu, sol e montanhas.
  function drawSky(dt) {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);

    sky.addColorStop(0, '#8bd4f4');
    sky.addColorStop(0.62, '#d7f3e7');
    sky.addColorStop(1, '#eff6ce');

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Sol com brilho.
    const sunGlow = ctx.createRadialGradient(790, 82, 12, 790, 82, 75);

    sunGlow.addColorStop(0, 'rgba(255,231,142,0.76)');
    sunGlow.addColorStop(1, 'rgba(255,231,142,0)');

    ctx.fillStyle = sunGlow;
    ctx.fillRect(700, 0, 180, 170);

    ctx.fillStyle = '#ffe58b';
    ctx.beginPath();
    ctx.arc(790, 82, 31, 0, Math.PI * 2);
    ctx.fill();

    // Nuvens em movimento lento.
    for (const cloud of clouds) {
      if (game.state === 'running') {
        cloud.x -= cloud.speed * dt;
      }

      if (cloud.x < -100) {
        cloud.x = WIDTH + 70;
      }

      drawCloud(cloud.x, cloud.y, cloud.scale);
    }

    // Montanhas distantes.
    ctx.fillStyle = '#a9dcae';
    ctx.beginPath();
    ctx.moveTo(0, 260);

    for (let x = 0; x <= WIDTH + 20; x += 20) {
      const y = 246 + Math.sin(
        (x / WIDTH) * Math.PI * 3 + game.elapsed * 0.035
      ) * 21;

      ctx.lineTo(x, y);
    }

    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.lineTo(0, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Montanhas próximas.
    ctx.fillStyle = '#78bf83';
    ctx.beginPath();
    ctx.moveTo(0, 292);

    for (let x = 0; x <= WIDTH + 20; x += 20) {
      const y = 279 + Math.sin(
        (x / WIDTH) * Math.PI * 3.5 + game.elapsed * 0.055
      ) * 18;

      ctx.lineTo(x, y);
    }

    ctx.lineTo(WIDTH, GROUND_Y);
    ctx.lineTo(0, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Arbustos.
    drawBush(35, 306, 0.8);
    drawBush(820, 300, 1.05);
    drawBush(900, 315, 0.65);
  }

  // Arbustos decorativos.
  function drawBush(x, y, scale) {
    ctx.save();

    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#559f62';
    ctx.beginPath();

    ctx.arc(0, 7, 17, 0, Math.PI * 2);
    ctx.arc(18, 0, 22, 0, Math.PI * 2);
    ctx.arc(39, 8, 16, 0, Math.PI * 2);

    ctx.fill();

    ctx.fillStyle = '#83c77a';
    ctx.beginPath();

    ctx.arc(13, -5, 6, 0, Math.PI * 2);
    ctx.arc(33, 4, 5, 0, Math.PI * 2);

    ctx.fill();
    ctx.restore();
  }

  // Chão de grama e terra.
  function drawGround() {
    const soil = ctx.createLinearGradient(0, GROUND_Y, 0, HEIGHT);

    soil.addColorStop(0, '#9bce75');
    soil.addColorStop(0.13, '#8bba62');
    soil.addColorStop(1, '#6e9d55');

    ctx.fillStyle = soil;
    ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

    // Grama superior.
    ctx.fillStyle = '#5aab62';
    ctx.fillRect(0, GROUND_Y, WIDTH, 8);

    ctx.fillStyle = '#8fd178';
    ctx.fillRect(0, GROUND_Y, WIDTH, 3);

    // Tufos de grama.
    for (let x = 8; x < WIDTH; x += 31) {
      const offset = (x * 13) % 7;

      ctx.strokeStyle = '#438e53';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      ctx.beginPath();

      ctx.moveTo(x, GROUND_Y + 7);
      ctx.lineTo(x - 3, GROUND_Y - 1 - offset * 0.35);

      ctx.moveTo(x + 2, GROUND_Y + 7);
      ctx.lineTo(x + 5, GROUND_Y + 1 - offset * 0.25);

      ctx.stroke();
    }

    // Pedrinhas e manchas.
    for (let i = 0; i < 34; i += 1) {
      const x = (i * 83 + 23) % WIDTH;
      const y = GROUND_Y + 24 + ((i * 17) % 43);

      ctx.fillStyle = i % 2
        ? 'rgba(255,255,255,0.13)'
        : 'rgba(61,103,55,0.13)';

      ctx.beginPath();
      ctx.ellipse(x, y, 2 + (i % 3), 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function getDuckAnimation() {
    if (game.state === 'over') return 'fall';
    if (game.state === 'ready') return 'idle';
    if (player.celebrateTimer > 0) return 'celebrate';
    if (!player.grounded) {
      return player.velocityY > 115 ? 'fall' : 'jump';
    }
    return 'run';
  }

  function getDuckFrame(animation) {
    if (animation === 'jump') {
      if (player.velocityY < -440) return 0;
      if (player.velocityY < -240) return 1;
      if (player.velocityY < -50) return 2;
      return 3;
    }

    const fps = {
      idle: 3,
      run: 11,
      fall: 9,
      celebrate: 9
    }[animation] || 8;

    return Math.floor(player.animationTime * fps) % SPRITE_COLUMNS;
  }

  function drawDuck() {
    if (spriteReady) {
      const animation = getDuckAnimation();
      const row = SPRITE_ROWS[animation];
      const frame = getDuckFrame(animation);

      ctx.drawImage(
        spriteImage,
        frame * SPRITE_SIZE,
        row * SPRITE_SIZE,
        SPRITE_SIZE,
        SPRITE_SIZE,
        player.x - 9,
        player.y - 21,
        86,
        86
      );
      return;
    }

    drawDuckFallback();
  }

  // Personagem alternativo caso a folha de sprites não carregue.
  function drawDuckFallback() {
    const runCycle = game.state === 'running' && player.grounded
      ? Math.sin(game.elapsed * 17)
      : 0;

    const bob = player.grounded ? Math.abs(runCycle) * 1.6 : 0;

    const x = player.x;
    const y = player.y + bob;
    const isJumping = !player.grounded;

    // Sombra do personagem.
    const shadowScale = Math.max(
      0.48,
      1 - (GROUND_Y - (player.y + player.height)) / 250
    );

    ctx.fillStyle = `rgba(47, 91, 48, ${0.18 * shadowScale})`;
    ctx.beginPath();

    ctx.ellipse(
      x + 33,
      GROUND_Y + 1,
      28 * shadowScale,
      6 * shadowScale,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.save();

    ctx.translate(x + 34, y + 30);
    ctx.scale(1 + player.squash * 0.2, 1 - player.squash * 0.15);
    ctx.translate(-34, -30);

    // Corpo amarelo.
    ctx.fillStyle = '#ffd34f';
    ctx.strokeStyle = '#d99b32';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.ellipse(29, 37, 25, 18, -0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cabeça.
    ctx.fillStyle = '#ffe071';

    ctx.beginPath();
    ctx.arc(49, 20, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bico laranja.
    ctx.fillStyle = '#f28b35';
    ctx.strokeStyle = '#d66e28';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(62, 22);
    ctx.quadraticCurveTo(75, 21, 78, 27);
    ctx.quadraticCurveTo(70, 32, 61, 29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Asa animada.
    ctx.fillStyle = '#f3bd43';
    ctx.strokeStyle = '#d99b32';
    ctx.lineWidth = 1.7;

    ctx.beginPath();

    if (isJumping) {
      ctx.moveTo(17, 34);
      ctx.quadraticCurveTo(21, 17, 38, 24);
      ctx.quadraticCurveTo(34, 33, 29, 39);
    } else {
      ctx.moveTo(14, 37);
      ctx.quadraticCurveTo(24, 25 + runCycle * 2, 39, 36);
      ctx.quadraticCurveTo(29, 48, 17, 43);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Olho.
    ctx.fillStyle = '#3c4538';

    ctx.beginPath();
    ctx.arc(53, 16, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Brilho do olho.
    ctx.fillStyle = '#fff';

    ctx.beginPath();
    ctx.arc(54, 15, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Bochecha.
    ctx.fillStyle = 'rgba(244, 135, 112, 0.55)';

    ctx.beginPath();
    ctx.ellipse(59, 27, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patinhas animadas.
    ctx.strokeStyle = '#e88831';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';

    const legSwing = player.grounded ? runCycle * 3 : -2;

    ctx.beginPath();

    ctx.moveTo(24, 51);
    ctx.lineTo(22 + legSwing, 55);

    ctx.moveTo(40, 51);
    ctx.lineTo(41 - legSwing, 55);

    ctx.stroke();

    // Dedinhos.
    ctx.lineWidth = 2.5;

    ctx.beginPath();

    ctx.moveTo(22 + legSwing, 55);
    ctx.lineTo(17 + legSwing, 56);

    ctx.moveTo(22 + legSwing, 55);
    ctx.lineTo(26 + legSwing, 57);

    ctx.moveTo(41 - legSwing, 55);
    ctx.lineTo(36 - legSwing, 56);

    ctx.moveTo(41 - legSwing, 55);
    ctx.lineTo(45 - legSwing, 57);

    ctx.stroke();

    ctx.restore();
  }

  // Desenha as partículas.
  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;

      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size * alpha,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  // Detecção de colisão.
  function rectanglesOverlap(a, b) {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  function checkCollision(obstacle) {
    const duckHitbox = {
      x: player.x + 13,
      y: player.y + 13,
      width: 43,
      height: 42
    };

    return rectanglesOverlap(duckHitbox, obstacle.hitbox);
  }

  // Atualização da lógica do jogo.
  function update(dt) {
    game.elapsed += dt;
    game.score += dt * 10;
    player.animationTime += dt;
    player.celebrateTimer = Math.max(0, player.celebrateTimer - dt);

    if (game.score >= game.nextMilestone && player.grounded) {
      player.celebrateTimer = 0.72;
      game.nextMilestone += 100;
      createDust(player.x + 35, GROUND_Y - 8, 9);
    }

    // Gravidade e movimento do personagem.
    player.velocityY += player.gravity * dt;
    player.y += player.velocityY * dt;

    player.squash = Math.max(0, player.squash - dt * 1.8);

    // Verifica se o personagem chegou ao chão.
    if (player.y + player.height >= GROUND_Y) {
      const landed = !player.grounded;

      player.y = GROUND_Y - player.height;
      player.velocityY = 0;
      player.grounded = true;

      if (landed) {
        createDust(player.x + 30, GROUND_Y - 2, 7);
      }
    }

    // A velocidade aumenta progressivamente.
    const speed = Math.min(330 + game.score * 1.45, 510);

    // Criação dos obstáculos.
    game.spawnTimer -= dt;

    if (game.spawnTimer <= 0) {
      game.obstacles.push(new FlowerObstacle());

      const difficulty = Math.min(game.score / 450, 0.22);

      game.spawnTimer = 1.45 + Math.random() * 0.48 - difficulty;
    }

    // Atualiza flores e verifica colisões.
    for (const obstacle of game.obstacles) {
      obstacle.update(dt, speed);

      if (checkCollision(obstacle)) {
        endGame();
        return;
      }
    }

    // Remove flores que saíram da tela.
    game.obstacles = game.obstacles.filter(
      obstacle => !obstacle.isOffscreen()
    );

    // Movimento das partículas.
    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 160 * dt;
      particle.life -= dt;
    }

    game.particles = game.particles.filter(
      particle => particle.life > 0
    );

    updateHud();
  }

  // Desenha todos os elementos.
  function render(dt = 0) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawSky(dt);
    drawGround();

    for (const obstacle of game.obstacles) {
      obstacle.draw();
    }

    drawParticles();
    drawDuck();
  }

  function idleLoop(timestamp) {
    if (game.state !== 'ready') return;

    if (!game.lastTime) {
      game.lastTime = timestamp;
    }

    const dt = Math.min((timestamp - game.lastTime) / 1000, 0.04);
    game.lastTime = timestamp;
    player.animationTime += dt;
    render(0);
    game.animationId = requestAnimationFrame(idleLoop);
  }

  function finishLoading() {
    if (loadingResolved) return;
    loadingResolved = true;

    const minimumLoadingTime = 650;
    const remainingTime = Math.max(
      0,
      minimumLoadingTime - (performance.now() - loadingStartedAt)
    );

    window.setTimeout(() => {
      loadingScreen.classList.add('is-hidden');
      loadingScreen.setAttribute('aria-hidden', 'true');
      game.state = 'ready';
      showMessage('ready');
      game.lastTime = 0;
      game.animationId = requestAnimationFrame(idleLoop);
    }, remainingTime);
  }

  // Loop principal utilizando requestAnimationFrame.
  function loop(timestamp) {
    if (game.state !== 'running') return;

    if (!game.lastTime) {
      game.lastTime = timestamp;
    }

    const dt = Math.min(
      (timestamp - game.lastTime) / 1000,
      0.032
    );

    game.lastTime = timestamp;

    update(dt);
    render(dt);

    if (game.state === 'running') {
      game.animationId = requestAnimationFrame(loop);
    }
  }

  // Botão de iniciar e reiniciar.
  function handleAction() {
    startGame(false);
  }

  actionButton.addEventListener('click', handleAction);

  // Controle por toque no jogo.
  canvas.addEventListener('pointerdown', event => {
    event.preventDefault();

    if (game.state === 'ready' || game.state === 'over') {
      startGame(true);
    } else {
      jump();
    }
  });

  // Controle pelo teclado.
  window.addEventListener('keydown', event => {
    const isJumpKey =
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'KeyW';

    if (!isJumpKey || event.repeat) return;

    event.preventDefault();

    if (game.state === 'ready' || game.state === 'over') {
      startGame(true);
    } else {
      jump();
    }
  });

  // Ajuste ao retornar para a aba do jogo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game.state === 'running') {
      game.lastTime = 0;
    }
  });

  // Inicialização.
  updateHud();
  render(0);

})();
