/* Continuous mixed playback: four library tracks for each SoundCloud track. */
(() => {
  const heard = new Set(window.initialUiPreferences?.playedTrackKeys || []);
  const key = (t) =>
    t?.scId || t?.soundcloudId ? 'sc-' + String(t.scId || t.soundcloudId) : 'local-' + t?.id;
  for (const track of library.tracks)
    if (heard.has('local-' + track.id) && (track.scId || track.soundcloudId)) heard.add(key(track));
  const basePlayList = playList,
    baseAdvance = advance,
    baseLoad = load;
  let session = null,
    generation = 0;
  function recordHeard() {
    if (!current) return;
    const id = key(current);
    if (heard.has(id)) return;
    heard.add(id);
    window.lumen.preferencesSet({ playedTrackKeys: [...heard] }).catch(() => {});
  }
  audio.addEventListener('playing', recordHeard);
  function stopMix() {
    generation++;
    session = null;
  }
  playList = function (list, index) {
    stopMix();
    return basePlayList(list, index);
  };
  function localTrack(state) {
    while (true) {
      if (!state.localBag.length) {
        state.localBag = library.tracks.filter(
          (t) => !t.remote && !heard.has(key(t)) && !state.reserved.has(key(t))
        );
        for (let i = state.localBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.localBag[i], state.localBag[j]] = [state.localBag[j], state.localBag[i]];
        }
        if (!state.localBag.length) return null;
      }
      const t = state.localBag.pop();
      if (!heard.has(key(t)) && !state.reserved.has(key(t))) return t;
    }
  }
  async function remoteTrack(state) {
    for (let attempt = 0; attempt < 3; attempt++) {
      while (state.remoteBag.length) {
        const t = state.remoteBag.pop();
        if (!heard.has(key(t)) && !state.reserved.has(key(t)) && !excludedOnline(t)) return t;
      }
      if (Date.now() < state.retryAfter) return null;
      try {
        state.remoteBag = await window.lumen.scRandom(
          [...heard, ...state.reserved].filter((id) => id.startsWith('sc-')).slice(-50000)
        );
      } catch (error) {
        state.lastError = cleanError(error);
        state.retryAfter = Date.now() + 30000;
        return null;
      }
      if (session !== state) return null;
    }
    state.retryAfter = Date.now() + 10000;
    return null;
  }
  async function refill(state) {
    if (state.filling) return state.filling;
    state.filling = (async () => {
      while (session === state && queue.length - qi - 1 < 12) {
        let local = localTrack(state),
          track = null;
        const wantRemote = !local || state.localSinceRemote >= 4;
        if (wantRemote) {
          track = await remoteTrack(state);
          if (session !== state) return;
        }
        if (track) {
          if (local) state.localBag.push(local);
          state.localSinceRemote = 0;
        } else if (local) {
          track = local;
          state.localSinceRemote++;
        }
        if (!track) break;
        state.reserved.add(key(track));
        queue.push(track);
      }
      if (session === state) renderQueue();
    })();
    try {
      await state.filling;
    } finally {
      state.filling = null;
    }
  }
  async function startMix() {
    for (const track of library.tracks)
      if (heard.has('local-' + track.id) && (track.scId || track.soundcloudId))
        heard.add(key(track));
    stopMix();
    const state = {
      id: generation,
      reserved: new Set(),
      localBag: [],
      remoteBag: [],
      localSinceRemote: 0,
      retryAfter: 0,
      lastError: '',
      filling: null,
    };
    session = state;
    $('play-all').setAttribute('aria-busy', 'true');
    try {
      let first = localTrack(state);
      if (!first) first = await remoteTrack(state);
      if (session !== state) return;
      if (!first) {
        session = null;
        toast(
          state.lastError ||
            'Новых непрослушанных треков пока нет. Ранее проигранные треки повторяться не будут.'
        );
        return;
      }
      state.reserved.add(key(first));
      state.localSinceRemote = first.remote ? 0 : 1;
      shuffle = false;
      repeat = false;
      $('shuffle').classList.remove('active');
      $('repeat').classList.remove('active');
      basePlayList([first], 0);
      refill(state).catch((error) => {
        state.lastError = cleanError(error);
      });
    } finally {
      $('play-all').removeAttribute('aria-busy');
    }
  }
  load = function (t) {
    baseLoad(t);
    const state = session;
    if (state && queue.length - qi < 7)
      refill(state).catch((error) => {
        state.lastError = cleanError(error);
      });
  };
  advance = async function (delta = 1, automatic = false) {
    const state = session;
    if (!state) return baseAdvance(delta, automatic);
    if (delta < 0) {
      toast('В смешанном режиме уже прослушанные треки не повторяются');
      return;
    }
    if (automatic && repeat) {
      repeat = false;
      $('repeat').classList.remove('active');
    }
    upNext = upNext.filter((t) => !heard.has(key(t)) && !excludedOnline(t));
    while (
      qi + 1 < queue.length &&
      (heard.has(key(queue[qi + 1])) || excludedOnline(queue[qi + 1]))
    )
      qi++;
    if (!upNext.length && qi + 1 >= queue.length) await refill(state);
    if (session !== state) return;
    if (!upNext.length && qi + 1 >= queue.length) {
      audio.pause();
      toast(state.lastError || 'Новых непрослушанных треков пока нет');
      return;
    }
    const oldShuffle = shuffle;
    shuffle = false;
    try {
      return await baseAdvance(delta, automatic);
    } finally {
      shuffle = oldShuffle;
    }
  };
  waveStart.addEventListener('click', stopMix, { capture: true });
  const baseRenderQueue = renderQueue;
  renderQueue = function () {
    baseRenderQueue();
    if (!session) return;
    const next = queue.slice(qi + 1).filter((t) => !heard.has(key(t)) && !excludedOnline(t));
    $('queue-count').textContent = upNext.length + next.length;
    if (!next.length) return;
    $('queue').querySelector('.queue-empty')?.remove();
    $('queue').append(node('div', 'queue-section-heading', 'Дальше в смешанном потоке'));
    for (const t of next) {
      const b = node('button', 'queue-entry', t.title);
      b.append(node('small', '', t.artist));
      b.onclick = () => {
        if (heard.has(key(t))) return;
        qi = queue.indexOf(t);
        load(t);
        renderQueue();
      };
      $('queue').append(b);
    }
  };
  $('play-all').onclick = startMix;
  $('play-all').title = 'Смешать библиотеку и SoundCloud без повторов';
})();
