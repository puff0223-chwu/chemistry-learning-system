import { checkAnswer, getExplanation, pickWrongFeedback, summarizeInput } from '../lib/lockLogic.js'
import { DEFERRED_ACTIONS, evalCondition, isBranch, isEmptyCondition, usesGoalCompletion, walkActions } from '../lib/missionEvents.js'

const MAX_CHAIN_DEPTH = 24 // guards against scenes whose "on enter" events send the student around in circles
const MAX_DELAY_MS = 60000

const freshState = () => ({
  stageId: null, // the stage being played (null = standing at the stage map)
  sceneId: null,
  flags: {},
  items: [],
  notebook: [],
  objectivesDone: [],
  objectiveHints: {}, // objectiveId -> how many hints were shown
  visibility: {}, // objectId -> true/false, set by reveal_object / hide_object
  locks: {}, // lockId -> { wrong, hints, gaveUp, solved, afterGiveUp }
  backgrounds: {}, // sceneId -> background, set by swap_background
  stagesDone: {}, // stageId -> true
  unlocked: {}, // stageId -> true (once unlocked, a stage stays unlocked)
  introduced: {}, // stageId -> true once its opening text was shown
  lastScene: {}, // stageId -> the scene the student was last in
  elapsedMs: 0,
  missionDone: false,
})

const hasText = (html) => !!html && html.replace(/<[^>]*>/g, '').trim().length > 0

// Plays a whole mission: its stages, the stage map, and inside a stage the scenes. Holds the game state (flags,
// current stage and scene...) and executes the unified event actions of spec-v5 §7. It knows nothing about React or
// Supabase; the UI listens through subscribe() and provides ui.message / ui.sound / ui.intro, the log sink and the
// persistence sink. Pass { mission } (several stages) or { stage } (a single stage, handy for tests).
export default class GameEngine {
  constructor({ mission = null, stage = null, ui = {}, onLog = () => {}, onPersist = () => {}, saved = null, startSceneId = null, now = () => Date.now() }) {
    this.mission = mission ?? { stages: [stage], stageLinks: [], settings: {} }
    this.stages = this.mission.stages
    this.stagesById = new Map(this.stages.map((st) => [st.stageId, st]))
    this.links = this.mission.stageLinks ?? []
    this.settings = this.mission.settings ?? {}
    this.ui = ui
    this.onLog = onLog
    this.onPersist = onPersist
    this.now = now
    this.scenes = new Map(this.stages.flatMap((st) => st.scenes.map((s) => [s.sceneId, s])))
    this.stageOf = new Map(this.stages.flatMap((st) => st.scenes.map((s) => [s.sceneId, st.stageId])))
    this.objects = new Map(this.stages.flatMap((st) => st.scenes.flatMap((s) => s.objects.map((o) => [o.id, { scene: s, object: o }]))))
    this.objectives = new Map(this.stages.flatMap((st) => (st.objectives ?? []).map((o) => [o.objectiveId, { objective: o, stageId: st.stageId }])))
    // group id -> the objects in it (a group can be shown or hidden as one)
    this.groupMembers = new Map()
    for (const [id, { object }] of this.objects) {
      if (object.groupId) this.groupMembers.set(object.groupId, [...(this.groupMembers.get(object.groupId) ?? []), id])
    }
    this.listeners = new Set()
    this.depth = 0
    this.destroyed = false
    this.resumed = !!saved
    this.startSceneId = startSceneId

    let base = freshState()
    if (saved) {
      base = { ...base, ...saved }
      // progress saved before stages existed: "stageDone: true" meant the one and only stage
      if (saved.stageDone === true) base.stagesDone = { ...base.stagesDone, [this.stages[0].stageId]: true }
      delete base.stageDone
      if (base.stageId && !this.stagesById.has(base.stageId)) base.stageId = null
      if (base.sceneId && !this.scenes.has(base.sceneId)) base.sceneId = null
    }
    // `transition` is display-only (which way the last scene change should animate) and never saved.
    this.state = { ...base, transition: null, tick: 0 }
    this.refreshUnlocks({ silent: true })
    this.runStart = now()
    this.elapsedBase = base.elapsedMs ?? 0
    this.stageStartedAt = now()
    this.transitionSeq = 0
  }

  get stage() {
    return this.stagesById.get(this.state.stageId) ?? this.stages[0]
  }

  get multiStage() {
    return this.stages.length > 1
  }

  // ---- React bridge ----------------------------------------------------------------------

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  setState(patch, { persist = true } = {}) {
    if (this.destroyed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
    if (persist) this.onPersist(this.serialize())
  }

  tick() {
    this.setState({ tick: this.state.tick + 1 }, { persist: false })
  }

  destroy() {
    this.destroyed = true
    this.listeners.clear()
  }

  // ---- queries ------------------------------------------------------------------------------

  elapsedSeconds() {
    return Math.floor((this.elapsedBase + (this.now() - this.runStart)) / 1000)
  }

  view() {
    const s = this.state
    return {
      flags: s.flags,
      items: s.items,
      objectivesDone: s.objectivesDone,
      notebookCount: s.notebook.length,
      elapsedSeconds: this.elapsedSeconds(),
    }
  }

  check(condition) {
    return evalCondition(condition, this.view())
  }

  scene() {
    return this.state.stageId ? (this.scenes.get(this.state.sceneId) ?? null) : null
  }

  isVisible = (object) => {
    const override = this.state.visibility[object.id]
    const base = override ?? object.visible !== false
    return base && this.check(object.showWhen)
  }

  background(scene) {
    return this.state.backgrounds[scene.sceneId] ?? scene.background
  }

  serialize() {
    const { transition: _t, tick: _k, ...rest } = this.state
    return { ...rest, elapsedMs: this.elapsedBase + (this.now() - this.runStart) }
  }

  log(eventType, { blockId = null, payload = null } = {}) {
    this.onLog(eventType, { stageId: this.state.stageId, sceneId: this.scene()?.sceneId ?? null, blockId, payload })
  }

  // ---- stages: the map, unlocking, entering and leaving ---------------------------------------------

  // Does this stage's incoming connection let the student through right now?
  linkActive(link) {
    return !!this.state.stagesDone[link.from] && (isEmptyCondition(link.when) || this.check(link.when))
  }

  // A stage with no connection pointing at it is a starting stage. Otherwise its incoming connections decide:
  // join "all" needs every one to be active, "any" needs one.
  stageUnlockable(stage) {
    const incoming = this.links.filter((l) => l.to === stage.stageId && this.stagesById.has(l.from))
    if (incoming.length === 0) return true
    return (stage.join ?? 'all') === 'any' ? incoming.some((l) => this.linkActive(l)) : incoming.every((l) => this.linkActive(l))
  }

  // Unlocks whatever has become reachable (never locks anything again). Returns the stages unlocked just now.
  refreshUnlocks({ silent = false } = {}) {
    const fresh = this.stages.filter((st) => !this.state.unlocked[st.stageId] && this.stageUnlockable(st))
    if (fresh.length === 0) return []
    const unlocked = { ...this.state.unlocked, ...Object.fromEntries(fresh.map((st) => [st.stageId, true])) }
    if (silent) this.state = { ...this.state, unlocked }
    else this.setState({ unlocked })
    return fresh
  }

  // What the stage map shows: every stage with its status ('locked' | 'open' | 'done') and why it is locked.
  stageCards() {
    return this.stages.map((st) => {
      const done = !!this.state.stagesDone[st.stageId]
      const status = done ? 'done' : this.state.unlocked[st.stageId] ? 'open' : 'locked'
      const needs = this.links.filter((l) => l.to === st.stageId && this.stagesById.has(l.from)).map((l) => this.stagesById.get(l.from).title)
      return { stage: st, status, needs, join: st.join ?? 'all' }
    })
  }

  async enterStage(stageId, { sceneId = null } = {}) {
    const st = this.stagesById.get(stageId)
    if (!st || !this.state.unlocked[stageId]) return
    const replay = !!this.state.stagesDone[stageId]
    if (replay && st.resetOnRetry) this.resetStage(stageId)
    const target = sceneId ?? (replay && st.resetOnRetry ? null : this.state.lastScene[stageId]) ?? st.startSceneId ?? st.scenes[0]?.sceneId ?? null
    if (!target) return
    const first = !this.state.lastScene[stageId]
    this.stageStartedAt = this.now()
    this.setState({ stageId, sceneId: target, transition: null })
    if (first || replay) this.log('stage_start', { payload: { title: st.title, replay } })
    // opening text, once per stage
    if (hasText(st.intro) && !this.state.introduced[stageId]) {
      this.setState({ introduced: { ...this.state.introduced, [stageId]: true } })
      await this.ui.intro?.(st)
    }
    await this.enterScene(target, null, { animate: false })
    await this.checkCompletion()
  }

  leaveStage() {
    if (!this.state.stageId) return
    this.setState({ stageId: null, transition: null })
  }

  // Replaying a finished stage with "重置" on: puts its scenes, locks, backgrounds and the markers its events set back.
  resetStage(stageId) {
    const st = this.stagesById.get(stageId)
    if (!st) return
    const objectIds = new Set(st.scenes.flatMap((s) => s.objects.map((o) => o.id)))
    const sceneIds = new Set(st.scenes.map((s) => s.sceneId))
    const drop = (obj, keep) => Object.fromEntries(Object.entries(obj).filter(([k]) => keep(k)))
    const ownFlags = new Set()
    const collect = (list) => walkActions(list, (a) => a.action === 'set_flag' && a.flag && ownFlags.add(a.flag))
    for (const scene of st.scenes) {
      collect(scene.onEnter)
      for (const o of scene.objects) {
        collect(o.onClick)
        collect(o.onSuccess)
        collect(o.onGiveUp)
      }
    }
    const ownObjectives = new Set((st.objectives ?? []).map((o) => o.objectiveId))
    this.setState({
      visibility: drop(this.state.visibility, (id) => !objectIds.has(id)),
      locks: drop(this.state.locks, (id) => !objectIds.has(id)),
      backgrounds: drop(this.state.backgrounds, (id) => !sceneIds.has(id)),
      flags: drop(this.state.flags, (f) => !ownFlags.has(f)),
      objectivesDone: this.state.objectivesDone.filter((id) => !ownObjectives.has(id)),
      objectiveHints: drop(this.state.objectiveHints, (id) => !ownObjectives.has(id)),
      lastScene: drop(this.state.lastScene, (id) => id !== stageId),
    })
  }

  // ---- lifecycle ------------------------------------------------------------------------------

  async start() {
    if (this.resumed) {
      if (this.state.stageId && this.scene()) this.log('scene_enter')
      await this.checkCompletion()
      return
    }
    await this.beginFresh()
  }

  // A fresh game: with one stage we walk straight in; with several the student starts at the map.
  async beginFresh() {
    this.log('mission_start')
    const owner = this.startSceneId ? this.stageOf.get(this.startSceneId) : null
    const starters = this.stages.filter((st) => this.state.unlocked[st.stageId])
    if (owner) await this.enterStage(owner, { sceneId: this.startSceneId })
    else if (!this.multiStage || starters.length === 1) await this.enterStage((starters[0] ?? this.stages[0]).stageId)
  }

  // Preview "reset": back to a fresh state, optionally at another scene.
  async restart(sceneId = null) {
    this.elapsedBase = 0
    this.runStart = this.now()
    this.state = { ...freshState(), transition: null, tick: this.state.tick }
    this.refreshUnlocks({ silent: true })
    this.startSceneId = sceneId ?? this.startSceneId
    this.listeners.forEach((l) => l())
    this.onPersist(this.serialize())
    await this.beginFresh()
  }

  setFlag(flag, on) {
    const flags = { ...this.state.flags }
    if (on) flags[flag] = true
    else delete flags[flag]
    this.setState({ flags })
    return this.checkCompletion()
  }

  // ---- player input ---------------------------------------------------------------------------

  async tryExit(direction) {
    const scene = this.scene()
    const target = scene?.exits?.[direction]
    if (!target || !this.scenes.has(target)) return
    const rule = scene.exitConditions?.[direction]
    if (rule?.when && !this.check(rule.when)) {
      await this.ui.message?.(rule.message || '現在還不能過去。')
      return
    }
    await this.enterScene(target, direction)
    await this.checkCompletion()
  }

  async clickObject(object) {
    if (this.state.missionDone) return
    if (object.type === 'lock') {
      await this.openLock(object.id)
      await this.checkCompletion()
      return
    }
    if (object.logClick) this.log('object_click', { blockId: object.id })
    await this.runActions(object.onClick ?? [])
    await this.checkCompletion()
  }

  // ---- the executor -----------------------------------------------------------------------------

  async enterScene(sceneId, kind, { animate = true } = {}) {
    if (!this.scenes.has(sceneId)) return
    if (this.stageOf.get(sceneId) !== this.state.stageId) {
      console.warn('[player] 不能直接走到另一關的場景，已略過（跨關卡請用關卡連線）')
      return
    }
    if (this.depth >= MAX_CHAIN_DEPTH) {
      console.error('[player] 場景連鎖進入次數過多，已停止（請檢查「進入場景時」的事件是否互相跳轉）')
      return
    }
    const from = this.state.sceneId
    this.transitionSeq += 1
    this.setState({
      sceneId,
      lastScene: { ...this.state.lastScene, [this.state.stageId]: sceneId },
      transition: animate && from !== sceneId ? { seq: this.transitionSeq, kind: kind ?? 'fade', from } : null,
    })
    this.log('scene_enter')
    const scene = this.scenes.get(sceneId)
    this.depth += 1
    try {
      await this.runActions(scene.onEnter ?? [])
    } finally {
      this.depth -= 1
    }
  }

  async runActions(list) {
    for (const a of Array.isArray(list) ? list : []) {
      if (this.destroyed) return
      if (!a || typeof a !== 'object') continue
      if (isBranch(a)) {
        await this.runActions(this.check(a.if) ? a.then : a.else)
        continue
      }
      await this.runAction(a)
    }
  }

  async runAction(a) {
    switch (a.action) {
      case 'show_message':
        if (a.message) await this.ui.message?.(a.message)
        break
      case 'goto_scene':
        if (a.sceneId) await this.enterScene(a.sceneId, a.transition || 'fade')
        break
      case 'reveal_object':
      case 'hide_object': {
        if (!a.target) break
        const shown = a.action === 'reveal_object'
        const ids = this.groupMembers.get(a.target) ?? [a.target] // a group target means every object in it
        this.setState({ visibility: { ...this.state.visibility, ...Object.fromEntries(ids.map((id) => [id, shown])) } })
        break
      }
      case 'open_lock':
        await this.openLock(a.target)
        break
      case 'set_flag':
        if (a.flag) this.setState({ flags: { ...this.state.flags, [a.flag]: true } })
        break
      case 'clear_flag': {
        if (!a.flag) break
        const flags = { ...this.state.flags }
        delete flags[a.flag]
        this.setState({ flags })
        break
      }
      case 'add_item':
        if (a.itemId && !this.state.items.includes(a.itemId)) {
          this.setState({ items: [...this.state.items, a.itemId] })
          this.log('item_collect', { payload: { itemId: a.itemId } })
        }
        break
      case 'remove_item':
        this.setState({ items: this.state.items.filter((id) => id !== a.itemId) })
        break
      case 'swap_background':
        if (a.sceneId && a.assetId) this.setState({ backgrounds: { ...this.state.backgrounds, [a.sceneId]: { type: 'image', assetId: a.assetId } } })
        break
      case 'play_sound':
        if (a.assetId) this.ui.sound?.(a.assetId)
        break
      case 'add_notebook':
        if (a.entryText) this.setState({ notebook: [...this.state.notebook, { category: a.category ?? '', text: a.entryText }] })
        break
      case 'complete_objective':
        await this.markObjectiveDone(a.objectiveId ?? a.target)
        break
      case 'complete_stage':
        await this.completeStage()
        break
      case 'delay':
        await new Promise((r) => setTimeout(r, Math.min(Math.max(Number(a.ms) || 0, 0), MAX_DELAY_MS)))
        break
      default:
        if (DEFERRED_ACTIONS.includes(a.action)) console.warn(`[player] 「${a.action}」要等後續階段才支援，已略過`)
        else console.warn(`[player] 不認識的事件：${a.action}`)
    }
  }

  // ---- answer locks (spec-v5 §9) ---------------------------------------------------------------------

  lockObject(id) {
    const entry = this.objects.get(id)
    return entry?.object.type === 'lock' ? entry.object : null
  }

  lockState(id) {
    return this.state.locks[id] ?? { wrong: 0, hints: 0, gaveUp: false, solved: false, afterGiveUp: false }
  }

  setLockState(id, patch) {
    this.setState({ locks: { ...this.state.locks, [id]: { ...this.lockState(id), ...patch } } })
  }

  lockHints(lock) {
    return (lock.hints ?? []).filter((h) => h && h.trim())
  }

  // The dialog asks what it may offer: more hints? the "我真的不會" button?
  lockOptions(id) {
    const lock = this.lockObject(id)
    if (!lock) return { canHint: false, canGiveUp: false, hintsTotal: 0 } // not a lock (or deleted since the progress was saved)
    const st = this.lockState(id)
    const total = this.lockHints(lock).length
    return {
      canHint: !st.solved && !st.gaveUp && st.hints < total && (lock.hintMode === 'onRequest' || st.wrong > 0),
      canGiveUp: !st.solved && !st.gaveUp && !!lock.giveUp?.enabled && st.wrong >= (lock.giveUp.afterAttempts ?? 3),
      hintsTotal: total,
    }
  }

  // Shows the lock's dialog and waits until the student closes it (solved or walked away).
  async openLock(id) {
    if (!id || !this.lockObject(id)) return
    await this.ui.lock?.(id)
  }

  async submitLock(id, input) {
    const lock = this.lockObject(id)
    const st = this.lockState(id)
    if (!lock) return { correct: false, right: 0, total: 1 }
    if (st.solved) return { correct: true, right: 1, total: 1, already: true }
    const result = await checkAnswer(lock, input)
    this.log('lock_attempt', { blockId: id, payload: { answer: summarizeInput(lock, input), correct: result.correct, attempt: st.wrong + 1 } })

    if (result.correct) {
      this.setLockState(id, { solved: true, afterGiveUp: st.gaveUp })
      this.log('lock_solved', { blockId: id, payload: { afterGiveUp: st.gaveUp, attempts: st.wrong + 1, hints: st.hints } })
      this.ui.closeLock?.(id)
      await this.runActions(lock.onSuccess ?? [])
      return result
    }

    const wrong = st.wrong + 1
    const patch = { wrong }
    // "hint after each wrong answer": reveal the next layer automatically (not after giving up)
    const total = this.lockHints(lock).length
    if (!st.gaveUp && lock.hintMode !== 'onRequest' && st.hints < Math.min(wrong, total)) {
      patch.hints = Math.min(wrong, total)
      this.log('hint_shown', { blockId: id, payload: { level: patch.hints, auto: true } })
    }
    this.setLockState(id, patch)
    return { ...result, feedback: pickWrongFeedback(lock, input) }
  }

  requestHint(id) {
    const st = this.lockState(id)
    if (!this.lockOptions(id).canHint) return
    this.setLockState(id, { hints: st.hints + 1 })
    this.log('hint_shown', { blockId: id, payload: { level: st.hints + 1, auto: false } })
  }

  // "我真的不會": reveal the explanation and run the give-up events, but do NOT pass the lock. The student must
  // still answer it correctly themselves (spec §9.3).
  async giveUp(id) {
    const lock = this.lockObject(id)
    if (!lock || !this.lockOptions(id).canGiveUp) return null
    this.setLockState(id, { gaveUp: true })
    this.log('give_up', { blockId: id, payload: { attempts: this.lockState(id).wrong } })
    const explanation = await getExplanation(lock)
    await this.runActions(lock.onGiveUp ?? [])
    return explanation
  }

  // ---- objectives (spec-v5 §11) ---------------------------------------------------------------------

  async markObjectiveDone(id) {
    const entry = this.objectives.get(id)
    if (!id || !entry || this.state.objectivesDone.includes(id)) return false
    this.setState({ objectivesDone: [...this.state.objectivesDone, id] })
    this.log('objective_done', { payload: { objectiveId: id, text: entry.objective.text } })
    await this.runActions(entry.objective.onDone ?? [])
    return true
  }

  // Objectives of the current stage as the objective bar shows them. A hidden ("彩蛋") one only appears once done.
  currentObjectives() {
    const done = this.state.objectivesDone
    return (this.stage.objectives ?? [])
      .filter((o) => (o.hidden ? done.includes(o.objectiveId) : this.check(o.visibleWhen)))
      .map((o) => {
        const isDone = done.includes(o.objectiveId)
        const hints = (o.hints ?? []).filter((h) => h && h.trim())
        return { id: o.objectiveId, text: o.text, done: isDone, hints, hintsShown: Math.min(this.state.objectiveHints[o.objectiveId] ?? 0, hints.length) }
      })
  }

  requestObjectiveHint(id) {
    const o = this.currentObjectives().find((x) => x.id === id)
    if (!o || o.done || o.hintsShown >= o.hints.length) return
    this.setState({ objectiveHints: { ...this.state.objectiveHints, [id]: o.hintsShown + 1 } })
    this.log('hint_shown', { blockId: id, payload: { objectiveId: id, level: o.hintsShown + 1, auto: false } })
  }

  // ---- finishing -------------------------------------------------------------------------------------

  // Called after anything that may have changed the state: finishes objectives whose condition now holds, then
  // the stage itself if its "自動過關" condition holds.
  async checkCompletion() {
    if (!this.state.stageId) return
    for (let round = 0; round < 10; round++) {
      let changed = false
      for (const o of this.stage.objectives ?? []) {
        if (!this.state.objectivesDone.includes(o.objectiveId) && !isEmptyCondition(o.doneWhen) && this.check(o.doneWhen)) {
          changed = (await this.markObjectiveDone(o.objectiveId)) || changed
        }
      }
      if (!changed) break
    }
    if (this.state.stagesDone[this.state.stageId]) return
    const cond = this.stage.completeWhen
    if (isEmptyCondition(cond)) {
      // no rule of its own: goals alone can finish the stage (see usesGoalCompletion)
      if (!this.goalCompletion(this.stage)) return
      const goals = this.stage.objectives.filter((o) => !o.hidden)
      if (!goals.every((o) => this.state.objectivesDone.includes(o.objectiveId))) return
    } else if (!this.check(cond)) return
    await this.completeStage()
  }

  goalCompletion(stage) {
    this.goalCache ??= new Map()
    if (!this.goalCache.has(stage.stageId)) this.goalCache.set(stage.stageId, usesGoalCompletion(this.mission, stage))
    return this.goalCache.get(stage.stageId)
  }

  // The mission is finished when something was completed and every stage that is unlocked has been completed.
  allUnlockedDone() {
    const open = this.stages.filter((st) => this.state.unlocked[st.stageId])
    return open.length > 0 && open.every((st) => this.state.stagesDone[st.stageId])
  }

  async completeStage() {
    const id = this.state.stageId
    if (!id || this.state.stagesDone[id]) return
    this.setState({ stagesDone: { ...this.state.stagesDone, [id]: true } })
    this.log('stage_complete', { payload: { seconds: Math.round((this.now() - this.stageStartedAt) / 1000), title: this.stage.title } })
    await this.runActions(this.stage.onComplete ?? [])
    const fresh = this.refreshUnlocks()
    if (this.allUnlockedDone()) {
      this.setState({ missionDone: true })
      this.log('mission_complete', { payload: { seconds: this.elapsedSeconds() } })
      return
    }
    // more to play: straight into the next stage if there is exactly one (and the teacher allows it), else the map
    const playable = this.stages.filter((st) => this.state.unlocked[st.stageId] && !this.state.stagesDone[st.stageId])
    if (this.settings.autoNextStage && playable.length === 1 && fresh.some((st) => st.stageId === playable[0].stageId)) await this.enterStage(playable[0].stageId)
    else this.leaveStage()
  }
}
