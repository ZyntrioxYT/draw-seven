"use strict";

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ui = {
  welcome: $("#welcomeScreen"), game: $("#gameScreen"), startForm: $("#startForm"),
  playerName: $("#playerName"), grid: $("#playerGrid"), round: $("#roundNumber"),
  deck: $("#deckCount"), dealer: $("#dealerName"), status: $("#statusMessage"),
  roundValue: $("#roundValue"), decisionTitle: $("#decisionTitle"), decisionHint: $("#decisionHint"),
  draw: $("#drawButton"), stay: $("#stayButton"), drawStack: $("#drawStack"),
  rules: $("#rulesModal"), target: $("#targetModal"), targetTitle: $("#targetTitle"),
  targetCopy: $("#targetCopy"), targetOptions: $("#targetOptions"), results: $("#roundModal"),
  resultList: $("#resultList"), roundTitle: $("#roundTitle"), roundEyebrow: $("#roundEyebrow"),
  nextRound: $("#nextRoundButton"), toast: $("#toast"), sound: $("#soundButton"), soundIcon: $("#soundIcon")
};

let audioContext;
const state = {
  players: [], deck: [], discard: [], round: 0, dealer: 0, turn: 0,
  busy: false, roundOver: false, roundScored: false, gameOver: false, sound: true, messageTimer: null
};

function makeDeck() {
  const cards = [{ type: "number", value: 0 }];
  for (let value = 1; value <= 12; value += 1) {
    for (let copy = 0; copy < value; copy += 1) cards.push({ type: "number", value });
  }
  [2, 4, 6, 8, 10].forEach((value) => cards.push({ type: "modifier", value }));
  cards.push({ type: "modifier", value: "x2" });
  for (let i = 0; i < 3; i += 1) {
    cards.push({ type: "action", value: "freeze" });
    cards.push({ type: "action", value: "flip3" });
    cards.push({ type: "action", value: "second" });
  }
  return shuffle(cards);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function freshPlayer(name, isHuman = false) {
  return { name, isHuman, total: 0, numbers: [], modifiers: [], chances: 0, actionCards: [], active: true, busted: false, stayed: false, flipSeven: false };
}

function resetRoundPlayer(player) {
  Object.assign(player, { numbers: [], modifiers: [], chances: 0, actionCards: [], active: true, busted: false, stayed: false, flipSeven: false });
}

function cardLabel(card) {
  if (card.type === "number") return String(card.value);
  if (card.type === "modifier") return card.value === "x2" ? "×2" : `+${card.value}`;
  return { freeze: "Freeze", flip3: "Flip 3", second: "2nd Chance" }[card.value];
}

function actionDescription(value) {
  return {
    freeze: "They must stay and bank their current round value.",
    flip3: "They must immediately take three cards.",
    second: "They gain protection from one duplicate number."
  }[value];
}

function roundScore(player) {
  if (player.busted) return 0;
  let score = player.numbers.reduce((sum, number) => sum + number, 0);
  if (player.modifiers.includes("x2")) score *= 2;
  score += player.modifiers.filter((value) => value !== "x2").reduce((sum, value) => sum + value, 0);
  if (player.flipSeven) score += 15;
  return score;
}

function drawCard() {
  if (!state.deck.length) {
    state.deck = shuffle(state.discard);
    state.discard = [];
    notify("Discard pile reshuffled");
  }
  const card = state.deck.pop();
  ui.deck.textContent = state.deck.length;
  ui.drawStack.classList.remove("drawing");
  void ui.drawStack.offsetWidth;
  ui.drawStack.classList.add("drawing");
  tone(330, .05);
  return card;
}

function tone(frequency, duration = .08) {
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is an optional enhancement. */ }
}

function notify(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add("show");
  clearTimeout(state.messageTimer);
  state.messageTimer = setTimeout(() => ui.toast.classList.remove("show"), 1800);
}

function setStatus(message) {
  ui.status.textContent = message;
}

function stateLabel(player, index) {
  if (player.busted) return "BUSTED";
  if (player.flipSeven) return "DRAW SEVEN!";
  if (player.stayed) return "STAYED";
  if (state.turn === index && !state.roundOver) return "PLAYING";
  return "ACTIVE";
}

function renderCard(card, extraClass = "") {
  const className = card.type === "number" ? "" : card.type;
  return `<div class="play-card ${className} ${extraClass}" title="${cardLabel(card)}">
    <small>${card.type === "number" ? card.value : ""}</small><strong>${cardLabel(card)}</strong>
  </div>`;
}

function render() {
  ui.round.textContent = state.round;
  ui.deck.textContent = state.deck.length;
  ui.dealer.textContent = state.players[state.dealer]?.name || "—";
  ui.grid.innerHTML = state.players.map((player, index) => {
    const numberCards = player.numbers.map((value) => renderCard({ type: "number", value })).join("");
    const modifierCards = player.modifiers.map((value) => renderCard({ type: "modifier", value })).join("");
    const chanceCards = Array.from({ length: player.chances }, () => renderCard({ type: "action", value: "second" })).join("");
    const cards = numberCards + modifierCards + chanceCards;
    const stateClass = player.busted ? "bust" : "";
    return `<article class="player-panel ${state.turn === index && player.active && !state.roundOver ? "is-turn" : ""}">
      <div class="player-head">
        <span class="avatar">${player.name.charAt(0).toUpperCase()}</span>
        <div><div class="player-name">${escapeHTML(player.name)}${index === state.dealer ? " · dealer" : ""}</div><div class="player-state">${stateLabel(player, index)}</div></div>
        <span class="round-chip ${stateClass}">${player.busted ? "+0" : `+${roundScore(player)}`}</span>
        <div class="player-total"><small>TOTAL</small>${player.total}</div>
      </div>
      <div class="hand">${cards || '<span class="empty-hand">Waiting for a card…</span>'}</div>
    </article>`;
  }).join("");

  const human = state.players[0];
  ui.roundValue.textContent = human ? roundScore(human) : 0;
  const humanTurn = human && state.turn === 0 && human.active && !state.busy && !state.roundOver;
  ui.draw.disabled = !humanTurn;
  ui.stay.disabled = !humanTurn;
  if (humanTurn) {
    ui.decisionTitle.textContent = "Your decision";
    ui.decisionHint.textContent = human.numbers.length === 6 ? "One unique number away from the bonus." : "Take one card, or protect your points.";
  } else if (human?.busted) {
    ui.decisionTitle.textContent = "You busted this round";
    ui.decisionHint.textContent = "The other players are finishing up.";
  } else if (human?.stayed) {
    ui.decisionTitle.textContent = "Your points are safe";
    ui.decisionHint.textContent = "The other players are finishing up.";
  } else {
    ui.decisionTitle.textContent = "Waiting for your turn";
    ui.decisionHint.textContent = "Watch what the other players do.";
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function chooseTarget(drawer, card) {
  const active = state.players.map((player, index) => ({ player, index })).filter(({ player }) => player.active);
  if (!active.length) return null;
  if (!drawer.isHuman) {
    if (card.value === "freeze") {
      const opponents = active.filter(({ player }) => player !== drawer);
      const pool = opponents.length ? opponents : active;
      return pool.sort((a, b) => roundScore(b.player) - roundScore(a.player))[0].index;
    }
    const opponents = active.filter(({ player }) => player !== drawer);
    const pool = opponents.length ? opponents : active;
    return pool.sort((a, b) => b.player.numbers.length - a.player.numbers.length)[0].index;
  }

  return new Promise((resolve) => {
    ui.targetTitle.textContent = `Play ${cardLabel(card)}`;
    ui.targetCopy.textContent = actionDescription(card.value);
    ui.targetOptions.innerHTML = active.map(({ player, index }) => `<button class="target-option" data-target="${index}"><b>${escapeHTML(player.name)}${player === drawer ? " (you)" : ""}</b><span>${player.numbers.length} numbers · ${roundScore(player)} points showing</span></button>`).join("");
    ui.target.classList.remove("hidden");
    ui.targetOptions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      ui.target.classList.add("hidden");
      resolve(Number(button.dataset.target));
    }, { once: true }));
  });
}

async function processAction(drawer, card) {
  const targetIndex = await chooseTarget(drawer, card);
  if (targetIndex === null) return;
  const target = state.players[targetIndex];
  setStatus(`${drawer.name} plays ${cardLabel(card)} on ${target.name}.`);
  notify(`${cardLabel(card)} → ${target.name}`);
  if (card.value === "freeze") {
    target.active = false;
    target.stayed = true;
    state.discard.push(card);
    tone(190, .14);
  } else if (card.value === "flip3") {
    await resolveFlipThree(target);
    state.discard.push(card);
  }
  render();
}

async function handleSecondChance(player, card) {
  if (player.chances === 0) {
    player.chances += 1;
    notify(`${player.name} keeps a Second Chance.`);
    setStatus(`${player.name} holds onto a Second Chance.`);
    tone(620, .12);
    return;
  }
  const others = state.players.filter((other) => other.active && other !== player);
  if (!others.length) {
    state.discard.push(card);
    notify(`${player.name} already had one — it's discarded.`);
    setStatus(`${player.name} discards a spare Second Chance.`);
    return;
  }
  let targetIndex;
  if (player.isHuman) {
    targetIndex = await new Promise((resolve) => {
      ui.targetTitle.textContent = "Give Second Chance";
      ui.targetCopy.textContent = "You already hold one — give this one to another active player.";
      ui.targetOptions.innerHTML = others.map((other) => `<button class="target-option" data-target="${state.players.indexOf(other)}"><b>${escapeHTML(other.name)}</b><span>${other.numbers.length} numbers · ${roundScore(other)} points showing</span></button>`).join("");
      ui.target.classList.remove("hidden");
      ui.targetOptions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        ui.target.classList.add("hidden");
        resolve(Number(button.dataset.target));
      }, { once: true }));
    });
  } else {
    targetIndex = state.players.indexOf(others.sort((a, b) => b.numbers.length - a.numbers.length)[0]);
  }
  const target = state.players[targetIndex];
  target.chances += 1;
  notify(`${player.name} passes a Second Chance to ${target.name}.`);
  setStatus(`${player.name} gives a spare Second Chance to ${target.name}.`);
  tone(620, .12);
}

async function resolveFlipThree(target) {
  const deferred = [];
  for (let count = 0; count < 3; count += 1) {
    if (!target.active || state.roundOver) break;
    await sleep(420);
    const card = drawCard();
    setStatus(`${target.name} flips ${cardLabel(card)} (${count + 1} of 3).`);
    if (card.type === "action" && card.value !== "second") deferred.push(card);
    else await processCard(target, card);
    render();
  }
  if (!target.busted && !state.roundOver) {
    for (const action of deferred) {
      await sleep(250);
      await processAction(target, action);
    }
  } else {
    state.discard.push(...deferred);
  }
}

async function processCard(player, card) {
  if (card.type === "number") {
    if (player.numbers.includes(card.value)) {
      if (player.chances > 0) {
        player.chances -= 1;
        state.discard.push(card, { type: "action", value: "second" });
        notify(`${player.name}'s Second Chance saved them!`);
        setStatus(`${player.name} matched ${card.value}, but used a Second Chance.`);
        tone(700, .18);
      } else {
        player.busted = true;
        player.active = false;
        state.discard.push(card);
        notify(`${player.name} busted on ${card.value}`);
        setStatus(`${player.name} drew another ${card.value} and busted.`);
        tone(120, .28);
      }
    } else {
      player.numbers.push(card.value);
      if (player.numbers.length === 7) {
        player.flipSeven = true;
        state.roundOver = true;
        setStatus(`${player.name} drew seven unique numbers!`);
        notify(`Draw Seven! +15 for ${player.name}`);
        tone(880, .28);
      }
    }
  } else if (card.type === "modifier") {
    player.modifiers.push(card.value);
  } else if (card.value === "second") {
    await handleSecondChance(player, card);
  } else {
    await processAction(player, card);
  }
}

async function dealOne(playerIndex) {
  const player = state.players[playerIndex];
  if (!player.active || state.roundOver) return;
  const card = drawCard();
  setStatus(`${player.name} draws ${cardLabel(card)}.`);
  await processCard(player, card);
  render();
}

async function startRound() {
  state.busy = true;
  state.roundOver = false;
  state.roundScored = false;
  state.round += 1;
  state.players.forEach(resetRoundPlayer);
  if (state.round > 1) state.dealer = (state.dealer + 1) % state.players.length;
  state.turn = (state.dealer + 1) % state.players.length;
  ui.results.classList.add("hidden");
  setStatus("Dealing the opening cards…");
  render();

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    if (state.roundOver) break;
    const index = (state.dealer + offset) % state.players.length;
    await sleep(360);
    await dealOne(index);
  }
  if (state.roundOver) return finishRound();
  state.busy = false;
  state.turn = (state.dealer + 1) % state.players.length;
  render();
  runTurn();
}

async function runTurn() {
  if (state.roundOver || !state.players.some((player) => player.active)) return finishRound();
  let checks = 0;
  while (!state.players[state.turn].active && checks < state.players.length) {
    state.turn = (state.turn + 1) % state.players.length;
    checks += 1;
  }
  if (!state.players.some((player) => player.active)) return finishRound();
  render();
  const player = state.players[state.turn];
  setStatus(`${player.name}'s turn.`);
  if (player.isHuman) return;
  state.busy = true;
  render();
  await sleep(650);
  if (botShouldStay(player)) {
    player.active = false;
    player.stayed = true;
    setStatus(`${player.name} stays on ${roundScore(player)}.`);
    tone(240, .06);
  } else {
    await dealOne(state.turn);
  }
  state.busy = false;
  if (state.roundOver) return finishRound();
  advanceTurn();
}

function botShouldStay(player) {
  const value = roundScore(player);
  const unique = player.numbers.length;
  if (unique >= 6) return false;
  if (unique <= 2) return false;
  const duplicatesRemaining = player.numbers.reduce((sum, number) => sum + Math.max(0, number - 1), 0);
  const danger = duplicatesRemaining / Math.max(1, state.deck.length);
  const nerve = player.chances ? 42 : 24 + Math.random() * 9;
  return value >= nerve || (danger > .23 && value >= 16);
}

function advanceTurn() {
  state.turn = (state.turn + 1) % state.players.length;
  render();
  runTurn();
}

async function humanDraw() {
  if (ui.draw.disabled) return;
  state.busy = true;
  render();
  await dealOne(0);
  state.busy = false;
  if (state.roundOver) return finishRound();
  advanceTurn();
}

function humanStay() {
  if (ui.stay.disabled) return;
  const human = state.players[0];
  human.active = false;
  human.stayed = true;
  setStatus(`${human.name} stays on ${roundScore(human)}.`);
  tone(240, .06);
  advanceTurn();
}

async function finishRound() {
  if (state.roundScored || (state.busy && !state.roundOver)) return;
  state.roundOver = true;
  state.roundScored = true;
  state.busy = true;
  render();
  await sleep(700);
  const scored = state.players.map((player) => {
    const points = roundScore(player);
    player.total += points;
    return points;
  });
  const reachedGoal = state.players.some((player) => player.total >= 200);
  state.gameOver = reachedGoal;
  const highest = Math.max(...state.players.map((player) => player.total));
  const winners = state.players.filter((player) => player.total === highest);
  ui.roundEyebrow.textContent = reachedGoal ? "GAME COMPLETE" : `ROUND ${state.round} COMPLETE`;
  ui.roundTitle.textContent = reachedGoal ? (winners.length > 1 ? "A dead heat!" : `${winners[0].name} wins!`) : "Points on the board";
  ui.resultList.innerHTML = state.players.map((player, index) => `<div class="result-row ${reachedGoal && player.total === highest ? "winner" : ""}"><span>${escapeHTML(player.name)}${player.busted ? " · busted" : player.flipSeven ? " · draw seven" : ""}</span><span class="round-points">+${scored[index]}</span><strong>${player.total}</strong></div>`).join("");
  ui.nextRound.innerHTML = reachedGoal ? "Play again <span>↻</span>" : "Deal the next round <span>→</span>";
  const roundCards = [];
  state.players.forEach((player) => {
    player.numbers.forEach((value) => roundCards.push({ type: "number", value }));
    player.modifiers.forEach((value) => roundCards.push({ type: "modifier", value }));
    for (let i = 0; i < player.chances; i += 1) roundCards.push({ type: "action", value: "second" });
  });
  state.discard.push(...roundCards);
  render();
  ui.results.classList.remove("hidden");
  state.busy = false;
}

function startGame(name) {
  state.players = [freshPlayer(name || "Player", true), freshPlayer("Mara"), freshPlayer("Kit"), freshPlayer("Otis")];
  state.deck = makeDeck();
  state.discard = [];
  state.round = 0;
  state.dealer = Math.floor(Math.random() * 4);
  state.gameOver = false;
  ui.welcome.classList.add("hidden");
  ui.game.classList.remove("hidden");
  startRound();
}

function resetToWelcome() {
  if (ui.game.classList.contains("hidden")) return;
  window.location.reload();
}

ui.startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startGame(ui.playerName.value.trim().slice(0, 16));
});
ui.draw.addEventListener("click", humanDraw);
ui.stay.addEventListener("click", humanStay);
ui.nextRound.addEventListener("click", () => {
  if (state.gameOver) startGame(state.players[0].name);
  else startRound();
});
$("#rulesButton").addEventListener("click", () => ui.rules.classList.remove("hidden"));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => ui.rules.classList.add("hidden")));
ui.rules.addEventListener("click", (event) => { if (event.target === ui.rules) ui.rules.classList.add("hidden"); });
ui.sound.addEventListener("click", () => {
  state.sound = !state.sound;
  ui.sound.setAttribute("aria-pressed", String(state.sound));
  ui.soundIcon.textContent = state.sound ? "♪" : "×";
});
$("#brandButton").addEventListener("click", resetToWelcome);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") ui.rules.classList.add("hidden");
  if (event.key.toLowerCase() === "d" && !ui.draw.disabled) humanDraw();
  if (event.key.toLowerCase() === "s" && !ui.stay.disabled) humanStay();
});
