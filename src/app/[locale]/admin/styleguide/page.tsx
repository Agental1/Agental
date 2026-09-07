import type { Metadata } from "next";
import { Sparkles, Star, Check, Circle } from "lucide-react";
import { PortalTheme } from "@/components/portal-theme";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/marketing/eyebrow";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import type { Portal } from "@/lib/utils";

// Statique, et c'est délibéré : le guide de style est une page de
// développement derrière la garde admin, laissée hors du périmètre de
// traduction. Les quinze autres pages privées sont passées en
// generateMetadata localisé ; celle-ci reste en dehors.
export const metadata: Metadata = { title: "Styleguide" };

const SWATCHES: { label: string; token: string }[] = [
  { label: "bg", token: "bg-bg" },
  { label: "surface", token: "bg-surface" },
  { label: "surface-2", token: "bg-surface-2" },
  { label: "accent", token: "bg-accent" },
  { label: "accent-2", token: "bg-accent-2" },
  { label: "cta", token: "bg-cta" },
  { label: "surface-inverse", token: "bg-surface-inverse" },
  { label: "success", token: "bg-success" },
  { label: "warning", token: "bg-warning" },
  { label: "danger", token: "bg-danger" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Showcase({ portal }: { portal: Portal }) {
  return (
    <PortalTheme
      portal={portal}
      className="flex-1 min-w-0 rounded-sedan border border-border p-6 space-y-8"
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-accent" />
          <span className="font-display text-2xl">Agental</span>
          <Badge variant="accent" className="ml-1 uppercase">
            {portal}
          </Badge>
        </div>
        <p className="text-sm text-fg-muted">
          {portal === "talents"
            ? "Peau claire & chaude — tutoiement, mobile-first."
            : "Peau sombre & sobre — vouvoiement, data-forward."}
        </p>
      </header>

      <Section title="Couleurs sémantiques">
        <div className="grid grid-cols-4 gap-2">
          {SWATCHES.map((s) => (
            <div key={s.label} className="space-y-1">
              <div
                className={`h-12 rounded-sedan border border-border ${s.token}`}
              />
              <span className="text-[11px] text-fg-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typographie">
        <Eyebrow className="block">
          Eyebrow en JetBrains Mono
        </Eyebrow>
        <p className="text-3xl font-bold leading-[1.05] tracking-[-0.02em]">
          Concentre-toi sur ton jeu.
        </p>
        <p className="text-base text-fg-muted">
          Corps de texte en Instrument Sans — On s&apos;occupe du reste. Veille,
          candidatures et suivi pendant que tu joues.
        </p>
      </Section>

      <Section title="Rayons">
        <div className="flex flex-wrap gap-3">
          {[
            ["sedan-sm", "rounded-sedan-sm"],
            ["sedan", "rounded-sedan"],
            ["sedan-lg", "rounded-sedan-lg"],
            ["sedan-xl", "rounded-sedan-xl"],
            ["sedan-2xl", "rounded-sedan-2xl"],
          ].map(([label, cls]) => (
            <div key={label} className="space-y-1 text-center">
              <div
                className={`size-16 border border-border-strong bg-surface-2 ${cls}`}
              />
              <p className="font-mono text-[10px] text-fg-subtle">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Boutons">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">
            <Star /> Primaire
          </Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Lien</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Désactivé</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutre</Badge>
          <Badge variant="accent">
            <Sparkles /> IA
          </Badge>
          <Badge variant="solid">Agental</Badge>
          <Badge variant="success">
            <Check /> Dispo
          </Badge>
          <Badge variant="warning">En attente</Badge>
          <Badge variant="danger">Refusé</Badge>
          <Badge variant="neutral">
            <Circle /> External
          </Badge>
          <Badge variant="mono">Short-list prête</Badge>
        </div>
      </Section>

      <Section title="Formulaire">
        <div className="space-y-2 max-w-sm">
          <Label htmlFor={`email-${portal}`}>Adresse email</Label>
          <Input id={`email-${portal}`} placeholder="prenom@exemple.fr" />
        </div>
      </Section>

      <Section title="Carte">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>19 €/mois · commission 7,5 %</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-fg-muted">
            Auto-candidature par l&apos;IA, veille prioritaire, Self-tape Studio
            augmenté.
          </CardContent>
          <CardFooter>
            <Button className="w-full">Choisir</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Onglets (Radix)">
        <Tabs defaultValue="identite">
          <TabsList>
            <TabsTrigger value="identite">Identité</TabsTrigger>
            <TabsTrigger value="physique">Physique</TabsTrigger>
            <TabsTrigger value="medias">Médias</TabsTrigger>
          </TabsList>
          <TabsContent value="identite" className="text-sm text-fg-muted">
            Nom artistique, coordonnées.
          </TabsContent>
          <TabsContent value="physique" className="text-sm text-fg-muted">
            Mensurations, âge, type, accents.
          </TabsContent>
          <TabsContent value="medias" className="text-sm text-fg-muted">
            Photos, reel, voix.
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Dialog (Radix)">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Ouvrir le mandat</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ton mandat de représentation</DialogTitle>
              <DialogDescription>
                Gratuit. Sans engagement de ta part. Résiliable quand tu veux.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-fg-muted">
              C&apos;est le contrat standard entre un artiste et son agent,
              encadré par la loi française.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <DialogClose asChild>
                <Button variant="ghost">Plus tard</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Signer</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Section>
    </PortalTheme>
  );
}

export default function StyleguidePage() {
  return (
    <main className="min-h-screen bg-surface-2 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="font-display text-3xl">Design system — deux peaux</h1>
          <p className="text-fg-muted text-sm mt-1">
            Un seul jeu de tokens, deux skins via{" "}
            <code className="text-xs">data-portal</code>. Les composants sont
            écrits une seule fois.
          </p>
        </div>
        <div className="flex flex-col lg:flex-row gap-6">
          <Showcase portal="talents" />
          <Showcase portal="casting" />
        </div>
      </div>
    </main>
  );
}
