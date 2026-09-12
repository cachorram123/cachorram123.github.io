/* SantaScreen — grupos de transmissão de tela em 1080p60 + câmera (WebRTC mesh) */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const socket = io();

const ICE_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ],
};

const SCREEN_MAX_BITRATE = 10_000_000; // ~10 Mbps para 1080p60

// ---------- Estado ----------

let myName = '';
let roomCode = '';
let joined = false;

const peers = new Map(); // peerId -> peer
let camStream = null;
let screenStream = null;
let camOn = false;
let screenOn = false;

const tiles = new Map(); // "peerId:cam" | "peerId:screen" -> { el, video, avatar, label }
let focusedKey = null;
let audioMuted = false;  // silencia o som que chega dos outros (o Discord continua normal)
let stripHidden = false; // recolhe a faixa de participantes pra transmissão ocupar mais tela

// ---------- Ícones ----------

const ICONS = {
  cam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
  camOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m21 6.5-4 4V7a1 1 0 0 0-1-1H9.83L21 17.17V6.5zM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.55-.18L20.73 22 22 20.73 3.27 2z"/></svg>',
  screen: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H7v2h10v-2h-3v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H4V5h16v11z"/><path d="M11 14.5v-5l4.5 2.5-4.5 2.5z"/></svg>',
  leave: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85a.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/></svg>',
  screenSmall: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H7v2h10v-2h-3v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H4V5h16v11z"/></svg>',
  copySmall: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
  compress: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
  speakerOff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41L12 10.83z"/></svg>',
};

// ---------- Utilidades ----------

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

const AVATAR_GRADS = [
  ['#6366f1', '#a855f7'], ['#06b6d4', '#3b82f6'], ['#f59e0b', '#ef4444'], ['#10b981', '#06b6d4'],
  ['#ec4899', '#8b5cf6'], ['#f43f5e', '#f97316'], ['#22c55e', '#84cc16'], ['#0ea5e9', '#6366f1'],
];

function avatarGradient(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [c1, c2] = AVATAR_GRADS[h % AVATAR_GRADS.length];
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

function initialOf(name) {
  return (name.trim()[0] || '?').toUpperCase();
}

function myMediaState() {
  return {
    camera: { on: camOn, id: camStream ? camStream.id : null },
    screen: { on: screenOn, id: screenStream ? screenStream.id : null },
  };
}

function broadcastMediaState(to = null) {
  socket.emit('media-state', { to, state: myMediaState() });
}

function hasLiveVideo(stream) {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
}

function inviteLink() {
  return `${location.origin}${location.pathname}#${roomCode}`;
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(inviteLink());
    toast('Link de convite copiado!');
    return true;
  } catch {
    toast(`Código: ${roomCode}`);
    return false;
  }
}

function inviteCodeFromUrl() {
  const m = location.hash.match(/^#([A-Za-z0-9]{6})$/);
  return m ? m[1].toUpperCase() : null;
}

// ---------- Sessão persistente (sobrevive ao F5; o grupo espera 1 min no servidor) ----------

const SESSION_KEY = 'robertoscreen-session';
const NAME_KEY = 'robertoscreen-name'; // nome fica salvo no navegador pra não redigitar

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

// Preferências de UI (mute e faixa recolhida) ficam no navegador, não na sessão:
// quem silenciou não quer o som voltando sozinho a cada F5.
const PREFS_KEY = 'robertoscreen-prefs';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    audioMuted = !!p.audioMuted;
    stripHidden = !!p.stripHidden;
  } catch {}
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ audioMuted, stripHidden }));
  } catch {}
}

function saveSession() {
  if (!joined) return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: roomCode, name: myName, camOn, screenOn }));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

// ---------- Peers (negociação perfeita) ----------

function connectPeer(id, name) {
  if (peers.has(id)) return peers.get(id);

  const pc = new RTCPeerConnection(ICE_CONFIG);
  const peer = {
    id,
    name,
    pc,
    polite: socket.id > id, // um lado educado, outro não — resolve colisão de ofertas
    makingOffer: false,
    ignoreOffer: false,
    state: null,
    streams: new Map(), // streamId -> MediaStream
  };
  peers.set(id, peer);

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      socket.emit('signal', { to: id, data: { description: pc.localDescription } });
    } catch (err) {
      console.error(err);
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { to: id, data: { candidate } });
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') pc.restartIce();
  };

  // Os encodings do sender só existem depois da negociação — sem isso o
  // setParameters falha silencioso e a tela fica no bitrate default (~2,5 Mbps)
  pc.onsignalingstatechange = () => {
    if (pc.signalingState === 'stable') tuneScreenSenders(pc);
  };

  pc.ontrack = (ev) => {
    const stream = ev.streams[0];
    if (!stream) return;
    peer.streams.set(stream.id, stream);
    const rerender = () => renderPeer(peer);
    ev.track.onmute = rerender;
    ev.track.onunmute = rerender;
    ev.track.onended = rerender;
    stream.onremovetrack = rerender;
    renderPeer(peer);
  };

  addLocalTracksTo(peer);
  broadcastMediaState(id);
  return peer;
}

function addLocalTracksTo(peer) {
  for (const stream of [camStream, screenStream].filter(Boolean)) {
    for (const track of stream.getTracks()) {
      peer.pc.addTrack(track, stream);
    }
  }
  preferScreenCodecs(peer.pc);
  tuneScreenSenders(peer.pc);
}

function addStreamToAll(stream) {
  for (const peer of peers.values()) {
    for (const track of stream.getTracks()) {
      peer.pc.addTrack(track, stream);
    }
    preferScreenCodecs(peer.pc);
    tuneScreenSenders(peer.pc);
  }
}

// VP9 rende bem mais qualidade por bit que o VP8 default em screencast;
// os demais codecs seguem na lista como fallback pra quem não suporta
function preferScreenCodecs(pc) {
  if (!screenStream) return;
  if (typeof RTCRtpTransceiver === 'undefined' || !('setCodecPreferences' in RTCRtpTransceiver.prototype)) return;
  const caps = RTCRtpSender.getCapabilities && RTCRtpSender.getCapabilities('video');
  if (!caps) return;
  const vp9 = caps.codecs.filter((c) => /vp9/i.test(c.mimeType));
  if (vp9.length === 0) return;
  const rest = caps.codecs.filter((c) => !/vp9/i.test(c.mimeType));
  const videoTrack = screenStream.getVideoTracks()[0];
  for (const tr of pc.getTransceivers()) {
    if (tr.sender && tr.sender.track === videoTrack) {
      try {
        tr.setCodecPreferences([...vp9, ...rest]);
      } catch {}
    }
  }
}

function removeStreamFromAll(stream) {
  const tracks = new Set(stream.getTracks());
  for (const peer of peers.values()) {
    for (const sender of peer.pc.getSenders()) {
      if (sender.track && tracks.has(sender.track)) peer.pc.removeTrack(sender);
    }
  }
}

// Prioriza qualidade da transmissão de tela: bitrate alto e 60fps estáveis
function tuneScreenSenders(pc) {
  if (!screenStream) return;
  const videoTrack = screenStream.getVideoTracks()[0];
  if (!videoTrack) return;
  for (const sender of pc.getSenders()) {
    if (sender.track !== videoTrack) continue;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = SCREEN_MAX_BITRATE;
    params.encodings[0].maxFramerate = 60;
    params.degradationPreference = 'maintain-framerate';
    sender.setParameters(params).catch(() => {});
  }
}

socket.on('signal', async ({ from, data }) => {
  const peer = peers.get(from);
  if (!peer) return;
  const pc = peer.pc;
  try {
    if (data.description) {
      const desc = data.description;
      const collision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('signal', { to: from, data: { description: pc.localDescription } });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!peer.ignoreOffer) throw err;
      }
    }
  } catch (err) {
    console.error('Erro de sinalização:', err);
  }
});

socket.on('peer-joined', ({ id, name }) => {
  if (!joined) return;
  connectPeer(id, name);
  toast(`${name} entrou no grupo`);
  renderParticipants();
  renderEmptyHint();
});

socket.on('peer-left', ({ id }) => {
  const peer = peers.get(id);
  if (!peer) return;
  peers.delete(id); // primeiro sai do mapa, depois fecha: a guarda do renderPeer já vale
  peer.pc.close();
  removeTile(`${id}:cam`);
  removeTile(`${id}:screen`);
  toast(`${peer.name} saiu do grupo`);
  renderParticipants();
  renderEmptyHint();
});

socket.on('media-state', ({ peerId, state }) => {
  const peer = peers.get(peerId);
  if (!peer) return;
  peer.state = state;
  renderPeer(peer);
  renderParticipants();
});

socket.on('disconnect', () => {
  if (joined) toast('Conexão perdida com o servidor… tentando voltar.', true);
});

// Reconexão (queda de rede) e retomada pós-F5
socket.on('connect', () => {
  if (joined) {
    // a rede caiu: reentra no grupo mantendo os streams locais vivos
    teardownRemotePeers();
    socket.emit('join-room', { code: roomCode, name: myName }, (res) => {
      if (res.error) {
        toast('O grupo expirou enquanto você estava desconectado.', true);
        leaveRoom();
        return;
      }
      for (const p of res.peers) connectPeer(p.id, p.name);
      broadcastMediaState();
      renderParticipants();
      renderEmptyHint();
      toast('Reconectado!');
    });
  } else {
    tryResume();
  }
});

let resumeTried = false;

function tryResume() {
  if (resumeTried) return;
  resumeTried = true;

  const invite = inviteCodeFromUrl();
  const saved = loadSession();
  if (saved && saved.name) $('#nameInput').value = saved.name;

  // Link de convite pra um grupo diferente do salvo: só pré-preenche o código
  if (invite && (!saved || saved.code !== invite)) {
    $('#codeInput').value = invite;
    if ($('#nameInput').value.trim()) $('#joinBtn').focus();
    else $('#nameInput').focus();
    return;
  }

  if (!saved || !saved.code) return;

  // F5: volta pro grupo automaticamente
  myName = saved.name;
  socket.emit('join-room', { code: saved.code, name: saved.name }, (res) => {
    if (res.error) {
      clearSession();
      toast('Seu grupo anterior expirou. Entre ou crie um novo.', true);
      return;
    }
    enterRoom(res);
    toast('De volta ao grupo!');
    if (saved.camOn) toggleCam();
    if (saved.screenOn) toast('O refresh parou sua transmissão — clique em "Transmitir tela" pra retomar.');
  });
}

function teardownRemotePeers() {
  for (const [id, peer] of [...peers]) {
    peers.delete(id);
    peer.pc.close();
    removeTile(`${id}:cam`);
    removeTile(`${id}:screen`);
  }
}

// ---------- Entrada / saída ----------

function enterRoom({ code, peers: peerList }) {
  roomCode = code;
  joined = true;

  $('#joinView').style.display = 'none';
  $('#roomView').hidden = false;
  $$('.code-value').forEach((el) => (el.textContent = code));
  history.replaceState(null, '', `#${code}`); // URL vira link de convite

  for (const p of peerList) connectPeer(p.id, p.name);

  broadcastMediaState();
  updateControls();
  renderSelf();
  renderParticipants();
  renderEmptyHint();
  saveSession();
  try {
    localStorage.setItem(NAME_KEY, myName);
  } catch {}
}

function leaveRoom() {
  socket.emit('leave');
  joined = false;
  clearSession();

  teardownRemotePeers();

  for (const stream of [camStream, screenStream]) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
  camStream = screenStream = null;
  camOn = screenOn = false;

  for (const key of [...tiles.keys()]) removeTile(key);
  focusedKey = null;
  history.replaceState(null, '', location.pathname);

  $('#roomView').hidden = true;
  $('#joinView').style.display = 'flex';
}

// ---------- Controles de mídia ----------

async function toggleCam() {
  if (camOn) {
    removeStreamFromAll(camStream);
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    camOn = false;
  } else {
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch {
      toast('Não foi possível acessar a câmera.', true);
      return;
    }
    camOn = true;
    camStream.getVideoTracks()[0].onended = () => { if (camOn) toggleCam(); };
    addStreamToAll(camStream);
  }
  broadcastMediaState();
  updateControls();
  renderSelf();
  saveSession();
}

async function toggleScreen() {
  if (screenOn) {
    removeStreamFromAll(screenStream);
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
    screenOn = false;
    if (focusedKey === 'self:screen') focusedKey = null;
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
        // Só o áudio da aba compartilhada. 'exclude' tira o áudio do sistema da
        // opção de compartilhar — é por ele que a saída do Discord voltaria
        // pros outros como eco. Quem precisa levar som transmite uma aba.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'exclude',
        selfBrowserSurface: 'exclude', // compartilhar a própria aba faria loop de áudio/vídeo
      });
    } catch {
      return; // usuário cancelou o seletor
    }
    screenOn = true;
    const videoTrack = screenStream.getVideoTracks()[0];
    videoTrack.contentHint = 'motion'; // prioriza fluidez (60fps) na codificação
    videoTrack.onended = () => { if (screenOn) toggleScreen(); };
    addStreamToAll(screenStream);
  }
  broadcastMediaState();
  updateControls();
  renderSelf();
  renderParticipants();
  saveSession();
}

function updateControls() {
  const screenBtn = $('#screenBtn');
  screenBtn.innerHTML = ICONS.screen;
  screenBtn.className = 'ctrl ' + (screenOn ? 'on' : '');
  screenBtn.dataset.tip = screenOn ? 'Parar transmissão' : 'Transmitir tela';

  const camBtn = $('#camBtn');
  camBtn.innerHTML = camOn ? ICONS.cam : ICONS.camOff;
  camBtn.className = 'ctrl ' + (camOn ? 'on' : '');
  camBtn.dataset.tip = camOn ? 'Desligar câmera' : 'Ligar câmera';

  const muteBtn = $('#muteBtn');
  muteBtn.innerHTML = audioMuted ? ICONS.speakerOff : ICONS.speaker;
  muteBtn.className = 'ctrl' + (audioMuted ? ' muted' : '');
  muteBtn.dataset.tip = audioMuted ? 'Ativar áudio' : 'Silenciar áudio';

  $('#leaveBtn').innerHTML = ICONS.leave;
}

// ---------- Mute e faixa de participantes ----------

function toggleMute() {
  audioMuted = !audioMuted;
  applyMute();
  savePrefs();
  updateControls();
}

function applyMute() {
  // o vídeo da própria tela segue mudo sempre, senão o próprio som volta em eco
  for (const tile of tiles.values()) tile.video.muted = tile.isSelf || audioMuted;
}

function toggleStrip() {
  stripHidden = !stripHidden;
  applyStrip();
  savePrefs();
}

function applyStrip() {
  $('#stage').classList.toggle('strip-hidden', stripHidden);
  const btn = $('#stripToggle');
  btn.innerHTML = stripHidden ? ICONS.chevronUp : ICONS.chevronDown;
  btn.title = stripHidden ? 'Mostrar participantes' : 'Esconder participantes';
}

// ---------- Tiles (palco) ----------

function ensureTile(key, { name, isScreen, isSelf }) {
  if (tiles.has(key)) return tiles.get(key);

  const el = document.createElement('div');
  el.className = 'tile' + (isScreen ? ' screen' : '');

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = !!isSelf || audioMuted; // nunca ouvir a própria transmissão
  el.appendChild(video);

  const avatar = document.createElement('div');
  avatar.className = 'avatar-circle';
  avatar.style.background = avatarGradient(name);
  avatar.textContent = initialOf(name);
  el.appendChild(avatar);

  const label = document.createElement('div');
  label.className = 'tile-label';
  el.appendChild(label);

  const fsBtn = document.createElement('button');
  fsBtn.className = 'tile-fs';
  fsBtn.title = 'Tela cheia';
  fsBtn.innerHTML = ICONS.expand;
  fsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen(el);
  });
  el.appendChild(fsBtn);

  el.addEventListener('click', () => {
    if (fullscreenEl() === el) return; // em tela cheia o clique não mexe no destaque
    focusedKey = focusedKey === key ? null : key;
    relayout();
  });
  el.addEventListener('dblclick', () => toggleFullscreen(el));

  const tile = { el, video, avatar, label, fsBtn, isSelf: !!isSelf };
  tiles.set(key, tile);
  relayout();
  return tile;
}

// ---------- Tela cheia ----------

function fullscreenEl() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function toggleFullscreen(el) {
  if (fullscreenEl() === el) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) {
    toast('Seu navegador não suporta tela cheia.', true);
    return;
  }
  Promise.resolve(req.call(el)).catch(() => {});
}

for (const evName of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(evName, () => {
    const current = fullscreenEl();
    for (const tile of tiles.values()) {
      const fs = current === tile.el;
      tile.el.classList.toggle('fullscreen', fs);
      tile.fsBtn.innerHTML = fs ? ICONS.compress : ICONS.expand;
      tile.fsBtn.title = fs ? 'Sair da tela cheia (Esc)' : 'Tela cheia';
    }
  });
}

function setTileLabel(tile, name, { isScreen = false } = {}) {
  tile.label.innerHTML = '';
  if (isScreen) tile.label.insertAdjacentHTML('beforeend', ICONS.screenSmall);
  const span = document.createElement('span');
  span.textContent = isScreen ? `${name} — tela` : name;
  tile.label.appendChild(span);
}

function showVideo(tile, stream) {
  if (tile.video.srcObject !== stream) tile.video.srcObject = stream;
  tile.video.style.display = '';
  tile.avatar.style.display = 'none';
}

function showAvatar(tile) {
  tile.video.srcObject = null;
  tile.video.style.display = 'none';
  tile.avatar.style.display = '';
}

function removeTile(key) {
  const tile = tiles.get(key);
  if (!tile) return;
  tile.video.srcObject = null;
  tile.el.remove();
  tiles.delete(key);
  if (focusedKey === key) focusedKey = null;
  relayout();
}

function relayout() {
  const stage = $('#stage');
  const main = $('#stageMain');
  const strip = $('#stageStrip');

  if (focusedKey && !tiles.has(focusedKey)) focusedKey = null;

  if (focusedKey) {
    stage.classList.add('focused');
    for (const [key, tile] of tiles) {
      const target = key === focusedKey ? main : strip;
      if (tile.el.parentElement !== target) target.appendChild(tile.el);
    }
  } else {
    stage.classList.remove('focused');
    for (const tile of tiles.values()) {
      if (tile.el.parentElement !== main) main.appendChild(tile.el);
    }
  }
  renderEmptyHint();
}

function renderEmptyHint() {
  const main = $('#stageMain');
  let hint = main.querySelector('.stage-empty');
  if (peers.size === 0 && joined) {
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'stage-empty';

      const b = document.createElement('b');
      b.textContent = 'Você está sozinho por aqui.';
      const p = document.createElement('span');
      p.textContent = 'Compartilhe o código para chamar o grupo:';

      const chip = document.createElement('button');
      chip.className = 'empty-code';
      chip.title = 'Copiar código';
      const codeSpan = document.createElement('span');
      codeSpan.textContent = roomCode;
      chip.appendChild(codeSpan);
      chip.insertAdjacentHTML('beforeend', ICONS.copySmall);
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        copyCode();
      });

      hint.append(b, p, chip);
      main.appendChild(hint);
    }
  } else if (hint) {
    hint.remove();
  }
}

// ---------- Renderização: eu ----------

function renderSelf() {
  const camTile = ensureTile('self:cam', { name: myName, isSelf: true });
  camTile.el.classList.toggle('mirror', camOn);
  if (camOn && hasLiveVideo(camStream)) showVideo(camTile, camStream);
  else showAvatar(camTile);
  setTileLabel(camTile, `${myName} (você)`);

  if (screenOn && hasLiveVideo(screenStream)) {
    const screenTile = ensureTile('self:screen', { name: myName, isScreen: true, isSelf: true });
    showVideo(screenTile, screenStream);
    setTileLabel(screenTile, `${myName} (você)`, { isScreen: true });
  } else {
    removeTile('self:screen');
  }
}

// ---------- Renderização: peers ----------

function classifyStream(peer, stream) {
  const st = peer.state;
  if (st) {
    if (st.screen.id === stream.id) return 'screen';
    if (st.camera.id === stream.id) return 'camera';
  }
  return 'camera';
}

function renderPeer(peer) {
  // Fechar a conexão deixa as tracks remotas em muted/ended, e esses eventos
  // chegam DEPOIS do peer sair do mapa. Sem esta guarda o ensureTile abaixo
  // recriava o tile de quem já saiu — e ninguém mais o removia.
  if (peers.get(peer.id) !== peer) return;

  let camS = null;
  let screenS = null;
  for (const stream of peer.streams.values()) {
    const kind = classifyStream(peer, stream);
    if (kind === 'screen') screenS = stream;
    else camS = stream;
  }

  // Tile da câmera / avatar
  const camTile = ensureTile(`${peer.id}:cam`, { name: peer.name });
  if (hasLiveVideo(camS)) showVideo(camTile, camS);
  else showAvatar(camTile);
  setTileLabel(camTile, peer.name);

  // Tile da transmissão de tela (o som da tela sai por este vídeo)
  if (hasLiveVideo(screenS)) {
    const hadTile = tiles.has(`${peer.id}:screen`);
    const screenTile = ensureTile(`${peer.id}:screen`, { name: peer.name, isScreen: true });
    screenTile.video.muted = audioMuted;
    showVideo(screenTile, screenS);
    setTileLabel(screenTile, peer.name, { isScreen: true });
    if (!hadTile && !focusedKey) {
      focusedKey = `${peer.id}:screen`; // destaque automático pra quem está transmitindo
      relayout();
    }
  } else {
    removeTile(`${peer.id}:screen`);
  }
}

// ---------- Lista de participantes ----------

function renderParticipants() {
  const list = $('#participantList');
  list.innerHTML = '';

  const entries = [
    { name: `${myName} (você)`, rawName: myName, sharing: screenOn },
    ...[...peers.values()].map((p) => ({
      name: p.name,
      rawName: p.name,
      sharing: p.state ? p.state.screen.on : false,
    })),
  ];

  for (const e of entries) {
    const li = document.createElement('li');

    const av = document.createElement('div');
    av.className = 'p-avatar';
    av.style.background = avatarGradient(e.rawName);
    av.textContent = initialOf(e.rawName);

    const nm = document.createElement('span');
    nm.className = 'p-name';
    nm.textContent = e.name;

    const badges = document.createElement('span');
    badges.className = 'p-badges';
    if (e.sharing) {
      const s = document.createElement('span');
      s.className = 'badge-screen';
      s.innerHTML = ICONS.screenSmall;
      badges.appendChild(s);
    }

    li.append(av, nm, badges);
    list.appendChild(li);
  }

  $('#countLabel').textContent = entries.length;
}

// ---------- Tela de entrada ----------

function formatName(name) {
  name = name.trim().slice(0, 24);
  if (!name) return '';
  return name[0].toUpperCase() + name.slice(1).toLowerCase();
}

function readName() {
  const name = formatName($('#nameInput').value);
  if (!name) {
    toast('Diga seu nome primeiro 🙂', true);
    $('#nameInput').focus();
    return null;
  }
  $('#nameInput').value = name; // mostra o nome já formatado
  return name;
}

$('#createBtn').addEventListener('click', () => {
  const name = readName();
  if (!name) return;
  myName = name;
  socket.emit('create-room', name, (res) => {
    if (res.error) return toast(res.error, true);
    enterRoom(res);
    toast(`Grupo criado! Código: ${res.code}`);
  });
});

$('#joinBtn').addEventListener('click', () => {
  const name = readName();
  if (!name) return;
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length < 6) {
    toast('Digite o código do grupo (6 caracteres).', true);
    $('#codeInput').focus();
    return;
  }
  myName = name;
  socket.emit('join-room', { code, name }, (res) => {
    if (res.error) return toast(res.error, true);
    enterRoom(res);
  });
});

$('#codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});
$('#codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#joinBtn').click();
});
$('#nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#codeInput').focus();
});

// ---------- Sala: botões ----------

$('#screenBtn').addEventListener('click', toggleScreen);
$('#camBtn').addEventListener('click', toggleCam);
$('#muteBtn').addEventListener('click', toggleMute);
$('#stripToggle').addEventListener('click', toggleStrip);
$('#leaveBtn').addEventListener('click', leaveRoom);

$$('.copy-code').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const ok = await copyCode();
    if (ok) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  });
});

window.addEventListener('beforeunload', () => {
  if (joined) socket.emit('leave');
});

$('#nameInput').value = savedName();
loadPrefs();
applyStrip();
updateControls();
