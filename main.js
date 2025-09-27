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
let nextCardId = null;
const HINT_ACTIVE_CLASS = 'swipe-indicator--active';
const HINT_DISABLED_CLASS = 'swipe-indicator--disabled';

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
  cardImageContainer: document.querySelector('#card .card-image'),
  card: document.getElementById('card'),
  previewCard: document.getElementById('card-preview'),
  previewTitle: document.getElementById('card-preview-title'),
  previewText: document.getElementById('card-preview-text'),
  previewImage: document.getElementById('card-preview-image'),
  previewImageContainer: document.querySelector('#card-preview .card-image'),
  cardStack: document.querySelector('.card-stack'),
  hintLeft: document.getElementById('hint-left'),
  hintRight: document.getElementById('hint-right'),
  status: document.getElementById('status-message'),
  reset: document.getElementById('reset-button'),
  resourceBars: Array.from(document.querySelectorAll('.resource')),
};

elements.hintLeftLabel = elements.hintLeft?.querySelector('.swipe-indicator__label');
elements.hintRightLabel = elements.hintRight?.querySelector('.swipe-indicator__label');

const cardViews = {
  current: {
    card: elements.card,
    title: elements.title,
    text: elements.text,
    image: elements.image,
    imageContainer: elements.cardImageContainer,
  },
  preview: {
    card: elements.previewCard,
    title: elements.previewTitle,
    text: elements.previewText,
    image: elements.previewImage,
    imageContainer: elements.previewImageContainer,
  },
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
  const rotationY = progress * 24;
  const rotationX = -progress * 8;
  const translateY = progress * -32;
  const translateZ = Math.abs(progress) * -46;
  const scale = 1 - Math.min(Math.abs(progress) * 0.05, 0.08);
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
  if (elements.hintLeft) {
    elements.hintLeft.classList.remove(HINT_ACTIVE_CLASS);
  }
  if (elements.hintRight) {
    elements.hintRight.classList.remove(HINT_ACTIVE_CLASS);
  }
}

function setHintContent(element, directionLabel, actionLabel = '', options = {}) {
  if (!element) return;
  const { ariaDirection = directionLabel } = options;
  const labelSpan =
    element === elements.hintLeft
      ? elements.hintLeftLabel
      : element === elements.hintRight
      ? elements.hintRightLabel
      : element.querySelector('.swipe-indicator__label');

  const trimmedAction = actionLabel?.trim?.() ?? '';
  if (labelSpan) {
    labelSpan.textContent = trimmedAction;
  }

  const parts = [];
  if (ariaDirection) {
    parts.push(ariaDirection);
  }
  if (trimmedAction) {
    parts.push(trimmedAction);
  }
  const labelText = parts.join(': ');
  if (labelText) {
    element.setAttribute('aria-label', labelText);
    element.title = labelText;
  } else if (ariaDirection) {
    element.setAttribute('aria-label', ariaDirection);
    element.removeAttribute('title');
  } else {
    element.removeAttribute('aria-label');
    element.removeAttribute('title');
  }
}

function updateHintActivity(progress) {
  if (!elements.hintLeft || !elements.hintRight) return;
  if (progress <= -0.2) {
    elements.hintLeft.classList.add(HINT_ACTIVE_CLASS);
    elements.hintRight.classList.remove(HINT_ACTIVE_CLASS);
  } else if (progress >= 0.2) {
    elements.hintRight.classList.add(HINT_ACTIVE_CLASS);
    elements.hintLeft.classList.remove(HINT_ACTIVE_CLASS);
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

  setHintContent(elements.hintLeft, 'Свайп влево', leftLabel, {
    ariaDirection: 'Свайп влево',
  });
  setHintContent(elements.hintRight, 'Свайп вправо', rightLabel, {
    ariaDirection: 'Свайп вправо',
  });
}

function clearCardView(view) {
  if (!view) return;
  if (view.title) view.title.textContent = '';
  if (view.text) view.text.textContent = '';
  if (view.image) {
    view.image.hidden = true;
    view.image.removeAttribute('src');
    view.image.alt = '';
  }
  if (view.imageContainer) {
    view.imageContainer.style.display = 'none';
    view.imageContainer.classList.remove('card-image--placeholder');
  }
}

function setCardContent(view, card) {
  if (!view) return;
  if (!card) {
    clearCardView(view);
    return;
  }

  if (view.title) view.title.textContent = card.title ?? '';
  if (view.text) view.text.textContent = card.text ?? '';

  const hasImage = Boolean(card.image);
  if (view.imageContainer) {
    view.imageContainer.style.display = '';
    view.imageContainer.classList.toggle('card-image--placeholder', !hasImage);
  }
  if (view.image) {
    if (hasImage) {
      view.image.hidden = false;
      view.image.src = card.image;
      view.image.alt = card.title ?? '';
    } else {
      view.image.hidden = true;
      view.image.removeAttribute('src');
      view.image.alt = '';
    }
  }
}

function updatePreviewCardView(card) {
  if (!card) {
    clearCardView(cardViews.preview);
    if (cardViews.preview.card) {
      cardViews.preview.card.classList.remove('card--visible');
    }
    return;
  }

  setCardContent(cardViews.preview, card);
  if (cardViews.preview.card) {
    cardViews.preview.card.classList.add('card--visible');
  }
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

function ensureDeckHasCards() {
  if (!Array.isArray(state.deck)) {
    state.deck = [];
  }
  if (state.deck.length === 0) {
    state.deck = shuffle(cardList.map((card) => card.id));
  }
}

function pullNextCardId() {
  ensureDeckHasCards();
  let attempts = state.deck.length;
  while (attempts > 0 && state.deck.length > 0) {
    const nextId = state.deck.shift();
    const card = cardMap.get(nextId);
    if (!card) {
      attempts -= 1;
      continue;
    }
    if (meetsConditions(card)) {
      return nextId;
    }
    state.deck.push(nextId);
    attempts -= 1;
  }
  return null;
}

function peekNextCardId() {
  ensureDeckHasCards();
  const deckCopy = [...state.deck];
  let attempts = deckCopy.length;
  while (attempts > 0 && deckCopy.length > 0) {
    const nextId = deckCopy.shift();
    const card = cardMap.get(nextId);
    if (!card) {
      attempts -= 1;
      continue;
    }
    if (meetsConditions(card)) {
      return nextId;
    }
    deckCopy.push(nextId);
    attempts -= 1;
  }
  return null;
}

function showNoCardsState({ skipAnimation = false } = {}) {
  state.currentCardId = null;
  clearCardView(cardViews.current);
  if (cardViews.current.title) {
    cardViews.current.title.textContent = 'Новая неделя';
  }
  if (cardViews.current.text) {
    cardViews.current.text.textContent = 'Все спокойно. Наслаждайтесь паузой или начните новую смену!';
  }
  updatePreviewCardView(null);
  nextCardId = null;
  setHintContent(elements.hintLeft, 'Свайп влево', 'Пауза');
  setHintContent(elements.hintRight, 'Свайп вправо', 'Новая смена');
  elements.status.textContent = 'Подходящих карточек нет — обновите смену.';
  disableChoices(true);
  saveState();
  if (!skipAnimation) {
    playCardEnterAnimation();
  }
}

function renderCard(options = {}) {
  const { skipAnimation = false } = options;

  if (!state.currentCardId && !state.gameOver) {
    state.currentCardId = pullNextCardId();
  }

  const card = state.currentCardId ? cardMap.get(state.currentCardId) : null;
  if (!card) {
    showNoCardsState({ skipAnimation });
    return;
  }

  setCardContent(cardViews.current, card);
  updateHintLabels(card);

  if (state.gameOver) {
    disableChoices(true);
  } else {
    disableChoices(false);
    elements.status.textContent = `День ${state.day}`;
  }

  updateResources();

  if (state.gameOver) {
    nextCardId = null;
    updatePreviewCardView(null);
  } else {
    nextCardId = peekNextCardId();
    const previewCard = nextCardId ? cardMap.get(nextCardId) : null;
    updatePreviewCardView(previewCard);
  }

  saveState();

  if (!skipAnimation) {
    playCardEnterAnimation();
  }
}

function disableChoices(disabled) {
  elements.card.classList.toggle('card--locked', disabled);
  [elements.hintLeft, elements.hintRight].forEach((hint) => {
    if (!hint) return;
    hint.classList.toggle(HINT_DISABLED_CLASS, disabled);
  });
  if (disabled) {
    clearHintActive();
  }
}

async function handleChoice(side) {
  if (loading || state.gameOver || isAnimating) return;
  const card = cardMap.get(state.currentCardId);
  if (!card) return;
  const choice = card.choices?.[side];
  if (!choice) return;

  isAnimating = true;
  disableChoices(true);

  const cardElement = elements.card;
  cardElement.style.transition = '';
  cardElement.style.transform = '';
  cardElement.style.opacity = '';

  let incomingCard = null;
  let upcomingPreviewCard = null;
  let postAnimationAction = null;

  applyEffects(choice.effects);
  applyFlags(choice.flags_set);
  applyDeckChanges(choice.adds, choice.removes);

  state.day += 1;
  updateResources();

  const defeated = checkDefeat();

  if (defeated || state.gameOver) {
    nextCardId = null;
    updatePreviewCardView(null);
    postAnimationAction = () => {
      cardElement.style.visibility = '';
      renderCard({ skipAnimation: true });
    };
  } else {
    const nextCurrentId = pullNextCardId();
    const previewId = peekNextCardId();
    nextCardId = previewId;
    incomingCard = nextCurrentId ? cardMap.get(nextCurrentId) : null;
    upcomingPreviewCard = previewId ? cardMap.get(previewId) : null;

    if (incomingCard) {
      state.currentCardId = nextCurrentId;
      updatePreviewCardView(incomingCard);
      postAnimationAction = () => {
        cardElement.style.visibility = '';
        setCardContent(cardViews.current, incomingCard);
        updateHintLabels(incomingCard);
        elements.status.textContent = `День ${state.day}`;
        updatePreviewCardView(upcomingPreviewCard);
        disableChoices(false);
        saveState();
        playCardEnterAnimation();
      };
    } else {
      updatePreviewCardView(null);
      postAnimationAction = () => {
        cardElement.style.visibility = '';
        showNoCardsState({ skipAnimation: true });
      };
    }
  }

  try {
    await playSwipeAnimation(cardElement, side);
  } catch (error) {
    console.warn('Swipe animation did not finish as expected', error);
  }

  try {
    postAnimationAction?.();
  } finally {
    if (cardElement) {
      cardElement.style.visibility = '';
    }
    isAnimating = false;
  }
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

function playSwipeAnimation(cardElement, direction) {
  return new Promise((resolve) => {
    const target = cardElement || elements.card;
    if (!target) {
      resolve();
      return;
    }

    const computedStyle = window.getComputedStyle(target);
    const startTransform = target.style.transform || computedStyle.transform || 'none';
    const startOpacity = parseFloat(target.style.opacity || computedStyle.opacity || '1');
    const width = window.innerWidth || target.offsetWidth || 1;
    const travelX = width * 1.35;
    const offsetX = direction === 'left' ? -travelX : travelX;
    const tiltY = direction === 'left' ? -42 : 42;
    const tiltZ = direction === 'left' ? -36 : 36;
    const tiltX = direction === 'left' ? 18 : -18;
    const previousOrigin = target.style.transformOrigin;

    const finalize = () => {
      target.style.visibility = 'hidden';
      target.style.transition = '';
      target.style.transform = '';
      target.style.opacity = '';
      target.style.transformOrigin = previousOrigin;
      resolve();
    };

    if (typeof target.animate !== 'function') {
      const rotateZ = direction === 'left' ? -36 : 36;
      const offsetY = -110;
      const offsetZ = -180;
      target.style.transition = 'transform 0.55s cubic-bezier(0.22, 0.71, 0.35, 1), opacity 0.5s ease';
      target.style.transformOrigin = '50% 60%';
      target.style.transform = `translate3d(${offsetX}px, ${offsetY}px, ${offsetZ}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotate(${rotateZ}deg) scale(0.78)`;
      target.style.opacity = '0';
      window.setTimeout(finalize, 580);
      return;
    }

    target.style.transition = 'none';
    target.style.transformOrigin = '50% 60%';

    const animation = target.animate(
      [
        {
          transform: startTransform === 'none' ? 'translate3d(0, 0, 0)' : startTransform,
          opacity: startOpacity,
        },
        {
          transform: `translate3d(${offsetX * 0.35}px, -40px, -90px) rotateX(${tiltX * 0.6}deg) rotateY(${tiltY * 0.7}deg) rotate(${tiltZ * 0.8}deg) scale(0.92)`,
          opacity: Math.max(startOpacity - 0.2, 0.7),
          offset: 0.45,
        },
        {
          transform: `translate3d(${offsetX}px, -150px, -210px) rotateX(${tiltX}deg) rotateY(${tiltY * 1.25}deg) rotate(${tiltZ * 1.4}deg) scale(0.72)`,
          opacity: 0,
        },
      ],
      {
        duration: 620,
        easing: 'cubic-bezier(0.23, 0.76, 0.38, 1)',
        fill: 'forwards',
      }
    );

    let settled = false;
    let failSafeTimeout = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (failSafeTimeout !== null) {
        clearTimeout(failSafeTimeout);
      }
      try {
        animation.cancel();
      } catch (cancelError) {
        // Ignore cancellation errors – animation may already be finished.
      }
      finalize();
    };

    failSafeTimeout = window.setTimeout(cleanup, 820);

    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
    if (typeof animation.finished?.then === 'function') {
      animation.finished.then(cleanup, cleanup);
    }
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
  nextCardId = null;
  renderCard();
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
