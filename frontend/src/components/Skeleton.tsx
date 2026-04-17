interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
}

export function Skeleton({ height = 16, width = "100%", radius = 8, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        height,
        width,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card skeleton-row">
      <Skeleton height={20} width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === rows - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="container route-fade">
      <Skeleton height={28} width="32%" style={{ marginBottom: 8 }} />
      <Skeleton height={14} width="48%" style={{ marginBottom: 36 }} />
      <div className="col col--gap-3">
        <Skeleton height={72} radius={14} />
        <Skeleton height={72} radius={14} />
        <Skeleton height={72} radius={14} />
      </div>
    </div>
  );
}
