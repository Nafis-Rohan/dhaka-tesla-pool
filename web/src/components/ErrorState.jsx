export function ErrorState({ error, onRetry }) {
  const message = error?.message ?? 'Something went wrong'

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-red-600">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
        >
          Retry
        </button>
      )}
    </div>
  )
}
