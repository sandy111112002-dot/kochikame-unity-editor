(function (global) {
  'use strict';

  const FORMAT = 'UnifiedFlightScene';
  const VERSION = 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const point = (value, fallback = { x: 0, y: 0 }) => ({
    x: finite(value && value.x, fallback.x),
    y: finite(value && value.y, fallback.y),
    ...(value && value.role ? { role: value.role } : {})
  });

  function emptyScene() {
    return {
      format: FORMAT,
      version: VERSION,
      meta: { source: FORMAT },
      playback: { duration: 1, loop: false, speed: 1 },
      actors: [],
      trajectories: [],
      events: [],
      collision: { enabled: false, projectileRadius: 0, targets: [], responses: [] }
    };
  }

  function normalizeUnified(input) {
    const scene = emptyScene();
    scene.meta = { ...scene.meta, ...(input.meta || {}) };
    scene.playback = {
      duration: Math.max(.001, finite(input.playback && input.playback.duration, 1)),
      loop: Boolean(input.playback && input.playback.loop),
      speed: Math.max(.01, finite(input.playback && input.playback.speed, 1))
    };
    scene.actors = Array.isArray(input.actors) ? input.actors.map((actor, index) => ({
      id: String(actor.id || `actor-${index + 1}`),
      role: actor.role || 'actor',
      position: point(actor.position),
      collider: actor.collider ? { radius: Math.max(0, finite(actor.collider.radius)) } : null
    })) : [];
    scene.trajectories = Array.isArray(input.trajectories) ? input.trajectories.map((path, index) => ({
      id: String(path.id || `trajectory-${index + 1}`),
      delay: Math.max(0, finite(path.delay)),
      duration: Math.max(.001, finite(path.duration, scene.playback.duration)),
      speed: Math.max(0, finite(path.speed)),
      easing: path.easing || 'linear',
      speedSegments: Array.isArray(path.speedSegments) ? clone(path.speedSegments) : undefined,
      points: Array.isArray(path.points) ? path.points.map(p => point(p)) : []
    })) : [];
    scene.events = Array.isArray(input.events) ? input.events.map((event, index) => ({
      id: String(event.id || `event-${index + 1}`),
      type: event.type || 'event',
      time: Math.max(0, finite(event.time)),
      params: event.params == null ? null : clone(event.params)
    })).sort((a, b) => a.time - b.time) : [];
    const collision = input.collision || {};
    scene.collision = {
      enabled: Boolean(collision.enabled),
      projectileRadius: Math.max(0, finite(collision.projectileRadius)),
      targets: Array.isArray(collision.targets) ? collision.targets.map(target => ({
        actorId: String(target.actorId || ''), radius: Math.max(0, finite(target.radius))
      })) : [],
      responses: Array.isArray(collision.responses) ? clone(collision.responses) : []
    };
    return scene;
  }

  function fromCollisionEditor(input) {
    const config = input.config || {};
    const actors = input.actors || {};
    const actor = (id, role, radius) => ({ id, role, position: point(actors[id]), collider: { radius: finite(radius) } });
    const duration = Math.max(1, finite(config.launchDelay) + 1.2 + finite(config.impactPause) + finite(config.turnTime) + .5);
    return normalizeUnified({
      format: FORMAT, version: VERSION,
      meta: { source: 'SpinningTopCollisionEditor', sourceVersion: finite(input.version, 1) },
      playback: { duration },
      actors: [actor('ryotsu', 'attacker', 0), actor('doctor', 'target', config.doctorRadius), actor('reiko', 'target', config.reikoRadius)],
      trajectories: [{ id: 'spinning-top', delay: finite(config.launchDelay), duration, speed: finite(config.speed, 360), easing: 'linear', points: [] }],
      events: [{ id: 'launch', type: 'launch', time: finite(config.launchDelay), params: null }],
      collision: {
        enabled: true,
        projectileRadius: finite(config.topRadius),
        targets: [{ actorId: 'doctor', radius: finite(config.doctorRadius) }, { actorId: 'reiko', radius: finite(config.reikoRadius) }],
        responses: [{ targetId: 'doctor', type: 'retarget', nextTargetId: 'reiko', pause: finite(config.impactPause), turnDuration: finite(config.turnTime), turnStrength: finite(config.turnStrength) }, { targetId: 'reiko', type: config.finish === 'pass' ? 'pass' : 'stop' }]
      }
    });
  }

  function fromFlightEditorProject(input) {
    const controls = input.controls || {};
    const duration = Math.max(.001, finite(controls.duration, 1.8));
    return normalizeUnified({
      format: FORMAT, version: VERSION,
      meta: { source: 'UnityFlightEditorProject', sourceVersion: finite(input.version, 1) },
      playback: { duration },
      actors: [
        { id: 'attacker', role: 'attacker', position: point(input.attackerPosition) },
        { id: 'target', role: 'target', position: point(input.targetPosition) }
      ],
      trajectories: (input.trajectories || []).map((path, index) => ({ id: path.id || `trajectory-${index + 1}`, delay: finite(path.delaySeconds), duration, speed: finite(path.speed, controls.bulletSpeed), easing: path.easing || controls.easing, speedSegments: path.speedSegments, points: path.points || [] })),
      events: (input.events || []).map(event => ({ id: event.id, type: event.type, time: event.time, params: event.params || null })),
      collision: input.collision || { enabled: false }
    });
  }

  function normalizeDocument(input) {
    if (!input || typeof input !== 'object') throw new Error('無效的編輯器資料');
    if (input.format === FORMAT || input.formatName === FORMAT) return normalizeUnified(input);
    if (input.formatName === 'SpinningTopCollisionEditor') return fromCollisionEditor(input);
    if (input.format === 'UnityFlightEditorProject') return fromFlightEditorProject(input);
    throw new Error(`不支援的資料格式：${input.format || input.formatName || '未知'}`);
  }

  function segmentCircle(from, to, center, radius) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(center.x - from.x, center.y - from.y) <= radius;
    const t = clamp(((center.x - from.x) * dx + (center.y - from.y) * dy) / lengthSquared, 0, 1);
    return Math.hypot(from.x + dx * t - center.x, from.y + dy * t - center.y) <= radius;
  }

  function createClock(options = {}) {
    let duration = Math.max(.001, finite(options.duration, 1));
    let time = clamp(finite(options.time), 0, duration);
    let playing = false, frame = 0, last = 0;
    const now = options.now || (() => performance.now());
    const raf = options.requestFrame || (callback => requestAnimationFrame(callback));
    const caf = options.cancelFrame || (id => cancelAnimationFrame(id));
    const emit = () => options.onUpdate && options.onUpdate({ time, duration, progress: time / duration, playing });
    function tick(stamp) {
      if (!playing) return;
      if (!last) last = stamp;
      const delta = Math.min(.1, Math.max(0, (stamp - last) / 1000));
      last = stamp;
      time = Math.min(duration, time + delta * Math.max(.01, finite(options.speed, 1)));
      emit();
      if (time >= duration) {
        if (options.loop) time = 0;
        else { playing = false; frame = 0; options.onComplete && options.onComplete(); return; }
      }
      frame = raf(tick);
    }
    return {
      play() { if (time >= duration) time = 0; if (!playing) { playing = true; last = now(); emit(); frame = raf(tick); } },
      pause() { playing = false; if (frame) caf(frame); frame = 0; last = 0; emit(); },
      stop() { playing = false; if (frame) caf(frame); frame = 0; last = 0; time = 0; emit(); },
      seek(value) { time = clamp(finite(value), 0, duration); last = now(); emit(); },
      setDuration(value) { duration = Math.max(.001, finite(value, duration)); time = clamp(time, 0, duration); emit(); },
      state() { return { time, duration, progress: time / duration, playing }; },
      destroy() { playing = false; if (frame) caf(frame); frame = 0; }
    };
  }

  global.UnifiedFlightRuntime = Object.freeze({ FORMAT, VERSION, emptyScene, normalizeDocument, fromCollisionEditor, fromFlightEditorProject, segmentCircle, createClock });
})(typeof globalThis !== 'undefined' ? globalThis : window);
