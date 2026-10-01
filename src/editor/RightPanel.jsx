import { useState } from 'react'
import RichTextEditor from '../components/RichTextEditor.jsx'
import { DIRECTIONS, ICON_CHOICES, OBJECT_TYPE_LABELS, parseYouTubeId } from '../lib/missionSchema.js'
import AssetPicker from './AssetPicker.jsx'
import { ConditionEditor, EventEditor, FLAG_LIST_ID } from './EventEditor.jsx'

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

// ---------------------------------------------------------------- layers

function LayersPanel({ objects, selectedId, onSelect, onUpdate, onMove, onDelete, onDuplicate }) {
  const reversed = [...objects].reverse() // top-most first, like every layer panel
  return (
    <section className="border-b border-slate-200 p-3 flex flex-col gap-2 max-h-60 min-h-[110px]">
      <h2 className="font-bold text-sm">圖層（上面的蓋住下面的）</h2>
      {objects.length === 0 && <p className="text-xs text-slate-400">這個場景還沒有物件。</p>}
      <ul className="overflow-y-auto flex flex-col gap-1">
        {reversed.map((o) => (
          <li key={o.id} className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm ${o.id === selectedId ? 'bg-cyan/15 ring-1 ring-cyan' : 'hover:bg-slate-100'}`}>
            <button type="button" title={o.visible ? '目前一開始會顯示，按一下改成隱藏' : '目前一開始隱藏，按一下改成顯示'} onClick={() => onUpdate(o.id, { visible: !o.visible })} className="w-6">
              {o.visible ? '👁️' : '🚫'}
            </button>
            <button type="button" title={o.locked ? '已鎖定（畫布上點不到）' : '鎖定，避免誤拖'} onClick={() => onUpdate(o.id, { locked: !o.locked })} className="w-6">
              {o.locked ? '🔒' : '🔓'}
            </button>
            <button type="button" onClick={() => onSelect(o.id)} className="flex-1 min-w-0 text-left truncate">
              {o.name}
              <span className="text-[11px] text-slate-400"> {OBJECT_TYPE_LABELS[o.type]}</span>
            </button>
            {o.id === selectedId && (
              <span className="flex gap-0.5 text-xs">
                <button type="button" title="移到最上面" onClick={() => onMove(o.id, 'top')} className="px-1 hover:bg-slate-200 rounded">⤒</button>
                <button type="button" title="上移一層" onClick={() => onMove(o.id, 'up')} className="px-1 hover:bg-slate-200 rounded">↑</button>
                <button type="button" title="下移一層" onClick={() => onMove(o.id, 'down')} className="px-1 hover:bg-slate-200 rounded">↓</button>
                <button type="button" title="移到最下面" onClick={() => onMove(o.id, 'bottom')} className="px-1 hover:bg-slate-200 rounded">⤓</button>
                <button type="button" title="複製（Ctrl+D）" onClick={() => onDuplicate(o.id)} className="px-1 hover:bg-slate-200 rounded">⧉</button>
                <button type="button" title="刪除（Delete）" onClick={() => onDelete(o.id)} className="px-1 hover:bg-red-100 text-red-600 rounded">🗑</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- object properties

function Section({ title, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-3">
      <p className="text-sm font-bold">{title}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

function ObjectProperties({ object, assets, assetMap, ctx, onUpdate }) {
  const [picker, setPicker] = useState(null)
  const set = (patch) => onUpdate(object.id, patch, { key: `prop-${object.id}-${Object.keys(patch)[0]}` })
  const asset = object.assetId ? assetMap[object.assetId] : null

  return (
    <div className="flex flex-col gap-3">
      <Field label="名稱（只有你看得到，方便辨認）">
        <input value={object.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} />
      </Field>

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
        <Field label="圖示（點選，或自己輸入一個表情符號）">
          <div className="flex flex-wrap gap-1">
            {ICON_CHOICES.map((c) => (
              <button key={c} type="button" onClick={() => set({ icon: c })} className={`w-8 h-8 text-lg rounded ${object.icon === c ? 'bg-cyan/25 ring-1 ring-cyan' : 'hover:bg-slate-100'}`}>
                {c}
              </button>
            ))}
          </div>
          <input value={object.icon} onChange={(e) => set({ icon: [...e.target.value].slice(-2).join('') })} className={`${inputClass} mt-1`} />
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

      {object.type === 'hotspot' && <p className="text-xs text-slate-500">隱形點擊區在學生畫面看不到，下方可以設定「點了會發生什麼事」。</p>}

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

      <Section title="🖱️ 點擊時" hint="學生點這個物件時，依序執行這些動作。">
        <EventEditor actions={object.onClick ?? []} onChange={(v) => onUpdate(object.id, { onClick: v }, { key: `onclick-${object.id}` })} ctx={ctx} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!object.logClick} onChange={(e) => onUpdate(object.id, { logClick: e.target.checked })} /> 記錄學生點擊（寫入學習紀錄）
        </label>
      </Section>

      <Section title="👁 顯示條件" hint="沒有設定＝一直顯示（受上面圖層的「眼睛」控制）。設了條件，要條件成立才看得到。">
        <ConditionEditor value={object.showWhen ?? null} onChange={(v) => onUpdate(object.id, { showWhen: v }, { key: `showwhen-${object.id}` })} />
      </Section>

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

// ---------------------------------------------------------------- scene properties

function SceneProperties({ scene, scenes, stage, assets, assetMap, ctx, isStart, onUpdateScene, onSetExit, onSetStart, onStageTitle, onUpdateStage, onDuplicate, onDelete }) {
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

      <div>
        <p className="text-xs text-slate-500 mb-1">出口（往哪個方向走會到哪個場景；也可以在「場景關聯圖」拖線建立）</p>
        <div className="grid grid-cols-2 gap-2">
          {DIRECTIONS.map((d) => (
            <Field key={d.key} label={`${d.arrow} ${d.label}`}>
              <select value={scene.exits[d.key] ?? ''} onChange={(e) => onSetExit(scene.sceneId, d.key, e.target.value || null)} className={inputClass}>
                <option value="">（無）</option>
                {scenes
                  .filter((s) => s.sceneId !== scene.sceneId)
                  .map((s) => (
                    <option key={s.sceneId} value={s.sceneId}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
        </div>
      </div>

      {DIRECTIONS.some((d) => scene.exits[d.key]) && (
        <Section title="🔒 出口通行條件" hint="沒有設定＝隨時可以走。設了條件，沒達成時顯示你寫的提示。">
          {DIRECTIONS.filter((d) => scene.exits[d.key]).map((d) => {
            const rule = scene.exitConditions?.[d.key] ?? {}
            const setRule = (patch) => {
              const next = { ...rule, ...patch }
              const exitConditions = { ...(scene.exitConditions ?? {}) }
              if (next.when || next.message) exitConditions[d.key] = next
              else delete exitConditions[d.key]
              onUpdateScene(scene.sceneId, { exitConditions }, { key: `exitrule-${scene.sceneId}-${d.key}` })
            }
            return (
              <details key={d.key} open={!!rule.when} className="border border-slate-200 rounded-lg p-2">
                <summary className="cursor-pointer text-sm">
                  {d.arrow} {d.label}
                  {rule.when ? '（有條件）' : ''}
                </summary>
                <div className="flex flex-col gap-2 mt-2">
                  <ConditionEditor value={rule.when ?? null} onChange={(v) => setRule({ when: v })} />
                  <Field label="沒達成時顯示的提示">
                    <input value={rule.message ?? ''} onChange={(e) => setRule({ message: e.target.value })} placeholder="例如：先戴上護目鏡才能靠近抽氣櫃" className={inputClass} />
                  </Field>
                </div>
              </details>
            )
          })}
        </Section>
      )}

      <Section title="🎬 進入這個場景時" hint="每次學生走進這個場景都會執行。要只做一次，請搭配旗標與「如果…」。">
        <EventEditor actions={scene.onEnter ?? []} onChange={(v) => onUpdateScene(scene.sceneId, { onEnter: v }, { key: `onenter-${scene.sceneId}` })} ctx={ctx} />
      </Section>

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

      <Section title="🏁 關卡" hint="目前一個任務只有一關。">
        <Field label="關卡名稱">
          <input value={stage.title} onChange={(e) => onStageTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="開場說明（學生開始前會看到，可留空）">
          <RichTextEditor key={stage.stageId} value={stage.intro ?? ''} onChange={(html) => onUpdateStage({ intro: html }, { key: 'stage-intro' })} minHeight={80} />
        </Field>
        <p className="text-xs text-slate-500">過關條件（條件成立就自動過關；也可以用「完成本關」動作過關。兩者都沒設，學生就無法過關）</p>
        <ConditionEditor value={stage.completeWhen ?? null} onChange={(v) => onUpdateStage({ completeWhen: v }, { key: 'stage-completewhen' })} />
        <p className="text-xs text-slate-500">過關後要執行的動作</p>
        <EventEditor actions={stage.onComplete ?? []} onChange={(v) => onUpdateStage({ onComplete: v }, { key: 'stage-oncomplete' })} ctx={ctx} />
      </Section>

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

export default function RightPanel({ scene, scenes, stage, object, assets, assetMap, ctx, actions }) {
  return (
    <aside className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <datalist id={FLAG_LIST_ID}>
        {ctx.flags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <LayersPanel
        objects={scene.objects}
        selectedId={object?.id ?? null}
        onSelect={actions.selectObject}
        onUpdate={actions.updateObject}
        onMove={actions.moveLayer}
        onDelete={actions.deleteObject}
        onDuplicate={actions.duplicateObject}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {object ? (
          <ObjectProperties key={object.id} object={object} assets={assets} assetMap={assetMap} ctx={ctx} onUpdate={actions.updateObject} />
        ) : (
          <SceneProperties
            scene={scene}
            scenes={scenes}
            stage={stage}
            assets={assets}
            assetMap={assetMap}
            ctx={ctx}
            isStart={stage.startSceneId === scene.sceneId}
            onUpdateScene={actions.updateScene}
            onSetExit={(from, dir, to) => actions.setExit(from, dir, to, false)}
            onSetStart={actions.setStartScene}
            onStageTitle={actions.setStageTitle}
            onUpdateStage={actions.updateStage}
            onDuplicate={actions.duplicateScene}
            onDelete={actions.requestDeleteScene}
          />
        )}
      </div>
    </aside>
  )
}
