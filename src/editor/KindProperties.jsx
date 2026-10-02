import { useState } from 'react'
import { genId } from '../lib/missionSchema.js'
import { assetUrl } from '../lib/assets.js'
import AssetPicker from './AssetPicker.jsx'
import { ConditionEditor, EventEditor } from './EventEditor.jsx'
import IconPicker from './IconPicker.jsx'
import VisibilityBlock from './VisibilityBlock.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'

function Section({ title, hint, children }) {
  return (
    <section className="flex flex-col gap-2 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
      <h3 className="font-bold text-sm">{title}</h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </section>
  )
}

function NameField({ object, onUpdate, label }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">名稱（只有你看得到，方便辨認）　{label}</span>
      <input value={object.name} onChange={(e) => onUpdate(object.id, { name: e.target.value }, { key: `prop-${object.id}-name` })} className={inputClass} />
    </label>
  )
}

// ---------------------------------------------------------------- socket (插座)

// Where an item is put to make something happen: a keyhole, a safe, a test-tube rack, a comparison table.
export function SocketProperties({ object, ctx, onUpdate, onAddItem }) {
  const [iconPicker, setIconPicker] = useState(false)
  const items = ctx.items ?? []
  const accepts = object.accepts ?? []
  const set = (patch, key) => onUpdate(object.id, patch, key ? { key: `prop-${object.id}-${key}` } : { important: true })
  const toggle = (id) => set({ accepts: accepts.includes(id) ? accepts.filter((x) => x !== id) : [...accepts, id] })
  const hints = [...(object.hints ?? []), '', '', ''].slice(0, 3)

  return (
    <div className="flex flex-col gap-4">
      <NameField object={object} onUpdate={onUpdate} label="插座" />
      <p className="text-xs bg-slate-50 rounded-lg p-2 text-slate-600">🔌 插座：學生把「證物袋裡的物品」放到這裡，就會發生事情，例如鑰匙插進鎖孔、試管放上試管架。</p>

      <Section title="① 哪些物品可以放進來？（必填）">
        {items.length === 0 && <p className="text-xs text-amber-700">還沒有任何物品。請按下面「＋ 新增物品」，或到上方「🎒 物品」建立。</p>}
        <div className={`flex flex-col gap-1 rounded-lg ${accepts.filter(Boolean).length === 0 ? 'ring-1 ring-red-400 bg-red-50 p-1.5' : ''}`}>
          {items.map((it) => (
            <label key={it.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={accepts.includes(it.id)} onChange={() => toggle(it.id)} />
              <span>{it.icon}</span>
              <span>{it.name || '（未命名的物品）'}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => set({ accepts: [...accepts, onAddItem()] })} className="self-start text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">
          ＋ 新增物品
        </button>
      </Section>

      <Section title="② 放進去之後，物品會…">
        {[
          [true, '🫥 用掉（從證物袋消失）', '例如鑰匙插進鎖孔就不見了。'],
          [false, '🎒 還留在證物袋', '例如只是放上去比對，之後還能拿回來。'],
        ].map(([value, title, desc]) => (
          <label key={String(value)} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${(object.consumeItem !== false) === value ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={`consume-${object.id}`} checked={(object.consumeItem !== false) === value} onChange={() => set({ consumeItem: value })} className="mt-1" />
            <span className="text-sm">
              <b>{title}</b>
              <span className="block text-xs text-slate-500">{desc}</span>
            </span>
          </label>
        ))}
      </Section>

      <Section title="③ 放對物品時，會發生什麼事？" hint="沒有設定的話，放對了也不會有任何反應（發布前檢查會提醒）。">
        <EventEditor actions={object.onMatch ?? []} onChange={(v) => onUpdate(object.id, { onMatch: v }, { key: `onmatch-${object.id}` })} ctx={{ ...ctx, selfId: object.id, selfName: object.name }} />
      </Section>

      <Section title="④ 放錯物品時，會發生什麼事？" hint="不設定的話，學生會看到「好像插不進去…」。">
        <EventEditor actions={object.onWrongItem ?? []} onChange={(v) => onUpdate(object.id, { onWrongItem: v }, { key: `onwrong-${object.id}` })} ctx={{ ...ctx, selfId: object.id, selfName: object.name }} />
      </Section>

      <Section title="⑤ 提示（學生什麼都沒拿、直接點它時）" hint="每點一次出現下一則；不想給的留空。">
        {hints.map((h, i) => (
          <input key={i} value={h} onChange={(e) => set({ hints: hints.map((x, j) => (j === i ? e.target.value : x)) }, `hint-${i}`)} placeholder={['例如：找找看有沒有鑰匙', '', '例如：鑰匙在抽屜裡'][i]} className={inputClass} />
        ))}
      </Section>

      <Section title="⑥ 外觀">
        {[
          ['icon', '👁 看得見的圖示', '學生看得到這個插座。'],
          ['invisible', '🫥 隱形（疊在圖片上）', '例如圖片上的鎖孔位置，學生看不到框，但拖到那裡有反應。'],
        ].map(([value, title, desc]) => (
          <label key={value} className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${(object.appearance ?? 'icon') === value ? 'border-cyan bg-cyan/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            <input type="radio" name={`look-${object.id}`} checked={(object.appearance ?? 'icon') === value} onChange={() => set({ appearance: value })} className="mt-1" />
            <span className="text-sm">
              <b>{title}</b>
              <span className="block text-xs text-slate-500">{desc}</span>
            </span>
          </label>
        ))}
        {(object.appearance ?? 'icon') === 'icon' && (
          <button type="button" onClick={() => setIconPicker(true)} className="self-start flex items-center gap-2 bg-white border border-slate-300 hover:border-cyan rounded-lg px-3 py-1.5 text-sm">
            <span className="text-2xl leading-none">{object.icon}</span> 換圖示…
          </button>
        )}
      </Section>

      <Section title="">
        <VisibilityBlock object={object} ctx={ctx} onUpdate={onUpdate} />
      </Section>

      {iconPicker && <IconPicker current={object.icon} onPick={(emoji) => (set({ icon: emoji }), setIconPicker(false))} onClose={() => setIconPicker(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------- device (裝置)

// Something with states the student can switch: a lamp, a fume hood, a cabinet door, an instrument's power.
export function DeviceProperties({ object, ctx, assets, assetMap, onUpdate }) {
  const [picker, setPicker] = useState(null) // { stateId, kind: 'icon' | 'image' }
  const states = object.states ?? []
  const set = (patch, key) => onUpdate(object.id, patch, key ? { key: `prop-${object.id}-${key}` } : { important: true })
  const patchState = (id, patch, key) => set({ states: states.map((s) => (s.id === id ? { ...s, ...patch } : s)) }, key)
  const deviceCtx = { ...ctx, selfId: object.id, selfName: object.name }

  function removeState(id) {
    const rest = states.filter((s) => s.id !== id)
    const onState = { ...(object.onState ?? {}) }
    delete onState[id]
    set({ states: rest, onState, initialState: object.initialState === id ? rest[0]?.id : object.initialState })
  }

  return (
    <div className="flex flex-col gap-4">
      <NameField object={object} onUpdate={onUpdate} label="裝置" />
      <p className="text-xs bg-slate-50 rounded-lg p-2 text-slate-600">💡 裝置：有好幾種狀態、學生可以切換的東西，例如電燈（關／開）、抽氣櫃、櫃門（鎖著／打開）。</p>

      <Section title="① 它有哪些狀態？（至少兩個）" hint="每個狀態有自己的圖示（或圖片）。選「一開始」的那個，是學生剛進來時看到的樣子。">
        {states.map((s) => {
          const asset = s.assetId ? assetMap[s.assetId] : null
          return (
            <div key={s.id} className="border border-slate-200 rounded-xl p-2 flex gap-2 items-center">
              <button type="button" onClick={() => setPicker({ stateId: s.id, kind: 'icon' })} title="換圖示" className="w-12 h-12 shrink-0 rounded-lg border border-slate-300 hover:border-cyan flex items-center justify-center overflow-hidden bg-slate-50 text-2xl">
                {asset ? <img src={assetUrl(asset.storage_path)} alt="" className="w-full h-full object-contain" /> : s.icon}
              </button>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <input value={s.name} onChange={(e) => patchState(s.id, { name: e.target.value }, `st-${s.id}`)} placeholder="狀態名稱，例如：開" className={inputClass} />
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`init-${object.id}`} checked={object.initialState === s.id} onChange={() => set({ initialState: s.id })} /> 一開始是這個
                  </label>
                  <button type="button" onClick={() => setPicker({ stateId: s.id, kind: 'image' })} className="underline text-slate-600 hover:text-navy">
                    用圖片
                  </button>
                  {s.assetId && (
                    <button type="button" onClick={() => patchState(s.id, { assetId: null })} className="underline text-slate-500 hover:text-red-600">
                      不用圖片
                    </button>
                  )}
                </div>
              </div>
              <button type="button" disabled={states.length <= 2} onClick={() => removeState(s.id)} title="刪除這個狀態（至少要保留兩個）" aria-label="刪除這個狀態" className="px-1.5 py-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30">
                ✕
              </button>
            </div>
          )
        })}
        <button type="button" onClick={() => set({ states: [...states, { id: genId('ds'), name: `狀態 ${states.length + 1}`, icon: '🔘', assetId: null }] })} className="self-start text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1">
          ＋ 新增狀態
        </button>
      </Section>

      <Section title="② 學生點它的時候…">
        <label className={`flex gap-2 rounded-lg border p-2 cursor-pointer ${object.clickToCycle !== false ? 'border-cyan bg-cyan/5' : 'border-slate-200'}`}>
          <input type="checkbox" checked={object.clickToCycle !== false} onChange={(e) => set({ clickToCycle: e.target.checked })} className="mt-1" />
          <span className="text-sm">
            <b>點一下就換到下一個狀態</b>
            <span className="block text-xs text-slate-500">取消勾選的話，學生點它沒反應，只能靠別的機關（事件裡的「改變裝置狀態」）來改變，例如答對題目後櫃門才打開。</span>
          </span>
        </label>
      </Section>

      {object.clickToCycle !== false && (
        <Section title="③ 什麼時候才能操作它？" hint="不設定＝隨時都可以。例如「先打開電源，才能開抽氣櫃」。">
          <ConditionEditor value={object.operateWhen} onChange={(v) => set({ operateWhen: v }, 'operatewhen')} ctx={ctx} emptyHint="沒有條件＝隨時都可以操作。" />
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-500">還不能操作時，學生看到這句話：</span>
            <input value={object.operateMessage ?? ''} onChange={(e) => set({ operateMessage: e.target.value }, 'operatemsg')} placeholder="例如：沒有電，先找找電源" className={inputClass} />
          </label>
        </Section>
      )}

      <Section title={`${object.clickToCycle !== false ? "④" : "③"} 變成某個狀態時，會發生什麼事？`} hint="可以用來連動下一個機關，例如燈打開時記住「亮了」，讓線索出現。不需要的狀態留空。">
        {states.map((s) => (
          <details key={s.id} open={(object.onState?.[s.id] ?? []).length > 0} className="border border-slate-200 rounded-lg p-2">
            <summary className="cursor-pointer text-sm font-bold">
              {s.icon} 變成「{s.name || '（未命名）'}」時 {(object.onState?.[s.id] ?? []).length > 0 ? '⚡' : ''}
            </summary>
            <div className="mt-2">
              <EventEditor actions={object.onState?.[s.id] ?? []} onChange={(v) => set({ onState: { ...(object.onState ?? {}), [s.id]: v } }, `onstate-${s.id}`)} ctx={deviceCtx} />
            </div>
          </details>
        ))}
      </Section>

      <Section title="">
        <VisibilityBlock object={object} ctx={ctx} onUpdate={onUpdate} />
      </Section>

      {picker?.kind === 'icon' && <IconPicker current={states.find((s) => s.id === picker.stateId)?.icon} onPick={(emoji) => (patchState(picker.stateId, { icon: emoji, assetId: null }), setPicker(null))} onClose={() => setPicker(null)} />}
      {picker?.kind === 'image' && (
        <AssetPicker
          assets={assets}
          type="image"
          title="選擇這個狀態的圖片"
          onClose={() => setPicker(null)}
          onPick={(a) => {
            patchState(picker.stateId, { assetId: a.id })
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}
