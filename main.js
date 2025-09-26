const STORAGE_KEY = 'dnd-state-v1';
const RESOURCE_KEYS = ['service', 'revenue', 'order', 'burnout'];
const DEFAULT_RESOURCE_VALUE = 5;
const RESOURCE_MIN = 0;
const RESOURCE_MAX = 10;

let cardList = [];
let cardMap = new Map();
let state = null;
let loading = true;
let isAnimating = false;

const elements = {
  title: document.getElementById('card-title'),
  text: document.getElementById('card-text'),
  image: document.getElementById('card-image'),
  cardImageContainer: document.querySelector('.card-image'),
  card: document.getElementById('card'),
  leftButton: document.getElementById('left-button'),
  rightButton: document.getElementById('right-button'),
  status: document.getElementById('status-message'),
  reset: document.getElementById('reset-button'),
  resourceBars: Array.from(document.querySelectorAll('.resource')),
};

document.addEventListener('DOMContentLoaded', () => {
  init();
  setupInteractions();
});

function setupInteractions() {
  elements.leftButton.addEventListener('click', () => handleChoice('left'));
  elements.rightButton.addEventListener('click', () => handleChoice('right'));
  elements.reset.addEventListener('click', resetGame);

  let startX = null;
  let isSwiping = false;

  elements.card.addEventListener('touchstart', (event) => {
    if (state?.gameOver || loading || isAnimating) return;
    startX = event.changedTouches[0].clientX;
    isSwiping = true;
  });

  elements.card.addEventListener('touchend', (event) => {
    if (!isSwiping || startX === null) return;
    const endX = event.changedTouches[0].clientX;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) > 40) {
      handleChoice(deltaX < 0 ? 'left' : 'right');
    }
    startX = null;
    isSwiping = false;
  });

  elements.card.addEventListener('touchcancel', () => {
    startX = null;
    isSwiping = false;
  });
}

async function init() {
  try {
    const response = await fetch('cards.json');
    cardList = await response.json();
    cardMap = new Map(cardList.map((card) => [card.id, card]));
  } catch (error) {
    console.error('Не удалось загрузить карты', error);
    elements.status.textContent = 'Ошибка загрузки карточек.';
    loading = false;
    return;
  }

  state = loadState();
  if (!state || !Array.isArray(state.deck) || state.deck.length === 0) {
    state = createInitialState();
  }
  loading = false;
  updateResources();
  renderCard();
}

function createInitialState() {
  const deck = shuffle(cardList.map((card) => card.id));
  return {
    resources: RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = DEFAULT_RESOURCE_VALUE;
      return acc;
    }, {}),
    day: 1,
    deck,
    flags: {},
    currentCardId: null,
    gameOver: false,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Не удалось считать состояние', error);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Не удалось сохранить состояние', error);
  }
}

function updateResources() {
  elements.resourceBars.forEach((resourceElement) => {
    const key = resourceElement.dataset.key;
    const value = state.resources[key];
    const percent = Math.max(RESOURCE_MIN, Math.min(value, RESOURCE_MAX)) / RESOURCE_MAX * 100;
    resourceElement.querySelector('.fill').style.width = `${percent}%`;
    resourceElement.querySelector('.value').textContent = value;
  });
}

function meetsConditions(card) {
  const { conditions } = card;
  if (!conditions) return true;
  if (conditions.day_min && state.day < conditions.day_min) return false;
  if (conditions.day_max && state.day > conditions.day_max) return false;
  if (conditions.requires_flags) {
    for (const [flag, expected] of Object.entries(conditions.requires_flags)) {
      if (state.flags[flag] !== expected) {
        return false;
      }
    }
  }
  if (conditions.forbid_flags) {
    for (const [flag, forbidden] of Object.entries(conditions.forbid_flags)) {
      if (state.flags[flag] === forbidden) {
        return false;
      }
    }
  }
  return true;
}

function drawNextCard() {
  if (!state.deck || state.deck.length === 0) {
    // Replenish with all cards that might still be relevant
    state.deck = shuffle(cardList.map((card) => card.id));
  }

  let attempts = state.deck.length;
  while (attempts > 0 && state.deck.length > 0) {
    const nextId = state.deck.shift();
    const card = cardMap.get(nextId);
    if (!card) {
      attempts--;
      continue;
    }
    if (meetsConditions(card)) {
      state.currentCardId = nextId;
      saveState();
      renderCard();
      return;
    }
    state.deck.push(nextId);
    attempts--;
  }

  state.currentCardId = null;
  elements.title.textContent = 'Новая неделя';
  elements.text.textContent = 'Все спокойно. Наслаждайтесь паузой или начните новую смену!';
  elements.cardImageContainer.style.display = 'none';
  elements.image.removeAttribute('src');
  elements.image.alt = '';
  elements.leftButton.textContent = 'Ждать';
  elements.rightButton.textContent = 'Играть';
  elements.status.textContent = 'Подходящих карточек нет — обновите смену.';
  disableChoices(true);
  saveState();
  playCardEnterAnimation();
}

function renderCard() {
  if (!state.currentCardId) {
    drawNextCard();
    return;
  }
  const card = cardMap.get(state.currentCardId);
  if (!card) {
    drawNextCard();
    return;
  }
  disableChoices(state.gameOver);
  elements.title.textContent = card.title;
  elements.text.textContent = card.text;
  if (card.image) {
    elements.cardImageContainer.style.display = 'block';
    elements.image.src = card.image;
    elements.image.alt = card.title;
  } else {
    elements.cardImageContainer.style.display = 'none';
    elements.image.removeAttribute('src');
    elements.image.alt = '';
  }
  elements.leftButton.textContent = card.choices.left.label;
  elements.rightButton.textContent = card.choices.right.label;
  elements.status.textContent = `День ${state.day}`;
  updateResources();
  saveState();
  playCardEnterAnimation();
}

function disableChoices(disabled) {
  elements.leftButton.disabled = disabled;
  elements.rightButton.disabled = disabled;
}

async function handleChoice(side) {
  if (loading || state.gameOver || isAnimating) return;
  const card = cardMap.get(state.currentCardId);
  if (!card) return;
  const choice = card.choices[side];
  if (!choice) return;

  isAnimating = true;
  disableChoices(true);

  await playSwipeAnimation(side);

  applyEffects(choice.effects);
  applyFlags(choice.flags_set);
  applyDeckChanges(choice.adds, choice.removes);

  state.day += 1;
  updateResources();
  saveState();

  if (checkDefeat()) {
    renderCard();
    isAnimating = false;
    return;
  }

  state.currentCardId = null;
  saveState();
  drawNextCard();
  isAnimating = false;
}

function applyEffects(effects = {}) {
  RESOURCE_KEYS.forEach((key) => {
    const delta = effects[key] ?? 0;
    state.resources[key] = clamp(state.resources[key] + delta, RESOURCE_MIN, RESOURCE_MAX);
  });
}

function applyFlags(flags = {}) {
  Object.entries(flags).forEach(([flag, value]) => {
    state.flags[flag] = value;
  });
}

function applyDeckChanges(adds = [], removes = []) {
  const uniqueAdds = adds.filter((id) => !state.deck.includes(id));
  uniqueAdds.forEach((id) => state.deck.push(id));
  if (removes.length) {
    state.deck = state.deck.filter((id) => !removes.includes(id));
  }
}

function checkDefeat() {
  const depleted = RESOURCE_KEYS.find((key) => state.resources[key] <= RESOURCE_MIN);
  if (depleted) {
    state.gameOver = true;
    disableChoices(true);
    elements.status.textContent = `Ресурс «${translateResource(depleted)}» исчерпан. Смена окончена.`;
    saveState();
    return true;
  }
  return false;
}

function translateResource(key) {
  switch (key) {
    case 'service':
      return 'Сервис';
    case 'revenue':
      return 'Доход';
    case 'order':
      return 'Порядок';
    case 'burnout':
      return 'Выгорание';
    default:
      return key;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function playSwipeAnimation(direction) {
  return new Promise((resolve) => {
    const cardElement = elements.card;
    const className = direction === 'left' ? 'card--swipe-left' : 'card--swipe-right';
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      cardElement.classList.remove(className);
      resolve();
    };

    const onAnimationEnd = (event) => {
      if (event.target !== cardElement) return;
      cardElement.removeEventListener('animationend', onAnimationEnd);
      cleanup();
    };

    cardElement.addEventListener('animationend', onAnimationEnd);
    requestAnimationFrame(() => {
      cardElement.classList.remove('card--enter');
      cardElement.classList.add(className);
    });

    setTimeout(() => {
      cardElement.removeEventListener('animationend', onAnimationEnd);
      cleanup();
    }, 650);
  });
}

function playCardEnterAnimation() {
  const cardElement = elements.card;
  cardElement.classList.remove('card--enter');
  void cardElement.offsetWidth;
  cardElement.classList.add('card--enter');
}

function resetGame() {
  state = createInitialState();
  elements.status.textContent = 'Смена сброшена. Удачи!';
  disableChoices(false);
  updateResources();
  drawNextCard();
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
