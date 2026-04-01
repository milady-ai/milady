import React from "react";

type InlineProps = React.PropsWithChildren<Record<string, unknown>>;

function passthrough({ children, ...props }: InlineProps) {
  return React.createElement("div", props, children);
}

function button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return React.createElement("button", { type: "button", ...props }, children);
}

function input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return React.createElement("input", props);
}

function textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return React.createElement("textarea", props);
}

function dialogRoot({
  children,
  open,
}: React.PropsWithChildren<{ open?: boolean }>) {
  return open === false
    ? null
    : React.createElement(React.Fragment, null, children);
}

export function createInlineUiMock<T extends Record<string, unknown>>(
  actual?: T,
) {
  return {
    ...actual,
    Button: button,
    Dialog: dialogRoot,
    DialogContent: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", { role: "dialog", ...props }, children),
    DialogDescription: passthrough,
    DialogFooter: passthrough,
    DialogHeader: passthrough,
    DialogTitle: passthrough,
    DialogTrigger: passthrough,
    DialogClose: passthrough,
    DialogOverlay: passthrough,
    DialogPortal: passthrough,
    DrawerSheet: dialogRoot,
    DrawerSheetContent: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
    DrawerSheetDescription: passthrough,
    DrawerSheetHeader: passthrough,
    DrawerSheetOverlay: passthrough,
    DrawerSheetPortal: passthrough,
    DrawerSheetTitle: passthrough,
    Field: passthrough,
    FieldDescription: passthrough,
    FieldLabel: ({
      children,
      ...props
    }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
      React.createElement("label", props, children),
    FieldMessage: passthrough,
    Input: input,
    Select: passthrough,
    SelectContent: passthrough,
    SelectItem: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("option", props, children),
    SelectTrigger: button,
    SelectValue: passthrough,
    Textarea: textarea,
    cn: (...values: Array<string | false | null | undefined>) =>
      values.filter(Boolean).join(" "),
  };
}
