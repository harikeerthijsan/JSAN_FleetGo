import { EmptyState } from '../States/States';
import './Charts.css';

export interface ChartDatum {
  label: string;
  count: number;
  color?: string;
}

const PALETTE = [
  '#285a60', '#58a58c', '#d7af67', '#b27670', '#9189af',
  '#62999e', '#b58a9a', '#7f9f68', '#738579', '#557d89',
];

function colorAt(i: number, explicit?: string): string {
  return explicit ?? PALETTE[i % PALETTE.length];
}

/** Horizontal bar chart — robust, dependency-free, good for category counts. */
export function BarChart({ data }: { data: ChartDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) {
    return <EmptyState title="No data" description="Nothing to chart yet." />;
  }
  return (
    <div className="fg-barchart">
      {data.map((d, i) => (
        <div key={d.label} className="fg-barchart__row">
          <span className="fg-barchart__label" title={d.label}>{d.label}</span>
          <div className="fg-barchart__track">
            <div
              className="fg-barchart__bar"
              style={{
                width: `${(d.count / max) * 100}%`,
                background: colorAt(i, d.color),
              }}
            />
          </div>
          <span className="fg-barchart__value">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Donut chart via SVG stroke segments. */
export function DonutChart({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return <EmptyState title="No data" description="Nothing to chart yet." />;
  }
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="fg-donut">
      <svg viewBox="0 0 160 160" className="fg-donut__svg">
        <g transform="rotate(-90 80 80)">
          {data.map((d, i) => {
            const fraction = d.count / total;
            const dash = fraction * circumference;
            const seg = (
              <circle
                key={d.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={colorAt(i, d.color)}
                strokeWidth="20"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </g>
        <text x="80" y="76" textAnchor="middle" className="fg-donut__total">
          {total}
        </text>
        <text x="80" y="94" textAnchor="middle" className="fg-donut__caption">
          total
        </text>
      </svg>
      <ul className="fg-donut__legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="fg-donut__swatch" style={{ background: colorAt(i, d.color) }} />
            <span className="fg-donut__legend-label">{d.label}</span>
            <span className="fg-donut__legend-value">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
