export default function PageBackground({ image, overlay = 'rgba(0, 10, 30, 0.65)', children }) {
  return (
    <div className="min-h-screen">
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${image})` }}
      />
      <div className="relative min-h-screen flex flex-col page-fade">{children}</div>
    </div>
  )
}
