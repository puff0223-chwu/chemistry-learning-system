import { assetUrl } from '../lib/assets.js'

// A picture of an item: its image if it has one, otherwise its emoji icon. Used in the editor's item list and in the student's bag.
export default function ItemFace({ item, assetMap, size = 'text-2xl' }) {
  const asset = item.assetId ? assetMap?.[item.assetId] : null
  return asset ? <img src={assetUrl(asset.storage_path)} alt="" className="w-full h-full object-contain" draggable={false} /> : <span className={`${size} leading-none`}>{item.icon || '📦'}</span>
}
