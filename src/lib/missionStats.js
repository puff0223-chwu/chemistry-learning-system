// 任務紀錄的統計（純函式，不碰 Supabase，可用 node 直接測）。
// 一筆「場次」= { session, logs }，logs 依 seq 由小到大。

export const MISSION_EVENT_LABELS = {
  mission_start: '開始任務',
  stage_start: '進入關卡',
  stage_complete: '完成關卡',
  scene_enter: '進入場景',
  object_click: '點擊物件',
  item_collect: '撿到道具',
  lock_attempt: '作答',
  lock_solved: '解開題目',
  hint_shown: '看提示',
  give_up: '放棄這題',
  objective_done: '完成任務目標',
  mission_complete: '完成任務',
  mission_quit: '中途離開',
}

const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : '—')
const round1 = (n) => Math.round(n * 10) / 10

// 從任務資料（已發布版本）整理「代號 → 老師看得懂的名字」。
export function buildNames(data) {
  const names = { stages: new Map(), scenes: new Map(), blocks: new Map(), locks: new Map(), objectives: new Map() }
  for (const st of data?.stages ?? []) {
    names.stages.set(st.stageId, st.title)
    for (const o of st.objectives ?? []) names.objectives.set(o.objectiveId, o.text)
    for (const sc of st.scenes ?? []) {
      names.scenes.set(sc.sceneId, sc.name)
      for (const ob of sc.objects ?? []) {
        names.blocks.set(ob.id, ob.name)
        if (ob.type === 'lock') names.locks.set(ob.id, { name: ob.name, scene: sc.name, stage: st.title })
      }
    }
  }
  return names
}

export function mergeNames(list) {
  const out = { stages: new Map(), scenes: new Map(), blocks: new Map(), locks: new Map(), objectives: new Map() }
  for (const n of list) for (const key of Object.keys(out)) for (const [k, v] of n[key]) out[key].set(k, v)
  return out
}

const lookup = (map, id, fallback) => (id ? (map.get(id) ?? fallback) : fallback)

// 時間軸上每一筆事件的白話說明。
export function describeMissionEvent(log, names) {
  const p = log.payload ?? {}
  const stage = lookup(names.stages, log.stage_id, '')
  const scene = lookup(names.scenes, log.scene_id, '')
  const block = lookup(names.blocks, log.block_id, '（已刪除的物件）')
  switch (log.event_type) {
    case 'stage_start':
      return `${p.title ?? stage}${p.replay ? '（重玩）' : ''}`
    case 'stage_complete':
      return `${p.title ?? stage}（用了 ${p.seconds ?? '?'} 秒）`
    case 'scene_enter':
      return scene
    case 'object_click':
      return block
    case 'item_collect':
      return p.itemId ?? ''
    case 'lock_attempt':
      return `${block}：「${p.answer ?? ''}」${p.correct ? '✅ 答對' : '❌ 答錯'}（第 ${p.attempt ?? '?'} 次）`
    case 'lock_solved':
      return `${block}（共答 ${p.attempts ?? '?'} 次、看 ${p.hints ?? 0} 個提示${p.afterGiveUp ? '、放棄後看答案' : ''}）`
    case 'hint_shown':
      return p.objectiveId
        ? `任務目標「${lookup(names.objectives, p.objectiveId, '（已刪除）')}」第 ${p.level ?? '?'} 個提示`
        : `${block} 第 ${p.level ?? '?'} 個提示${p.auto ? '（答錯多次自動出現）' : ''}`
    case 'give_up':
      return `${block}（已答錯 ${p.attempts ?? '?'} 次）`
    case 'objective_done':
      return p.text ?? lookup(names.objectives, p.objectiveId, '')
    case 'mission_complete':
      return `共 ${p.seconds ?? '?'} 秒`
    default:
      return ''
  }
}

const eventOrder = (a, b) => (a.seq ?? 0) - (b.seq ?? 0)

export function summarizeMissionSession({ session, logs }, titleOf = () => '（已刪除的任務）') {
  const sorted = [...logs].sort(eventOrder)
  const doneStages = new Set(sorted.filter((l) => l.event_type === 'stage_complete').map((l) => l.stage_id))
  const attempts = sorted.filter((l) => l.event_type === 'lock_attempt')
  const wrong = attempts.filter((l) => l.payload?.correct === false).length
  const complete = sorted.find((l) => l.event_type === 'mission_complete')
  const stageSeconds = sorted.filter((l) => l.event_type === 'stage_complete').reduce((s, l) => s + (l.payload?.seconds ?? 0), 0)
  const seconds = complete?.payload?.seconds ?? stageSeconds
  const quit = sorted.some((l) => l.event_type === 'mission_quit')
  return {
    date: session.started_at,
    purpose: session.purpose,
    grade: session.grade,
    className: session.class_name,
    seat: session.seat_number,
    name: session.student_name,
    mission: titleOf(session.mission_id),
    version: session.mission_version ?? '',
    stagesDone: doneStages.size,
    seconds,
    minutes: seconds ? (seconds / 60).toFixed(1) : '0.0',
    attempts: attempts.length,
    wrong,
    hints: sorted.filter((l) => l.event_type === 'hint_shown').length,
    giveUps: sorted.filter((l) => l.event_type === 'give_up').length,
    status: complete ? '完成' : quit ? '中途離開' : '進行中／未完成',
    completed: !!complete,
  }
}

// 卡關分析：每道題、每個任務目標，學生卡在哪。排序：答錯率高、放棄多的在最上面。
export function analyzeStuck(rows, names) {
  const locks = new Map()
  const objectives = new Map()
  const slot = (map, id) => {
    if (!map.has(id)) map.set(id, { id, tried: new Set(), wrongSessions: new Set(), solved: new Set(), attempts: 0, wrong: 0, hints: 0, giveUps: new Set(), solveAttempts: [], done: new Set() })
    return map.get(id)
  }
  for (const { session, logs } of rows) {
    const sid = session.session_uuid
    for (const l of logs) {
      const p = l.payload ?? {}
      if (l.event_type === 'lock_attempt' && l.block_id) {
        const s = slot(locks, l.block_id)
        s.tried.add(sid)
        s.attempts++
        if (p.correct === false) {
          s.wrong++
          s.wrongSessions.add(sid)
        }
      } else if (l.event_type === 'lock_solved' && l.block_id) {
        const s = slot(locks, l.block_id)
        s.tried.add(sid)
        s.solved.add(sid)
        if (typeof p.attempts === 'number') s.solveAttempts.push(p.attempts)
      } else if (l.event_type === 'give_up' && l.block_id) {
        const s = slot(locks, l.block_id)
        s.tried.add(sid)
        s.giveUps.add(sid)
      } else if (l.event_type === 'hint_shown') {
        if (p.objectiveId) slot(objectives, p.objectiveId).hints++
        else if (l.block_id) {
          const s = slot(locks, l.block_id)
          s.tried.add(sid)
          s.hints++
        }
      } else if (l.event_type === 'objective_done' && p.objectiveId) {
        slot(objectives, p.objectiveId).done.add(sid)
      }
    }
  }
  const total = rows.length
  const lockRows = [...locks.values()]
    .map((s) => {
      const info = names.locks.get(s.id)
      return {
        id: s.id,
        name: info?.name ?? '（已刪除的題目）',
        where: info ? `${info.stage}／${info.scene}` : '',
        students: s.tried.size,
        attempts: s.attempts,
        wrong: s.wrong,
        wrongRate: pct(s.wrong, s.attempts),
        wrongRateValue: s.attempts ? s.wrong / s.attempts : 0,
        wrongStudents: s.wrongSessions.size,
        avgAttempts: s.solveAttempts.length ? round1(s.solveAttempts.reduce((a, b) => a + b, 0) / s.solveAttempts.length) : '—',
        solved: s.solved.size,
        giveUps: s.giveUps.size,
        hints: s.hints,
      }
    })
    .sort((a, b) => b.giveUps - a.giveUps || b.wrongRateValue - a.wrongRateValue || b.attempts - a.attempts)
  const objectiveRows = [...objectives.values()]
    .map((s) => ({
      id: s.id,
      text: names.objectives.get(s.id) ?? '（已刪除的目標）',
      done: s.done.size,
      doneRate: pct(s.done.size, total),
      hints: s.hints,
    }))
    .sort((a, b) => a.done - b.done || b.hints - a.hints)
  return { locks: lockRows, objectives: objectiveRows, total }
}
