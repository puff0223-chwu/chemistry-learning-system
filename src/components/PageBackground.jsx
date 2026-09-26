import { useSettings } from '../lib/settings.jsx'

// `page` picks the background configured in 外觀設定: 'home' | 'task' | 'battle'.
export default function PageBackground({ page, overlay = 'rgba(0, 10, 30, 0.65)', children }) {
  const { settings } = useSettings()
  const image = settings[`bg_${page}`]
  return (
    <div className="min-h-screen">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(${overlay}, ${overlay}), url("${image}")` }}
      />
      <div className="relative min-h-screen flex flex-col page-fade">{children}</div>
    </div>
  )
}
