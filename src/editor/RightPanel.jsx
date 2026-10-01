import { useState } from 'react'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { DIRECTIONS, OBJECT_TYPE_LABELS, parseYouTubeId } from '../lib/missionSchema.js'
import AssetPicker from './AssetPicker.jsx'
import { EventEditor } from './EventEditor.jsx'
import LayersPanel, { SelectionPanel, interactionBadges } from './LayersPanel.jsx'
import LockProperties from './LockEditor.jsx'
import VisibilityBlock from './VisibilityBlock.jsx'

const inputClass = 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm'

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function NumField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => e.target.value !== '' && Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))}
        className={inputClass}
      />
    </Field>
  )
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex border-b border-slate-200 -mx-3 px-3 gap-1 sticky top-0 bg-white z-10 pt-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3 py-1.5 text-sm rounded-t-lg border-b-2 -mb-px ${value === t.key ? 'border-cyan font-bold text-navy' : 'border-transparent text-slate-500 hover:text-navy'}`}
        >
          {t.label}
          {t.badge ? <span className="ml-1 text-xs">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- object: 外觀 tab

function LookTab({ object, assets, assetMap, onUpdate, onPickIcon }) {
  const [picker, setPicker] = useState(null)
  const set = (patch) => onUpdate(object.id, patch, { key: `prop-${object.id}-${Object.keys(patch)[0]}` })
  const asset = object.assetId ? assetMap[object.assetId] : null

  return (
    <div className="flex flex-col gap-3">
      {object.type === 'image' && (
        <Field label="圖片素材">
          <button type="button" onClick={() => setPicker('image')} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 text-sm text-left truncate">
            {asset ? `🖼️ ${asset.name || asset.storage_path}` : '選擇圖片…'}
          </button>
        </Field>
      )}

      {object.type === 'video' && (
        <>
          <Field label="影片素材（上傳到素材庫的檔案）">
            <button type="button" onClick={() => setPicker('video')} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 text-sm text-left truncate">
              {asset ? `🎬 ${asset.name || asset.storage_path}` : '選擇影片…'}
            </button>
          </Field>
          <Field label="或貼 YouTube 不公開連結（填了會優先使用）">
            <input value={object.youtubeUrl ?? ''} onChange={(e) => set({ youtubeUrl: e.target.value })} placeholder="https://youtu.be/..." className={inputClass} />
            {object.youtubeUrl && !parseYouTubeId(object.youtubeUrl) && <span className="text-xs text-red-600">看不出這是 YouTube 網址</span>}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!object.loop} onChange={(e) => set({ loop: e.target.checked })} /> 重複播放
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={object.muted !== false} onChange={(e) => set({ muted: e.target.checked })} /> 靜音
          </label>
        </>
      )}

      {object.type === 'icon' && (
        <Field label="圖示">
          <button type="button" onClick={() => onPickIcon(object.id)} className="flex items-center gap-3 bg-slate-100 hover:bg-slate-200 rounded-xl px-3 py-2 text-left">
            <span className="text-4xl leading-none">{object.icon}</span>
            <span className="text-sm">
              <b>更換圖示…</b>
              <br />
              <span className="text-xs text-slate-500">300 多個，可用名稱搜尋</span>
            </span>
          </button>
        </Field>
      )}

      {object.type === 'text' && (
        <>
          <Field label="文字內容（可設粗體、顏色、化學式／數學式）">
            <RichTextEditor key={object.id} value={object.html} onChange={(html) => set({ html })} minHeight={120} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="基準字級（px）" value={object.fontSize} min={8} max={200} onChange={(v) => set({ fontSize: v })} />
            <Field label="對齊">
              <select value={object.align} onChange={(e) => set({ align: e.target.value })} className={inputClass}>
                <option value="left">靠左</option>
                <option value="center">置中</option>
                <option value="right">靠右</option>
              </select>
            </Field>
            <Field label="文字顏色">
              <input type="color" value={object.color} onChange={(e) => set({ color: e.target.value })} className="h-8 w-full rounded border border-slate-300" />
            </Field>
            <Field label="背景色">
              <div className="flex gap-1">
                <input type="color" value={object.background || '#000000'} onChange={(e) => set({ background: e.target.value })} className="h-8 flex-1 rounded border border-slate-300" />
                <button type="button" onClick={() => set({ background: '' })} className="text-xs bg-slate-100 hover:bg-slate-200 rounded px-2">無</button>
              </div>
            </Field>
          </div>
        </>
      )}

      {object.type === 'hotspot' && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
          隱形點擊區在學生畫面看不到，用來蓋在圖片的某個位置（例如照片裡的抽屜）。到「互動」分頁設定點了會發生什麼事。
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={object.x} onChange={(v) => set({ x: v })} />
        <NumField label="Y" value={object.y} onChange={(v) => set({ y: v })} />
        <NumField label="寬" value={object.w} min={12} onChange={(v) => set({ w: Math.max(12, v) })} />
        <NumField label="高" value={object.h} min={12} onChange={(v) => set({ h: Math.max(12, v) })} />
        <NumField label="旋轉（度）" value={object.rotation} onChange={(v) => set({ rotation: v })} />
        <Field label={`透明度 ${Math.round(object.opacity * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={object.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
        </Field>
      </div>

      {picker && (
        <AssetPicker
          assets={assets}
          type={picker}
          title={picker === 'image' ? '選擇圖片' : '選擇影片'}
          onClose={() => setPicker(null)}
          onPick={(a) => {
            onUpdate(object.id, { assetId: a.id }, { important: true })
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- object: 互動 tab

function InteractTab({ object, ctx, onUpdate }) {
  const objectCtx = { ...ctx, selfId: object.id, selfName: object.name }

  return (
    <div className="flex flex-col gap-4">
      <VisibilityBlock object={object} ctx={ctx} onUpdate={onUpdate} />

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-3">
        <h3 className="font-bold text-sm">🖱️ 學生點它的時候，會發生什麼事？</h3>
        <p className="text-xs text-slate-500">沒有設定的話，點它不會有任何反應。步驟會從上往下一步一步做。</p>
        <EventEditor actions={object.onClick ?? []} onChange={(v) => onUpdate(object.id, { onClick: v }, { key: `onclick-${object.id}` })} ctx={objectCtx} recipeKind="object" />
        <label className="flex items-center gap-2 text-sm mt-1">
          <input type="checkbox" checked={!!object.logClick} onChange={(e) => onUpdate(object.id, { logClick: e.target.checked })} /> 把學生點它的紀錄寫進學習資料
        </label>
      </section>
    </div>
  )
}

// A member of a group: say so, and let the teacher take it out or select the whole group.
function GroupNote({ group, object, onUpdate, onSelectGroup }) {
  if (!group) return null
  return (
    <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1.5 text-sm">
      <span className="flex-1 min-w-0 truncate">🗂 屬於群組「{group.name}」</span>
      <button type="button" onClick={onSelectGroup} className="text-violet-800 underline whitespace-nowrap">選整組</button>
      <button type="button" onClick={() => onUpdate(object.id, { groupId: undefined }, { important: true })} className="text-violet-800 underline whitespace-nowrap">移出群組</button>
    </div>
  )
}

function ObjectProperties({ object, group, assets, assetMap, ctx, onUpdate, onPickIcon, onPreviewLock, onSelectGroup }) {
  const [tab, setTab] = useState(object.type === 'hotspot' ? 'interact' : 'look')
  if (object.type === 'lock') {
    return (
      <LockProperties
        lock={object}
        assets={assets}
        ctx={ctx}
        TabBar={Tabs}
        onChange={(patch, opts) => onUpdate(object.id, patch, opts)}
        onPickIcon={() => onPickIcon(object.id)}
        onPreview={() => onPreviewLock(object.id)}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <GroupNote group={group} object={object} onUpdate={onUpdate} onSelectGroup={onSelectGroup} />
      <Field label={`名稱（只有你看得到，方便辨認）　${OBJECT_TYPE_LABELS[object.type]}`}>
        <input value={object.name} onChange={(e) => onUpdate(object.id, { name: e.target.value }, { key: `prop-${object.id}-name` })} className={inputClass} />
      </Field>
      <Tabs
        tabs={[
          { key: 'look', label: '外觀' },
          { key: 'interact', label: '互動', badge: interactionBadges(object) },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'look' ? <LookTab object={object} assets={assets} assetMap={assetMap} onUpdate={onUpdate} onPickIcon={onPickIcon} /> : <InteractTab object={object} ctx={ctx} onUpdate={onUpdate} />}
    </div>
  )
}

// ---------------------------------------------------------------- scene properties

function SceneTab({ scene, scenes, assetMap, assets, isStart, onUpdateScene, onSetStart, onDuplicate, onDelete }) {
  const [picker, setPicker] = useState(false)
  const background = scene.background
  const bgAsset = background?.type === 'image' ? assetMap[background.assetId] : null
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">沒有選取物件時，這裡是「場景」的設定。</p>
      <Field label="場景名稱">
        <input value={scene.name} onChange={(e) => onUpdateScene(scene.sceneId, { name: e.target.value }, { key: `scene-name-${scene.sceneId}` })} className={inputClass} />
      </Field>
      <Field label="背景">
        <div className="flex gap-1 items-center">
          <button type="button" onClick={() => setPicker(true)} className="flex-1 bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1.5 text-sm text-left truncate">
            {bgAsset ? `🖼️ ${bgAsset.name || bgAsset.storage_path}` : background?.type === 'image' ? '⚠️ 背景圖遺失，重新選擇' : '選擇背景圖…'}
          </button>
          <input
            type="color"
            title="純色背景"
            value={background?.type === 'color' ? background.color : '#1e293b'}
            onChange={(e) => onUpdateScene(scene.sceneId, { background: { type: 'color', color: e.target.value } }, { key: `scene-bg-${scene.sceneId}` })}
            className="h-8 w-10 rounded border border-slate-300"
          />
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={isStart} onClick={() => onSetStart(scene.sceneId)} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg px-3 py-1.5 text-sm">
          {isStart ? '★ 這是起始場景' : '設為起始場景'}
        </button>
        <button type="button" onClick={() => onDuplicate(scene.sceneId)} className="bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 text-sm">
          複製場景
        </button>
        <button
          type="button"
          disabled={scenes.length <= 1}
          title={scenes.length <= 1 ? '至少要保留一個場景' : undefined}
          onClick={() => onDelete(scene.sceneId)}
          className="bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-700 rounded-lg px-3 py-1.5 text-sm"
        >
          刪除場景
        </button>
      </div>
      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">過關方式、開場說明，請按上方「🏁 關卡設定」。</p>

      {picker && (
        <AssetPicker
          assets={assets}
          type="image"
          title="選擇背景圖"
          onClose={() => setPicker(false)}
          onPick={(a) => {
            onUpdateScene(scene.sceneId, { background: { type: 'image', assetId: a.id } }, { important: true })
            setPicker(false)
          }}
        />
      )}
    </div>
  )
}

function ExitsTab({ scene, scenes, ctx, onUpdateScene, onSetExit }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">學生會在畫面邊緣看到有出口的方向按鈕。也可以到上方「🗺️ 場景關聯圖」直接拖線建立。</p>
      {DIRECTIONS.map((d) => {
        const target = scene.exits[d.key]
        const rule = scene.exitConditions?.[d.key] ?? {}
        const hasRule = !!(rule.when || rule.message)
        const setRule = (patch) => {
          const next = { ...rule, ...patch }
          const exitConditions = { ...(scene.exitConditions ?? {}) }
          if (next.when || next.message) exitConditions[d.key] = next
          else delete exitConditions[d.key]
          onUpdateScene(scene.sceneId, { exitConditions }, { key: `exitrule-${scene.sceneId}-${d.key}` })
        }
        return (
          <div key={d.key} className="border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold w-14 shrink-0">
                {d.arrow} {d.label}
              </span>
              <select value={target ?? ''} onChange={(e) => onSetExit(scene.sceneId, d.key, e.target.value || null)} className={inputClass}>
                <option value="">（這個方向沒有出口）</option>
                {scenes
                  .filter((s) => s.sceneId !== scene.sceneId)
                  .map((s) => (
                    <option key={s.sceneId} value={s.sceneId}>
                      通往：{s.name}
                    </option>
                  ))}
              </select>
            </div>
            {target && (
              <details open={hasRule} className="text-sm">
                <summary className="cursor-pointer text-slate-600 hover:text-navy">{hasRule ? '🔒 有通行條件（點開修改）' : '🔓 隨時可以走（要設條件才能走？點這裡）'}</summary>
                <div className="flex flex-col gap-2 mt-2">
                  <p className="text-xs text-slate-500">例如「學生已經做過：戴上護目鏡」才能進入。</p>
                  <ConditionEditor value={rule.when ?? null} onChange={(v) => setRule({ when: v })} ctx={ctx} emptyHint="沒有條件＝隨時可以走。" />
                  <Field label="條件還沒達成時，學生按了會看到這句話：">
                    <input value={rule.message ?? ''} onChange={(e) => setRule({ message: e.target.value })} placeholder="例如：先戴上護目鏡才能靠近抽氣櫃" className={inputClass} />
                  </Field>
                </div>
              </details>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SceneEventsTab({ scene, ctx, onUpdateScene }) {
  const sceneCtx = { ...ctx, sceneName: scene.name }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold text-sm">🎬 學生走進這個場景時，會發生什麼事？</h3>
      <p className="text-xs text-slate-500">每次走進來都會做一次。想要「只在第一次」說話，請用下面的範例。沒有設定就什麼都不會發生。</p>
      <EventEditor actions={scene.onEnter ?? []} onChange={(v) => onUpdateScene(scene.sceneId, { onEnter: v }, { key: `onenter-${scene.sceneId}` })} ctx={sceneCtx} recipeKind="scene" />
    </div>
  )
}

function SceneProperties({ scene, scenes, assets, assetMap, ctx, isStart, onUpdateScene, onSetExit, onSetStart, onDuplicate, onDelete }) {
  const [tab, setTab] = useState('scene')
  const exitCount = Object.values(scene.exits).filter(Boolean).length
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        tabs={[
          { key: 'scene', label: '場景' },
          { key: 'exits', label: '出口', badge: exitCount ? String(exitCount) : '' },
          { key: 'events', label: '進入時', badge: scene.onEnter?.length ? '⚡' : '' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'scene' && (
        <SceneTab scene={scene} scenes={scenes} assets={assets} assetMap={assetMap} isStart={isStart} onUpdateScene={onUpdateScene} onSetStart={onSetStart} onDuplicate={onDuplicate} onDelete={onDelete} />
      )}
      {tab === 'exits' && <ExitsTab scene={scene} scenes={scenes} ctx={ctx} onUpdateScene={onUpdateScene} onSetExit={onSetExit} />}
      {tab === 'events' && <SceneEventsTab scene={scene} ctx={ctx} onUpdateScene={onUpdateScene} />}
    </div>
  )
}

export default function RightPanel({ scene, scenes, stage, object, objectIds, assets, assetMap, ctx, actions, onPickIcon, onPreviewLock }) {
  const group = object?.groupId ? (scene.groups ?? []).find((g) => g.id === object.groupId) : null
  return (
    <aside className="w-[22rem] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <LayersPanel scene={scene} selectedIds={objectIds} actions={actions} />
      <div className="flex-1 overflow-y-auto p-3">
        {objectIds.length > 1 ? (
          <SelectionPanel scene={scene} selectedIds={objectIds} actions={actions} />
        ) : object ? (
          <ObjectProperties key={object.id} object={object} group={group} onSelectGroup={() => actions.selectObject(object.id)} assets={assets} assetMap={assetMap} ctx={ctx} onUpdate={actions.updateObject} onPickIcon={onPickIcon} onPreviewLock={onPreviewLock} />
        ) : (
          <SceneProperties
            key={scene.sceneId}
            scene={scene}
            scenes={scenes}
            assets={assets}
            assetMap={assetMap}
            ctx={ctx}
            isStart={stage.startSceneId === scene.sceneId}
            onUpdateScene={actions.updateScene}
            onSetExit={(from, dir, to) => actions.setExit(from, dir, to, false)}
            onSetStart={actions.setStartScene}
            onDuplicate={actions.duplicateScene}
            onDelete={actions.requestDeleteScene}
          />
        )}
      </div>
    </aside>
  )
}
