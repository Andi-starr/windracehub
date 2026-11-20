export function ResultTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>{headers.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className={i < 3 ? "bg-sea-50/60" : "odd:bg-white even:bg-slate-50/50"}>
              {r.map((c, j) => <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${j === 0 ? "font-semibold" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
