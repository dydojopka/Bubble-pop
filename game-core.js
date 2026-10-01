'use strict';

// Настройки поля
const CONFIG = {
  width: 720,
  height: 700,
  radius: 20,
  columns: 16,
  stepX: 40,
  stepY: 40 * Math.sqrt(3) / 2,
  left: 50,
  top: 40,
  minX: 50,
  maxX: 670,
  dangerY: 590,
  shooterX: 360,
  shooterY: 650,
  speed: 520,
  shotsPerDescent: 3,
};

const COLORS = [
  { name: 'Розовый', fill: 'rgb(255, 102, 142)', edge: 'rgb(178, 46, 82)' },
  { name: 'Голубой', fill: 'rgb(87, 217, 255)', edge: 'rgb(32, 132, 174)' },
  { name: 'Жёлтый', fill: 'rgb(255, 200, 92)', edge: 'rgb(184, 126, 30)' },
  { name: 'Фиолетовый', fill: 'rgb(168, 139, 255)', edge: 'rgb(104, 72, 181)' },
  { name: 'Зелёный', fill: 'rgb(94, 230, 174)', edge: 'rgb(31, 151, 102)' },
];

function klyuch(row, col) {
  return row + ',' + col;
}

function proveritYacheyku(row, col) {
  return Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0 && col < CONFIG.columns;
}

function koordinaty(row, col, phase = 0) {
  // У сотовой сетки каждый второй ряд сдвинут на полшарика
  let shift = 0;
  if ((row + phase) % 2 === 1) shift = CONFIG.stepX / 2;
  return { x: CONFIG.left + col * CONFIG.stepX + shift, y: CONFIG.top + row * CONFIG.stepY };
}

function sosedi(row, col, phase = 0) {
  let diagonal = -1;
  if ((row + phase) % 2 === 1) diagonal = 1;
  const cells = [
    [row, col - 1], [row, col + 1],
    [row - 1, col], [row - 1, col + diagonal],
    [row + 1, col], [row + 1, col + diagonal],
  ];
  const result = [];
  for (const cell of cells) {
    if (proveritYacheyku(cell[0], cell[1])) result.push(cell);
  }
  return result;
}

function napravlenie(x, y) {
  // Пушка и прицел используют один угол, не больше 72 градусов от вертикали
  const angle = Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4,
    Math.atan2(x - CONFIG.shooterX, Math.max(60, CONFIG.shooterY - y))));
  return { x: Math.sin(angle), y: -Math.cos(angle), angle: angle };
}

function sozdatPole(random = Math.random) {
  // В таблице по ключу «ряд,столбец» лежат данные шарика
  return { cells: new Map(), phase: 0, nextId: 1, random: random };
}

function sluchaynyyCvet(pole) {
  return Math.floor(pole.random() * COLORS.length);
}

function dobavitSharik(pole, row, col, color) {
  if (!proveritYacheyku(row, col) || pole.cells.has(klyuch(row, col))) {
    throw new Error('Недопустимая ячейка');
  }
  if (!Number.isInteger(color) || color < 0 || color >= COLORS.length) {
    throw new Error('Недопустимый цвет');
  }
  const bubble = { id: pole.nextId, row: row, col: col, color: color };
  pole.nextId++;
  pole.cells.set(klyuch(row, col), bubble);
  return bubble;
}

function polozhenie(pole, bubble) {
  return koordinaty(bubble.row, bubble.col, pole.phase);
}

function estOpora(pole, row, col) {
  const nearby = sosedi(row, col, pole.phase);
  for (const cell of nearby) {
    if (cell[0] === row - 1 && pole.cells.has(klyuch(cell[0], cell[1]))) return true;
  }
  return false;
}

function nachalnoePole(pole) {
  pole.cells.clear();
  pole.phase = 0;
  pole.nextId = 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < CONFIG.columns; col++) {
      const supported = row === 0 || estOpora(pole, row, col);
      if (supported && (row === 0 || pole.random() < 0.8)) {
        dobavitSharik(pole, row, col, sluchaynyyCvet(pole));
      }
    }
  }
}

function naytiGruppu(pole, row, col) {
  const start = pole.cells.get(klyuch(row, col));
  if (!start) return [];
  const visited = {};
  const stack = [[row, col]];
  const result = [];

  // Берём ячейку и добавляем её соседей в список для проверки.
  while (stack.length > 0) {
    const cell = stack.pop();
    const cellKey = klyuch(cell[0], cell[1]);
    if (visited[cellKey]) continue;
    visited[cellKey] = true;
    const bubble = pole.cells.get(cellKey);
    if (!bubble || bubble.color !== start.color) continue;
    result.push(bubble);
    for (const next of sosedi(cell[0], cell[1], pole.phase)) stack.push(next);
  }
  return result;
}

function naytiOtorvannye(pole) {
  const connected = {};
  const stack = [];
  for (const bubble of pole.cells.values()) {
    if (bubble.row === 0) stack.push([bubble.row, bubble.col]);
  }

  // Сначала отмечаем всё, что соединено с потолком.
  while (stack.length > 0) {
    const cell = stack.pop();
    const cellKey = klyuch(cell[0], cell[1]);
    if (connected[cellKey] || !pole.cells.has(cellKey)) continue;
    connected[cellKey] = true;
    for (const next of sosedi(cell[0], cell[1], pole.phase)) stack.push(next);
  }
  const result = [];
  for (const bubble of pole.cells.values()) {
    if (!connected[klyuch(bubble.row, bubble.col)]) result.push(bubble);
  }
  return result;
}

function lopnutGruppu(pole, row, col) {
  const group = naytiGruppu(pole, row, col);
  if (group.length < 3) return [];
  const removed = [];
  for (const bubble of group) {
    const p = polozhenie(pole, bubble);
    removed.push({ bubble: bubble, x: p.x, y: p.y, points: 10, falling: false });
    pole.cells.delete(klyuch(bubble.row, bubble.col));
  }
  for (const bubble of naytiOtorvannye(pole)) {
    const p = polozhenie(pole, bubble);
    removed.push({ bubble: bubble, x: p.x, y: p.y, points: 15, falling: true });
    pole.cells.delete(klyuch(bubble.row, bubble.col));
  }
  return removed;
}

function opustitPole(pole) {
  // Меняем фазу вместе с рядами, иначе шарики сдвинутся ещё и вбок.
  pole.phase = 1 - pole.phase;
  const shifted = new Map();
  for (const bubble of pole.cells.values()) {
    bubble.row++;
    shifted.set(klyuch(bubble.row, bubble.col), bubble);
  }
  pole.cells = shifted;
  for (let col = 0; col < CONFIG.columns; col++) {
    if (pole.random() < 0.78) dobavitSharik(pole, 0, col, sluchaynyyCvet(pole));
  }
  for (const bubble of pole.cells.values()) {
    if (bubble.row === 1 && !estOpora(pole, bubble.row, bubble.col)) {
      dobavitSharik(pole, 0, bubble.col, sluchaynyyCvet(pole));
    }
  }
  for (const bubble of pole.cells.values()) {
    if (bubble.row === 0) return;
  }
  dobavitSharik(pole, 0, 7, sluchaynyyCvet(pole));
}

function dostigliLinii(pole) {
  for (const bubble of pole.cells.values()) {
    if (polozhenie(pole, bubble).y + CONFIG.radius >= CONFIG.dangerY) return true;
  }
  return false;
}

function cvetaNaPole(pole) {
  const result = [];
  for (const bubble of pole.cells.values()) {
    if (!result.includes(bubble.color)) result.push(bubble.color);
  }
  return result;
}

function stolknovenie(pole, x, y) {
  let nearest = null;
  let distance = CONFIG.radius * 2;
  for (const bubble of pole.cells.values()) {
    const p = polozhenie(pole, bubble);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d <= distance) {
      distance = d;
      nearest = bubble;
    }
  }
  return nearest;
}

function mozhnoZakrepit(pole, row, col, x, y, contacts, from) {
  if (pole.cells.has(klyuch(row, col))) return false;
  const target = koordinaty(row, col, pole.phase);
  if (Math.hypot(target.x - x, target.y - y) > CONFIG.stepX * 1.5) return false;

  // Не даём попасть на обратную сторону шарика, в закрытую полость.
  for (const bubble of contacts) {
    const p = polozhenie(pole, bubble);
    const outward = (target.x - p.x) * (from.x - p.x) + (target.y - p.y) * (from.y - p.y);
    if (outward < -1) return false;
  }

  const vx = target.x - from.x;
  const vy = target.y - from.y;
  const lengthSquared = vx * vx + vy * vy;
  const clearance = CONFIG.radius * 2 * Math.sqrt(3) / 2 - 0.8;
  for (const bubble of pole.cells.values()) {
    const p = polozhenie(pole, bubble);
    let t = 0;
    if (lengthSquared !== 0) {
      t = ((p.x - from.x) * vx + (p.y - from.y) * vy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
    }
    // Разрешаем немного скользить по краю, но не проходить сквозь шарик.
    if (Math.hypot(from.x + t * vx - p.x, from.y + t * vy - p.y) < clearance) return false;
  }
  return true;
}

function mestoPopadaniya(pole, x, y, hit, from) {
  const contacts = [];
  const candidates = [];
  const checked = {};

  if (hit) {
    for (const bubble of pole.cells.values()) {
      const p = polozhenie(pole, bubble);
      if (Math.hypot(p.x - x, p.y - y) <= CONFIG.radius * 2 + 3) contacts.push(bubble);
    }
    for (const bubble of contacts) {
      for (const cell of sosedi(bubble.row, bubble.col, pole.phase)) candidates.push(cell);
    }
  } else {
    // При попадании в потолок ищем место в верхнем ряду.
    for (let col = 0; col < CONFIG.columns; col++) candidates.push([0, col]);
  }

  let bestCell = null;
  let bestDistance = Infinity;
  for (const cell of candidates) {
    const cellKey = klyuch(cell[0], cell[1]);
    if (checked[cellKey]) continue;
    checked[cellKey] = true;
    if (!mozhnoZakrepit(pole, cell[0], cell[1], x, y, contacts, from)) continue;
    const p = koordinaty(cell[0], cell[1], pole.phase);
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCell = cell;
    }
  }
  return bestCell;
}

// Только для запуска проверок правил в Node.js.
if (typeof module !== 'undefined') {
  module.exports = {
    CONFIG, COLORS, klyuch, koordinaty, sosedi, napravlenie, sozdatPole,
    dobavitSharik, polozhenie, sluchaynyyCvet, nachalnoePole, naytiGruppu,
    naytiOtorvannye, lopnutGruppu, opustitPole, dostigliLinii, cvetaNaPole,
    stolknovenie, mestoPopadaniya,
  };
}
