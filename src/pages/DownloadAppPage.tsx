import { useEffect, useMemo, useState } from "react";
import { Monitor, Apple, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { openExternal } from "@/lib/desktop";

type DetectedOS = "windows" | "macos" | "other";

function detectOS(): DetectedOS {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "macos";
  return "other";
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface LatestRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

const REPO = "Gabriella0808/lineage-sales-hub";

function useLatestRelease() {
  const [release, setRelease] = useState<LatestRelease | null | undefined>(undefined); // undefined = loading, null = none found

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null));
  }, []);

  return release;
}

function findAsset(assets: ReleaseAsset[] | undefined, os: DetectedOS): ReleaseAsset | undefined {
  if (!assets) return undefined;
  if (os === "windows") return assets.find((a) => a.name.toLowerCase().endsWith("-setup.exe")) ?? assets.find((a) => a.name.toLowerCase().endsWith(".msi"));
  return assets.find((a) => a.name.toLowerCase().endsWith(".dmg"));
}

export default function DownloadAppPage() {
  const detected = useMemo(detectOS, []);
  const [selected, setSelected] = useState<DetectedOS>(detected === "other" ? "windows" : detected);
  const release = useLatestRelease();
  const loading = release === undefined;
  const asset = findAsset(release?.assets, selected);

  return (
    <div className="animate-fade-in max-w-3xl">
      <div className="page-header">
        <h1 className="page-title">Desktop App</h1>
        <p className="page-subtitle">Lineage Collections Business Portal, installed like normal desktop software.</p>
      </div>

      <Card className="mb-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {selected === "windows" ? <Monitor className="h-4 w-4 text-primary" /> : <Apple className="h-4 w-4 text-primary" />}
            Lineage Collections for {selected === "windows" ? "Windows" : "macOS"}
            {detected === selected && <Badge variant="secondary" className="ml-1">Detected</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {selected === "windows"
              ? "Installs a standalone Lineage Collections app to your PC. Appears in the Start Menu, launches from the taskbar, and uninstalls cleanly from Windows Settings."
              : "A standard macOS .dmg install. Drag Lineage Collections into Applications, launch from Launchpad or the Dock."}
          </p>
          {loading ? (
            <Button disabled className="w-full sm:w-auto">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Checking for a release…
            </Button>
          ) : asset ? (
            <Button className="w-full sm:w-auto" onClick={() => openExternal(asset.browser_download_url)}>
              <Download className="h-4 w-4 mr-2" />
              Download for {selected === "windows" ? "Windows" : "macOS"} ({release!.tag_name})
            </Button>
          ) : (
            <Button disabled className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              Download for {selected === "windows" ? "Windows" : "macOS"} (Coming Soon)
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {asset
              ? selected === "windows"
                ? "This Windows installer is not code-signed, so Windows SmartScreen will warn \"Windows protected your PC\". Click More info, then Run anyway. Only install copies downloaded from this page."
                : "Built, signed, and notarized via the project's release pipeline."
              : "No published release yet. This page will offer a real download the moment one exists; nothing here is a placeholder link."}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Not on {selected === "windows" ? "Windows" : "macOS"}?</span>
        <button
          className="text-primary hover:underline font-medium"
          onClick={() => setSelected(selected === "windows" ? "macos" : "windows")}
        >
          Choose {selected === "windows" ? "macOS" : "Windows"} instead
        </button>
      </div>
    </div>
  );
}
