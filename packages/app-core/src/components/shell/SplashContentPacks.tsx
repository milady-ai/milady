import type { ResolvedContentPack } from "@miladyai/shared/contracts/content-pack";
import { Card, CardContent } from "@miladyai/ui";

const MONO_FONT = "'Courier New', 'Courier', 'Monaco', monospace";

interface SplashContentPacksProps {
  packs: ResolvedContentPack[];
  activePackId: string | null;
  t: (key: string, values?: Record<string, unknown>) => string;
  onSelectPack: (pack: ResolvedContentPack) => void;
  onLoadCustomPack: () => void;
}

export function SplashContentPacks({
  packs,
  activePackId,
  t,
  onSelectPack,
  onLoadCustomPack,
}: SplashContentPacksProps) {
  if (packs.length === 0) return null;

  return (
    <div className="mt-3 w-full">
      <p
        style={{ fontFamily: MONO_FONT }}
        className="mb-2 text-[8px] uppercase text-black/45"
      >
        {t("startupshell.ContentPacks", {
          defaultValue: "Content Packs",
        })}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {packs.map((pack) => {
          const isActive = activePackId === pack.manifest.id;
          return (
            <Card
              key={pack.manifest.id}
              className={`shrink-0 w-28 cursor-pointer border shadow-none transition-all ${
                isActive
                  ? "border-black bg-black/10 ring-1 ring-black/30"
                  : "border-black/20 bg-black/5 hover:border-black/40 hover:bg-black/8"
              }`}
              onClick={() => onSelectPack(pack)}
            >
              <CardContent className="flex flex-col items-center gap-1.5 p-2">
                {pack.vrmPreviewUrl ? (
                  <img
                    src={pack.vrmPreviewUrl}
                    alt={pack.manifest.name}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/10">
                    <span className="text-lg">
                      {pack.manifest.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <p className="w-full truncate text-center text-[10px] font-semibold text-black">
                  {pack.manifest.name}
                </p>
                {pack.manifest.description && (
                  <p className="w-full truncate text-center text-[8px] text-black/50">
                    {pack.manifest.description}
                  </p>
                )}
                {isActive && (
                  <span
                    style={{ fontFamily: MONO_FONT }}
                    className="text-[7px] uppercase text-black/60"
                  >
                    {t("startupshell.PackActive", {
                      defaultValue: "Active",
                    })}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Load custom pack button */}
        <Card
          className="shrink-0 w-28 cursor-pointer border border-dashed border-black/20 bg-transparent shadow-none hover:border-black/40 hover:bg-black/5 transition-all"
          onClick={onLoadCustomPack}
        >
          <CardContent className="flex flex-col items-center justify-center gap-1.5 p-2 h-full min-h-[100px]">
            <span className="text-2xl text-black/30">+</span>
            <p className="w-full text-center text-[9px] text-black/40">
              {t("startupshell.LoadPack", {
                defaultValue: "Load pack",
              })}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
