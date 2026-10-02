import { useState } from 'react'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { ANSWER_TYPES, answerTypeMeta, newAnswer, validateLock } from '../lib/lockLogic.js'
import { AnswerEditor } from './LockEditor.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2'
const COMMON = ['choice', 'text', 'number', 'multiChoice']
const EXAMPLES = {
  choice: '例如：下列哪一個是酸性溶液？',
  text: '例如：寫出食鹽的化學式',
  number: '例如：算出溶液的濃度（可設誤差與單位）',
  multiChoice: '例如：下列哪些是實驗室安全守則？（全部選對才算對）',
}

const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, '').trim()
const STEPS = ['題目', '怎麼回答', '正確答案', '提示', '答對之後', '完成']

// 題目精靈: one question at a time, from "what do you ask" to "what happens when they get it right".
// It edits the lock in place (every change is saved like any other edit), so closing it at any step loses nothing.
export default function LockWizard({ lock, assets, onChange, onPreview, onClose }) {
  const [step, setStep] = useState(0)
  const [tried, setTried] = useState(false) // show red "required" messages only after the teacher tried to continue
  const result = validateLock(lock)
  const promptMissing = plain(lock.prompt) === ''

  const blockers = step === 0 ? (promptMissing ? ['請先寫下題目，學生才知道要回答什麼。'] : []) : step === 2 ? result.errors : []
  function next() {
    if (blockers.length) {
      setTried(true)
      return
    }
    setTried(false)
    setStep(step + 1)
  }

  function switchType(type) {
    if (type === lock.answerType) return
    const drafts = { ...(lock.answerDrafts ?? {}), [lock.answerType]: lock.answer }
    onChange({ answerType: type, answer: drafts[type] ?? newAnswer(type), answerDrafts: drafts }, { important: true })
  }

  // answer-time message and "remember it" marker, kept simple: the full list stays in the 「答對後」 tab
  const onSuccess = lock.onSuccess ?? []
  const message = onSuccess.find((a) => a.action === 'show_message')?.message ?? ''
  const flagName = `解開${lock.name}`
  const remembers = onSuccess.some((a) => a.action === 'set_flag' && a.flag === flagName)
  const others = onSuccess.filter((a) => a.action !== 'show_message' && !(a.action === 'set_flag' && a.flag === flagName)).length
  function setMessage(text) {
    const rest = onSuccess.filter((a) => a.action !== 'show_message')
    onChange({ onSuccess: text ? [{ action: 'show_message', message: text }, ...rest] : rest }, { key: `wizard-msg-${lock.id}` })
  }
  function setRemember(on) {
    const rest = onSuccess.filter((a) => !(a.action === 'set_flag' && a.flag === flagName))
    onChange({ onSuccess: on ? [...rest, { action: 'set_flag', flag: flagName }] : rest }, { important: true })
  }

  const hints = [...(lock.hints ?? []), '', '', ''].slice(0, 3)
  const meta = answerTypeMeta(lock.answerType)
  const typeCard = (t, example) => (
    <button
      key={t.type}
      type="button"
      onClick={() => switchType(t.type)}
      className={`text-left rounded-xl border p-3 ${lock.answerType === t.type ? 'border-cyan bg-cyan/10 ring-1 ring-cyan' : 'border-slate-200 hover:bg-slate-50'}`}
    >
      <span className="block font-bold">
        {t.icon} {t.label}
      </span>
      <span className="block text-xs text-slate-500 mt-0.5">{example ? EXAMPLES[t.type] : t.desc}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0, 10, 30, 0.6)' }}>
      <div className="bg-white text-navy rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="px-6 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">🧙 題目精靈</h2>
            <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-navy">
              先跳過，之後再設 ✕
            </button>
          </div>
          <ol className="flex items-center gap-1 mt-3 text-xs">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-1 flex-1 min-w-0">
                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-bold ${i === step ? 'bg-cyan text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{i < step ? '✓' : i + 1}</span>
                <span className={`truncate ${i === step ? 'font-bold' : 'text-slate-500'}`}>{label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-4">
          {step === 0 && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-bold">這一題叫什麼名字？</span>
                <span className="text-xs text-slate-500">只有你看得到，方便在清單裡認出它，例如「保險箱密碼」。</span>
                <input value={lock.name} onChange={(e) => onChange({ name: e.target.value }, { key: `wizard-name-${lock.id}` })} className={inputClass} />
              </label>
              <div className="flex flex-col gap-1">
                <span className="font-bold">
                  學生要回答什麼問題？ <span className="text-red-600">（必填）</span>
                </span>
                <span className="text-xs text-slate-500">學生打開這一題時，會先看到這段文字。可以放圖片、化學式。</span>
                <RichTextEditor key={lock.id} value={lock.prompt} onChange={(html) => onChange({ prompt: html }, { key: `prompt-${lock.id}` })} minHeight={110} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="font-bold">學生要怎麼回答？</p>
              <div className="grid grid-cols-2 gap-2">{COMMON.map((type) => typeCard(answerTypeMeta(type), true))}</div>
              <details open={!COMMON.includes(lock.answerType)} className="text-sm">
                <summary className="cursor-pointer text-slate-600 hover:text-navy">更多題型（配對、排順序、分類、點圖片、轉盤密碼、方向鎖）</summary>
                <div className="grid grid-cols-2 gap-2 mt-2">{ANSWER_TYPES.filter((t) => !COMMON.includes(t.type)).map((t) => typeCard(t, false))}</div>
              </details>
            </>
          )}

          {step === 2 && (
            <>
              <p className="font-bold">
                {meta.icon} {meta.label}：正確答案是什麼？ <span className="text-red-600">（必填）</span>
              </p>
              <AnswerEditor lock={lock} assets={assets} onChange={(answer) => onChange({ answer }, { key: `answer-${lock.id}` })} />
            </>
          )}

          {step === 3 && (
            <>
              <p className="font-bold">
                學生答錯時，要給什麼提示？ <span className="text-xs font-normal text-slate-500">（可略過）</span>
              </p>
              <p className="text-xs text-slate-500">答錯後會依序出現提示一、二、三。不想給的就留空。要改成「學生按了才給提示」，請在完成後到右側「提示」分頁設定。</p>
              {hints.map((h, i) => (
                <label key={i} className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">提示 {i + 1}{i === 2 ? '（最明顯的提示）' : ''}</span>
                  <input value={h} onChange={(e) => onChange({ hints: hints.map((x, j) => (j === i ? e.target.value : x)) }, { key: `wizard-hint-${lock.id}-${i}` })} placeholder={['例如：想想看酸的 pH 值', '', '例如：答案和檸檬汁一樣'][i]} className={inputClass} />
                </label>
              ))}
              {lock.giveUp?.enabled && (
                <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                  <span className="text-sm font-bold">學生按「我真的不會」時，要看到什麼解析？</span>
                  <span className="text-xs text-slate-500">答錯 {lock.giveUp.afterAttempts ?? 3} 次後學生可以放棄，這時會顯示正確答案和這段解析。不想提供就留空（會有一個黃色提醒，不影響發布）。</span>
                  <RichTextEditor key={`ex-${lock.id}`} value={lock.explanation} onChange={(html) => onChange({ explanation: html }, { key: `explain-${lock.id}` })} minHeight={80} />
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <p className="font-bold">
                學生答對之後呢？ <span className="text-xs font-normal text-slate-500">（可略過）</span>
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-sm">要對學生說什麼？</span>
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：答對了！保險箱打開了" className={inputClass} />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={remembers} onChange={(e) => setRemember(e.target.checked)} className="mt-1" />
                <span>
                  記住「{flagName}」這件事
                  <span className="block text-xs text-slate-500">之後可以拿它當條件，例如「解開保險箱之後，門才打得開」。</span>
                </span>
              </label>
              {others > 0 && <p className="text-xs bg-slate-50 rounded-lg p-2 text-slate-600">這一題在「答對後」還有 {others} 個其他步驟，不會被這裡改動。</p>}
              <p className="text-xs text-slate-500">想做更多事（讓東西出現、換場景、解開任務目標…），完成後到右側「答對後」分頁加。</p>
            </>
          )}

          {step === 5 && (
            <>
              <p className="font-bold">✅ 這一題設定好了</p>
              {result.errors.length === 0 && result.warnings.length === 0 ? (
                <p className="text-emerald-700">檢查通過，沒有發現問題。</p>
              ) : (
                <ul className="text-sm flex flex-col gap-1.5">
                  {result.errors.map((t, i) => (
                    <li key={`e${i}`} className="bg-red-50 text-red-700 rounded-lg px-2 py-1.5">
                      ❌ {t}
                    </li>
                  ))}
                  {result.warnings.map((t, i) => (
                    <li key={`w${i}`} className="bg-amber-50 text-amber-800 rounded-lg px-2 py-1.5">
                      ⚠️ {t}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500">之後想改，點選這一題，右側有「出題」「提示」「答對後」分頁；也可以在這一題上按右鍵再選「題目精靈」重新走一遍。</p>
            </>
          )}

          {tried && blockers.length > 0 && (
            <ul className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 flex flex-col gap-1">
              {blockers.map((t) => (
                <li key={t}>❌ {t}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 flex items-center gap-2">
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl px-4 py-2">
            ← 上一步
          </button>
          <span className="flex-1" />
          {step < 5 ? (
            <button type="button" onClick={next} className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-5 py-2 font-bold">
              {step === 3 || step === 4 ? '下一步（可略過）→' : '下一步 →'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onPreview()
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl px-4 py-2 font-bold"
              >
                ▶ 試答看看
              </button>
              <button type="button" onClick={onClose} className="bg-cyan hover:bg-cyan-dark text-white rounded-xl px-5 py-2 font-bold">
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
