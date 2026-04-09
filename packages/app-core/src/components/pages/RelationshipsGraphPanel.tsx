import type {
  RelationshipsGraphEdge,
  RelationshipsGraphSnapshot,
  RelationshipsPersonSummary,
} from "@miladyai/app-core/api";

const GRAPH_WIDTH = 960;
const GRAPH_HEIGHT = 540;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;
const GRAPH_RADIUS_X = 340;
const GRAPH_RADIUS_Y = 180;

type GraphPosition = {
  x: number;
  y: number;
};

function nodeRadius(person: RelationshipsPersonSummary): number {
  return Math.min(58, 26 + person.memberEntityIds.length * 4);
}

function shortLabel(value: string, maxLength = 20): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function edgeColor(edge: RelationshipsGraphEdge): string {
  if (edge.sentiment === "positive") return "rgba(73, 197, 122, 0.48)";
  if (edge.sentiment === "negative") return "rgba(239, 68, 68, 0.44)";
  return "rgba(240, 185, 11, 0.34)";
}

function buildNodePositions(
  people: RelationshipsPersonSummary[],
): Map<string, GraphPosition> {
  const positions = new Map<string, GraphPosition>();
  const total = Math.max(people.length, 1);

  people.forEach((person, index) => {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    positions.set(person.groupId, {
      x: GRAPH_CENTER_X + Math.cos(angle) * GRAPH_RADIUS_X,
      y: GRAPH_CENTER_Y + Math.sin(angle) * GRAPH_RADIUS_Y,
    });
  });

  return positions;
}

function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(240,185,11,0.9)]" />
        People
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-[2px] w-6 bg-[rgba(73,197,122,0.48)]" />
        Positive
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-[2px] w-6 bg-[rgba(240,185,11,0.34)]" />
        Neutral
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-[2px] w-6 bg-[rgba(239,68,68,0.44)]" />
        Negative
      </div>
    </div>
  );
}

export function RelationshipsGraphPanel({
  snapshot,
  selectedGroupId,
  onSelectGroupId,
}: {
  snapshot: RelationshipsGraphSnapshot | null;
  selectedGroupId: string | null;
  onSelectGroupId: (groupId: string) => void;
}) {
  if (!snapshot || snapshot.people.length === 0) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-[22px] border border-border/28 bg-card/35 px-6 py-10 text-center">
        <div className="text-sm font-semibold text-txt">
          No identities match the current filters.
        </div>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
          The graph will render once the relationships has people, identity
          links, and relationships to visualize.
        </p>
      </div>
    );
  }

  const positions = buildNodePositions(snapshot.people);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted/70">
            Identity Graph
          </div>
          <div className="mt-2 text-xl font-semibold text-txt">
            Canonical people and cross-person relationships
          </div>
        </div>
        <GraphLegend />
      </div>

      <div className="overflow-hidden rounded-[24px] border border-border/26 bg-[radial-gradient(circle_at_top,rgba(240,185,11,0.12),transparent_42%),linear-gradient(180deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--bg)_97%,transparent))]">
        <svg
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          className="h-[24rem] w-full"
          role="img"
          aria-label="Relationships relationship graph"
        >
          <defs>
            <radialGradient
              id="relationships-node-fill"
              cx="50%"
              cy="35%"
              r="70%"
            >
              <stop offset="0%" stopColor="rgba(255,240,199,0.92)" />
              <stop offset="100%" stopColor="rgba(240,185,11,0.86)" />
            </radialGradient>
          </defs>

          {snapshot.relationships.map((edge) => {
            const source = positions.get(edge.sourcePersonId);
            const target = positions.get(edge.targetPersonId);
            if (!source || !target) {
              return null;
            }
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edgeColor(edge)}
                strokeWidth={Math.max(1.5, edge.strength * 6)}
                strokeLinecap="round"
              />
            );
          })}

          {snapshot.people.map((person) => {
            const position = positions.get(person.groupId);
            if (!position) {
              return null;
            }
            const radius = nodeRadius(person);
            const selected = selectedGroupId === person.groupId;

            return (
              <>
                <g
                  key={`${person.groupId}:visual`}
                  transform={`translate(${position.x}, ${position.y})`}
                  className="pointer-events-none"
                >
                  <circle
                    r={radius + (selected ? 9 : 0)}
                    fill={selected ? "rgba(240,185,11,0.12)" : "transparent"}
                    stroke={selected ? "rgba(240,185,11,0.36)" : "transparent"}
                    strokeWidth={selected ? 2 : 0}
                  />
                  <circle
                    r={radius}
                    fill="url(#relationships-node-fill)"
                    stroke={
                      selected
                        ? "rgba(255,255,255,0.92)"
                        : "rgba(28,34,43,0.55)"
                    }
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  <text
                    textAnchor="middle"
                    y={-4}
                    className="fill-black text-[13px] font-semibold"
                  >
                    {shortLabel(person.displayName, 18)}
                  </text>
                  <text
                    textAnchor="middle"
                    y={14}
                    className="fill-black/70 text-[10px] font-medium"
                  >
                    {shortLabel(
                      person.platforms.slice(0, 3).join(" • ") ||
                        `${person.memberEntityIds.length} identities`,
                      26,
                    )}
                  </text>
                </g>
                <foreignObject
                  key={`${person.groupId}:button`}
                  x={position.x - radius - 12}
                  y={position.y - radius - 12}
                  width={(radius + 12) * 2}
                  height={(radius + 12) * 2}
                >
                  <button
                    type="button"
                    onClick={() => onSelectGroupId(person.groupId)}
                    className="h-full w-full rounded-full bg-transparent"
                    aria-label={`Select ${person.displayName}`}
                  />
                </foreignObject>
              </>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
