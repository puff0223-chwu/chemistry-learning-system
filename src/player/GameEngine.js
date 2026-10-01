import { DEFERRED_ACTIONS, evalCondition, isBranch, isEmptyCondition } from '../lib/missionEvents.js'

const MAX_CHAIN_DEPTH = 24 // guards against scenes whose "on enter" events send the student around in circles
const MAX_DELAY_MS = 60000

const freshState = (sceneId) => ({
  sceneId,
  flags: {},
  items: [],
  notebook: [],
  objectivesDone: [],
  visibility: {}, // objectId -> true/false, set by reveal_object / hide_object
  backgrounds: {}, // sceneId -> background, set by swap_background
  elapsedMs: 0,
  stageDone: false,
  missionDone: false,
})

// Runs one mission stage: holds the game state (flags, bag, current scene...) and executes the
// unified event actions of spec-v5 §7. It knows nothing about React or Supabase; the UI listens through
// subscribe() and provides ui.message / ui.sound, the log sink and the persistence sink.
export default class GameEngine {
  constructor({ stage, ui = {}, onLog = () => {}, onPersist = () => {}, saved = null, startSceneId = null, now = () => Date.now() }) {
    this.stage = stage
    this.ui = ui
    this.onLog = onLog
    this.onPersist = onPersist
    this.now = now
    this.scenes = new Map(stage.scenes.map((s) => [s.sceneId, s]))
    this.objects = new Map(stage.scenes.flatMap((s) => s.objects.map((o) => [o.id, { scene: s, object: o }])))
    this.listeners = new Set()
    this.depth = 0
    this.destroyed = false
    this.resumed = !!saved
    const first = startSceneId ?? stage.startSceneId ?? stage.scenes[0]?.sceneId ?? null
    const base = saved && this.scenes.has(saved.sceneId) ? { ...freshState(first), ...saved } : freshState(first)
    // `transition` is display-only (which way the last scene change should animate) and never saved.
    this.state = { ...base, transition: null, tick: 0 }
    this.runStart = now()
    this.elapsedBase = base.elapsedMs ?? 0
    this.transitionSeq = 0
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
    return this.scenes.get(this.state.sceneId) ?? null
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
    const scene = this.scene()
    this.onLog(eventType, { stageId: this.stage.stageId, sceneId: scene?.sceneId ?? null, blockId, payload })
  }

  // ---- lifecycle ------------------------------------------------------------------------------

  async start() {
    if (!this.resumed) this.log('mission_start')
    const scene = this.scene()
    if (!scene) return
    if (!this.resumed) this.log('stage_start')
    if (!this.resumed) await this.enterScene(scene.sceneId, null, { animate: false })
    else this.log('scene_enter')
    await this.checkCompletion()
  }

  // Preview "reset": back to a fresh state, optionally at another scene.
  async restart(sceneId = null) {
    this.elapsedBase = 0
    this.runStart = this.now()
    this.state = { ...freshState(sceneId ?? this.stage.startSceneId), transition: null, tick: this.state.tick }
    this.listeners.forEach((l) => l())
    this.onPersist(this.serialize())
    await this.enterScene(this.state.sceneId, null, { animate: false })
    await this.checkCompletion()
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
    if (object.logClick) this.log('object_click', { blockId: object.id })
    await this.runActions(object.onClick ?? [])
    await this.checkCompletion()
  }

  // ---- the executor -----------------------------------------------------------------------------

  async enterScene(sceneId, kind, { animate = true } = {}) {
    if (!this.scenes.has(sceneId)) return
    if (this.depth >= MAX_CHAIN_DEPTH) {
      console.error('[player] 場景連鎖進入次數過多，已停止（請檢查「進入場景時」的事件是否互相跳轉）')
      return
    }
    const from = this.state.sceneId
    this.transitionSeq += 1
    this.setState({
      sceneId,
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
    for (const a of list ?? []) {
      if (this.destroyed) return
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
      case 'hide_object':
        if (a.target) this.setState({ visibility: { ...this.state.visibility, [a.target]: a.action === 'reveal_object' } })
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
        if (a.objectiveId && !this.state.objectivesDone.includes(a.objectiveId)) {
          this.setState({ objectivesDone: [...this.state.objectivesDone, a.objectiveId] })
          this.log('objective_done', { payload: { objectiveId: a.objectiveId } })
        }
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

  async checkCompletion() {
    const cond = this.stage.completeWhen
    if (this.state.stageDone || isEmptyCondition(cond) || !this.check(cond)) return
    await this.completeStage()
  }

  async completeStage() {
    if (this.state.stageDone) return
    this.setState({ stageDone: true })
    this.log('stage_complete', { payload: { seconds: this.elapsedSeconds() } })
    await this.runActions(this.stage.onComplete ?? [])
    // One stage for now; the stage map (later phase) decides what comes next.
    this.setState({ missionDone: true })
    this.log('mission_complete', { payload: { seconds: this.elapsedSeconds() } })
  }
}
