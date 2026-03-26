import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from "@miladyai/ui";
import { useState } from "react";

interface ConnectionModalProps {
  onSubmit: (data: {
    name: string;
    url: string;
    type: "remote";
    token?: string;
  }) => void;
  onClose: () => void;
}

export function ConnectionModal({ onSubmit, onClose }: ConnectionModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const connectDisabled = !name.trim() || !url.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[min(100%-2rem,32rem)] rounded-2xl border-border bg-surface/98 p-0 shadow-2xl backdrop-blur-xl">
        <form
          className="space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              name: name.trim(),
              url: url.trim(),
              type: "remote",
              token: token.trim() || undefined,
            });
          }}
        >
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="font-sans text-xl font-semibold tracking-tight text-text-light">
              Connect Remote Agent
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-text-muted">
              Connect to a self-hosted Milady backend without leaving the
              dashboard.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="homepage-remote-name">Name</FieldLabel>
            <Input
              id="homepage-remote-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Remote Agent"
              autoComplete="off"
              className="h-11 rounded-xl border-border bg-dark/80 text-text-light placeholder:text-text-muted/65 focus-visible:ring-brand/35"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="homepage-remote-url">URL</FieldLabel>
            <Input
              id="homepage-remote-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              placeholder="https://my-agent.example.com"
              autoComplete="url"
              className="h-11 rounded-xl border-border bg-dark/80 text-text-light placeholder:text-text-muted/65 focus-visible:ring-brand/35"
            />
            <FieldDescription>
              Use the public Milady backend URL exposed by the remote agent.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="homepage-remote-token">
              Access Key <span className="text-text-muted/70">(optional)</span>
            </FieldLabel>
            <Input
              id="homepage-remote-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="milady_xxx..."
              type="password"
              autoComplete="off"
              className="h-11 rounded-xl border-border bg-dark/80 text-text-light placeholder:text-text-muted/65 focus-visible:ring-brand/35"
            />
          </Field>

          <DialogFooter className="gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-11 rounded-xl border-border bg-dark/50 text-text-light hover:bg-dark/80"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={connectDisabled}
              className="h-11 flex-1 rounded-xl border-brand/70 bg-brand text-dark hover:bg-brand-hover sm:flex-none"
            >
              Connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
