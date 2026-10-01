'use strict';

const canvas = document.getElementById('gameCanvas');
const statusText = document.getElementById('statusText');
const overlay = document.getElementById('overlay');
const stage = new createjs.Stage(canvas);
stage.mouseMoveOutside = true;
createjs.Touch.enable(stage);

// Порядок слоёв: поле, прицел, выстрел, пушка, эффекты.
const background = new createjs.Container();
const boardLayer = new createjs.Container();
const aimLayer = new createjs.Container();
const shotLayer = new createjs.Container();
const shooterLayer = new createjs.Container();
const effectsLayer = new createjs.Container();
stage.addChild(background, boardLayer, aimLayer, shotLayer, shooterLayer, effectsLayer);

const pole = sozdatPole();
const views = new Map();
const effects = [];
const aim = new createjs.Shape();
aimLayer.addChild(aim);

// Готовность -> полёт -> обработка попадания -> следующий ход.
let state = 'ready';
let shot = null;
let score = 0;
let best = prochitatRekord();
let currentColor = 0;
let nextColor = 1;
let aimX = CONFIG.shooterX;
let aimY = 100;
let aimEnd = null;
let resolveRemaining = 0;
let descentElapsed = 0;
let shotsUntilDescent = CONFIG.shotsPerDescent;
let slide = [];
let loadedBubble;
let barrel;

function razmerPolya() {
  // Учитываем плотность пикселей, чтобы шарики не размывались.
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  stage.scaleX = width / CONFIG.width;
  stage.scaleY = height / CONFIG.height;
  stage.update();
}

function prochitatRekord() {
  try {
    const saved = Number(localStorage.getItem('chromaticBest'));
    if (Number.isSafeInteger(saved) && saved >= 0) return saved;
  } catch { /* Браузер может запретить хранение данных. */ }
  return 0;
}

function obnovitSchet() {
  if (score > best) {
    best = score;
    try { localStorage.setItem('chromaticBest', String(best)); } catch { /* Игра продолжится без сохранения. */ }
  }
  document.getElementById('score').textContent = String(score).padStart(5, '0');
  document.getElementById('best').textContent = String(best).padStart(5, '0');
}

function obnovitSchetchik() {
  document.getElementById('shotsUntilDescent').textContent = shotsUntilDescent;
  document.getElementById('descentInterval').textContent = CONFIG.shotsPerDescent;
  let hint = 'Осталось выстрелов: ' + shotsUntilDescent;
  let shortHint = 'До спуска: ' + shotsUntilDescent;
  if (shotsUntilDescent === 1) hint = 'После следующего выстрела';
  if (shotsUntilDescent === 0) {
    hint = 'Поле опускается…';
    shortHint = 'Спуск…';
  }
  document.getElementById('descentHint').textContent = hint;
  document.getElementById('descentStatus').textContent = shortHint;
  const progress = (CONFIG.shotsPerDescent - shotsUntilDescent) / CONFIG.shotsPerDescent * 100;
  document.getElementById('descentProgress').style.width = progress + '%';
}

function sozdatTekst(value, size, color, x, y, align = 'center') {
  const label = new createjs.Text(value, '700 ' + size + 'px Manrope, sans-serif', color);
  label.textAlign = align;
  label.textBaseline = 'middle';
  label.x = x;
  label.y = y;
  return label;
}

function risovatSharik(colorIndex, radius = CONFIG.radius) {
  const color = COLORS[colorIndex];
  const view = new createjs.Container();
  const body = new createjs.Shape();
  body.graphics.setStrokeStyle(1.5).beginStroke(color.edge)
    .beginFill(color.fill).drawCircle(0, 0, radius - 0.75);
  const gloss = new createjs.Shape();
  gloss.graphics.beginFill('rgba(255, 255, 255, 0.36)')
    .drawEllipse(-radius * 0.53, -radius * 0.65, radius * 0.92, radius * 0.48);
  const shine = new createjs.Shape();
  shine.graphics.beginFill('rgb(255, 255, 255)').drawCircle(-radius * 0.4, -radius * 0.43, 1.8);
  view.addChild(body, gloss, shine);
  return view;
}

function risovatFon() {
  const surface = new createjs.Shape();
  surface.graphics.beginFill('rgb(16, 23, 42)').drawRect(0, 0, CONFIG.width, CONFIG.height);
  const dots = new createjs.Shape();
  for (let x = 30; x < CONFIG.width; x += 30) {
    for (let y = 20; y < CONFIG.dangerY - 20; y += 30) {
      dots.graphics.beginFill('rgba(158, 177, 218, 0.07)').drawCircle(x, y, 1);
    }
  }
  const walls = new createjs.Shape();
  walls.graphics.setStrokeStyle(1).beginStroke('rgba(156, 178, 225, 0.16)')
    .moveTo(CONFIG.minX - CONFIG.radius, 20).lineTo(CONFIG.minX - CONFIG.radius, CONFIG.dangerY - 15)
    .moveTo(CONFIG.maxX + CONFIG.radius, 20).lineTo(CONFIG.maxX + CONFIG.radius, CONFIG.dangerY - 15);
  const danger = new createjs.Shape();
  danger.graphics.setStrokeStyle(1).setStrokeDash([5, 7])
    .beginStroke('rgba(255, 102, 142, 0.6)')
    .moveTo(30, CONFIG.dangerY).lineTo(CONFIG.width - 30, CONFIG.dangerY);
  background.addChild(surface, dots, walls, danger);
}

function obnovitShariki() {
  const active = {};
  for (const bubble of pole.cells.values()) active[bubble.id] = true;
  for (const [id, view] of views) {
    if (!active[id]) {
      boardLayer.removeChild(view);
      views.delete(id);
    }
  }
  for (const bubble of pole.cells.values()) {
    if (views.has(bubble.id)) continue;
    const view = risovatSharik(bubble.color);
    const p = polozhenie(pole, bubble);
    view.x = p.x;
    view.y = p.y;
    views.set(bubble.id, view);
    boardLayer.addChild(view);
  }
}

function vybratCvet() {
  const colors = cvetaNaPole(pole);
  if (colors.length === 0) return sluchaynyyCvet(pole);
  return colors[Math.floor(pole.random() * colors.length)];
}

function risovatPushku() {
  shooterLayer.removeAllChildren();
  const halo = new createjs.Shape();
  halo.graphics.beginFill('rgba(99, 242, 196, 0.05)').drawCircle(CONFIG.shooterX, CONFIG.shooterY, 41);
  const base = new createjs.Shape();
  base.graphics.setStrokeStyle(1.5).beginStroke('rgb(68, 89, 119)')
    .beginFill('rgb(29, 42, 65)').drawRoundRect(CONFIG.shooterX - 36, CONFIG.shooterY - 24, 72, 50, 19);
  barrel = new createjs.Shape();
  barrel.graphics.beginFill('rgb(99, 242, 196)').drawRoundRect(-6, -37, 12, 25, 5);
  barrel.x = CONFIG.shooterX;
  barrel.y = CONFIG.shooterY;
  const ring = new createjs.Shape();
  ring.graphics.setStrokeStyle(2).beginStroke('rgb(99, 242, 196)').drawCircle(CONFIG.shooterX, CONFIG.shooterY, 23);
  loadedBubble = risovatSharik(currentColor);
  loadedBubble.x = CONFIG.shooterX;
  loadedBubble.y = CONFIG.shooterY;
  loadedBubble.visible = state === 'ready';
  const upcoming = risovatSharik(nextColor, 16);
  upcoming.x = CONFIG.shooterX + 108;
  upcoming.y = CONFIG.shooterY;
  shooterLayer.addChild(halo, base, barrel, ring, loadedBubble, upcoming,
    sozdatTekst('СЛЕДУЮЩИЙ', 8, 'rgb(140, 157, 186)', upcoming.x, CONFIG.shooterY + 31));
  document.getElementById('ammoHint').textContent = 'Заряжен: ' + COLORS[currentColor].name.toLowerCase();
}

function risovatPricel() {
  const g = aim.graphics.clear();
  aim.visible = state === 'ready';
  const vector = napravlenie(aimX, aimY);
  barrel.rotation = vector.angle * 180 / Math.PI;
  if (!aim.visible) return;
  let x = CONFIG.shooterX;
  let y = CONFIG.shooterY;
  let dx = vector.x;
  const dy = vector.y;
  const maxDistance = (CONFIG.shooterY - CONFIG.top) / -dy + 4;
  for (let distance = 0; distance < maxDistance; distance += 4) {
    x += dx * 4;
    y += dy * 4;
    if (x < CONFIG.minX) { x = 2 * CONFIG.minX - x; dx = -dx; }
    if (x > CONFIG.maxX) { x = 2 * CONFIG.maxX - x; dx = -dx; }
    if (y <= CONFIG.top || stolknovenie(pole, x, y)) break;
    if (distance > 36 && distance % 20 === 0) {
      g.beginFill('rgba(224, 235, 255, 0.45)').drawCircle(x, y, 1.6);
    }
  }
  aimEnd = { x: x, y: y };
  g.setStrokeStyle(1.5).beginStroke(COLORS[currentColor].fill).drawCircle(x, y, 7);
}

function vystrel() {
  if (state !== 'ready') return false;
  const vector = napravlenie(aimX, aimY);
  const view = risovatSharik(currentColor);
  view.x = CONFIG.shooterX;
  view.y = CONFIG.shooterY;
  shotLayer.addChild(view);
  shot = { view: view, color: currentColor, dx: vector.x, dy: vector.y };
  state = 'flying';
  loadedBubble.visible = false;
  aim.visible = false;
  statusText.textContent = 'Шарик в пути…';
  return true;
}

function dvigatSharik(dt) {
  // Маленькие шаги не дают пролететь сквозь другие шарики.
  const count = Math.max(1, Math.ceil(CONFIG.speed * dt / 3));
  const step = CONFIG.speed * dt / count;
  for (let i = 0; i < count && shot; i++) {
    const view = shot.view;
    const from = { x: view.x, y: view.y };
    view.x += shot.dx * step;
    view.y += shot.dy * step;
    if (view.x < CONFIG.minX) { view.x = 2 * CONFIG.minX - view.x; shot.dx = -shot.dx; }
    if (view.x > CONFIG.maxX) { view.x = 2 * CONFIG.maxX - view.x; shot.dx = -shot.dx; }
    const hit = stolknovenie(pole, view.x, view.y);
    if (view.y <= CONFIG.top || hit) {
      zakrepitSharik(hit, from);
      break;
    }
  }
}

function zakrepitSharik(hit, from) {
  const cell = mestoPopadaniya(pole, shot.view.x, shot.view.y, hit, from);
  if (!cell) {
    // Если привязка не удалась, возвращаем тот же шарик, а не объявляем проигрыш.
    shotLayer.removeAllChildren();
    shot = null;
    state = 'ready';
    risovatPushku();
    statusText.textContent = 'Шарик не закрепился — попробуй другой угол';
    return;
  }
  const bubble = dobavitSharik(pole, cell[0], cell[1], shot.color);
  const view = shot.view;
  const p = polozhenie(pole, bubble);
  view.x = p.x;
  view.y = p.y;
  boardLayer.addChild(view);
  views.set(bubble.id, view);
  shot = null;

  const removed = lopnutGruppu(pole, bubble.row, bubble.col);
  let popped = 0;
  let earned = 0;
  for (const item of removed) {
    if (!item.falling) popped++;
    earned += item.points;
    score += item.points;
    effektVzryva(item);
  }
  obnovitShariki();
  obnovitSchet();
  shotsUntilDescent--;
  obnovitSchetchik();
  state = 'resolving';
  resolveRemaining = 0.1;
  if (removed.length > 0) resolveRemaining = 0.26;
  if (popped > 0) statusText.textContent = popped + ' шариков лопнули · +' + earned + ' очков';
  else if (shotsUntilDescent === 0) statusText.textContent = 'Нет совпадения — поле опускается';
  else statusText.textContent = 'Нет совпадения — попробуй ещё';
}

function effektVzryva(item) {
  const color = COLORS[item.bubble.color].fill;
  const oldView = views.get(item.bubble.id);
  if (item.falling && oldView) {
    effectsLayer.addChild(oldView);
    effects.push({ type: 'fall', view: oldView, age: 0, duration: 0.65, vx: (pole.random() - 0.5) * 35, vy: 70 });
  }
  let count = 8;
  if (item.falling) count = 4;
  for (let i = 0; i < count; i++) {
    const spark = new createjs.Shape();
    spark.graphics.beginFill(color).drawCircle(0, 0, 1.5 + pole.random() * 2);
    spark.x = item.x;
    spark.y = item.y;
    const angle = pole.random() * Math.PI * 2;
    const speed = 45 + pole.random() * 70;
    effectsLayer.addChild(spark);
    effects.push({ type: 'spark', view: spark, age: 0, duration: 0.45,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  }
  const label = sozdatTekst('+' + item.points, 14, 'rgb(255, 255, 255)', 0, 0);
  const outline = label.clone();
  outline.color = 'rgb(11, 16, 32)';
  outline.outline = 4;
  const popup = new createjs.Container();
  popup.addChild(outline, label);
  popup.x = item.x + (item.bubble.col % 2 ? 2 : -2);
  popup.y = item.y;
  effectsLayer.addChild(popup);
  effects.push({ type: 'score', view: popup, age: 0, duration: 1.1, vx: 0, vy: -32 });
}

function obnovitEffekty(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.age += dt;
    effect.view.x += effect.vx * dt;
    effect.view.y += effect.vy * dt;
    if (effect.type === 'fall') effect.vy += 450 * dt;
    if (effect.type === 'spark') effect.vy += 100 * dt;
    if (effect.type === 'score') effect.view.alpha = Math.min(1, Math.max(0, (effect.duration - effect.age) / 0.4));
    else effect.view.alpha = Math.max(0, 1 - effect.age / effect.duration);
    if (effect.age >= effect.duration) {
      effectsLayer.removeChild(effect.view);
      effects.splice(i, 1);
    }
  }
}

function nachatSpusk() {
  // Запоминаем старые координаты для плавного движения вниз.
  const origins = {};
  for (const [id, view] of views) origins[id] = { x: view.x, y: view.y };
  opustitPole(pole);
  obnovitShariki();
  slide = [];
  for (const bubble of pole.cells.values()) {
    const target = polozhenie(pole, bubble);
    let origin = origins[bubble.id];
    if (!origin) origin = { x: target.x, y: target.y - CONFIG.stepY };
    const view = views.get(bubble.id);
    view.x = origin.x;
    view.y = origin.y;
    slide.push({ view: view, origin: origin, target: target });
  }
  state = 'descending';
  descentElapsed = 0;
}

function animaciyaSpuska(dt) {
  descentElapsed += dt;
  const progress = Math.min(1, descentElapsed / 0.32);
  const eased = 1 - (1 - progress) ** 3;
  for (const item of slide) {
    item.view.x = item.origin.x;
    item.view.y = item.origin.y + (item.target.y - item.origin.y) * eased;
  }
  if (progress < 1) return;
  slide = [];
  shotsUntilDescent = CONFIG.shotsPerDescent;
  obnovitSchetchik();
  novyyHod();
}

function novyyHod() {
  if (dostigliLinii(pole)) {
    proigrysh();
    return;
  }
  const colors = cvetaNaPole(pole);
  currentColor = nextColor;
  if (!colors.includes(nextColor)) currentColor = vybratCvet();
  nextColor = vybratCvet();
  state = 'ready';
  risovatPushku();
  statusText.textContent = 'Твой ход · ЛКМ или пробел';
}

function zavershitHod() {
  if (dostigliLinii(pole)) proigrysh();
  else if (shotsUntilDescent === 0) nachatSpusk();
  else novyyHod();
}

function proigrysh() {
  state = 'gameover';
  aim.visible = false;
  loadedBubble.visible = false;
  document.getElementById('overlayScore').textContent = score;
  document.getElementById('overlayBest').textContent = best;
  overlay.classList.remove('hidden');
  statusText.textContent = 'Игра окончена';
}

function ochistitScenu() {
  boardLayer.removeAllChildren();
  shotLayer.removeAllChildren();
  effectsLayer.removeAllChildren();
  views.clear();
  effects.length = 0;
  slide = [];
  shot = null;
  score = 0;
  resolveRemaining = 0;
  descentElapsed = 0;
  shotsUntilDescent = CONFIG.shotsPerDescent;
  state = 'ready';
  aimX = CONFIG.shooterX;
  aimY = 100;
  overlay.classList.add('hidden');
}

function nachatZanovo() {
  ochistitScenu();
  nachalnoePole(pole);
  obnovitShariki();
  currentColor = vybratCvet();
  nextColor = vybratCvet();
  risovatPushku();
  obnovitSchet();
  obnovitSchetchik();
  statusText.textContent = 'Твой ход · ЛКМ или пробел';
  risovatPricel();
  stage.update();
}

function kadr(event) {
  // Время в секундах. После фоновой вкладки не наверстываем весь пропущенный полёт.
  const dt = Math.min(50, Math.max(0, event.delta || 0)) / 1000;
  if (state === 'flying') dvigatSharik(dt);
  else if (state === 'resolving') {
    resolveRemaining -= dt;
    if (resolveRemaining <= 0) zavershitHod();
  } else if (state === 'descending') animaciyaSpuska(dt);
  obnovitEffekty(dt);
  risovatPricel();
  stage.update();
}

function obnovitMysh(event) {
  const p = stage.globalToLocal(event.stageX, event.stageY);
  aimX = p.x;
  aimY = p.y;
}

stage.on('stagemousemove', obnovitMysh);
stage.on('stagemousedown', function (event) {
  if (event.nativeEvent.button !== undefined && event.nativeEvent.button !== 0) return;
  canvas.focus({ preventScroll: true });
  obnovitMysh(event);
  vystrel();
});
document.addEventListener('keydown', function (event) {
  if (event.code !== 'Space') return;
  if (event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (!event.repeat) vystrel();
});
function restartKnopkoy() {
  nachatZanovo();
  canvas.focus({ preventScroll: true });
}
document.getElementById('restartButton').addEventListener('click', restartKnopkoy);
document.getElementById('overlayButton').addEventListener('click', restartKnopkoy);

risovatFon();
nachatZanovo();
razmerPolya();
const resizeObserver = new ResizeObserver(razmerPolya);
resizeObserver.observe(canvas);
window.addEventListener('resize', razmerPolya);
createjs.Ticker.framerate = 60;

// В ручных тестах время двигает проверяющий скрипт, а не таймер.
const params = new URLSearchParams(window.location.search);
const manualTest = params.get('test') === '1' && params.get('manual') === '1';
createjs.Ticker.on('tick', function (event) {
  if (!manualTest) kadr(event);
});
if (params.get('test') === '1') {
  const script = document.createElement('script');
  script.src = 'tests/game-test.js';
  document.body.appendChild(script);
}
