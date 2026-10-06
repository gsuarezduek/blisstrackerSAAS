import { scoreColor, scoreBarColor } from './geoHelpers'

export default function ComponentCard({ meta, score }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{meta.label}</span>
        </div>
        {score != null && (
          <span className={`text-lg font-bold ${scoreColor(score)}`}>{score}</span>
        )}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">{meta.desc}</p>
      {score != null && (
        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-700 ${scoreBarColor(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
      )}
    </div>
  )
}
