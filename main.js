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
const SWIPE_TRIGGER_DISTANCE = 70;
const MAX_DRAG_DISTANCE = 180;

const gestureState = {
  active: false,
  pointerId: null,
  startX: 0,
  lastX: 0,
};

const elements = {
  title: document.getElementById('card-title'),
  text: document.getElementById('card-text'),
  image: document.getElementById('card-image'),
  cardImageContainer: document.querySelector('.card-image'),
  card: document.getElementById('card'),
  hintLeft: document.getElementById('hint-left'),
  hintRight: document.getElementById('hint-right'),
  status: document.getElementById('status-message'),
  reset: document.getElementById('reset-button'),
  resourceBars: Array.from(document.querySelectorAll('.resource')),
};

document.addEventListener('DOMContentLoaded', () => {
  init();
  setupInteractions();
});

function setupInteractions() {
  elements.reset.addEventListener('click', resetGame);

  elements.card.addEventListener('pointerdown', onPointerDown);
  elements.card.addEventListener('pointermove', onPointerMove);
  elements.card.addEventListener('pointerup', onPointerUp);
  elements.card.addEventListener('pointercancel', onPointerCancel);
  elements.card.addEventListener('lostpointercapture', onPointerCancel);
}

function onPointerDown(event) {
  if (!event.isPrimary || loading || state?.gameOver || isAnimating) return;
  gestureState.active = true;
  gestureState.pointerId = event.pointerId;
  gestureState.startX = event.clientX;
  gestureState.lastX = event.clientX;
  elements.card.setPointerCapture(event.pointerId);
  elements.card.classList.add('card--dragging');
  elements.card.style.transition = 'none';
  event.preventDefault();
}

function onPointerMove(event) {
  if (!gestureState.active || event.pointerId !== gestureState.pointerId) return;
  gestureState.lastX = event.clientX;
  applyDrag(gestureState.lastX - gestureState.startX);
}

function onPointerUp(event) {
  if (!gestureState.active || event.pointerId !== gestureState.pointerId) return;
  finishGesture(event.clientX - gestureState.startX);
}

function onPointerCancel(event) {
  if (!gestureState.active || (event.pointerId && event.pointerId !== gestureState.pointerId)) return;
  finishGesture(0);
}

function finishGesture(deltaX) {
  const card = elements.card;
  if (gestureState.pointerId !== null) {
    try {
      card.releasePointerCapture(gestureState.pointerId);
    } catch (error) {
      // ignore release errors (browser may already release capture)
    }
  }
  gestureState.active = false;
  gestureState.pointerId = null;
  card.classList.remove('card--dragging');

  if (loading || state?.gameOver || isAnimating) {
    resetCardPosition();
    clearHintActive();
    return;
  }

  if (Math.abs(deltaX) >= SWIPE_TRIGGER_DISTANCE) {
    clearHintActive();
    handleChoice(deltaX < 0 ? 'left' : 'right');
  } else {
    resetCardPosition();
  }
}

function applyDrag(deltaX) {
  const card = elements.card;
  const clamped = clamp(deltaX, -MAX_DRAG_DISTANCE, MAX_DRAG_DISTANCE);
  const width = window.innerWidth || card.offsetWidth || 1;
  const progress = clamp(clamped / (width * 0.45), -1, 1);

  card.style.transition = 'none';
  const rotationZ = progress * 14;
  const rotationY = progress * 20;
  const rotationX = -progress * 6;
  const translateY = progress * -26;
  const translateZ = Math.abs(progress) * -30;
  const scale = 1 - Math.min(Math.abs(progress) * 0.04, 0.07);
  card.style.transform = `translate3d(${clamped}px, ${translateY}px, ${translateZ}px) rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotate(${rotationZ}deg) scale(${scale})`;
  card.style.opacity = `${1 - Math.min(Math.abs(progress) * 0.32, 0.32)}`;

  updateHintActivity(progress);
}

function resetCardPosition() {
  const card = elements.card;
  card.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
  card.style.transform = '';
  card.style.opacity = '';
  clearHintActive();

  const handleTransitionEnd = (event) => {
    if (event.target !== card) return;
    card.style.transition = '';
  };

  card.addEventListener('transitionend', handleTransitionEnd, { once: true });
}

function clearHintActive() {
  elements.hintLeft.classList.remove('hint--active');
  elements.hintRight.classList.remove('hint--active');
}

function setHintContent(element, directionLabel, actionLabel = '') {
  const trimmedAction = actionLabel?.trim?.() ?? '';
  const labelText = trimmedAction ? `${directionLabel}: ${trimmedAction}` : directionLabel;
  if (trimmedAction) {
    element.dataset.label = trimmedAction;
  } else {
    delete element.dataset.label;
  }
  element.setAttribute('aria-label', labelText);
  if (trimmedAction) {
    element.title = labelText;
  } else {
    element.removeAttribute('title');
  }
}

function updateHintActivity(progress) {
  if (progress <= -0.2) {
    elements.hintLeft.classList.add('hint--active');
    elements.hintRight.classList.remove('hint--active');
  } else if (progress >= 0.2) {
    elements.hintRight.classList.add('hint--active');
    elements.hintLeft.classList.remove('hint--active');
  } else {
    clearHintActive();
  }
}

function updateHintLabels(card) {
  if (!card) {
    setHintContent(elements.hintLeft, 'Свайп влево');
    setHintContent(elements.hintRight, 'Свайп вправо');
    return;
  }

  const leftLabel = card.choices?.left?.label ?? '';
  const rightLabel = card.choices?.right?.label ?? '';

  setHintContent(elements.hintLeft, 'Влево', leftLabel);
  setHintContent(elements.hintRight, 'Вправо', rightLabel);
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
  elements.cardImageContainer.classList.remove('card-image--placeholder');
  elements.image.hidden = true;
  elements.image.removeAttribute('src');
  elements.image.alt = '';
  setHintContent(elements.hintLeft, 'Свайп влево', 'Пауза');
  setHintContent(elements.hintRight, 'Свайп вправо', 'Новая смена');
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
  const hasImage = Boolean(card.image);
  elements.cardImageContainer.style.display = '';
  elements.cardImageContainer.classList.toggle('card-image--placeholder', !hasImage);
  if (hasImage) {
    elements.image.hidden = false;
    elements.image.src = card.image;
    elements.image.alt = card.title;
  } else {
    elements.image.hidden = true;
    elements.image.removeAttribute('src');
    elements.image.alt = '';
  }
  updateHintLabels(card);
  elements.status.textContent = `День ${state.day}`;
  updateResources();
  saveState();
  playCardEnterAnimation();
}

function disableChoices(disabled) {
  elements.card.classList.toggle('card--locked', disabled);
  [elements.hintLeft, elements.hintRight].forEach((hint) => {
    hint.classList.toggle('hint--disabled', disabled);
  });
  if (disabled) {
    clearHintActive();
  }
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
    const width = window.innerWidth || cardElement.offsetWidth || 1;
    const offsetX = direction === 'left' ? -width * 1.25 : width * 1.25;
    const rotateZ = direction === 'left' ? -32 : 32;
    const rotateY = direction === 'left' ? -48 : 48;
    const rotateX = direction === 'left' ? 14 : -14;
    const offsetY = -70;
    const offsetZ = -120;

    const cleanup = () => {
      cardElement.style.transition = '';
      cardElement.style.transform = '';
      cardElement.style.opacity = '';
      cardElement.removeEventListener('transitionend', onTransitionEnd);
      resolve();
    };

    const onTransitionEnd = (event) => {
      if (event.target !== cardElement) return;
      cleanup();
    };

    cardElement.removeEventListener('transitionend', onTransitionEnd);
    cardElement.addEventListener('transitionend', onTransitionEnd);

    requestAnimationFrame(() => {
      cardElement.style.transition = 'transform 0.55s cubic-bezier(0.22, 0.71, 0.35, 1), opacity 0.5s ease';
      cardElement.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${offsetZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotateZ}deg) scale(0.86)`;
      cardElement.style.opacity = '0';
    });

    setTimeout(cleanup, 600);
  });
}

function playCardEnterAnimation() {
  const cardElement = elements.card;
  cardElement.style.transition = '';
  cardElement.style.transform = '';
  cardElement.style.opacity = '';
  cardElement.classList.remove('card--dragging');
  clearHintActive();
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
