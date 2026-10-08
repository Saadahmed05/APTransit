"use client";

import * as React from "react";
import {
  BottomNav,
  Button,
  Card,
  HoldButton,
  KpiTile,
  ResultSplash,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@aptransit/ui";
import {
  ArrowUp,
  Bell,
  Bus,
  CircleCheck,
  CircleX,
  ClipboardList,
  House,
  MapPin,
  ScanLine,
  Wifi,
} from "lucide-react";

// Development only (the /design page answers 404 in production). Shows the v2 minimal system:
// the new tokens, button sizes, tab variants, and the four new components. Switch light and dark
// with the theme switch further down the page.

type Splash = "valid" | "rejected" | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-h3 text-fg">{title}</h3>
      {children}
    </section>
  );
}

export function MinimalShowcase() {
  const [splash, setSplash] = React.useState<Splash>(null);

  const navItems = [
    { id: "today", label: "Today", icon: <House className="size-6" strokeWidth={1.75} /> },
    { id: "scan", label: "Scan", icon: <ScanLine className="size-6" strokeWidth={1.75} /> },
    {
      id: "manifest",
      label: "Manifest",
      icon: <ClipboardList className="size-6" strokeWidth={1.75} />,
    },
    { id: "alerts", label: "Alerts", icon: <Bell className="size-6" strokeWidth={1.75} /> },
  ].map((item) => ({ ...item, href: `#${item.id}`, active: item.id === "today" }));

  return (
    <div className="flex flex-col gap-10" data-testid="minimal-showcase">
      <h2 className="text-h1 text-fg">Minimal system (v2)</h2>

      <Section title="Surfaces, hairline and display-lg">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-default bg-surface-raised p-4 text-small">
            raised + border
          </div>
          <div className="rounded-lg bg-surface-sunken p-4 text-small">surface-sunken</div>
          <div className="rounded-lg border border-hairline bg-surface p-4 text-small">
            surface + hairline
          </div>
        </div>
        <p className="text-display-lg tabular-nums text-fg">08:30</p>
        <p className="text-display tabular-nums text-fg">08:30</p>
      </Section>

      <Section title="Button sizes">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small 36</Button>
          <Button size="md">Medium 44</Button>
          <Button size="lg">Large 52</Button>
          <Button size="xl">Extra large 56</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Tabs: segmented and underline">
        <Tabs defaultValue="a">
          <TabsList aria-label="Segmented tabs">
            <TabsTrigger value="a">Leave at</TabsTrigger>
            <TabsTrigger value="b">Arrive by</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Leave at content</TabsContent>
          <TabsContent value="b">Arrive by content</TabsContent>
        </Tabs>
        <Tabs defaultValue="x">
          <TabsList variant="underline" aria-label="Underline tabs">
            <TabsTrigger value="x">Overview</TabsTrigger>
            <TabsTrigger value="y">Stop demand</TabsTrigger>
          </TabsList>
          <TabsContent value="x">Overview content</TabsContent>
          <TabsContent value="y">Stop demand content</TabsContent>
        </Tabs>
      </Section>

      <Section title="Status chip">
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="success" label="Online" icon={Wifi} />
          <StatusChip tone="warning" label="GPS weak" icon={MapPin} />
          <StatusChip tone="info" label="On trip" icon={Bus} />
          <StatusChip tone="neutral" label="Scanner idle" icon={ScanLine} />
          <StatusChip tone="danger" label="Offline" icon={CircleX} live />
        </div>
      </Section>

      <Section title="Bottom navigation (field apps)">
        <Card padding="none" className="overflow-hidden">
          <BottomNav label="Field menu" items={navItems} />
        </Card>
      </Section>

      <Section title="Hold button (SOS)">
        <div className="max-w-sm">
          <HoldButton
            label="Hold for SOS"
            holdingLabel="Keep holding"
            hint="Press and hold for 3 seconds to send an emergency alert"
            onComplete={() => toast.success("Sent to depot")}
          />
        </div>
      </Section>

      <Section title="Result splash (scanner)">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSplash("valid")}>Show valid</Button>
          <Button variant="danger" onClick={() => setSplash("rejected")}>
            Show rejected
          </Button>
        </div>
        {splash === "valid" ? (
          <ResultSplash
            tone="success"
            icon={<CircleCheck />}
            label="Valid"
            reason="Kurnool to Vijayawada"
            detail="Seat 18 · 2 of 4 boarded"
            onReset={() => setSplash(null)}
          />
        ) : null}
        {splash === "rejected" ? (
          <ResultSplash
            tone="danger"
            icon={<CircleX />}
            label="Past destination"
            reason="This ticket ends at Nandyal"
            onReset={() => setSplash(null)}
          />
        ) : null}
      </Section>

      <Section title="KPI tiles">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiTile
            label="Passengers today"
            value="12,480"
            delta={{
              label: "up 12 percent",
              tone: "success",
              icon: <ArrowUp className="size-3" aria-hidden="true" />,
            }}
          />
          <KpiTile label="Trips on time" value="94%" />
          <KpiTile label="Loading" value="0" loading />
        </div>
      </Section>
    </div>
  );
}
