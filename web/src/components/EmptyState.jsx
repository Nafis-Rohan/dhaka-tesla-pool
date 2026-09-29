export function EmptyState({ message = 'Nothing here yet' }) {
  return (
    <div className="flex items-center justify-center p-8 text-gray-400">
      {message}
    </div>
  )
}
