import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import KseLiveDashboard from "@/components/kse-live-dashboard";

export default function KseLivePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-10 2xl:max-w-[1760px]">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
            Energia na żywo
          </p>
          <h1 className="text-3xl font-semibold">Krajowy System Elektroenergetyczny</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">PSE API</Badge>
          <Badge variant="secondary">Analiza + alerty</Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] space-y-10 px-6 pb-24 lg:px-10 2xl:max-w-[1760px]">
        <Card className="kse-intro border-border/60 bg-white/70">
          <CardHeader>
            <CardTitle className="text-2xl">Co tu zobaczysz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Ten mini-serwis zbiera wybrane dane z API PSE i pokazuje je w formie
              krótkiego dashboardu. Masz pod reka szybki podglad obciazenia systemu,
              generacji jednostek wytworczych oraz ryzyk z godzin szczytu i
              ograniczen sieciowych.
            </p>
            <p>
              Jesli chcesz inne sekcje, wykresy albo bardziej konkretne KPI, dodam
              dokladne pola z wybranych endpointow.
            </p>
          </CardContent>
        </Card>

        <KseLiveDashboard />
      </main>
    </div>
  );
}
