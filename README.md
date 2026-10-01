# Bubble Pop

Браузерная игра на JavaScript и **CreateJS**. Собирайте группы из трёх и более шариков одного цвета, набирайте очки и не дайте полю опуститься до красной линии.

**[Играть онлайн](https://dydojopka.github.io/Bubble-pop/)**

Прицел - мышью, выстрел - ЛКМ или пробелом.

## Структура проекта

```text
Bubble-pop/
├── index.html             # Страница и интерфейс
├── style.css              # Оформление
├── game-core.js           # Настройки, сетка и правила
├── game.js                # Отрисовка, управление и анимации
├── vendor/
│   └── createjs.min.js     # Библиотека CreateJS
└── README.md
```

## Локальный запуск

```sh
git clone https://github.com/dydojopka/Bubble-pop.git
cd Bubble-pop
```

Откройте `index.html` в браузере.

Или запустите локальный сервер (нужен Python 3):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Игра будет доступна по адресу <http://localhost:8000>.
